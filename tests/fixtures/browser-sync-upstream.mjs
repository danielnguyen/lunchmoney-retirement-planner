// Loaded only by the disposable synthetic HTTP/browser acceptance test.
import { readFileSync } from "node:fs";
const fixturePath = process.env.SYNTHETIC_SYNC_FIXTURE;
if (!fixturePath) throw new Error("Synthetic fixture required");
globalThis.fetch = async (input) => {
  const url = new URL(typeof input === "string" ? input : input.url ?? String(input));
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
  if (url.hostname === "api.github.com") {
    if (url.pathname.includes("/commits/")) return Response.json({ sha: fixture.revision });
    if (url.pathname.includes("/git/trees/")) return Response.json({ tree: [{ path: "plan.yaml", mode: "100644", type: "blob", sha: "b".repeat(40) }] });
    if (url.pathname.includes("/contents/")) return Response.json({ type: "file", encoding: "base64", size: Buffer.byteLength(fixture.yaml), sha: "b".repeat(40), content: Buffer.from(fixture.yaml).toString("base64") });
  }
  if (url.hostname === "api.lunchmoney.dev") {
    const resource = url.pathname.split("/").at(-1);
    return Response.json({ [resource]: resource === "manual_accounts" || resource === "plaid_accounts" ? fixture.accounts.filter((a) => a.source === (resource === "manual_accounts" ? "manual" : "plaid")) : [], has_more: false });
  }
  throw new Error("External network disabled in synthetic acceptance");
};
