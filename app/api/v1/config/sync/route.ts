import { gitSyncSettings, syncConfiguredGit, syncFailureMessage, syncSetupMessage } from "@/src/config/git-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

export async function GET() {
  const available = Boolean(gitSyncSettings());
  return reply({ available, message: available ? "Sync applies the committed Git plan and clears temporary controls. Permanent edits belong in GitHub." : syncSetupMessage });
}

export async function POST(request: Request) {
  const settings = gitSyncSettings();
  if (!settings) return reply({ message: syncSetupMessage }, 503);
  // Explicit deployment origin, not attacker-controlled Host/forwarded headers.
  // The custom header requires a CORS preflight; this route grants no CORS access.
  if (request.headers.get("origin") !== settings.origin ||
      request.headers.get("x-planner-sync") !== "1" ||
      (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) {
    return reply({ message: "Sync requires the configured planner browser origin. Open the planner through its private address and retry." }, 403);
  }
  if (new URL(request.url).search ||
      request.headers.has("transfer-encoding") ||
      (request.headers.has("content-length") && request.headers.get("content-length") !== "0")) {
    return reply({ message: "Sync accepts no parameters or request body." }, 400);
  }
  try {
    // Next may expose an empty stream even for a bodyless POST. Inspect it rather
    // than treating stream presence as caller input; stop at the first byte.
    if (request.body) {
      const reader = request.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.byteLength) return reply({ message: "Sync accepts no parameters or request body." }, 400);
        }
      } finally { await reader.cancel(); }
    }
    const revision = await syncConfiguredGit(settings);
    return reply({ revision });
  } catch {
    return reply({ message: syncFailureMessage }, 502);
  }
}
