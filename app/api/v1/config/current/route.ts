import {
  readCurrentPlannerConfig,
  saveCurrentPlannerConfig,
  validateCurrentPlannerConfig,
} from "@/src/config/current";
import { PlannerRuntimeError, runtimeErrorResponse } from "@/src/runtime/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_config_request",
      "The request body must be a JSON object.",
      400,
    );
  }
  return value as Record<string, unknown>;
}

async function requestPayload(
  request: Request,
  allowedKeys: ReadonlyArray<string>,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new PlannerRuntimeError(
      "invalid_config_request",
      "The request body must be valid JSON.",
      400,
    );
  }
  const payload = assertObject(parsed);
  const unexpectedKeys = Object.keys(payload).filter(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpectedKeys.length > 0) {
    throw new PlannerRuntimeError(
      "invalid_config_request",
      `Unexpected request field: ${unexpectedKeys[0]}.`,
      400,
    );
  }
  if (typeof payload.contents !== "string") {
    throw new PlannerRuntimeError(
      "invalid_config_request",
      "contents must be YAML text.",
      400,
    );
  }
  return payload;
}

export async function GET() {
  try {
    return Response.json(await readCurrentPlannerConfig(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return runtimeErrorResponse(error, "planner_config_read_failed");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await requestPayload(request, ["contents"]);
    validateCurrentPlannerConfig(payload.contents as string);
    return Response.json(
      { valid: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return runtimeErrorResponse(error, "planner_config_validation_failed");
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await requestPayload(request, ["contents", "expectedVersion"]);
    if (typeof payload.expectedVersion !== "string" || !payload.expectedVersion) {
      throw new PlannerRuntimeError(
        "invalid_config_request",
        "expectedVersion is required.",
        400,
      );
    }
    return Response.json(
      await saveCurrentPlannerConfig(
        payload.contents as string,
        payload.expectedVersion,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return runtimeErrorResponse(error, "planner_config_save_failed");
  }
}
