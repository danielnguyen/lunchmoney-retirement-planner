import type { CareerTransitionConfig } from "@/src/config/types";
import { parseCareerTransition } from "@/src/config/scenario-comparison";
import { applyCareerTransition } from "@/src/domain/scenario/career";
import { estimateOntarioEmployment } from "@/src/domain/scenario/payroll";
import { assertUnchangedCppBeforeTransition, evaluateCareerFunding } from "./fire-milestones";
import type { ProjectionInputsWithReturnPaths } from "./return-path-model";
import { validateProjectionInputs, type ProjectionInputs, type FundingFailure } from "./types";

export type EmploymentIncomeRequest = {
  retirementAge: number;
  stepMonths: number;
  maxAnnualGrossToday: number;
  resolutionAnnualGrossToday: number;
  career: CareerTransitionConfig | null;
};
export type IncomeBoundary = {
  status: "available" | "not_found" | "unavailable";
  annualGrossToday: number | null;
  annualNetCashToday: number | null;
  adjacentLowerFails: boolean | null;
  reason: string;
  tested: Array<{ annualGrossToday: number; passes: boolean; failure?: FundingFailure | null }>;
};
export type EmploymentIncomePoint = {
  age: number; date: string; path: "baseline" | "stress";
  required: IncomeBoundary; livingCosts: IncomeBoundary;
  terminalFinancialAssetsToday: number | null; provisionalTax: boolean;
};
export type EmploymentIncomeResult = {
  request: EmploymentIncomeRequest; effectiveDate: string; stressConfigured: boolean;
  points: EmploymentIncomePoint[];
};

export function parseEmploymentIncomeRequest(raw: unknown): EmploymentIncomeRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Employment income assumptions must be an object.");
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !["retirementAge", "stepMonths", "maxAnnualGrossToday", "resolutionAnnualGrossToday", "career"].includes(k))) throw new Error("Unknown employment income assumption.");
  if (typeof r.retirementAge !== "number" || !Number.isFinite(r.retirementAge)) throw new Error("Choose a full retirement age.");
  if (![1, 3, 12].includes(r.stepMonths as number)) throw new Error("Transition spacing must be 1, 3 or 12 months.");
  if (typeof r.maxAnnualGrossToday !== "number" || !Number.isFinite(r.maxAnnualGrossToday) || r.maxAnnualGrossToday <= 0 || r.maxAnnualGrossToday > 1000000) throw new Error("Gross search cap must be positive and at most 1,000,000 today.");
  if (typeof r.resolutionAnnualGrossToday !== "number" || ![1, 10, 100, 1000].includes(r.resolutionAnnualGrossToday) || r.maxAnnualGrossToday % r.resolutionAnnualGrossToday !== 0) throw new Error("Resolution must be 1, 10, 100 or 1,000 annual gross dollars and divide the search cap.");
  const career = r.career === null ? null : parseCareerTransition(r.career);
  if (career && (career.phases.length !== 1 || career.phases[0].kind === "coast")) throw new Error("Select one accumulation or Barista employment interval; Coast is a separate no-saving objective.");
  return { retirementAge: r.retirementAge, stepMonths: r.stepMonths as number, maxAnnualGrossToday: r.maxAnnualGrossToday, resolutionAnnualGrossToday: r.resolutionAnnualGrossToday, career };
}

const unavailable = (reason: string): IncomeBoundary => ({ status: "unavailable", annualGrossToday: null, annualNetCashToday: null, adjacentLowerFails: null, reason, tested: [] });

/** Sample the full bounded range before binary refinement. Certify a tested
 * boundary only: arbitrary unsampled feasible islands are not ruled out. */
