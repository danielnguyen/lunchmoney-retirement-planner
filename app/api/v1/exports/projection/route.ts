import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  validateProjectionExportRequest,
} from "@/src/domain/projection/export";
import { projectionJsonFilename } from "@/src/domain/projection/filenames";

export async function POST(request: Request) {
  try {
    const payload = validateProjectionExportRequest(await request.json());
    const projection = calculateProjection(payload.inputs);
    const snapshot = createProjectionSnapshot(projection, payload.baseline, payload.overrides);
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${projectionJsonFilename(snapshot.generatedAt)}"`,
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
