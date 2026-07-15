import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
  validateProjectionExportRequest,
} from "@/src/domain/projection/export";

export async function POST(request: Request) {
  try {
    const payload = validateProjectionExportRequest(await request.json());
    const projection = calculateProjection(payload.inputs);
    const snapshot = createProjectionSnapshot(projection, payload.baseline, payload.overrides);
    const mode = new URL(request.url).searchParams.get("mode") === "nominal" ? "nominal" : "real";
    const csv = projectionSnapshotToCsv(snapshot, mode);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="share-safe-retirement-projection-${new Date().toISOString().slice(0, 10)}.csv"`,
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
