import { demoInputs, demoSources } from "@/src/demo/baseline";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    schemaVersion: "2.0",
    inputs: demoInputs,
    sources: demoSources,
  });
}
