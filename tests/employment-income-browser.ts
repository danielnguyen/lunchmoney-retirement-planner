// Synthetic production-browser acceptance. Run after npm run build with Chromium installed:
// node --import tsx tests/employment-income-browser.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { currentBaselineFixture } from "./fixtures/projection";
import { annualTaxCareerInputs, fireInputs } from "./fixtures/fire-milestones";

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
    baseline.projectionInputs = annualTaxCareerInputs();
    const exceptions: string[] = [];
    let projections = 0;
    const projectionResponses: Array<{ status: number; mimeType: string }> = [];
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const task = pending.get(message.id); pending.delete(message.id);
        if (message.error) task?.reject(new Error(message.error.message)); else task?.resolve(message.result);
      }
      if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
      if (message.method === "Network.requestWillBeSent" && message.params.request.url.endsWith("/api/v1/projections")) projections++;
      if (message.method === "Network.responseReceived" && message.params.response.url.endsWith("/api/v1/projections")) {
        projectionResponses.push({ status: message.params.response.status, mimeType: message.params.response.mimeType });
      }
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
    const evidenceDir = process.env.CAREER_EVIDENCE_DIR;
    const evidence: Array<Record<string, unknown>> = [];
    if (evidenceDir) await mkdir(evidenceDir, { recursive: true });
    const capture = async (name: string, selector: string) => {
      if (!evidenceDir) return;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView()`);
      const bounds = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`) as Record<string, number>;
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...bounds, scale: 1 } });
      await writeFile(join(evidenceDir, `${name}.png`), Buffer.from(String(shot.data), "base64"));
      evidence.push({ capture: name, projectionRequests: projections,
        text: await evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`) });
    };
    const changeAge = async (panel: string, age: number) => evaluate(`(() => {
      const input = document.querySelector('${panel} input[type=number]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${age}');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    for (const width of [390, 1440]) {
      baseline.projectionInputs = annualTaxCareerInputs();
      await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x=>x.textContent.includes("Use illustrative Ontario")).click()');
      await evaluate(`(() => {
        window.incomeRequests = 0; window.incomeTicks = 0;
        const originalFetch = window.fetch;
        window.fetch = (...args) => { if (String(args[1]?.body).includes('"employmentIncome"')) window.incomeRequests++; return originalFetch(...args); };
        window.incomeTimer = setInterval(() => window.incomeTicks++, 20);
        [...document.querySelectorAll('.income-panel button')].find(x => x.textContent === 'Calculate income curve').click();
      })()`);
      await until(() => evaluate('[...document.querySelectorAll(".income-panel button")].find(x => x.textContent === "Calculate income curve")?.disabled'), Boolean);
      await evaluate(`(() => {
        const input = [...document.querySelectorAll('.income-panel label')].find(x => x.textContent.includes('Income curve full retirement age')).querySelector('input');
        for (const value of ['64', '63', '65']) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await capture(`income-${width}-busy-edited`, '.income-panel');
      await until(() => evaluate('document.querySelector(".income-panel")?.textContent.includes("Tested boundary")'), Boolean, 35000);
      assert.equal(await evaluate('window.incomeRequests'), 1, "Editing must not launch repeated expensive requests");
      assert(Number(await evaluate('window.incomeTicks')) > 5, "Browser event loop must remain responsive during calculation");
      await evaluate('clearInterval(window.incomeTimer)');
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
      assert(geometry.svg && geometry.rows === 26 && geometry.text, "Chart and accessible exact values must render");
      await capture(`income-${width}-completed`, '.income-panel');
      await changeAge('.income-panel', 64);
      await until(() => evaluate('!document.querySelector(".income-curve")'), Boolean);
      assert.equal(await evaluate('window.incomeRequests'), 1);
      await capture(`income-${width}-stale`, '.income-panel');
      await evaluate('document.querySelector(".fire-panel:not(.income-panel) input[type=checkbox]").click()');
      await until(() => evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) button")].some(x => x.textContent === "Calculate FIRE milestones")'), Boolean);
      for (const kind of ['coast', 'barista']) await evaluate(`[...document.querySelectorAll('.fire-panel:not(.income-panel) button')].find(x => x.textContent === 'Use illustrative ${kind} terms').click()`);
      await evaluate(`(() => {
        window.fireRequests = 0;
        const originalFetch = window.fetch;
        window.fetch = (...args) => { if (String(args[1]?.body).includes('"fireMilestones"')) window.fireRequests++; return originalFetch(...args); };
        [...document.querySelectorAll('.fire-panel:not(.income-panel) button')].find(x => x.textContent === 'Calculate FIRE milestones').click();
      })()`);
      await until(() => evaluate('document.querySelector(".fire-panel:not(.income-panel) [role=status]")?.textContent.includes("Calculating")'), Boolean);
      await changeAge('.fire-panel:not(.income-panel)', 64);
      await capture(`fire-${width}-busy-edited`, '.fire-panel:not(.income-panel)');
      await changeAge('.fire-panel:not(.income-panel)', 65);
      await until(() => evaluate('!!document.querySelector(".fire-panel:not(.income-panel) .comparison-cards")'), Boolean, 35000);
      assert.equal(await evaluate('window.fireRequests'), 1, "FIRE edits must not repeat requests");
      await capture(`fire-${width}-completed`, '.fire-panel:not(.income-panel)');
      await changeAge('.fire-panel:not(.income-panel)', 64);
      await until(() => evaluate('!document.querySelector(".fire-panel:not(.income-panel) .comparison-cards")'), Boolean);
      await capture(`fire-${width}-stale`, '.fire-panel:not(.income-panel)');
      baseline.projectionInputs = fireInputs();
      baseline.projectionInputs.accounts[0].openingBalance = 0;
      baseline.projectionInputs.surplusAllocation.targetCashReserveToday = 1000;
      baseline.projectionInputs.surplusAllocation.reserveIndexingRate = 0;
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x=>x.textContent.includes("Use illustrative Ontario")).click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x => x.textContent === "Calculate income curve").click()');
      await until(() => evaluate('document.querySelector(".income-panel")?.textContent.includes("2026-01: Protected reserve is not funded at transition.")'), Boolean);
      assert.equal(await evaluate('document.querySelector(".income-table")?.textContent.includes("1,000 today")'), true);
      assert.equal(await evaluate('document.querySelectorAll(".income-panel details[open]").length'), 0);
      await evaluate('document.querySelector(".income-table details summary").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-table details[open]")'), true);
      await capture(`income-${width}-failure`, '.income-panel');
      await evaluate('document.querySelector(".fire-panel:not(.income-panel) input[type=checkbox]").click()');
      await until(() => evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) button")].some(x => x.textContent === "Calculate FIRE milestones")'), Boolean);
      await evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) button")].find(x => x.textContent === "Calculate FIRE milestones").click()');
      await until(() => evaluate('!!document.querySelector(".fire-panel:not(.income-panel) .comparison-cards")'), Boolean);
      await evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) .comparison-cards article")].find(x => x.querySelector("h3").textContent.includes("Full FIRE")).querySelector("details").open = true');
      await capture(`fire-${width}-failure`, '.fire-panel:not(.income-panel)');
      baseline.projectionInputs = annualTaxCareerInputs();
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-panel .income-curve")'), false);
      console.log(`PASS: synthetic production income and FIRE at ${width}px, expanded controls, chart, exact table, dated failure evidence and opt-out.`);
    }
    if (evidenceDir) await writeFile(join(evidenceDir, "evidence.json"), JSON.stringify({
      fixture: "Synthetic annualTaxCareerInputs and underfunded fireInputs; no private configuration",
      productionProjectionRoute: true, projectionResponses, evidence,
    }, null, 2));
    assert(projections >= 8, "Projection requests must use the real HTTP route");
    assert.deepEqual(exceptions, []);
  } finally {
    ws?.close();
    app.kill("SIGTERM"); chrome.kill("SIGTERM");
    await Promise.all([appClosed, chromeClosed]);
    await rm(profile, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
