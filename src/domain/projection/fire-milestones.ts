import type { ProjectionInputsWithReturnPaths } from "./return-path-model";
import type { CareerTransitionConfig, CareerPhaseConfig } from "@/src/config/types";
import { parseCareerTransition } from "@/src/config/scenario-comparison";
import { applyCareerTransition } from "@/src/domain/scenario/career";
import { evaluateMilestoneFunding, openingReserveShortfall } from "./calculate";
import { validateProjectionInputs, type ProjectionInputs, type FundingFailure } from "./types";

export type FireKind = "coast" | "barista" | "full";
export type FireMilestoneRequest = {
  retirementAge: number;
  stepMonths: number;
  coast: CareerTransitionConfig | null;
  barista: CareerTransitionConfig | null;
  fullCppBenefitMultiplier: number;
};
export type FireCandidate = { age: number; date: string; failure?: FundingFailure | null; passes: boolean; reason: string | null; terminalFinancialAssetsToday: number | null; provisionalTax: boolean };
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

export function assertUnchangedCppBeforeTransition(baseline: ProjectionInputs, multiplier: number | undefined, age: number) {
  // CPP is a whole-projection amount in the existing engine. Benefits use the
  // month-end age, so a claim age equal to the transition can affect its prefix.
  if (multiplier !== undefined && multiplier !== 1 && baseline.person.cpp.monthlyAmountAt65Today > 0 &&
      age > baseline.person.currentAge + 1e-8 && baseline.person.cpp.startAge <= age + 1e-8) {
    throw new Error("CPP adjustment unavailable: CPP is payable before this transition. Use a multiplier of 1 to preserve unchanged accumulation; dated CPP adjustments are not supported.");
  }
}

/** Keep every accumulation assumption before the boundary, including dated events. */
export function materializeFireCandidate(baseline: ProjectionInputs, request: FireMilestoneRequest, kind: FireKind, age: number): ProjectionInputs {
  const multiplier = kind === "full" ? request.fullCppBenefitMultiplier : request[kind]?.cppBenefitMultiplier;
  assertUnchangedCppBeforeTransition(baseline, multiplier, age);
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
  const result = evaluateCareerFunding(inputs, age, request.retirementAge, kind, phase);
  return { failure: result.failure, age: result.age, passes: result.passes, reason: result.reason, provisionalTax: result.provisionalTax, terminalFinancialAssetsToday: result.terminalFinancialAssetsToday };
}

