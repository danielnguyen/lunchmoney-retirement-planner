import { ZodError } from "zod";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { projectionInputsSchema } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const inputs = projectionInputsSchema.parse(payload);
    return Response.json(calculateProjection(inputs));
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "invalid_projection_inputs", issues: error.issues },
        { status: 400 },
      );
    }

    return Response.json({ error: "projection_failed" }, { status: 500 });
  }
}
