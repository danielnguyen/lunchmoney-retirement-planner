import { calculateProjection } from "@/src/domain/projection/calculate";
import { validateProjectionInputs } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || !("inputs" in payload)) {
      throw new Error("Projection request must contain inputs");
    }
    const inputs = validateProjectionInputs((payload as { inputs: unknown }).inputs);
    return Response.json(calculateProjection(inputs));
  } catch (error) {
    return Response.json(
      {
        error: "invalid_projection_inputs",
        message: error instanceof Error ? error.message : "Projection failed",
      },
      { status: 400 },
    );
  }
}
