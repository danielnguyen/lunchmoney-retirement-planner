import { demoSources } from "@/src/demo/baseline";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { validateProjectionInputs } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const projection = calculateProjection(validateProjectionInputs(payload));
    const snapshot = createProjectionSnapshot(projection, demoSources);
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="retirement-projection-${snapshot.generatedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: "export_failed",
        message: error instanceof Error ? error.message : "Export failed",
      },
      { status: 400 },
    );
  }
}
