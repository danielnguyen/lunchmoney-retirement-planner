import type { ComparisonScenarioConfig, PlannerConfig } from "./types";
import { PlannerRuntimeError } from "@/src/runtime/errors";

function invalid(message: string): never {
  throw new PlannerRuntimeError("invalid_planner_config", `scenarioComparison: ${message}`, 422);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("expected an object");
  return value as Record<string, unknown>;
}
function keys(item: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(item).some((key) => !allowed.includes(key))) invalid("unsupported configuration field");
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) invalid("IDs and labels must be nonblank strings");
  return value as string;
}
function amount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) invalid("amounts and multipliers must be finite, non-negative and representable with safe cent precision");
  return value as number;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid("spending and personalContributions must be explicit arrays");
  return value as unknown[];
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) invalid("duplicate scenario or phase selection");
}

export function parseComparisonScenarios(value: unknown): ComparisonScenarioConfig[] {
  const scenarios = array(value).map((raw): ComparisonScenarioConfig => {
    const item = object(raw);
    keys(item, ["id", "label", "spending", "personalContributions", "contributionPolicy"]);
    if (item.contributionPolicy !== "configured_fixed_plan" && item.contributionPolicy !== "cash_constrained") invalid("choose an explicit contributionPolicy");
    const spending = array(item.spending).map((raw) => {
      const entry = object(raw);
      keys(entry, ["phaseId", "adjustment"]);
      const adjustment = object(entry.adjustment);
      keys(adjustment, adjustment.mode === "annual_lifestyle_budget" ? ["mode", "annualAmountToday"] : ["mode", "essentialMultiplier", "discretionaryMultiplier"]);
      const phaseId = label(entry.phaseId);
      if (adjustment.mode === "annual_lifestyle_budget") return { phaseId, adjustment: { mode: adjustment.mode, annualAmountToday: amount(adjustment.annualAmountToday) } };
      if (adjustment.mode !== "multipliers") invalid("unknown spending adjustment mode");
      return { phaseId, adjustment: { mode: adjustment.mode, essentialMultiplier: amount(adjustment.essentialMultiplier), discretionaryMultiplier: amount(adjustment.discretionaryMultiplier) } };
    });
    const personalContributions = array(item.personalContributions).map((raw) => {
      const entry = object(raw);
      keys(entry, ["phaseId", "target", "monthlyAmountToday"]);
      const target = object(entry.target);
      keys(target, target.mode === "account" ? ["mode", "accountId"] : ["mode"]);
      if (target.mode !== "personal_investing" && target.mode !== "account") invalid("unknown contribution target");
      return {
        target: target.mode === "account" ? { mode: target.mode, accountId: label(target.accountId) } : { mode: target.mode },
        phaseId: label(entry.phaseId), monthlyAmountToday: amount(entry.monthlyAmountToday),
      };
    });
    unique(spending.map((entry) => entry.phaseId));
    unique(personalContributions.map((entry) => `${entry.target.mode === "account" ? entry.target.accountId : "personal_investing"}/${entry.phaseId}`));
    return { id: label(item.id), label: label(item.label), spending, personalContributions, contributionPolicy: item.contributionPolicy } as ComparisonScenarioConfig;
  });
  unique(scenarios.map((scenario) => scenario.id));
  return scenarios;
}

export function validateComparisonReferences(scenarios: ComparisonScenarioConfig[], config: PlannerConfig): void {
  for (const scenario of scenarios) {
    for (const entry of scenario.spending) {
      const phase = config.spendingPhases?.find((phase) => phase.id === entry.phaseId);
      if (!phase) invalid("spending selection must reference an explicit existing phase");
      if (phase.endAge > config.retirementAge) invalid("working-life spending selections must end by retirement");
    }
    for (const entry of scenario.personalContributions) {
      const phases = entry.target.mode === "personal_investing"
        ? config.savingsPolicy?.personalInvesting.phases
        : config.configurationMode === "advanced"
          ? (config.accountMappings[entry.target.accountId]?.include ? config.accountMappings[entry.target.accountId]?.contributionPhases : undefined) ?? config.projectionAccounts?.[entry.target.accountId]?.contributionPhases
          : undefined;
      const phase = phases?.find((phase) => phase.id === entry.phaseId);
      if (!phase || ("funding" in phase && phase.funding !== "cash")) invalid("personal contribution selection must reference an existing cash-funded phase");
    }
  }
}
