import type { CurrentBaseline } from "@/src/domain/baseline/types";
import type { DisplayMode } from "@/src/domain/projection/presentation";
import type { ProjectionInputs, ProjectionResult } from "@/src/domain/projection/types";

export const explanationTargets = [
  "starting-financial-assets",
  "assets-at-retirement",
  "retirement-goal",
  "goal-gap",
  "financial-assets-duration",
  "annual-spending",
  "annual-funding",
  "annual-outflows",
  "account-burndown",
  "asset-allocation",
  "annual-ledger",
  "baseline-income",
  "baseline-essential",
  "baseline-discretionary",
  "baseline-contributions",
  "baseline-recurring",
  "lunchmoney-accounts",
] as const;

export type ExplanationTarget = (typeof explanationTargets)[number];

export type ExplanationSourceType =
  | "lunchmoney"
  | "configuration"
  | "override"
  | "projection";

export type ExplanationStep = {
  label: string;
  value: string;
  rawValue?: number;
  operation?: "input" | "add" | "subtract" | "result";
  sourceType?: ExplanationSourceType;
  sourceDescription?: string;
  effectiveDate?: string;
};

export type ExplanationDataSection = {
  title: string;
  description?: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number>>;
  initiallyExpanded?: boolean;
};

export type ExplanationDocument = {
  id: ExplanationTarget;
  title: string;
  plainLanguage: string;
  displayedResult?: {
    label: string;
    value: string;
    dollarMode?: DisplayMode;
    period?: string;
  };
  formula?: string;
  steps: ExplanationStep[];
  dataSections: ExplanationDataSection[];
  assumptions: Array<{
    label: string;
    value: string;
    sourceType: ExplanationSourceType;
    sourceDescription?: string;
    effectiveDate?: string;
  }>;
  caveats: string[];
  reconciliation?: {
    matched: boolean;
    calculatedValue: number;
    displayedValue: number;
  };
  unavailableEvidence?: string[];
};

export type ExplanationContext = {
  baseline: CurrentBaseline;
  inputs: ProjectionInputs;
  overrides: Record<string, number>;
  projection: ProjectionResult;
  displayMode: DisplayMode;
  selectedAllocationYear: number;
};
