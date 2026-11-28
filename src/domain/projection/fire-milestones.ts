import type { ProjectionInputsWithReturnPaths } from "./return-path-model";
import type { CareerTransitionConfig } from "@/src/config/types";
import { parseCareerTransition } from "@/src/config/scenario-comparison";
import { applyCareerTransition } from "@/src/domain/scenario/career";
import { evaluateMilestoneFunding } from "./calculate";
import { validateProjectionInputs, type ProjectionInputs } from "./types";

export type FireKind = "coast" | "barista" | "full";
export type FireMilestoneRequest = {
  retirementAge: number;
  stepMonths: number;
  coast: CareerTransitionConfig | null;
  barista: CareerTransitionConfig | null;
  fullCppBenefitMultiplier: number;
};
export type FireCandidate = { age: number; date: string; passes: boolean; reason: string | null; terminalFinancialAssetsToday: number | null; provisionalTax: boolean };
export type FireMilestone = {
  kind: FireKind;
  path: "baseline" | "stress";
  status: "met_at_start" | "future" | "not_found" | "unavailable";
  reason: string;
  candidate: FireCandidate | null;
  tested: FireCandidate[];
};
export type FireMilestoneResult = {
  effectiveDate: string;
  request: FireMilestoneRequest;
  lastCandidateAge: number;
  results: FireMilestone[];
  stressConfigured: boolean;
};

export function parseFireMilestoneRequest(raw: unknown): FireMilestoneRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("FIRE assumptions must be an object.");
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !["retirementAge", "stepMonths", "coast", "barista", "fullCppBenefitMultiplier"].includes(k))) throw new Error("Unknown FIRE assumption.");
  if (typeof r.retirementAge !== "number" || !Number.isFinite(r.retirementAge)) throw new Error("Choose a full retirement age.");
  if (r.stepMonths !== 1 && r.stepMonths !== 3 && r.stepMonths !== 12) throw new Error("Candidate spacing must be 1, 3 or 12 months.");
  if (typeof r.fullCppBenefitMultiplier !== "number" || !Number.isFinite(r.fullCppBenefitMultiplier) || r.fullCppBenefitMultiplier < 0 || r.fullCppBenefitMultiplier > 1) throw new Error("Choose a Full FIRE CPP multiplier between zero and one.");
  const template = (value: unknown, kind: "coast" | "barista") => {
    if (value === null) return null;
    const career = parseCareerTransition(value);
    if (career.phases.length !== 1 || career.phases[0].kind !== kind) throw new Error(`Select one ${kind} interval as the milestone employment template.`);
    return career;
  };
  return { retirementAge: r.retirementAge, stepMonths: r.stepMonths, fullCppBenefitMultiplier: r.fullCppBenefitMultiplier,
    coast: template(r.coast, "coast"), barista: template(r.barista, "barista") };
}

