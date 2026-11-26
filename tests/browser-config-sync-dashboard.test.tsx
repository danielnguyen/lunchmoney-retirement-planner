// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerDashboard } from "@/components/planner-dashboard";
import { GET as status, POST as sync } from "@/app/api/v1/config/sync/route";
import { GET as baseline } from "@/app/api/v1/baseline/current/route";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createLunchMoneyReadService } from "@/src/integrations/lunchmoney/read-service";
import { loadPlannerConfigWithReturnPaths } from "@/src/config/return-path-loader";
import type { ProjectionInputs } from "@/src/domain/projection/types";

vi.mock("recharts", () => {
  const Empty = () => null;
  return Object.fromEntries(["Area", "Bar", "BarChart", "CartesianGrid", "Cell", "ComposedChart", "Legend", "Line", "Pie", "PieChart", "ReferenceLine", "ResponsiveContainer", "Tooltip", "XAxis", "YAxis"].map((key) => [key, Empty]));
});
vi.mock("@/src/integrations/lunchmoney/read-service", async (original) => ({
  ...await original<typeof import("@/src/integrations/lunchmoney/read-service")>(), createLunchMoneyReadService: vi.fn(),
}));
let directory: string;
let active: string;
let original: string;
let candidate: string;
let upstreamHold: Promise<void> | undefined;
let baselineGoals: number[];
let failBaseline: boolean;
const revision = "a".repeat(40);
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "browser-sync-dashboard-"));
  active = join(directory, "active.yaml");
  original = await readFile("config/planner.example.yaml", "utf8");
  candidate = original.replace("retirementGoal: 0", "retirementGoal: 2468");
  upstreamHold = undefined;
  baselineGoals = [];
  failBaseline = false;
  await writeFile(active, original);
  for (const [key, value] of Object.entries({ PLANNER_CONFIG_PATH: active, PLANNER_GIT_SYNC_ENABLED: "true", PLANNER_GIT_REPOSITORY: "synthetic/config", PLANNER_GIT_BRANCH: "main", PLANNER_GIT_PATH: "plan.yaml", PLANNER_GIT_READ_TOKEN: "fake-secret", PLANNER_BROWSER_ORIGIN: "https://planner.example.invalid" })) vi.stubEnv(key, value);
  const config = await loadPlannerConfigWithReturnPaths();
  const accounts = Object.keys(config.accountMappings).map((key) => ({ source: key.split(":")[0], id: key.split(":")[1], name: "Synthetic account", display_name: null, to_base: 1000, status: "active", balance_as_of: "2026-07-01T00:00:00Z", balance_last_update: "2026-07-01T00:00:00Z" }));
  vi.mocked(createLunchMoneyReadService).mockReturnValue({ getCategories: async () => [], getManualAccounts: async () => accounts.filter((a) => a.source === "manual"), getPlaidAccounts: async () => accounts.filter((a) => a.source === "plaid"), getRecurringItems: async () => [], getTransactions: async () => [] } as unknown as ReturnType<typeof createLunchMoneyReadService>);
  vi.stubGlobal("fetch", vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/v1/config/sync") {
      if (init?.method !== "POST") return status();
      // Equivalent to the browser's origin header at the transport boundary.
      const headers = new Headers(init.headers);
      headers.set("origin", "https://planner.example.invalid");
      return sync(new Request("https://planner.example.invalid/api/v1/config/sync", { ...init, headers }));
    }
    if (url === "/api/v1/baseline/current") {
      if (failBaseline) return Response.json({ error: "baseline_load_failed", message: "Synthetic connection unavailable" }, { status: 502 });
      const response = await baseline();
      const body = await response.clone().json();
      baselineGoals.push(body.projectionInputs.retirementGoalToday);
      return response;
    }
    if (url === "/api/v1/projections") return Response.json(calculateProjection((JSON.parse(init!.body as string) as { inputs: ProjectionInputs }).inputs));
    if (url.includes("/commits/")) { await upstreamHold; return Response.json({ sha: revision }); }
    if (url.includes("/git/trees/")) return Response.json({ tree: [{ path: "plan.yaml", mode: "100644", type: "blob", sha: "b".repeat(40) }] });
    if (url.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", size: Buffer.byteLength(candidate), sha: "b".repeat(40), content: Buffer.from(candidate).toString("base64") });
    throw new Error("Unexpected synthetic request");
  }));
});
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

