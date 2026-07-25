import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Node as YamlNode,
  type Scalar,
  type YAMLMap,
} from "yaml";
import { parseAndValidatePlannerConfig } from "@/src/config/loader";
import type { PlannerConfig } from "@/src/config/types";
import { validateProjectionInputs, type ProjectionInputs } from "@/src/domain/projection/types";
import {
  buildControls,
  type ConfigBinding,
  type ControlDefinition,
  type LiveBaselineConversion,
  type Overrides,
  type ScenarioConfigTarget,
  type ScenarioPersistence,
} from "@/src/domain/scenario/controls";
import { PlannerRuntimeError } from "@/src/runtime/errors";

export type ScenarioReviewItem = {
  key: string;
  label: string;
  formattedBaselineValue: string;
  formattedScenarioValue: string;
  source: string;
  consequence: string;
};

export type ScenarioPreview = {
  directChanges: ScenarioReviewItem[];
  liveBaselineConversions: ScenarioReviewItem[];
  scenarioOnlyChanges: ScenarioReviewItem[];
};

export type AppliedScenarioChange = ScenarioReviewItem & {
  kind: "config" | "live_baseline_conversion";
};

export type SkippedScenarioChange = ScenarioReviewItem & {
  kind: "live_baseline_kept" | "scenario_only";
};

export type ScenarioApplyResult = {
  contents: string;
  appliedChanges: AppliedScenarioChange[];
  skippedChanges: SkippedScenarioChange[];
};

type ClassifiedOverride = {
  control: ControlDefinition;
  value: number;
  persistence: ScenarioPersistence;
  review: ScenarioReviewItem;
};

type ScenarioDraftInput = {
  contents: string;
  baseline: unknown;
  overrides: Overrides;
};

function invalidOverride(message: string): never {
  throw new PlannerRuntimeError("invalid_scenario_override", message, 422);
}

function sourceFor(
  control: ControlDefinition,
  persistence: ScenarioPersistence,
): string {
  if (persistence.kind === "live_baseline_conversion") {
    return "Live Lunch Money baseline (live_baseline)";
  }
  if (persistence.kind === "config") return "planner.local.yaml";
  if (control.key === "primaryResidence.currentValue") {
    return "Live Lunch Money account value";
  }
  if (
    control.key === "monthlyEssentialSpendingToday" ||
    control.key === "monthlyDiscretionarySpendingToday"
  ) {
    return "Live Lunch Money transaction baseline";
  }
  return "Current resolved baseline";
}

function consequenceFor(persistence: ScenarioPersistence): string {
  if (persistence.kind === "config") {
    return "Updates the corresponding configured scalar in the YAML draft only.";
  }
  if (persistence.kind === "live_baseline_conversion") {
    return persistence.consequence;
  }
  return persistence.reason;
}

function classifyOverrides(input: ScenarioDraftInput): {
  config: PlannerConfig;
  baseline: ProjectionInputs;
  classified: ClassifiedOverride[];
} {
  const config = parseAndValidatePlannerConfig(
    input.contents,
    "YAML",
    "provided to the scenario draft editor",
  );
  let baseline: ProjectionInputs;
  try {
    baseline = validateProjectionInputs(input.baseline);
  } catch (error) {
    throw new PlannerRuntimeError(
      "invalid_scenario_baseline",
      error instanceof Error
        ? error.message
        : "The active projection baseline is invalid.",
      422,
    );
  }
  const controls = buildControls(baseline);
  const controlsByKey = new Map(controls.map((control) => [control.key, control]));
  const classified: ClassifiedOverride[] = [];
  for (const [key, value] of Object.entries(input.overrides)) {
    const control = controlsByKey.get(key);
    if (!control) {
      throw new PlannerRuntimeError(
        "unknown_scenario_control",
        `Unknown scenario control key: ${key}.`,
        400,
      );
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      invalidOverride(`${control.label} must be a finite number.`);
    }
    const minimum = control.min(baseline);
    const maximum = control.max(baseline);
    if (value < minimum || value > maximum) {
      invalidOverride(
        `${control.label} must be between ${minimum} and ${maximum}.`,
      );
    }
    if (control.kind === "age" && !Number.isInteger(value)) {
      invalidOverride(`${control.label} must be a whole-number age.`);
    }
    const persistence = control.persistence(config);
    classified.push({
      control,
      value,
      persistence,
      review: {
        key,
        label: control.label,
        formattedBaselineValue: control.format(control.get(baseline)),
        formattedScenarioValue: control.format(value),
        source: sourceFor(control, persistence),
        consequence: consequenceFor(persistence),
      },
    });
  }
  return { config, baseline, classified };
}

export function previewScenarioDraft(input: ScenarioDraftInput): ScenarioPreview {
  const { classified } = classifyOverrides(input);
  return {
    directChanges: classified
      .filter((item) => item.persistence.kind === "config")
      .map((item) => item.review),
    liveBaselineConversions: classified
      .filter((item) => item.persistence.kind === "live_baseline_conversion")
      .map((item) => item.review),
    scenarioOnlyChanges: classified
      .filter((item) => item.persistence.kind === "scenario_only")
      .map((item) => item.review),
  };
}

function mapValue(node: YamlNode, key: string, label: string): YamlNode {
  if (!isMap(node)) {
    throw new PlannerRuntimeError(
      "scenario_binding_unavailable",
      `${label} cannot be applied because its configured parent is not an editable YAML mapping.`,
      422,
    );
  }
  const matches = (node as YAMLMap<YamlNode, YamlNode>).items.filter(
    (pair) => isScalar(pair.key) && String(pair.key.value) === key,
  );
  if (matches.length !== 1 || !matches[0]!.value) {
    throw new PlannerRuntimeError(
      "scenario_binding_unavailable",
      `${label} cannot be applied because its configured destination is missing or ambiguous.`,
      422,
    );
  }
  return matches[0]!.value;
}

