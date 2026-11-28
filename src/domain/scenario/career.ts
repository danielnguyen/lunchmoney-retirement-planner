import type { CareerPhaseConfig, CareerTransitionConfig, ComparisonScenarioConfig } from "@/src/config/types";
import { parseCareerTransition } from "@/src/config/scenario-comparison";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { buildInflationFactors } from "@/src/domain/projection/return-path";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import { estimateOntarioEmployment } from "./payroll";

export function applyCareerTransition(inputs: ProjectionInputs, raw: CareerTransitionConfig): void {
  const career = parseCareerTransition(raw);
  const oldRetirementAge = inputs.person.retirementAge;
  if (career.transitionAge < inputs.person.currentAge || career.transitionAge > oldRetirementAge || career.retirementAge > inputs.endAge) {
    throw new Error("Transition must be within the baseline working life; full retirement must be within the projection horizon.");
  }
  for (const age of [career.transitionAge, career.retirementAge, ...career.phases.flatMap(p => [p.startAge, p.endAge])]) {
    if (Math.abs((age - inputs.person.currentAge) * 12 - Math.round((age - inputs.person.currentAge) * 12)) > 1e-7) throw new Error("Career phase ages must align to projection months.");
  }
  const prefix = <T extends { startAge: number; endAge: number }>(phases: T[]) => phases
    .filter(p => p.startAge < career.transitionAge).map(p => ({ ...p, endAge: Math.min(p.endAge, career.transitionAge) }));
  inputs.person.employmentIncomePhases = prefix(inputs.person.employmentIncomePhases);
  // Preserve retirement spending assumptions when moving the retirement boundary.
  const retired = inputs.spendingPhases.filter(p => p.endAge > Math.max(oldRetirementAge, career.retirementAge)).map(p => ({ ...p,
    id: `${p.id}:career-retirement`, startAge: Math.max(career.retirementAge, p.startAge) }));
  if (retired.length) retired[0].startAge = career.retirementAge;
  inputs.spendingPhases = prefix(inputs.spendingPhases);
  const fundingByAccount = new Map(inputs.accounts.map(a => [a.id, a.contributionPhases[0]?.funding ??
    (inputs.savingsPolicy.mode === "simple" && a.id === inputs.savingsPolicy.workplaceRrspAccountId ? "income_withheld" : "cash")]));
  const personalPlans = new Map(inputs.accounts.map(a => [a.id, a.contributionPhases.filter(p => p.funding === "cash")]));
  const inflation = buildInflationFactors({ fallbackAnnualInflation: inputs.annualInflation,
    path: (inputs as ProjectionInputsWithReturnPaths).returnScenario?.inflationPath,
    startYear: Number(inputs.startDate.slice(0, 4)), startMonth: Number(inputs.startDate.slice(5, 7)),
    totalMonths: Math.round((inputs.endAge - inputs.person.currentAge) * 12) });
  for (const account of inputs.accounts) account.contributionPhases = prefix(account.contributionPhases);
  const reservePlans = inputs.savingsPolicy.mode === "simple" ? inputs.savingsPolicy.reserveBuildingPhases : [];
  if (inputs.savingsPolicy.mode === "simple") inputs.savingsPolicy.reserveBuildingPhases = prefix(reservePlans);
  for (const p of career.phases) {
    if (p.employment.mode === "gross_estimate" && (p.startAge < 18 || p.endAge > 65)) throw new Error("Gross estimate supports employment ages 18–64 only; use explicit overrides.");
    const employment = p.employment.mode === "gross_estimate" ? estimateOntarioEmployment(p.employment.annualGrossToday) : p.employment;
    const employeeWithheld = p.contributions.filter(c => c.funding === "income_withheld").reduce((sum, c) => sum + c.monthlyAmountToday * 12, 0);
    if (p.employment.mode === "gross_estimate" && p.contributions.some(c => c.employerMonthlyAmountToday > 0)) throw new Error("Employer match tax treatment is unavailable in gross estimates; select explicit net, taxable and eligible overrides including employer terms.");
    if (p.contributions.some(c => c.employerMonthlyAmountToday > 0 && c.funding !== "income_withheld")) throw new Error("Employer savings must use income-withheld funding.");
    const net = employment.annualNetCashToday - (p.employment.mode === "gross_estimate" ? employeeWithheld : 0);
    if (net < 0) throw new Error("Employee withholding exceeds estimated net cash.");
    inputs.person.employmentIncomePhases.push({ id: `career:${p.id}`, label: p.label, startAge: p.startAge, endAge: p.endAge,
      annualNetCashToday: net, annualTaxableEmploymentIncomeToday: employment.annualTaxableEmploymentIncomeToday,
      annualGrowth: p.annualGrowth, phaseLocalIndexing: true,
      rrspRoomGeneration: { annualEligibleEarnedIncomeToday: employment.annualEligibleEarnedIncomeToday,
        annualPensionAdjustmentToday: p.annualPensionAdjustmentToday, annualOtherRoomReductionToday: p.annualOtherRoomReductionToday, annualGrowth: p.annualGrowth } });
    inputs.spendingPhases.push({ id: `career:${p.id}`, label: p.label, startAge: p.startAge, endAge: p.endAge,
      essentialMultiplier: p.essentialMultiplier, discretionaryMultiplier: p.discretionaryMultiplier, source: "explicit_configuration" });
    if (p.kind !== "coast" && inputs.savingsPolicy.mode === "simple") {
      for (const original of reservePlans) {
        const startAge = Math.max(p.startAge, original.startAge), endAge = Math.min(p.endAge, original.endAge);
        if (endAge > startAge) inputs.savingsPolicy.reserveBuildingPhases.push({ ...original,
          id: `${original.id}:${p.id}`, startAge, endAge,
          monthlyAmountToday: original.monthlyAmountToday * Math.pow(1 + original.indexingRate, startAge - original.startAge) });
      }
    }
    // Personal saving is not an assumed employer benefit. Keep its dated plan
    // and existing routing unless this interval explicitly overrides the account.
    // Coast deliberately removes all saving, including these optional plans.
    if (p.kind !== "coast") for (const account of inputs.accounts) {
      if (p.contributions.some(c => c.accountId === account.id)) continue;
      for (const original of personalPlans.get(account.id)!) {
        const startAge = Math.max(p.startAge, original.startAge);
        const endAge = Math.min(p.endAge, original.endAge);
        if (endAge <= startAge) continue;
        const originalMonth = Math.round((original.startAge - inputs.person.currentAge) * 12);
        const startMonth = Math.round((startAge - inputs.person.currentAge) * 12);
        account.contributionPhases.push({ ...original, id: `${original.id}:${p.id}`, startAge, endAge,
          monthlyAmountToday: original.monthlyAmountToday * Math.pow(1 + original.indexingRate, startAge - original.startAge) *
            (original.phaseLocalIndexing ? inflation[originalMonth] / inflation[startMonth] : 1) });
      }
    }
    for (const c of p.contributions) {
      const account = inputs.accounts.find(a => a.id === c.accountId);
      if (!account) throw new Error("Career contribution must select an existing account.");
      if (!inputs.contributionWaterfall.routes.some(route => route.sourceAccountId === c.accountId)) throw new Error("Career savings must select an existing contribution route; configure the destination in Planner Config first.");
      if (inputs.savingsPolicy.mode === "simple" && ((c.funding === "cash" && c.accountId !== inputs.savingsPolicy.personalTfsaAccountId) || (c.funding === "income_withheld" && c.accountId !== inputs.savingsPolicy.workplaceRrspAccountId))) throw new Error("Simple savings requires personal TFSA for cash-funded savings or workplace RRSP for withholding.");
      account.contributionPhases.push({ id: `career:${p.id}`, label: `${p.label}: ${c.requirement} savings`, startAge: p.startAge, endAge: p.endAge,
        monthlyAmountToday: c.monthlyAmountToday + c.employerMonthlyAmountToday, funding: c.funding, indexingRate: p.annualGrowth, phaseLocalIndexing: true });
    }
  }
  // Existing routes remain valid even when the career plan selects no savings.
  for (const route of inputs.contributionWaterfall.routes) {
    const account = inputs.accounts.find(a => a.id === route.sourceAccountId)!;
    if (!account.contributionPhases.length) account.contributionPhases.push({ id: "career:no-saving", label: "No career saving selected", startAge: career.transitionAge, endAge: career.retirementAge, monthlyAmountToday: 0, funding: fundingByAccount.get(account.id)!, indexingRate: 0 });
  }
  inputs.spendingPhases.push(...retired.filter(p => p.endAge > p.startAge));
  inputs.person.retirementAge = career.retirementAge;
  inputs.person.cpp.monthlyAmountAt65Today *= career.cppBenefitMultiplier;
}