async function openDrawer() {
  render(<PlannerDashboard />);
  const launcher = await screen.findByRole("button", { name: "Planner Config" });
  fireEvent.click(launcher);
  const dialog = await screen.findByRole("dialog", { name: "Planner Config" });
  const view = within(dialog);
  await waitFor(() => expect(view.getByRole("button", { name: "Sync now" })).toBeEnabled());
  return { launcher, dialog, view };
}

it("crosses the browser action, real handler and atomic write, then reads a new baseline; repeated clicks are blocked", async () => {
  let release!: () => void;
  upstreamHold = new Promise((resolve) => { release = resolve; });
  const { launcher, dialog, view } = await openDrawer();
  const button = view.getByRole("button", { name: "Sync now" });
  expect(button.closest("header")).toBe(view.getByRole("button", { name: "Edit YAML" }).closest("header"));
  button.focus();
  expect(button).toHaveFocus();
  fireEvent.click(button);
  expect(view.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Refresh Lunch Money" })).toBeDisabled();
  fireEvent.click(button);
  await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([url, init]) => url === "/api/v1/config/sync" && init?.method === "POST")).toHaveLength(1));
  await act(async () => { release(); });
  await waitFor(() => expect(view.getByRole("status", { name: "Git sync" })).toHaveTextContent(`Applied Git revision ${revision}. Baseline refreshed`), { timeout: 3000 });
  expect(await readFile(active, "utf8")).toBe(candidate);
  expect(baselineGoals).toEqual([0, 2468]);
  expect(screen.getByRole("button", { name: "Refresh Lunch Money" })).toBeEnabled();
  expect(dialog).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(launcher).toHaveFocus();
});

it("shows invalid YAML failure without changing the baseline or active file, then allows retry", async () => {
  candidate = "synthetic-invalid: [";
  const { view } = await openDrawer();
  fireEvent.click(view.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(view.getByRole("status", { name: "Git sync" })).toHaveTextContent("Sync failed; the active configuration was not replaced"));
  expect(await readFile(active, "utf8")).toBe(original);
  expect(baselineGoals).toEqual([0]);
  expect(view.getByRole("button", { name: "Sync now" })).toBeEnabled();
});

it("reports activation separately when the subsequent baseline read fails", async () => {
  const { view } = await openDrawer();
  failBaseline = true;
  fireEvent.click(view.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Git sync" })).toHaveTextContent(`Applied Git revision ${revision}. The baseline could not be refreshed`));
  expect(await readFile(active, "utf8")).toBe(candidate);
  // A valid YAML revision can still encounter unavailable live data. Recovery
  // stays browser-based even when normal scenario controls cannot be rendered.
  failBaseline = false;
  fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
  await waitFor(() => expect(screen.getByRole("status", { name: "Git sync" })).toHaveTextContent("Baseline refreshed"), { timeout: 3000 });
});

it("keeps an unconfigured button visible and disabled with setup guidance", async () => {
  vi.stubEnv("PLANNER_GIT_SYNC_ENABLED", "false");
  render(<PlannerDashboard />);
  fireEvent.click(await screen.findByRole("button", { name: "Planner Config" }));
  const view = within(screen.getByRole("dialog", { name: "Planner Config" }));
  expect(view.getByRole("button", { name: "Sync now" })).toBeDisabled();
  expect(view.getByRole("status", { name: "Git sync" })).toHaveTextContent("The owner must configure");
});