export function solveIncomeBoundary(cap: number, resolution: number, evaluate: (gross: number, fresh: boolean) => boolean): IncomeBoundary {
  const samples = new Map<number, boolean>();
  const result = unavailable("");
  const check = (units: number, fresh = false) => {
    if (!fresh && samples.has(units)) return samples.get(units)!;
    const passes = evaluate(units * resolution, fresh);
    if (samples.has(units) && samples.get(units) !== passes) throw new Error("Candidate evaluation was not repeatable.");
    for (const [prior, passed] of samples) {
      if ((prior < units && passed && !passes) || (prior > units && !passed && passes)) throw new Error("Observed nonmonotonic feasibility; no minimum is reported.");
    }
    samples.set(units, passes);
    return passes;
  };
  try {
    const max = cap / resolution;
    for (let i = 0; i <= 16; i++) check(Math.floor(max * i / 16));
    if (!samples.get(max)) return { ...result, status: "not_found", reason: "No passing sampled income within the search cap; this does not prove impossibility or rule out unsampled feasible islands.", tested: [...samples].map(([n, passes]) => ({ annualGrossToday: n * resolution, passes })) };
    let high = Math.min(...[...samples].filter(([, passes]) => passes).map(([n]) => n));
    let low = Math.max(-1, ...[...samples].filter(([n, passes]) => !passes && n < high).map(([n]) => n));
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (check(mid)) high = mid; else low = mid;
    }
    if (!check(high, true) || (high > 0 && check(high - 1, true))) throw new Error("Adjacent lower income boundary was not verified.");
    return { ...result, status: "available", annualGrossToday: high * resolution, adjacentLowerFails: high > 0 ? true : null,
      reason: high === 0 ? "Zero income passes; no lower non-negative income exists." : "Tested passing boundary with adjacent lower income failing. Conditional on monotone feasibility; not a certified global minimum.",
      tested: [...samples].sort(([a], [b]) => a - b).map(([n, passes]) => ({ annualGrossToday: n * resolution, passes })) };
  } catch (error) {
    return { ...result, reason: error instanceof Error ? error.message : "Candidate evaluation failed.", tested: [...samples].map(([n, passes]) => ({ annualGrossToday: n * resolution, passes })) };
  }
}

export function materializeIncomeCandidate(baseline: ProjectionInputs, request: EmploymentIncomeRequest, age: number, gross: number): ProjectionInputs {
  const template = request.career;
  if (!template) throw new Error("Select explicit future employment assumptions.");
  if (template.phases[0].employment.mode !== "gross_estimate") throw new Error("Unavailable: independent net/taxable/eligible overrides do not define a reliable salary relation. Explicitly select the supported gross estimate.");
  if (template.phases[0].contributions.some(c => c.employerMonthlyAmountToday > 0)) throw new Error("Unavailable: employer match taxation has no supported gross-to-net relation.");
  assertUnchangedCppBeforeTransition(baseline, template.cppBenefitMultiplier, age);
  const inputs = structuredClone(baseline);
  applyCareerTransition(inputs, { ...template, transitionAge: age, retirementAge: request.retirementAge,
    phases: [{ ...template.phases[0], startAge: age, endAge: request.retirementAge, employment: { mode: "gross_estimate", annualGrossToday: gross } }] });
  return validateProjectionInputs(inputs);
}