/** Reuse a dated template across the candidate grid. Internal phase boundaries
 * remain at their configured ages; the edge terms extend if retirement moves. */
export function careerPhasesForInterval(career: CareerTransitionConfig, start: number, end: number) {
  const phases = career.phases.map((p, i) => ({ ...structuredClone(p),
    startAge: i === 0 ? start : Math.max(start, p.startAge),
    endAge: i === career.phases.length - 1 ? end : Math.min(end, p.endAge),
  })).filter(p => p.endAge > p.startAge);
  if (phases.length) { phases[0].startAge = start; phases[phases.length - 1].endAge = end; }
  return phases;
}

/** Editable illustrative starters, deliberately not affordability forecasts. */
export function careerPreset(inputs: ProjectionInputs, kind: "reduced_income" | "coast" | "barista" | "coast_to_barista"): ComparisonScenarioConfig {
  const start = inputs.person.currentAge;
  const end = inputs.person.retirementAge;
  const baseline = inputs.person.employmentIncomePhases[0];
  const middle = start + Math.floor((end - start) * 6) / 12;
  // Keep the existing spending schedule using the existing career-phase schema.
  // No actual future employer benefit or workplace withholding is inferred.
  const boundaries = [...new Set([start, end,
    ...inputs.spendingPhases.flatMap(p => [p.startAge, p.endAge]).filter(age => age > start && age < end),
    ...(kind === "coast_to_barista" && middle > start ? [middle] : []),
  ])].sort((a, b) => a - b);
  const phases = boundaries.slice(0, -1).map((from, i): CareerPhaseConfig => {
    const strategy = kind === "reduced_income" ? "accumulation" : kind === "coast_to_barista" ? from < middle ? "coast" : "barista" : kind;
    const spending = inputs.spendingPhases.find(p => p.startAge <= from && p.endAge > from)!;
    return {
      id: `career-${i + 1}`, label: `${strategy}: ${spending.label} (editable illustration)`, kind: strategy,
      startAge: from, endAge: boundaries[i + 1], annualGrowth: inputs.annualInflation,
      employment: { mode: "net_override" as const, annualNetCashToday: baseline.annualNetCashToday * .5,
        annualTaxableEmploymentIncomeToday: (baseline.annualTaxableEmploymentIncomeToday ?? 0) * .5,
        annualEligibleEarnedIncomeToday: (baseline.rrspRoomGeneration?.annualEligibleEarnedIncomeToday ?? 0) * .5 },
      annualPensionAdjustmentToday: 0, annualOtherRoomReductionToday: 0,
      essentialMultiplier: spending.essentialMultiplier, discretionaryMultiplier: spending.discretionaryMultiplier,
      surplusInvesting: strategy === "coast" ? "retain_as_cash" as const : "configured" as const, contributions: [],
    };
  });
  return { id: `career-${kind}`, label: kind.replaceAll("_", " "), spending: [], personalContributions: [], contributionPolicy: "cash_constrained",
    careerTransition: { transitionAge: start, retirementAge: end, cppBenefitMultiplier: 1, phases } };
}