/** Keep every accumulation assumption before the boundary, including dated events. */
export function materializeFireCandidate(baseline: ProjectionInputs, request: FireMilestoneRequest, kind: FireKind, age: number): ProjectionInputs {
  const inputs = structuredClone(baseline);
  if (kind !== "full" && age < request.retirementAge - 1e-8) {
    const template = request[kind];
    if (!template) throw new Error(`Configure ${kind} employment terms first.`);
    applyCareerTransition(inputs, { ...template, transitionAge: age, retirementAge: request.retirementAge,
      phases: [{ ...template.phases[0], startAge: age, endAge: request.retirementAge }] });
  } else {
    const oldRetirement = inputs.person.retirementAge;
    const prefix = <T extends { startAge: number; endAge: number }>(phases: T[]) => phases.filter(p => p.startAge < age - 1e-8).map(p => ({ ...p, endAge: Math.min(p.endAge, age) }));
    inputs.person.employmentIncomePhases = prefix(inputs.person.employmentIncomePhases);
    for (const account of inputs.accounts) account.contributionPhases = prefix(account.contributionPhases);
    inputs.contributionWaterfall.routes = inputs.contributionWaterfall.routes.filter(r => inputs.accounts.find(a => a.id === r.sourceAccountId)!.contributionPhases.length > 0);
    if (inputs.savingsPolicy.mode === "simple") inputs.savingsPolicy.reserveBuildingPhases = prefix(inputs.savingsPolicy.reserveBuildingPhases);
    const retired = inputs.spendingPhases.filter(p => p.endAge > Math.max(oldRetirement, age)).map(p => ({ ...p, id: `${p.id}:fire-retirement`, startAge: Math.max(age, p.startAge) }));
    if (!retired.length && age < inputs.endAge) throw new Error("No retirement spending interval is configured.");
    if (retired.length) retired[0].startAge = age;
    inputs.spendingPhases = [...prefix(inputs.spendingPhases), ...retired];
    inputs.person.retirementAge = age;
    inputs.person.cpp.monthlyAmountAt65Today *= kind === "full" ? request.fullCppBenefitMultiplier : request[kind]!.cppBenefitMultiplier;
  }
  return validateProjectionInputs(inputs);
}

export function evaluateFireCandidate(baseline: ProjectionInputs, request: FireMilestoneRequest, kind: FireKind, age: number): Omit<FireCandidate, "date"> {
  const inputs = materializeFireCandidate(baseline, request, kind, age);
  const phase = kind === "full" ? undefined : request[kind]?.phases[0];
  let reason: string | null = null;
  const fail = (message: string) => { reason ??= message; };
  const inCareer = (at: number) => at >= age - 1e-8 && at < request.retirementAge - 1e-8;
  const result = evaluateMilestoneFunding(inputs, {
    cashConstrainedPersonalContributionsAtAge: at => at >= age - 1e-8,
    retainSurplusAtAge: at => kind !== "full" && inCareer(at) && phase?.surplusInvesting === "retain_as_cash",
    // Coast must survive without adding uncommitted cash to retirement savings.
    consumeUncommittedSurplusAtAge: at => kind === "coast" && inCareer(at),
    onMonth: ({ age: at, working, flow, reserveShortfall, targetedEventDeposits }) => {
      const out = flow.outflows;
      if (out.unmetSpending > .005 || out.unmetRequiredOutflow > .005) fail("Required spending, tax or debt is unfunded.");
      if (reserveShortfall > .005) fail("Protected reserve is not funded.");
      if (flow.spendableCash && (flow.spendableCash.shortfall > .005 || flow.spendableCash.consumption > flow.spendableCash.target + .01)) fail("Configured spendable cash target is not satisfied.");
      if (!working) return;
      if (at < age - 1e-8) {
        if (flow.contributions.unallocatedCashFunded > .005 || flow.contributions.unallocatedIncomeWithheld > .005 || flow.withdrawals.total > .005) fail("Unchanged accumulation is not funded.");
        return;
      }
      const direct = inputs.savingsPolicy.mode === "advanced" && inputs.surplusAllocation.excess.mode === "allocate_to_account" &&
        inputs.accounts.find(a => inputs.surplusAllocation.excess.mode === "allocate_to_account" && a.id === inputs.surplusAllocation.excess.destinationAccountId)?.type !== "cash" ? flow.surplusAllocation.redirected : 0;
      const investments = inputs.accounts.filter(a => a.type !== "cash").reduce((sum, a) => sum + (flow.accountContributions[a.id] ?? 0), direct);
      if (kind === "coast" && (investments > .005 || flow.withdrawals.total > .005)) fail("Coast requires no investment saving or spending withdrawals.");
      const available = Math.max(0, flow.income.total - targetedEventDeposits - out.essential - out.discretionary - out.liabilityCashPayment - out.oneTime - out.tax);
      if (flow.contributions.cashFunded + direct > available + .005) fail("Investing depends on asset withdrawals.");
      if (flow.contributions.unallocatedIncomeWithheld > .005 || phase?.contributions.some(c => (c.requirement === "required" || c.funding === "income_withheld") && (flow.accountContributionDetails[c.accountId]?.unallocatedFromAccount ?? 0) > .005)) fail("Required employment savings are not funded.");
    },
  });
  if (!result.complete) fail("Projection stopped before the horizon.");
  if (!result.terminalFloorMet) fail("Terminal financial asset floor is not met.");
  return { age, passes: reason === null, reason, provisionalTax: result.provisionalTax, terminalFinancialAssetsToday: result.complete ? result.terminalFinancialAssetsToday : null };
}