function sequenceItem(node: YamlNode, itemId: string, label: string): YamlNode {
  if (!isSeq(node)) {
    throw new PlannerRuntimeError(
      "scenario_binding_unavailable",
      `${label} cannot be applied because its configured collection is not an editable YAML sequence.`,
      422,
    );
  }
  const matches = node.items.filter((item): item is YamlNode => {
    if (!item || !isMap(item)) return false;
    const idNode = mapValue(item, "id", label);
    return isScalar(idNode) && idNode.value === itemId;
  });
  if (matches.length !== 1) {
    throw new PlannerRuntimeError(
      "scenario_binding_unavailable",
      `${label} cannot be applied because no unique configured item id matches it.`,
      422,
    );
  }
  return matches[0]!;
}

function scalarNode(
  root: YamlNode,
  target: ScenarioConfigTarget,
  label: string,
): Scalar {
  let current = root;
  for (const segment of target.segments) {
    current = typeof segment === "string"
      ? mapValue(current, segment, label)
      : sequenceItem(current, segment.itemId, label);
  }
  if (!isScalar(current) || !current.range) {
    throw new PlannerRuntimeError(
      "scenario_binding_unsupported_yaml",
      `${label} uses a YAML alias or construct that cannot be edited safely. Replace it with a direct scalar before applying this scenario.`,
      422,
    );
  }
  return current;
}

function serializeNumber(value: number): string {
  if (Object.is(value, -0)) return "0";
  const text = String(value);
  if (!/[eE]/.test(text)) return text;
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!match) return text;
  const [, sign, whole, fraction = "", exponentText] = match;
  const digits = `${whole}${fraction}`;
  const decimalPosition = whole!.length + Number(exponentText);
  if (decimalPosition <= 0) {
    return `${sign}0.${"0".repeat(-decimalPosition)}${digits}`;
  }
  if (decimalPosition >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalPosition - digits.length)}`;
  }
  return `${sign}${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`;
}

type TextEdit = {
  start: number;
  end: number;
  replacement: string;
};

function bindingTargets(
  persistence: ConfigBinding | LiveBaselineConversion,
): ScenarioConfigTarget[] {
  return persistence.targets;
}

function patchContents(
  contents: string,
  changes: ClassifiedOverride[],
): string {
  const document = parseDocument(contents, {
    keepSourceTokens: true,
    prettyErrors: false,
  });
  if (document.errors.length > 0 || !document.contents) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The planner configuration provided to the scenario draft editor is not valid YAML.",
      422,
    );
  }
  const editsByRange = new Map<string, TextEdit>();
  for (const change of changes) {
    if (change.persistence.kind === "scenario_only") continue;
    for (const target of bindingTargets(change.persistence)) {
      const node = scalarNode(document.contents, target, change.control.label);
      const [start, end] = node.range!;
      const edit = {
        start,
        end,
        replacement: serializeNumber(change.value),
      };
      const rangeKey = `${start}:${end}`;
      const existing = editsByRange.get(rangeKey);
      if (existing && existing.replacement !== edit.replacement) {
        throw new PlannerRuntimeError(
          "scenario_binding_conflict",
          `${change.control.label} resolves to a configuration scalar already targeted by another override.`,
          422,
        );
      }
      editsByRange.set(rangeKey, edit);
    }
  }
  const edits = [...editsByRange.values()].sort((left, right) => right.start - left.start);
  for (let index = 1; index < edits.length; index += 1) {
    const previous = edits[index - 1]!;
    const current = edits[index]!;
    if (current.end > previous.start) {
      throw new PlannerRuntimeError(
        "scenario_binding_conflict",
        "Scenario configuration edits overlap and cannot be applied safely.",
        422,
      );
    }
  }
  let patched = contents;
  for (const edit of edits) {
    patched = `${patched.slice(0, edit.start)}${edit.replacement}${patched.slice(edit.end)}`;
  }
  parseAndValidatePlannerConfig(
    patched,
    "YAML",
    "after applying scenario changes",
  );
  return patched;
}

export function applyScenarioDraft(
  input: ScenarioDraftInput & {
    liveBaselineAction?: "keep" | "replace";
  },
): ScenarioApplyResult {
  const { classified } = classifyOverrides(input);
  const conversions = classified.filter(
    (item) => item.persistence.kind === "live_baseline_conversion",
  );
  if (conversions.length > 0 && !input.liveBaselineAction) {
    throw new PlannerRuntimeError(
      "live_baseline_action_required",
      "Choose whether to keep live baseline values or replace them with fixed configured values.",
      400,
    );
  }
  const applied = classified.filter(
    (item) =>
      item.persistence.kind === "config" ||
      (item.persistence.kind === "live_baseline_conversion" &&
        input.liveBaselineAction === "replace"),
  );
  const skipped = classified.filter(
    (item) =>
      item.persistence.kind === "scenario_only" ||
      (item.persistence.kind === "live_baseline_conversion" &&
        input.liveBaselineAction === "keep"),
  );
  return {
    contents: applied.length > 0
      ? patchContents(input.contents, applied)
      : input.contents,
    appliedChanges: applied.map((item) => ({
      ...item.review,
      kind: item.persistence.kind as "config" | "live_baseline_conversion",
    })),
    skippedChanges: skipped.map((item) => ({
      ...item.review,
      kind: item.persistence.kind === "scenario_only"
        ? "scenario_only"
        : "live_baseline_kept",
    })),
  };
}
