import { calculateProjection } from "@/src/domain/projection/calculate";
import { validateProjectionInputs } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    return Response.json(calculateProjection(validateProjectionInputs(payload)));
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
