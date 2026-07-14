import { demoInputs, demoSources } from "@/src/demo/baseline";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    createProjectionSnapshot(calculateProjection(demoInputs), demoSources),
  );
}
