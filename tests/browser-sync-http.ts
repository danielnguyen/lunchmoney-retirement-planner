// After npm run build: node --import tsx tests/browser-sync-http.ts
// Requires a local Chromium binary. Only synthetic fixtures reach the browser.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";

async function freePort() {
  const server = createServer(); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}
const delay = () => new Promise((resolve) => setTimeout(resolve, 100));
async function main() {
  const directory = await mkdtemp(join(tmpdir(), "planner-browser-"));
  const active = join(directory, "active.yaml");
  const fixturePath = join(directory, "upstream.json");
  const original = await readFile("config/planner.example.yaml", "utf8");
  const changed = original.replace("retirementGoal: 0", "retirementGoal: 2468");
  const config = parse(original);
  const accounts = Object.keys(config.accountMappings).map((key) => ({ source: key.split(":")[0], id: key.split(":")[1], name: "Synthetic account", display_name: null, to_base: 1000, status: "active", balance_as_of: "2026-07-01T00:00:00Z", balance_last_update: "2026-07-01T00:00:00Z" }));
  const fixture = async (yaml: string, revision = "a".repeat(40)) => writeFile(fixturePath, JSON.stringify({ yaml, revision, accounts }));
  await writeFile(active, original);
  await fixture(changed);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const staticLink = resolve(".next/standalone/.next/static");
  let createdLink = false;
  try { await symlink(resolve(".next/static"), staticLink); createdLink = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const server = spawn(process.execPath, ["--import", resolve("tests/fixtures/browser-sync-upstream.mjs"), resolve(".next/standalone/server.js")], {
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port), NEXT_TELEMETRY_DISABLED: "1", LUNCHMONEY_API_TOKEN: "fake-lunch-token", PLANNER_CONFIG_PATH: active, PLANNER_GIT_SYNC_ENABLED: "true", PLANNER_GIT_REPOSITORY: "synthetic/config", PLANNER_GIT_BRANCH: "main", PLANNER_GIT_PATH: "plan.yaml", PLANNER_GIT_READ_TOKEN: "fake-git-secret", PLANNER_BROWSER_ORIGIN: origin, PLANNER_EXPORT_TOKEN: "fake-export-secret", SYNTHETIC_SYNC_FIXTURE: fixturePath },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serviceLog = "";
  server.stdout.on("data", (chunk) => { serviceLog += String(chunk); });
  server.stderr.on("data", (chunk) => { serviceLog += String(chunk); });
  const chromePort = await freePort();
  const chrome = spawn(process.env.CHROMIUM_BINARY ?? "chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1", "--disable-component-update", "--disable-sync", "--no-first-run", `--user-data-dir=${join(directory, "chrome")}`, `--remote-debugging-port=${chromePort}`, "about:blank"], { env: { ...process.env, XDG_CONFIG_HOME: join(directory, "chrome-config"), XDG_CACHE_HOME: join(directory, "chrome-cache") }, stdio: ["ignore", "ignore", "pipe"] });
  let browserLog = "";
  chrome.stderr.on("data", (chunk) => { browserLog += String(chunk); });
  let socket: WebSocket | undefined;
  try {
    async function waitHttp(url: string) {
      for (let i = 0; i < 150; i++) { try { const r = await fetch(url); if (r.ok) return r; } catch {} await delay(); }
      throw new Error("Synthetic service startup timed out");
    }
    await waitHttp(`${origin}/api/v1/health`);
    const chromeInfo = await (await waitHttp(`http://127.0.0.1:${chromePort}/json/version`)).json();
    socket = new WebSocket(chromeInfo.webSocketDebuggerUrl);
    await new Promise<void>((done) => socket!.addEventListener("open", () => done(), { once: true }));
    let sequence = 0;
    const pending = new Map<number, { resolve: (value: Record<string, unknown>) => void; reject: (reason: Error) => void }>();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    });
    const command = (method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); socket!.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const target = await command("Target.createTarget", { url: "about:blank" });
    const attached = await command("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    const session = attached.sessionId as string;
    const send = (method: string, params: Record<string, unknown> = {}) => command(method, params, session);
    const evaluate = async (expression: string) => {
      const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!value.exceptionDetails, "Browser evaluation failed");
      return (value.result as { value: unknown }).value;
    };
    const waitFor = async (expression: string) => {
      for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(); }
      console.error("Synthetic sync status:", await evaluate("document.getElementById('planner-sync-status')?.textContent"));
      throw new Error(`Browser assertion timed out: ${expression}`);
    };
    await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await send("Page.navigate", { url: origin });
    const button = (text: string) => `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
    await waitFor(`Boolean(${button("Planner Config")})`);
    await evaluate(`${button("Planner Config")}.click()`);
    await waitFor(`Boolean(${button("Sync now")} && !${button("Sync now")}.disabled)`);
    assert.equal(await evaluate(`${button("Sync now")}.closest('header') === ${button("Edit YAML")}.closest('header')`), true);
    for (const text of ["Sync now", "Edit YAML"]) {
      assert.equal(await evaluate(`(() => { const r = ${button(text)}.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; })()`), true, `${text} visible at phone width`);
    }
    await send("Page.bringToFront");
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await evaluate(`${button("Sync now")}.focus()`);
    assert.equal(await evaluate("document.activeElement?.textContent"), "Sync now");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitFor("document.getElementById('planner-sync-status')?.textContent.includes('Baseline refreshed')");
    assert.equal(await readFile(active, "utf8"), changed);
    const getGoal = async () => (await (await fetch(`${origin}/api/v1/baseline/current`)).json()).projectionInputs.retirementGoalToday;
    assert.equal(await getGoal(), 2468);
    assert.equal(await evaluate("document.body.textContent.includes('fake-git-secret')"), false);
    assert.equal(await evaluate("(() => { const d = document.querySelector('[role=dialog]'); return d.scrollWidth <= d.clientWidth; })()"), true, "No horizontal overflow at phone width");
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(tmpdir(), "planner-sync-mobile.png"), Buffer.from(shot.data as string, "base64"));
    console.log("PASS: keyboard Sync now at 375px crosses real HTTP handler, atomic activation and refreshed baseline; screenshot /tmp/planner-sync-mobile.png.");
    await fixture("invalid: [");
    await evaluate(`${button("Sync now")}.click()`);
    await waitFor("document.getElementById('planner-sync-status')?.textContent.includes('Sync failed')");
    assert.equal(await readFile(active, "utf8"), changed);
    assert.equal(await getGoal(), 2468);
    await fixture(original, "c".repeat(40));
    await evaluate(`${button("Sync now")}.click()`);
    await waitFor("document.getElementById('planner-sync-status')?.textContent.includes('Baseline refreshed')");
    assert.equal(await getGoal(), 0);
    await evaluate(`${button("Sync now")}.click()`);
    await waitFor("document.getElementById('planner-sync-status')?.textContent.includes('Baseline refreshed')");
    assert.equal(await readFile(active, "utf8"), original);
    console.log("PASS: invalid revision preserves active plan; Git revert rollback and repeat sync succeed.");
    const rejectedRequests: RequestInit[] = [
      { headers: { origin: "https://forged.example.invalid", "x-planner-sync": "1" } },
      { headers: { origin, "x-planner-sync": "1" }, body: JSON.stringify({ ref: "arbitrary" }) },
      { headers: { authorization: "Bearer fake-export-secret" } },
    ];
    for (const init of rejectedRequests) {
      const response = await fetch(`${origin}/api/v1/config/sync`, { method: "POST", ...init });
      assert.ok(response.status === 400 || response.status === 403);
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.doesNotMatch(await response.text(), /fake-git-secret|synthetic\/config|arbitrary/);
    }
    console.log("PASS: real HTTP refuses forged origin, arbitrary input and export-only credential.");
  } catch (error) {
    console.error("Synthetic service diagnostics:", serviceLog.slice(-1500), browserLog.slice(-1000));
    throw error;
  } finally {
    socket?.close();
    const stopped = [server, chrome].map((child) => child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : once(child, "close"));
    server.kill(); chrome.kill();
    await Promise.all(stopped);
    if (createdLink) await rm(staticLink);
    await rm(directory, { recursive: true, force: true });
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