export function calculateEmploymentIncome(inputs: ProjectionInputsWithReturnPaths, raw: unknown): EmploymentIncomeResult {
  const request = parseEmploymentIncomeRequest(raw);
  const start = inputs.person.currentAge;
  if (request.retirementAge <= start || request.retirementAge > inputs.endAge || Math.abs((request.retirementAge - start) * 12 - Math.round((request.retirementAge - start) * 12)) > 1e-7) throw new Error("Full retirement must align to a projection month after the starting age and within the horizon.");
  const lastMonth = Math.min(Math.round((inputs.person.retirementAge - start) * 12), Math.round((request.retirementAge - start) * 12) - 1);
  const offsets = Array.from({ length: Math.floor(lastMonth / request.stepMonths) + 1 }, (_, i) => i * request.stepMonths);
  if (offsets.at(-1) !== lastMonth) offsets.push(lastMonth);
  if (offsets.length > 61) throw new Error("Income curve exceeds 61 transition dates; choose coarser spacing.");
  const normal = structuredClone(inputs);
  const stressConfigured = !!inputs.returnScenario?.inflationPath || inputs.accounts.some(a => !!a.returnPath);
  delete normal.returnScenario;
  normal.accounts.forEach(a => { delete a.returnPath; });
  const paths = stressConfigured ? [{ path: "baseline" as const, inputs: normal }, { path: "stress" as const, inputs }] : [{ path: "baseline" as const, inputs }];
  // The simulation itself has a validated bounded horizon; also bound total work
  // across dates/paths. Remaining points are explicitly unavailable, never omitted.
  const deadline = Date.now() + 30000;
  let simulatedMonths = 0;
  const points = paths.flatMap(({ path, inputs: active }) => offsets.map(offset => {
    const age = start + offset / 12;
    const date = new Date(Date.UTC(Number(inputs.startDate.slice(0, 4)), Number(inputs.startDate.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 7);
    const phase = request.career?.phases[0];
    type Evaluation = ReturnType<typeof evaluateCareerFunding>;
    const cache = new Map<number, Evaluation>();
    const evaluate = (gross: number, fresh = false): Evaluation => {
      if (!fresh && cache.has(gross)) return cache.get(gross)!;
      if (Date.now() > deadline || simulatedMonths > 2000000) throw new Error("Bounded simulation budget reached; choose coarser transition spacing or a shorter horizon.");
      // Below required employee withholding is a known failing salary, not a
      // broken model. Probe a valid candidate first to validate all other terms.
      const withheld = phase?.contributions.filter(c => c.funding === "income_withheld").reduce((n, c) => n + c.monthlyAmountToday * 12, 0) ?? 0;
      if (estimateOntarioEmployment(gross).annualNetCashToday < withheld) {
        const failure: FundingFailure = { date, category: "required_savings",
          shortfallToday: (withheld - estimateOntarioEmployment(gross).annualNetCashToday) / 12,
          message: "Employee withholding exceeds net cash.", action: "Increase gross salary or review mandatory withholding." };
        const result: Evaluation = { age, passes: false, livingCostsFunded: false, livingCostsFailure: failure, failure,
          reason: failure.message, terminalFinancialAssetsToday: null, provisionalTax: false };
        cache.set(gross, result);
        return result;
      }
      const candidate = materializeIncomeCandidate(active, request, age, gross);
      simulatedMonths += Math.ceil((candidate.endAge - start) * 12);
      const result = evaluateCareerFunding(candidate, age, request.retirementAge, phase!.kind, phase);
      cache.set(gross, result);
      return result;
    };
    try {
      materializeIncomeCandidate(active, request, age, request.maxAnnualGrossToday);
      const required = solveIncomeBoundary(request.maxAnnualGrossToday, request.resolutionAnnualGrossToday, (gross, fresh) => evaluate(gross, fresh).passes);
      const livingCosts = solveIncomeBoundary(request.maxAnnualGrossToday, request.resolutionAnnualGrossToday, (gross, fresh) => evaluate(gross, fresh).livingCostsFunded);
      // Retain the first dated cause for every sampled failure, including a
      // failed adjacent salary. Use the comparator's own cause, not a floor or
      // reserve constraint that the living-cost comparison does not enforce.
      for (const [boundary, field] of [[required, "failure"], [livingCosts, "livingCostsFailure"]] as const) {
        boundary.tested = boundary.tested.map(trial => ({ ...trial,
          failure: trial.passes ? null : cache.get(trial.annualGrossToday)?.[field] ?? null }));
      }
      for (const boundary of [required, livingCosts]) if (boundary.annualGrossToday !== null) {
        boundary.annualNetCashToday = estimateOntarioEmployment(boundary.annualGrossToday).annualNetCashToday - phase!.contributions.filter(c => c.funding === "income_withheld").reduce((n, c) => n + c.monthlyAmountToday * 12, 0);
      }
      const accepted = required.annualGrossToday === null ? null : evaluate(required.annualGrossToday);
      return { age, date, path, required, livingCosts, terminalFinancialAssetsToday: accepted?.terminalFinancialAssetsToday ?? null, provisionalTax: accepted?.provisionalTax ?? false };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Income curve unavailable.";
      return { age, date, path, required: unavailable(reason), livingCosts: unavailable(reason), terminalFinancialAssetsToday: null, provisionalTax: false };
    }
  }));
  return { request, effectiveDate: inputs.startDate, stressConfigured, points };
}
