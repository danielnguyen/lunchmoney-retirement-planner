import { execFile } from "node:child_process";
import { chmod, rename, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncPlannerConfig, type SyncOptions } from "../scripts/sync-planner-config";
import { loadPlannerConfigWithReturnPaths } from "@/src/config/return-path-loader";
import { GET as savedExport } from "@/app/api/v1/exports/projection/route";
import { GET as baselineRequest } from "@/app/api/v1/baseline/current/route";
import { createLunchMoneyReadService } from "@/src/integrations/lunchmoney/read-service";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, writeFile: vi.fn(fs.writeFile), rename: vi.fn(fs.rename) };
});
vi.mock("@/src/integrations/lunchmoney/read-service", async (original) => ({
  ...await original<typeof import("@/src/integrations/lunchmoney/read-service")>(),
  createLunchMoneyReadService: vi.fn(),
}));
const execute = promisify(execFile);
let directory: string;
let checkout: string;
let remote: string;
let options: SyncOptions;
let first: string;
let second: string;
let initial: string;
const git = async (cwd: string, ...args: string[]) => (await execute("git", ["-C", cwd, ...args])).stdout.trim();
async function commit(contents: string) {
  await writeFile(join(remote, "plan.yaml"), contents);
  await git(remote, "add", "plan.yaml");
  await git(remote, "-c", "user.name=Synthetic Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Synthetic config");
  return git(remote, "rev-parse", "HEAD");
}

