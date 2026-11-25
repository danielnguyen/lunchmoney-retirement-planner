// Run after npm run build: node --import tsx tests/export-http.ts
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { request } from "node:http";
import { createServer } from "node:net";
import { resolve } from "node:path";

const token = "synthetic-http-export-token";
const route = "/api/v1/exports/projection";

async function withServer(credential: string, test: (port: number) => Promise<void>) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((done) => listener.close(() => done()));
  const child = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
    env: {
      ...process.env, HOSTNAME: "127.0.0.1", PORT: String(port),
      PLANNER_EXPORT_TOKEN: credential, LUNCHMONEY_API_TOKEN: "",
      PLANNER_CONFIG_PATH: "/nonexistent/synthetic-config.yaml",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = once(child, "close");
  child.stderr.resume();
  try {
    await new Promise<void>((ready, reject) => {
      const timer = setTimeout(() => reject(new Error("Synthetic HTTP server startup timed out")), 15_000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Synthetic HTTP server exited")); });
      child.stdout.on("data", (data: Buffer) => {
        if (data.toString().includes("Ready")) { clearTimeout(timer); ready(); }
      });
    });
    await test(port);
  } finally {
    child.kill("SIGTERM");
    await closed;
  }
}

async function check(port: number, headers: Record<string, string>, expected: number, body?: string, query = "") {
  const result = await new Promise<{ status: number; cache: string | undefined; body: string }>((done, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path: route + query, method: "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { text += chunk; });
      res.on("end", () => done({ status: res.statusCode!, cache: res.headers["cache-control"], body: text }));
    });
    req.setTimeout(10_000, () => req.destroy(new Error("Synthetic HTTP request timed out")));
    req.on("error", reject);
    req.end(body);
  });
  assert.equal(result.status, expected);
  assert.equal(result.cache, "no-store");
  if (expected === 400) assert.deepEqual(JSON.parse(result.body), { error: "saved_export_inputs_not_allowed" });
  if (expected === 502) assert.deepEqual(JSON.parse(result.body), { error: "saved_export_failed" });
}

async function main() {
  const auth = { authorization: `Bearer ${token}` };
  await withServer("", async (port) => check(port, auth, 404));
  await withServer(token, async (port) => {
    await check(port, {}, 401);
    await check(port, { authorization: "Bearer incorrect-synthetic-token" }, 401);
    await check(port, auth, 400, undefined, "?overrides={}");
    await check(port, { ...auth, "content-length": "2" }, 400, "{}");
    await check(port, { ...auth, "transfer-encoding": "chunked" }, 400, "{}");
    // With no upstream credential, an allowed request reaches the sanitized
    // missing-token failure. Body refusals above must never reach that path.
    await check(port, auth, 502);
    await check(port, { ...auth, "content-length": "0" }, 502);
  });
  console.log("PASS: eight production HTTP export checks, including Content-Length and chunked GET body refusal.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
