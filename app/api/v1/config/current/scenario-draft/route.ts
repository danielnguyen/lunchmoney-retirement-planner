import { readCurrentPlannerConfig } from "@/src/config/current";
import {
  applyScenarioDraft,
  previewScenarioDraft,
} from "@/src/config/scenario-draft";
import { PlannerRuntimeError, runtimeErrorResponse } from "@/src/runtime/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const allowedKeys = [
  "contents",
  "expectedVersion",
  "baseline",
  "overrides",
  "action",
  "liveBaselineAction",
] as const;

function requestRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "The scenario draft request body must be a JSON object.",
      400,
    );
  }
  return value as Record<string, unknown>;
}

async function requestPayload(request: Request): Promise<{
  contents: string;
  expectedVersion: string;
  baseline: unknown;
  overrides: Record<string, number>;
  action: "preview" | "apply";
  liveBaselineAction?: "keep" | "replace";
}> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "The scenario draft request body must be valid JSON.",
      400,
    );
  }
  const payload = requestRecord(parsed);
  const unexpected = Object.keys(payload).find(
    (key) => !allowedKeys.includes(key as (typeof allowedKeys)[number]),
  );
  if (unexpected) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      `Unexpected request field: ${unexpected}.`,
      400,
    );
  }
  if (typeof payload.contents !== "string") {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "contents must be YAML text.",
      400,
    );
  }
  if (
    typeof payload.expectedVersion !== "string" ||
    !payload.expectedVersion
  ) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "expectedVersion is required.",
      400,
    );
  }
  if (
    !payload.overrides ||
    typeof payload.overrides !== "object" ||
    Array.isArray(payload.overrides)
  ) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "overrides must be a scenario control value object.",
      400,
    );
  }
  if (payload.action !== "preview" && payload.action !== "apply") {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "action must be preview or apply.",
      400,
    );
  }
  if (
    payload.liveBaselineAction !== undefined &&
    payload.liveBaselineAction !== "keep" &&
    payload.liveBaselineAction !== "replace"
  ) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "liveBaselineAction must be keep or replace.",
      400,
    );
  }
  if (payload.action === "preview" && payload.liveBaselineAction !== undefined) {
    throw new PlannerRuntimeError(
      "invalid_scenario_draft_request",
      "Preview requests cannot select a liveBaselineAction.",
      400,
    );
  }
  return {
    contents: payload.contents,
    expectedVersion: payload.expectedVersion,
    baseline: payload.baseline,
    overrides: payload.overrides as Record<string, number>,
    action: payload.action,
    ...(payload.liveBaselineAction
      ? { liveBaselineAction: payload.liveBaselineAction }
      : {}),
  };
}

export async function POST(request: Request) {
  try {
    const payload = await requestPayload(request);
    const active = await readCurrentPlannerConfig();
    if (active.version !== payload.expectedVersion) {
      throw new PlannerRuntimeError(
        "planner_config_conflict",
        "The planner configuration changed on disk. Revert changes to load the latest contents before applying scenario values.",
        409,
      );
    }
    const result = payload.action === "preview"
      ? previewScenarioDraft(payload)
      : applyScenarioDraft(payload);
    return Response.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return runtimeErrorResponse(error, "scenario_draft_failed");
  }
}