describe("manual Git configuration sync", () => {
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "planner-git-sync-"));
    remote = join(directory, "upstream");
    checkout = join(directory, "checkout");
    await mkdir(remote);
    await git(remote, "init", "-b", "main");
    initial = await readFile("config/planner.example.yaml", "utf8");
    first = await commit(initial);
    second = await commit(initial.replace("retirementGoal: 0", "retirementGoal: 1234"));
    await execute("git", ["clone", remote, checkout]);
    const active = join(directory, "active.yaml");
    await writeFile(active, initial);
    options = { checkout, path: "plan.yaml", branch: "main", active };
    vi.stubEnv("PLANNER_CONFIG_PATH", active);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it("activates fetched commits, ignores dirty contents and rolls back with exact revision reporting", async () => {
    await writeFile(join(checkout, "plan.yaml"), "invalid: dirty checkout");
    expect(await syncPlannerConfig(options)).toBe(second);
    expect((await loadPlannerConfigWithReturnPaths()).retirementGoal).toBe(1234);
    expect(await readFile(join(checkout, "plan.yaml"), "utf8")).toBe("invalid: dirty checkout");
    expect(await syncPlannerConfig({ ...options, ref: first })).toBe(first);
    expect(await readFile(options.active, "utf8")).toBe(initial);
    expect(first).not.toBe(second);
  });

  it("fetches a new valid upstream commit without checking it out", async () => {
    const latest = await commit(initial.replace("retirementGoal: 0", "retirementGoal: 2468"));
    expect(await syncPlannerConfig(options)).toBe(latest);
    expect((await loadPlannerConfigWithReturnPaths()).retirementGoal).toBe(2468);
    expect(await git(checkout, "rev-parse", "HEAD")).toBe(second);
  });

  it.each(["invalid YAML", "invalid config", "missing", "fetch", "ref", "symlink", "path"])("preserves active config after %s failure", async (failure) => {
    if (failure === "invalid YAML") await commit("private-value: [");
    if (failure === "invalid config") await commit("currentAge: private-value");
    if (failure === "missing") options.path = "absent.yaml";
    if (failure === "fetch") await git(checkout, "remote", "set-url", "origin", join(directory, "absent"));
    if (failure === "ref") options.ref = "missing-ref";
    if (failure === "path") options.path = "../plan.yaml";
    if (failure === "symlink") {
      await symlink("plan.yaml", join(remote, "link.yaml"));
      await git(remote, "add", "link.yaml");
      await git(remote, "-c", "user.name=Synthetic Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Synthetic link");
      options.path = "link.yaml";
    }
    await expect(syncPlannerConfig(options)).rejects.toThrow("Sync failed; active configuration was not replaced.");
    expect(await readFile(options.active, "utf8")).toBe(initial);
    expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it.each(["write", "rename"])("preserves the active file on %s failure and cleans the temporary file", async (operation) => {
    if (operation === "write") vi.mocked(writeFile).mockRejectedValueOnce(new Error("private path"));
    else vi.mocked(rename).mockRejectedValueOnce(new Error("private path"));
    await expect(syncPlannerConfig(options)).rejects.toThrow("Sync failed; active configuration was not replaced.");
    expect(await readFile(options.active, "utf8")).toBe(initial);
    expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("preserves the active file when access-attribute preservation fails", async () => {
    const commands = join(directory, "commands");
    await mkdir(commands);
    await writeFile(join(commands, "cp"), "#!/bin/sh\nexit 1\n");
    await chmod(join(commands, "cp"), 0o755);
    vi.stubEnv("PATH", `${commands}:${process.env.PATH}`);
    await expect(syncPlannerConfig(options)).rejects.toThrow("Sync failed");
    expect(await readFile(options.active, "utf8")).toBe(initial);
    expect((await readdir(directory)).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("reports only a commit on CLI success and a sanitized status on failure", async () => {
    const args = ["--import", "tsx", "scripts/sync-planner-config.ts", "--checkout", checkout,
      "--path", options.path, "--active", options.active, "--branch", "main"];
    const result = await execute(process.execPath, args);
    expect(result.stdout.trim()).toBe(`Applied planner configuration from Git commit ${second}.`);
    expect(result.stderr).toBe("");
    await expect(execute(process.execPath, [...args, "--ref", "private-invalid-ref"]))
      .rejects.toMatchObject({ code: 1, stdout: "", stderr: expect.not.stringContaining("private-invalid-ref") });
  });

  it("a fresh baseline request observes the activated YAML without restart", async () => {
    // A synthetic reader supplies no live data; baseline's real config loader is used.
    const config = await loadPlannerConfigWithReturnPaths();
    const accounts = Object.keys(config.accountMappings).map((key) => ({
      source: key.split(":")[0], id: key.split(":")[1],
      name: "Synthetic account", display_name: null, to_base: 1000, status: "active",
      balance_as_of: "2026-07-01T00:00:00Z", balance_last_update: "2026-07-01T00:00:00Z",
    }));
    vi.mocked(createLunchMoneyReadService).mockReturnValue({
      getCategories: async () => [], getManualAccounts: async () => accounts.filter((account) => account.source === "manual"),
      getPlaidAccounts: async () => accounts.filter((account) => account.source === "plaid"), getRecurringItems: async () => [],
      getTransactions: async () => [],
    } as unknown as ReturnType<typeof createLunchMoneyReadService>);
    const before = await baselineRequest();
    const beforeBody = await before.json();
    expect(before.status, JSON.stringify(beforeBody)).toBe(200);
    await syncPlannerConfig(options);
    const after = await baselineRequest();
    const afterBody = await after.json();
    expect(after.status).toBe(200);
    expect(beforeBody.projectionInputs.retirementGoalToday).toBe(0);
    expect(afterBody.projectionInputs.retirementGoalToday).toBe(1234);
    vi.stubEnv("PLANNER_EXPORT_TOKEN", "synthetic-export-token");
    const exported = await savedExport(new Request("http://localhost/api/v1/exports/projection", {
      headers: { authorization: "Bearer synthetic-export-token" },
    }));
    expect(exported.status).toBe(200);
    const snapshot = await exported.json();
    expect(snapshot.resolvedBaseline.retirementGoalToday).toBe(1234);
    expect(snapshot.activeInputs).toEqual(snapshot.resolvedBaseline);
  });
});
