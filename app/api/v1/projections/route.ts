import { parseComparisonScenarios } from "@/src/config/scenario-comparison";
import { calculateComparison } from "@/src/domain/scenario/comparison";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { validateProjectionInputs } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    if (!payload || typeof payload !== "object" || !("inputs" in payload)) {
      throw new Error("Projection request must contain inputs");
    }
    const inputs = validateProjectionInputs((payload as { inputs: unknown }).inputs);
    if ("scenarioComparison" in payload) {
      return Response.json(calculateComparison(inputs, parseComparisonScenarios(payload.scenarioComparison)));
    }
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
