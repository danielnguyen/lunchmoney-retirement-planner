import { createHash, timingSafeEqual } from "node:crypto";
import { loadCurrentBaseline } from "@/src/domain/baseline/load";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const refuse = (status: number, error: string) => Response.json({ error }, { status, headers });
  const token = process.env.PLANNER_EXPORT_TOKEN;
  if (!token) return refuse(404, "saved_export_disabled");
  const authorization = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${token}`))) {
    return refuse(401, "unauthorized");
  }
  // Next's GET/HEAD adapter drops the body stream. Retained framing headers
  // must also be checked so body-bearing requests never trigger baseline reads.
  const contentLength = request.headers.get("content-length");
  if (new URL(request.url).search || request.body !== null ||
      request.headers.has("transfer-encoding") ||
      (contentLength !== null && contentLength !== "0")) {
    return refuse(400, "saved_export_inputs_not_allowed");
  }
  try {
    const baseline = await loadCurrentBaseline();
    const projection = calculateProjection(baseline.projectionInputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${projectionJsonFilename(snapshot.generatedAt)}"`,
      },
    });
  } catch {
    return refuse(502, "saved_export_failed");
  }
}
