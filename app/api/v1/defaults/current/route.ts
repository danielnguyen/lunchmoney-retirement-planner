import { demoBaseline } from "@/src/demo/baseline";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    schemaVersion: "1.0",
    values: demoBaseline,
  });
}
