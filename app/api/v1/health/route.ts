import { plannerConfigPresent } from "@/src/config/loader";

export const dynamic = "force-dynamic";

export async function GET() {
  const tokenConfigured = Boolean(process.env.LUNCHMONEY_API_TOKEN);
  const configPresent = await plannerConfigPresent();
  return Response.json({
    status: tokenConfigured && configPresent ? "ok" : "configuration_required",
    service: "lunchmoney-retirement-planner",
    apiVersion: "v1",
    baselineSchemaVersion: "1.5",
    projectionSchemaVersion: "7.0",
    configuration: {
      lunchMoneyTokenConfigured: tokenConfigured,
      plannerConfigPresent: configPresent,
    },
    lunchMoney: {
      status: tokenConfigured ? "not_checked" : "missing_token",
      message: tokenConfigured
        ? "Use /api/v1/lunchmoney/status to perform a read-only connection check."
        : "LUNCHMONEY_API_TOKEN is not configured.",
    },
  });
}
