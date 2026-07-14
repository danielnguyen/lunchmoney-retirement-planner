import { calculateProjection } from "@/src/domain/projection/calculate";
import { projectionToCsv } from "@/src/domain/projection/export";
import { validateProjectionInputs } from "@/src/domain/projection/types";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const projection = calculateProjection(validateProjectionInputs(payload));
    const mode = new URL(request.url).searchParams.get("mode") === "nominal" ? "nominal" : "real";
    const csv = projectionToCsv(projection, mode);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="retirement-projection-${new Date().toISOString().slice(0, 10)}.csv"`,
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