/** Exhaustive chronological grid: no monotonicity assumption or binary search. */
export function searchFireCandidates(ages: number[], evaluate: (age: number) => FireCandidate) {
  const tested: FireCandidate[] = [];
  for (const age of ages) {
    const candidate = evaluate(age);
    tested.push(candidate);
    if (candidate.passes) return { candidate, tested };
  }
  return { candidate: null, tested };
}

export function calculateFireMilestones(inputs: ProjectionInputsWithReturnPaths, raw: unknown): FireMilestoneResult {
  const request = parseFireMilestoneRequest(raw);
  const start = inputs.person.currentAge;
  if (request.retirementAge <= start || request.retirementAge > inputs.endAge || Math.abs((request.retirementAge - start) * 12 - Math.round((request.retirementAge - start) * 12)) > 1e-7) throw new Error("Full retirement must align to a projection month after the starting age and within the horizon.");
  const lastCandidateAge = Math.min(inputs.person.retirementAge, request.retirementAge);
  const months = Math.round((lastCandidateAge - start) * 12);
  const offsets = Array.from({ length: Math.floor(months / request.stepMonths) + 1 }, (_, i) => i * request.stepMonths);
  if (offsets.at(-1) !== months) offsets.push(months);
  if (offsets.length > 601) throw new Error("Search exceeds 601 candidates per milestone; choose a coarser spacing.");
  const normal = structuredClone(inputs);
  const stressConfigured = !!inputs.returnScenario?.inflationPath || inputs.accounts.some(a => !!a.returnPath);
  delete normal.returnScenario;
  normal.accounts.forEach(a => { delete a.returnPath; });
  const paths = stressConfigured ? [{ path: "baseline" as const, inputs: normal }, { path: "stress" as const, inputs }] : [{ path: "baseline" as const, inputs }];
  const results = paths.flatMap(({ path, inputs: active }) => (["coast", "barista", "full"] as const).map((kind): FireMilestone => {
    const tested: FireCandidate[] = [];
    const empty = { kind, path, candidate: null, tested };
    if (kind !== "full" && !request[kind]) return { ...empty, status: "unavailable", reason: `Select explicit ${kind} employment assumptions.` };
    try {
      const searched = searchFireCandidates(offsets.map(n => start + n / 12), age => {
        const offset = Math.round((age - start) * 12);
        const date = new Date(Date.UTC(Number(inputs.startDate.slice(0, 4)), Number(inputs.startDate.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 7);
        const candidate = { ...evaluateFireCandidate(active, request, kind, age), date };
        tested.push(candidate);
        return candidate;
      });
      return { kind, path, ...searched, status: searched.candidate ? searched.candidate.age === start ? "met_at_start" : "future" : "not_found",
        reason: searched.candidate ? "Earliest passing tested month; every earlier grid candidate failed. Conditional on these assumptions." : "No passing candidate in the tested range. See failures; dates between grid points were not tested." };
    } catch (error) {
      return { ...empty, status: "unavailable", reason: error instanceof Error ? error.message : "Candidate simulation failed." };
    }
  }));
  return { effectiveDate: inputs.startDate, request, lastCandidateAge, results, stressConfigured };
}
