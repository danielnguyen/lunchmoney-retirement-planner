// Synthetic production-browser acceptance. Run after npm run build with Chromium installed:
// node --import tsx tests/employment-income-browser.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { currentBaselineFixture } from "./fixtures/projection";
import { fireInputs } from "./fixtures/fire-milestones";

async function port() {
  const server = createServer().listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise<void>(done => server.close(() => done()));
  return address.port;
}
async function until<T>(read: () => Promise<T>, accepts: (v: T) => boolean, timeout = 15000): Promise<T> {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const value = await read(); if (accepts(value)) return value; } catch { /* Startup/navigation may not be ready. */ }
    await new Promise(done => setTimeout(done, 100));
  }
  throw new Error("Synthetic browser condition timed out");
}
async function main() {
  const appPort = await port(), debugPort = await port();
  const profile = await mkdtemp(join(tmpdir(), "income-browser-"));
  await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
  const app = spawn(process.execPath, [resolve(".next/standalone/server.js")], { env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(appPort), LUNCHMONEY_API_TOKEN: "", PLANNER_CONFIG_PATH: "/nonexistent/synthetic-config.yaml" }, stdio: "ignore" });
  const chrome = spawn("chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-background-networking", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, "about:blank"], { env: { ...process.env, XDG_CONFIG_HOME: join(profile, "config"), XDG_CACHE_HOME: join(profile, "cache") }, stdio: "ignore" });
  const appClosed = once(app, "close"), chromeClosed = once(chrome, "close");
  let ws: WebSocket | undefined;
  try {
    await until(async () => (await fetch(`http://127.0.0.1:${appPort}/api/v1/health`)).status, s => s === 200);
    const tabs = await until(async () => await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>, t => t.some(x => x.type === "page"));
    ws = new WebSocket(tabs.find(t => t.type === "page")!.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { ws!.onopen = () => done(); ws!.onerror = () => reject(new Error("Chromium connection failed")); });
    let id = 0;
    const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
    const send = (method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> => new Promise((resolve, reject) => {
      const key = ++id;
      pending.set(key, { resolve, reject });
      ws!.send(JSON.stringify({ id: key, method, params }));
    });
    const baseline = structuredClone(currentBaselineFixture);
    baseline.projectionInputs = fireInputs();
    const exceptions: string[] = [];
    let projections = 0;
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const task = pending.get(message.id); pending.delete(message.id);
        if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
      if (message.method === "Network.requestWillBeSent" && message.params.request.url.endsWith("/api/v1/projections")) projections++;
      if (message.method === "Fetch.requestPaused") {
        const config = message.params.request.url.includes("/config/sync");
        void send("Fetch.fulfillRequest", { requestId: message.params.requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }],
          body: Buffer.from(JSON.stringify(config ? { available: false } : baseline)).toString("base64") });
      }
    };
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/v1/baseline/current" }, { urlPattern: "*/api/v1/config/sync" }] });
    const evaluate = async (expression: string) => {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error("Browser script failed");
      return (r.result as { value: unknown }).value;
    };
    for (const width of [390, 1440]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x=>x.textContent.includes("Use illustrative Ontario")).click()');
      await until(() => evaluate('document.querySelector(".income-panel")?.textContent.includes("Tested boundary")'), Boolean);
      await evaluate('[...document.querySelectorAll(".income-panel details")].find(x=>x.textContent.includes("Income curve job terms")).open = true');
      const geometry = await evaluate(`(() => {
        const panel = document.querySelector('.income-panel');
        const controls = [...panel.querySelectorAll('input, select')];
        return { width: panel.clientWidth, scroll: panel.scrollWidth,
          controlsFit: controls.every(e => e.getBoundingClientRect().right <= innerWidth + 1),
          svg: !!panel.querySelector('.income-curve svg'),
          rows: panel.querySelectorAll('tbody tr').length,
          text: panel.textContent.includes('today’s dollars') };
      })()`) as { width: number; scroll: number; controlsFit: boolean; svg: boolean; rows: number; text: boolean };
      assert(geometry.controlsFit, `Controls overflow at ${width}`);
      assert(geometry.scroll <= geometry.width + 1, `Panel overflow at ${width}`);
      assert(geometry.svg && geometry.rows === 3 && geometry.text, "Chart and accessible exact values must render");
      baseline.projectionInputs.accounts[0].openingBalance = 0;
      baseline.projectionInputs.surplusAllocation.targetCashReserveToday = 1000;
      baseline.projectionInputs.surplusAllocation.reserveIndexingRate = 0;
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x=>x.textContent.includes("Use illustrative Ontario")).click()');
      await until(() => evaluate('document.querySelector(".income-panel")?.textContent.includes("2026-01: Protected reserve is not funded at transition.")'), Boolean);
      assert.equal(await evaluate('document.querySelector(".income-table")?.textContent.includes("1,000 today")'), true);
      assert.equal(await evaluate('document.querySelectorAll(".income-panel details[open]").length'), 0);
      await evaluate('document.querySelector(".income-table details summary").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-table details[open]")'), true);
      baseline.projectionInputs = fireInputs();
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-panel .income-curve")'), false);
      console.log(`PASS: synthetic production income curve at ${width}px, expanded controls, chart, exact table, dated failure evidence and opt-out.`);
    }
    assert(projections >= 4, "Projection requests must use the real HTTP route");
    assert.deepEqual(exceptions, []);
  } finally {
    ws?.close();
    app.kill("SIGTERM"); chrome.kill("SIGTERM");
    await Promise.all([appClosed, chromeClosed]);
    await rm(profile, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
