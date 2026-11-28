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
      await evaluate("scrollTo(0, 0)");
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
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.syntheticRequests = [];
      const nativeFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        if (String(args[0]).includes('/api/v1/projections')) {
          window.syntheticRequests.push({ request: JSON.parse(args[1].body), result: await response.clone().json() });
        }
        return response;
      };
    ` });
    for (const width of [390, 1440]) {
      baseline.projectionInputs = annualTaxCareerInputs();
      await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await send("Page.navigate", { url: "about:blank" });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector("#overview")'), Boolean);
      assert.equal(await evaluate('document.querySelectorAll(".income-panel, .fire-panel, .capacity-panel").length'), 0, "Overview must not mount analyses");
      const beforeNavigation = projections;
      await evaluate('location.hash = "/career-independence"');
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      assert.equal(projections, beforeNavigation, "Navigation must reuse the projection");
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
      assert.equal(await evaluate(`(() => {
        const result = window.syntheticRequests.find(x => x.request.employmentIncome).result;
        const point = result.points[0];
        const text = document.querySelector('.analysis-summary').textContent;
        const money = n => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n);
        return [point.required.annualGrossToday, point.required.annualNetCashToday, point.livingCosts.annualGrossToday, point.livingCosts.annualNetCashToday].every(n => text.includes(money(n)));
      })()`), true, "Income summary matches the real response");
      await capture(`income-${width}-completed`, '.income-panel');
      const beforeSelection = projections;
      await evaluate(`(() => { const select = document.querySelector('.analysis-summary select'); select.value = select.options[1].value; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
      assert.equal(projections, beforeSelection, "Selecting an existing point must not calculate");
      await evaluate('location.hash = "overview"');
      await until(() => evaluate('!document.querySelector(".income-panel")'), Boolean);
      await evaluate('history.back()');
      await until(() => evaluate('!!document.querySelector(".income-panel .analysis-summary select")'), Boolean);
      assert.equal(projections, beforeSelection, "Back must retain results without requests");
      assert.equal(await evaluate('document.querySelector(".analysis-summary select").selectedIndex'), 1);
      await evaluate('[...document.querySelectorAll(".income-panel details")].find(x=>x.querySelector("summary").textContent.includes("Chart and tested")).open = true');
      await evaluate('[...document.querySelectorAll(".income-panel details")].find(x=>x.querySelector("summary").textContent.includes("Income curve job terms")).open = true');
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
      await capture(`income-${width}-details`, '.income-panel');
      await changeAge('.income-panel', 64);
      await until(() => evaluate('!document.querySelector(".income-curve")'), Boolean);
      assert.equal(await evaluate('window.incomeRequests'), 1);
      await capture(`income-${width}-stale`, '.income-panel');
      await evaluate('location.hash = "/fire-milestones"');
      await until(() => evaluate('!!document.querySelector(".fire-panel:not(.income-panel) input[type=checkbox]")'), Boolean);
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
      assert.equal(await evaluate(`(() => {
        const result = window.syntheticRequests.find(x => x.request.fireMilestones).result;
        const cards = [...document.querySelectorAll('.fire-panel .analysis-summary article')];
        return result.results.every((r, i) => cards[i].textContent.includes(r.reason) && (!r.candidate || cards[i].textContent.includes(r.candidate.age.toFixed(2))));
      })()`), true, "FIRE summary matches the real response");
      await capture(`fire-${width}-completed`, '.fire-panel:not(.income-panel)');
      await changeAge('.fire-panel:not(.income-panel)', 64);
      await until(() => evaluate('!document.querySelector(".fire-panel:not(.income-panel) .comparison-cards")'), Boolean);
      await capture(`fire-${width}-stale`, '.fire-panel:not(.income-panel)');
      baseline.projectionInputs = fireInputs();
      baseline.projectionInputs.accounts[0].openingBalance = 0;
      baseline.projectionInputs.surplusAllocation.targetCashReserveToday = 1000;
      baseline.projectionInputs.surplusAllocation.reserveIndexingRate = 0;
      await send("Page.navigate", { url: "about:blank" });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}` });
      await until(() => evaluate('!!document.querySelector("#overview")'), Boolean);
      assert.equal(await evaluate('document.querySelectorAll(".income-panel, .fire-panel, .capacity-panel").length'), 0, "Overview must not mount analyses");
      const beforeNegativeNavigation = projections;
      await evaluate('location.hash = "/career-independence"');
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      assert.equal(projections, beforeNegativeNavigation, "Navigation must reuse the projection");
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x=>x.textContent.includes("Use illustrative Ontario")).click()');
      await evaluate('[...document.querySelectorAll(".income-panel button")].find(x => x.textContent === "Calculate income curve").click()');
      await until(() => evaluate('document.querySelector(".income-panel")?.textContent.includes("2026-01: Protected reserve is not funded at transition.")'), Boolean);
      assert.equal(await evaluate('document.querySelector(".income-table")?.textContent.includes("1,000.00 today")'), true);
      assert.equal(await evaluate('document.querySelectorAll(".income-panel details[open]").length'), 0);
      await capture(`income-${width}-unavailable`, '.income-panel');
      await evaluate('[...document.querySelectorAll(".income-panel details")].find(x=>x.querySelector("summary").textContent.includes("Chart and tested")).open = true');
      await evaluate('document.querySelector(".income-table details summary").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-table details[open]")'), true);
      await capture(`income-${width}-failure`, '.income-panel');
      await evaluate('location.hash = "/fire-milestones"');
      await until(() => evaluate('!!document.querySelector(".fire-panel:not(.income-panel) input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".fire-panel:not(.income-panel) input[type=checkbox]").click()');
      await until(() => evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) button")].some(x => x.textContent === "Calculate FIRE milestones")'), Boolean);
      await evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) button")].find(x => x.textContent === "Calculate FIRE milestones").click()');
      await until(() => evaluate('!!document.querySelector(".fire-panel:not(.income-panel) .comparison-cards")'), Boolean);
      await evaluate('[...document.querySelectorAll(".fire-panel:not(.income-panel) .comparison-cards article")].find(x => x.querySelector("h3").textContent.includes("Full FIRE")).querySelector("details").open = true');
      await capture(`fire-${width}-failure`, '.fire-panel:not(.income-panel)');
      await evaluate('location.hash = "/career-independence"');
      await until(() => evaluate('!!document.querySelector(".income-panel input[type=checkbox]")'), Boolean);
      await evaluate('document.querySelector(".income-panel input[type=checkbox]").click()');
      assert.equal(await evaluate('!!document.querySelector(".income-panel .income-curve")'), false);
      baseline.projectionInputs = fireInputs();
      baseline.projectionInputs.accounts[0].openingBalance = 1000000;
      baseline.projectionInputs.monthlyDiscretionarySpendingToday = 1000;
      baseline.projectionInputs.spendingPhases = [{ ...baseline.projectionInputs.spendingPhases[0], endAge: 42 }, { id: "synthetic-retirement", label: "Synthetic retirement", startAge: 42, endAge: baseline.projectionInputs.endAge, essentialMultiplier: 1, discretionaryMultiplier: 1, source: "explicit_configuration" }];
      await send("Page.navigate", { url: "about:blank" });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}/#/spending-capacity` });
      await until(() => evaluate('!!document.querySelector(".capacity-panel")'), Boolean);
      await evaluate('document.querySelector(".capacity-panel > label input").click()');
      await until(() => evaluate('!!document.querySelector(".capacity-panel fieldset input")'), Boolean);
      await evaluate('document.querySelector(".capacity-panel fieldset input").click()');
      await evaluate('[...document.querySelectorAll(".capacity-panel button")].find(x=>x.textContent === "Calculate spending capacity").click()');
      await until(() => evaluate('!!document.querySelector(".capacity-panel .comparison-cards")'), Boolean, 35000);
      assert.equal(await evaluate(`(() => {
        const result = window.syntheticRequests.find(x => x.request.spendingCapacity).result;
        const text = document.querySelector('.analysis-summary').textContent;
        return result.phases.every(p => [p.monthlyLifestyleCapacityToday, p.monthlyEssentialToday, p.monthlyDiscretionaryCapacityToday, p.monthlyDifferenceToday].every(n => text.includes(new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n))));
      })()`), true, "Capacity summary matches the real response");
      await capture(`capacity-${width}-completed`, '.capacity-panel');
      assert.equal(await evaluate('document.querySelectorAll(".capacity-panel details[open]").length'), 0);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, "No page overflow");
      assert.equal(await evaluate('localStorage.length + sessionStorage.length'), 0, "No financial values persisted");
      assert.equal(await evaluate('location.hash'), '#/spending-capacity');
      const beforeReturn = projections;
      await evaluate('location.hash = "overview"');
      await until(() => evaluate('!document.querySelector(".capacity-panel")'), Boolean);
      await evaluate('history.back()');
      await until(() => evaluate('!!document.querySelector(".capacity-panel .comparison-cards")'), Boolean);
      await evaluate('history.forward()');
      await until(() => evaluate('!document.querySelector(".capacity-panel")'), Boolean);
      assert.equal(projections, beforeReturn);
      await send("Emulation.setEmulatedMedia", { media: "print" });
      assert.equal(await evaluate('getComputedStyle(document.querySelector("#overview")).display !== "none"'), true);
      await send("Emulation.setEmulatedMedia", { media: "screen" });
      await evaluate('[...document.querySelectorAll("button")].find(x => x.textContent.trim() === "Planner Config").click()');
      await until(() => evaluate('!!document.getElementById("drawer-monthlyEssentialSpendingToday")'), Boolean);
      await evaluate(`(() => {
        const input = document.getElementById("drawer-monthlyEssentialSpendingToday");
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1234');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
      })()`);
      await until(() => evaluate('window.syntheticRequests.at(-1)?.request.inputs.monthlyEssentialSpendingToday === 1234'), Boolean);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
      const beforeOverrideNavigation = projections;
      for (const page of ['career-independence', 'fire-milestones', 'spending-capacity']) {
        await evaluate(`location.hash = '/${page}'`);
        await until(() => evaluate(`document.querySelector('[aria-current="page"]')?.getAttribute('href') === '#/${page}'`), Boolean);
      }
      assert.equal(projections, beforeOverrideNavigation, "Temporary override navigation must not project again");
      await evaluate('[...document.querySelectorAll(".capacity-panel button")].find(x=>x.textContent === "Calculate spending capacity").click()');
      await until(() => evaluate('window.syntheticRequests.at(-1)?.request.spendingCapacity && window.syntheticRequests.at(-1)?.request.inputs.monthlyEssentialSpendingToday === 1234'), Boolean);
      assert.equal(await evaluate('localStorage.length + sessionStorage.length'), 0);
      for (const page of ['career-independence', 'fire-milestones', 'spending-capacity']) {
        await send("Page.navigate", { url: "about:blank" });
        await send("Page.navigate", { url: `http://127.0.0.1:${appPort}/#/${page}` });
        await until(() => evaluate(`document.querySelector('[aria-current="page"]')?.getAttribute('href') === '#/${page}'`), Boolean);
        await until(() => evaluate('window.syntheticRequests.length === 1'), Boolean);
        assert.equal(await evaluate('!!window.syntheticRequests[0].request.inputs && !window.syntheticRequests[0].request.employmentIncome && !window.syntheticRequests[0].request.fireMilestones && !window.syntheticRequests[0].request.spendingCapacity'), true);
      }
      await evaluate(`document.querySelector('nav[aria-label="Planner pages"] a').focus()`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate('document.activeElement.textContent'), 'Career independence');
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await until(() => evaluate('document.activeElement.id === "income-heading"'), Boolean);
      // A valid zero-base fixture must explain unavailability, not invent capacity.
      baseline.projectionInputs.monthlyDiscretionarySpendingToday = 0;
      await send("Page.navigate", { url: "about:blank" });
      await send("Page.navigate", { url: `http://127.0.0.1:${appPort}/#/spending-capacity` });
      await until(() => evaluate('!!document.querySelector(".capacity-panel")'), Boolean);
      await evaluate('document.querySelector(".capacity-panel > label input").click()');
      await until(() => evaluate('!!document.querySelector(".capacity-panel fieldset input")'), Boolean);
      await evaluate('document.querySelector(".capacity-panel fieldset input").click()');
      await evaluate('[...document.querySelectorAll(".capacity-panel button")].find(x=>x.textContent === "Calculate spending capacity").click()');
      await until(() => evaluate('document.querySelector(".capacity-panel .analysis-summary")?.textContent.includes("positive configured discretionary spending base")'), Boolean);
      assert.equal(await evaluate('!!document.querySelector(".capacity-panel .comparison-cards")'), false);
      await capture(`capacity-${width}-unavailable`, '.capacity-panel');
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
