export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "lunchmoney-retirement-planner",
    apiVersion: "v1",
    projectionSchemaVersion: "2.0",
  });
}