/** Shared forward constraints for milestones and income candidates. */
export function evaluateCareerFunding(inputs: ProjectionInputs, age: number, retirementAge: number, kind: FireKind | "accumulation", phase?: CareerPhaseConfig): Omit<FireCandidate, "date"> & { livingCostsFunded: boolean; livingCostsFailure: FundingFailure | null } {
  let livingCostsFunded = true;
  let observedCareerMonths = 0;
  let reason: string | null = null;
  let failure: FundingFailure | null = null;
  let livingCostsFailure: FundingFailure | null = null;
  let previousReserve: { shortfall: number; factor: number } | null = null;
  let lastDate = inputs.startDate.slice(0, 7);
  const fail = (evidence: FundingFailure) => {
    if (failure) return;
    failure = evidence;
    reason = `${evidence.date}: ${evidence.message} ${evidence.action}`;
  };
  if (Math.abs(age - inputs.person.currentAge) < 1e-8) {
    const shortfallToday = openingReserveShortfall(inputs);
    if (shortfallToday > .005) fail({ date: lastDate, category: "reserve", shortfallToday,
      message: "Protected reserve is not funded at transition.", action: "Build the reserve before transition or choose a later transition." });
  }
  const inCareer = (at: number) => at >= age - 1e-8 && at < retirementAge - 1e-8;
  const result = evaluateMilestoneFunding(inputs, {
    cashConstrainedPersonalContributionsAtAge: at => at >= age - 1e-8,
    retainSurplusAtAge: at => kind !== "full" && inCareer(at) && phase?.surplusInvesting === "retain_as_cash",
    // Coast must survive without adding uncommitted cash to retirement savings.
    consumeUncommittedSurplusAtAge: at => kind === "coast" && inCareer(at),
    onMonth: ({ date, age: at, working, inflationFactor, flow, reserveShortfall, targetedEventDeposits }) => {
      lastDate = date;
      const evidence = (category: FundingFailure["category"], shortfall: number, message: string, action: string): FundingFailure =>
        ({ date, category, shortfallToday: shortfall / inflationFactor, message, action });
      if (inCareer(at)) observedCareerMonths++;
      const out = flow.outflows;
      // Cash needed for living costs, before voluntary saving or reserve building.
      // Income already excludes payroll and employee withholding. Other income
      // and untargeted events offset demand; targeted deposits cannot pay bills.
      const livingShortfall = Math.max(0, out.essential + out.discretionary + out.liabilityCashPayment + out.oneTime + out.tax - flow.income.total + targetedEventDeposits,
        out.unmetSpending, out.unmetRequiredOutflow);
      if (inCareer(at) && livingShortfall > .005) {
        livingCostsFunded = false;
        livingCostsFailure ??= evidence("living_costs", livingShortfall, "Current income does not cover living costs.", "Increase deposited income or reduce the selected costs.");
      }
      if (out.unmetSpending > .005 || out.unmetRequiredOutflow > .005) fail(evidence("required_outflow", Math.max(out.unmetSpending, out.unmetRequiredOutflow), "Required spending, tax or debt is unfunded.", "Review spending, debt payments and available withdrawal assets."));
      // A recovered historical buildup is allowed, but the opening transition
      // balance and every subsequent month must retain the protected reserve.
      if (Math.abs(at - age) < 1e-8 && previousReserve && previousReserve.shortfall > .005) {
        fail({ date, category: "reserve", shortfallToday: previousReserve.shortfall / previousReserve.factor,
          message: "Protected reserve is not funded at transition.", action: "Build the reserve before transition or choose a later transition." });
      }
      if ((at >= age - 1e-8 || !working) && reserveShortfall > .005) fail(evidence("reserve", reserveShortfall, "Protected reserve is not funded.", "Build the reserve before transition or revise income and spending."));
      previousReserve = { shortfall: reserveShortfall, factor: inflationFactor };
      if (flow.spendableCash && (flow.spendableCash.shortfall > .005 || flow.spendableCash.consumption > flow.spendableCash.target + .01)) fail(evidence("spendable_cash", Math.max(flow.spendableCash.shortfall, flow.spendableCash.consumption - flow.spendableCash.target), "Configured spendable cash target is not satisfied.", "Review the spendable cash target and spending."));
      if (!working) return;
      if (at < age - 1e-8) {
        // Personal cash/room-capped saving is optional. Withheld employment
        // savings and unauthorized withdrawals remain funding constraints.
        if (flow.contributions.unallocatedIncomeWithheld > .005) fail(evidence("required_savings", flow.contributions.unallocatedIncomeWithheld, "Required employment savings are not funded.", "Review contribution room and mandatory withholding."));
        if (flow.withdrawals.total > .005) fail(evidence("withdrawals", flow.withdrawals.total, "Unchanged accumulation depends on asset withdrawals.", "Review baseline income, spending and saving before transition."));
        return;
      }
      if (kind === "accumulation" && flow.withdrawals.total > .005) fail(evidence("withdrawals", flow.withdrawals.total, "Working-life withdrawals are not authorized by accumulation terms.", "Increase employment income or explicitly select Barista terms."));
      const direct = inputs.savingsPolicy.mode === "advanced" && inputs.surplusAllocation.excess.mode === "allocate_to_account" &&
        inputs.accounts.find(a => inputs.surplusAllocation.excess.mode === "allocate_to_account" && a.id === inputs.surplusAllocation.excess.destinationAccountId)?.type !== "cash" ? flow.surplusAllocation.redirected : 0;
      const investments = inputs.accounts.filter(a => a.type !== "cash").reduce((sum, a) => sum + (flow.accountContributions[a.id] ?? 0), direct);
      if (kind === "coast" && (investments > .005 || flow.withdrawals.total > .005)) fail(evidence("coast_saving", investments + flow.withdrawals.total, "Coast requires no investment saving or spending withdrawals.", "Review Coast income and contribution terms."));
      const available = Math.max(0, flow.income.total - targetedEventDeposits - out.essential - out.discretionary - out.liabilityCashPayment - out.oneTime - out.tax);
      if (flow.contributions.cashFunded + direct > available + .005) fail(evidence("withdrawals", flow.contributions.cashFunded + direct - available, "Investing depends on asset withdrawals.", "Reduce investment contributions or increase deposited income."));
      const requiredSavingShortfall = Math.max(flow.contributions.unallocatedIncomeWithheld,
        phase?.contributions.filter(c => c.requirement === "required" || c.funding === "income_withheld")
          .reduce((sum, c) => sum + (flow.accountContributionDetails[c.accountId]?.unallocatedFromAccount ?? 0), 0) ?? 0);
      if (requiredSavingShortfall > .005) fail(evidence("required_savings", requiredSavingShortfall, "Required employment savings are not funded.", "Review required contribution amounts, room and deposited income."));
    },
  });
  if (observedCareerMonths < Math.round((retirementAge - age) * 12)) livingCostsFunded = false;
  if (!result.complete) fail(result.failure ?? { date: lastDate, category: "incomplete", shortfallToday: null, message: "Projection stopped before the horizon.", action: "Review the first unfunded outflow." });
  if (!result.terminalFloorMet) fail({ date: lastDate, category: "terminal_floor", shortfallToday: Math.max(0, inputs.retirementRequirement.minimumEndingFinancialAssetsToday - result.terminalFinancialAssetsToday), message: "Terminal financial asset floor is not met.", action: "Increase saving, delay retirement or review the configured terminal floor." });
  return { livingCostsFunded, livingCostsFailure: livingCostsFailure ?? (!result.complete ? failure : null), failure, age, passes: reason === null, reason, provisionalTax: result.provisionalTax, terminalFinancialAssetsToday: result.complete ? result.terminalFinancialAssetsToday : null };
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
