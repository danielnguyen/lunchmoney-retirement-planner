import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/config/sync/route";
import { saveCurrentPlannerConfig } from "@/src/config/current";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, rename: vi.fn(fs.rename) };
});
let directory: string;
let active: string;
let original: string;
let candidate: string;
let revision: string;
const request = (options: RequestInit = {}, query = "") => new Request(`https://planner.example.invalid/api/v1/config/sync${query}`, {
  method: "POST", headers: { origin: "https://planner.example.invalid", "x-planner-sync": "1" }, ...options,
});
function upstream() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/commits/")) return Response.json({ sha: revision });
    if (url.includes("/git/trees/")) return Response.json({ tree: [{ path: "plans/plan.yaml", mode: "100644", type: "blob", sha: "b".repeat(40) }] });
    return Response.json({ type: "file", encoding: "base64", size: Buffer.byteLength(candidate), sha: "b".repeat(40), content: Buffer.from(candidate).toString("base64") });
  });
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "browser-sync-"));
  active = join(directory, "active.yaml");
  original = await readFile("config/planner.example.yaml", "utf8");
  candidate = original.replace("retirementGoal: 0", "retirementGoal: 2468");
  revision = "a".repeat(40);
  await writeFile(active, original);
  for (const [key, value] of Object.entries({ PLANNER_CONFIG_PATH: active, PLANNER_GIT_SYNC_ENABLED: "true", PLANNER_GIT_REPOSITORY: "synthetic/config", PLANNER_GIT_BRANCH: "main", PLANNER_GIT_PATH: "plans/plan.yaml", PLANNER_GIT_READ_TOKEN: "fake-read-secret", PLANNER_BROWSER_ORIGIN: "https://planner.example.invalid" })) vi.stubEnv(key, value);
  vi.stubGlobal("fetch", upstream());
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }); });

describe("browser sync server boundary", () => {
  it("applies the immutable validated file, repeats and rolls back to a reverted branch", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
    expect(await (await POST(request())).json()).toEqual({ revision });
    expect(await readFile(active, "utf8")).toBe(candidate);
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls[1][0]).toBe(`https://api.github.com/repos/synthetic/config/contents/plans/plan.yaml?ref=${revision}`);
    expect(calls[0][1]).toMatchObject({ redirect: "error", headers: { Authorization: "Bearer fake-read-secret" } });
    expect((await POST(request())).status).toBe(200);
    candidate = original;
    revision = "c".repeat(40); // Owner reverts the file in GitHub; browser still uses only its configured branch.
    expect(await (await POST(request())).json()).toEqual({ revision });
    expect(await readFile(active, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["active.yaml"]);
  });

  it.each(["disabled", "missing token", "bad origin config", "cross origin", "missing origin", "missing header", "cross site", "query", "body", "framing"])("refuses %s before upstream access", async (scenario) => {
    let req = request();
    if (scenario === "disabled") vi.stubEnv("PLANNER_GIT_SYNC_ENABLED", "false");
    if (scenario === "missing token") vi.stubEnv("PLANNER_GIT_READ_TOKEN", "");
    if (scenario === "bad origin config") vi.stubEnv("PLANNER_BROWSER_ORIGIN", "https://planner.example.invalid/path");
    if (scenario === "cross origin") req.headers.set("origin", "https://forged.example.invalid");
    if (scenario === "missing origin") req.headers.delete("origin");
    if (scenario === "missing header") req.headers.delete("x-planner-sync");
    if (scenario === "cross site") req.headers.set("sec-fetch-site", "cross-site");
    if (scenario === "query") req = request({}, "?ref=arbitrary");
    if (scenario === "body") req = request({ body: JSON.stringify({ url: "https://forged.example.invalid", yaml: "private" }) });
    if (scenario === "framing") req.headers.set("transfer-encoding", "chunked");
    const response = await POST(req);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(await readFile(active, "utf8")).toBe(original);
    expect(await response.text()).not.toMatch(/fake-read-secret|synthetic\/config|arbitrary|forged|private"/);
  });

  it.each(["invalid YAML", "invalid config", "invalid revision", "network", "timeout", "upstream error", "rename", "symlink"])("preserves active config and sanitizes %s failures", async (scenario) => {
    if (scenario === "invalid YAML") candidate = "private: [";
    if (scenario === "invalid config") candidate = "currentAge: private";
    if (scenario === "invalid revision") revision = "private-invalid-ref";
    if (scenario === "network" || scenario === "timeout") vi.mocked(fetch).mockRejectedValueOnce(new Error("private upstream credential"));
    if (scenario === "upstream error") vi.mocked(fetch).mockResolvedValueOnce(new Response("private upstream error", { status: 403 }));
    if (scenario === "rename") vi.mocked(rename).mockRejectedValueOnce(new Error("private path"));
    if (scenario === "symlink") {
      vi.mocked(fetch).mockResolvedValueOnce(Response.json({ sha: revision })).mockResolvedValueOnce(Response.json({ type: "symlink", target: "private" }));
    }
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/private upstream|private path|private-invalid|fake-read-secret/);
    expect(await readFile(active, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["active.yaml"]);
  });

  it("refuses simultaneous sync before a second upstream read and disables local Save even if enabled", async () => {
    let release!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const pending = POST(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect((await POST(request())).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.stubEnv("PLANNER_CONFIG_WRITE_ENABLED", "true");
    await expect(saveCurrentPlannerConfig(original, "anything")).rejects.toMatchObject({ code: "planner_config_write_disabled" });
    release(Response.json({ sha: revision }));
    expect((await pending).status).toBe(200);
  });
  it("passes the bounded deadline to upstream fetch and preserves the file on abort", async () => {
    const controller = new AbortController();
    const deadline = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    vi.mocked(fetch).mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("Synthetic timeout", "AbortError")), { once: true });
    }));
    const pending = POST(request());
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(deadline).toHaveBeenCalledWith(20_000);
    controller.abort();
    expect((await pending).status).toBe(502);
    expect(await readFile(active, "utf8")).toBe(original);
  });

});
