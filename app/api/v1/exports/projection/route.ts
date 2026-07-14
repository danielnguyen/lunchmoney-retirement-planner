import { ZodError } from "zod";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { projectionInputsSchema } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const inputs = projectionInputsSchema.parse(payload);
    const snapshot = createProjectionSnapshot(calculateProjection(inputs));

    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="retirement-projection-${snapshot.generatedAt.slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "invalid_projection_inputs", issues: error.issues },
        { status: 400 },
      );
    }

    return Response.json({ error: "export_failed" }, { status: 500 });
  }
}
