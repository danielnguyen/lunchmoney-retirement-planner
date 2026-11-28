import type { ComparisonScenarioConfig, CareerTransitionConfig, CareerPhaseConfig, PlannerConfig } from "./types";
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
    keys(item, ["id", "label", "spending", "personalContributions", "contributionPolicy", "careerTransition"]);
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
    return { ...(item.careerTransition === undefined ? {} : { careerTransition: parseCareerTransition(item.careerTransition) }), id: label(item.id), label: label(item.label), spending, personalContributions, contributionPolicy: item.contributionPolicy } as ComparisonScenarioConfig;
  });
  unique(scenarios.map((scenario) => scenario.id));
  return scenarios;
}

export function validateComparisonReferences(scenarios: ComparisonScenarioConfig[], config: PlannerConfig): void {
  for (const scenario of scenarios) {
    const career = scenario.careerTransition;
    if (career) {
      if (career.transitionAge < config.currentAge || career.transitionAge > config.retirementAge || career.retirementAge > config.projectionEndAge) invalid("career ages must stay within the baseline working life and projection horizon");
      for (const phase of career.phases) {
        for (const age of [phase.startAge, phase.endAge]) if (Math.abs((age - config.currentAge) * 12 - Math.round((age - config.currentAge) * 12)) > 1e-7) invalid("career ages must align to projection months");
        for (const contribution of phase.contributions) if (!config.accountMappings[contribution.accountId]?.include && !config.projectionAccounts?.[contribution.accountId]) invalid("career contribution must reference an included or projection account");
      }
    }
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

export function parseCareerTransition(value: unknown): CareerTransitionConfig {
  const item = object(value);
  keys(item, ["transitionAge", "retirementAge", "cppBenefitMultiplier", "phases"]);
  const transitionAge = amount(item.transitionAge);
  const retirementAge = amount(item.retirementAge);
  const cppBenefitMultiplier = amount(item.cppBenefitMultiplier);
  if (cppBenefitMultiplier > 1) invalid("CPP lower-benefit multiplier must be between zero and one");
  const phases = array(item.phases).map((raw): CareerPhaseConfig => {
    const p = object(raw);
    keys(p, ["id", "label", "kind", "startAge", "endAge", "annualGrowth", "employment", "annualPensionAdjustmentToday", "annualOtherRoomReductionToday", "essentialMultiplier", "discretionaryMultiplier", "surplusInvesting", "contributions"]);
    if (!["accumulation", "coast", "barista"].includes(String(p.kind))) invalid("unknown career phase kind");
    if (!["retain_as_cash", "configured"].includes(String(p.surplusInvesting))) invalid("choose surplus investing policy");
    if (typeof p.annualGrowth !== "number" || !Number.isFinite(p.annualGrowth) || p.annualGrowth < -.2 || p.annualGrowth > .5) invalid("career growth must be between -0.2 and 0.5");
    const e = object(p.employment);
    keys(e, e.mode === "gross_estimate" ? ["mode", "annualGrossToday"] : ["mode", "annualNetCashToday", "annualTaxableEmploymentIncomeToday", "annualEligibleEarnedIncomeToday"]);
    if (e.mode !== "gross_estimate" && e.mode !== "net_override") invalid("select gross estimate or explicit employment overrides");
    const employment: CareerPhaseConfig["employment"] = e.mode === "gross_estimate"
      ? { mode: e.mode, annualGrossToday: amount(e.annualGrossToday) }
      : { mode: e.mode, annualNetCashToday: amount(e.annualNetCashToday), annualTaxableEmploymentIncomeToday: amount(e.annualTaxableEmploymentIncomeToday), annualEligibleEarnedIncomeToday: amount(e.annualEligibleEarnedIncomeToday) };
    const contributions = array(p.contributions).map((raw): CareerPhaseConfig["contributions"][number] => {
      const c = object(raw);
      keys(c, ["accountId", "monthlyAmountToday", "funding", "employerMonthlyAmountToday", "requirement", "sourceDescription"]);
      if (c.funding !== "cash" && c.funding !== "income_withheld") invalid("choose contribution funding");
      if (c.requirement !== "required" && c.requirement !== "optional") invalid("choose required or optional contribution");
      return { accountId: label(c.accountId), monthlyAmountToday: amount(c.monthlyAmountToday), funding: c.funding, employerMonthlyAmountToday: amount(c.employerMonthlyAmountToday), requirement: c.requirement, sourceDescription: label(c.sourceDescription) };
    });
    unique(contributions.map(c => c.accountId));
    return { id: label(p.id), label: label(p.label), kind: p.kind as CareerPhaseConfig["kind"], startAge: amount(p.startAge), endAge: amount(p.endAge), annualGrowth: p.annualGrowth,
      employment, annualPensionAdjustmentToday: amount(p.annualPensionAdjustmentToday), annualOtherRoomReductionToday: amount(p.annualOtherRoomReductionToday),
      essentialMultiplier: amount(p.essentialMultiplier), discretionaryMultiplier: amount(p.discretionaryMultiplier), surplusInvesting: p.surplusInvesting as CareerPhaseConfig["surplusInvesting"], contributions };
  });
  unique(phases.map(p => p.id));
  if (!phases.length || phases[0].startAge !== transitionAge || phases.at(-1)!.endAge !== retirementAge) invalid("career phases must cover transition through full retirement");
  phases.forEach((p, i) => {
    if (p.endAge <= p.startAge || (i > 0 && Math.abs(p.startAge - phases[i - 1].endAge) > 1e-8)) invalid("career phases must be ordered, contiguous and non-overlapping");
  });
  return { transitionAge, retirementAge, cppBenefitMultiplier, phases };
}
