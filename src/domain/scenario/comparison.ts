import { applyCareerTransition } from "./career";
import { payrollProvenance, estimateOntarioEmployment } from "./payroll";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { validateProjectionInputs, type ProjectionInputs, type ProjectionSummary, type RetirementRequirementResult, type EmploymentIncomePhase } from "@/src/domain/projection/types";

export type ComparisonAllocation = {
  year: number;
  months: number;
  takeHome: number;
  lifestyle: number;
  liabilityPayments: number;
  extraDebtPayments: number;
  plannedPersonal: number;
  actualPersonal: number;
  personalDeposits: number;
  withdrawalFundedPersonal: number;
  withheld: number;
  withdrawals: number;
  tax: number;
  otherOutflows: number;
  retained: number;
  targetedDeposits: number;
  unfunded: number;
  unallocatedPersonal: number;
  reconciliationDifference: number;
};
export type ComparisonResult = {
  allocationHorizon: "working_life" | "full_horizon";
  workingLifeFeasible: boolean;
  lifetimeViable: boolean;
  coastVerified: boolean | null;
  coastFundingWithoutSurplusToday: number | null;
  retirementRequirement: RetirementRequirementResult | null;
  activeInputs: {
    career?: {
      sourceType: "explicit_scenario";
      sourceDescription: string;
      effectiveDate: string;
      employment: EmploymentIncomePhase[];
      payrollEstimates: Array<{ phaseId: string; estimate: ReturnType<typeof estimateOntarioEmployment> }>;
      cppBenefitMultiplier: number;
    };
    effectiveDate: string;
    reserveTargetToday: number;
    reserveIndexingRate: number;
    operatingCashTargetToday: number | null;
    spending: Array<{ phaseId: string; label: string; startAge: number; endAge: number; annualEssentialToday: number; annualDiscretionaryToday: number; source: string }>;
    personalContributions: Array<{ accountId: string; phaseId: string; label: string; startAge: number; endAge: number; monthlyAmountToday: number; baselineMonthlyAmountToday: number }>;
  } | null;
  id: string;
  label: string;
  definition: ComparisonScenarioConfig;
  status: "calculated" | "infeasible" | "unavailable";
  warnings: string[];
  retirementAge: number;
  terminalAge: number;
  summary: ProjectionSummary | null;
  firstFundingShortfallAge: number | null;
  annual: ComparisonAllocation[];
  trajectory: Array<{ age: number; financialAssetsToday: number }>;
};

export function materializeComparisonInputs(baseline: ProjectionInputs, scenario: ComparisonScenarioConfig): ProjectionInputs {
  const inputs = structuredClone(baseline);
  for (const selection of scenario.spending) {
    const phase = inputs.spendingPhases.find((phase) => phase.id === selection.phaseId);
    if (!phase || phase.source !== "explicit_configuration" || phase.endAge > inputs.person.retirementAge) throw new Error("Select an explicit working-life spending phase ending by retirement.");
    const adjustment = selection.adjustment;
    if (adjustment.mode === "multipliers") {
      phase.essentialMultiplier = adjustment.essentialMultiplier;
      phase.discretionaryMultiplier = adjustment.discretionaryMultiplier;
    } else {
      const essential = inputs.monthlyEssentialSpendingToday * phase.essentialMultiplier;
      const discretionary = adjustment.annualAmountToday / 12 - essential;
      if (discretionary < 0) throw new Error("Annual lifestyle budget is below protected essential spending.");
      if (inputs.monthlyDiscretionarySpendingToday === 0 && discretionary > 0) throw new Error("A positive discretionary budget cannot scale a zero discretionary baseline.");
      phase.discretionaryMultiplier = inputs.monthlyDiscretionarySpendingToday === 0 ? 0 : discretionary / inputs.monthlyDiscretionarySpendingToday;
    }
  }
  for (const selection of scenario.personalContributions) {
    const accountId = selection.target.mode === "account" ? selection.target.accountId
      : inputs.savingsPolicy.mode === "simple" ? inputs.savingsPolicy.personalTfsaAccountId : null;
    const phase = inputs.accounts.find((account) => account.id === accountId)?.contributionPhases.find((phase) => phase.id === selection.phaseId);
    if (!phase || phase.funding !== "cash") throw new Error("Personal contribution selection no longer matches a cash-funded phase.");
    phase.monthlyAmountToday = selection.monthlyAmountToday;
  }
  if (scenario.careerTransition) applyCareerTransition(inputs, scenario.careerTransition);
  return validateProjectionInputs(inputs);
}

export function calculateComparison(baseline: ProjectionInputs, scenarios: ComparisonScenarioConfig[]): ComparisonResult[] {
  const fullHorizon = scenarios.some(s => s.careerTransition !== undefined);
  return scenarios.map((definition) => {
    const result: ComparisonResult = {
      allocationHorizon: fullHorizon ? "full_horizon" : "working_life", workingLifeFeasible: true, lifetimeViable: false, coastVerified: definition.careerTransition?.phases.some(p => p.kind === "coast") ? true : null, retirementRequirement: null, coastFundingWithoutSurplusToday: null,
      activeInputs: null, id: definition.id, label: definition.label, definition,
      status: "calculated", warnings: [], retirementAge: baseline.person.retirementAge,
      terminalAge: baseline.endAge, summary: null, firstFundingShortfallAge: null,
      annual: [], trajectory: [],
    };
    try {
      const inputs = materializeComparisonInputs(baseline, definition);
      result.retirementAge = inputs.person.retirementAge;
      result.activeInputs = {
        ...(definition.careerTransition ? { career: {
          sourceType: "explicit_scenario" as const,
          sourceDescription: "Editable career assumptions; gross estimates use dated 2026 Ontario references; overrides are user-entered",
          effectiveDate: baseline.startDate,
          employment: inputs.person.employmentIncomePhases.filter(p => p.phaseLocalIndexing),
          payrollEstimates: definition.careerTransition.phases.flatMap(p => p.employment.mode === "gross_estimate" ? [{ phaseId: p.id, estimate: estimateOntarioEmployment(p.employment.annualGrossToday) }] : []),
          cppBenefitMultiplier: definition.careerTransition.cppBenefitMultiplier,
        } } : {}),
        effectiveDate: baseline.startDate,
        reserveTargetToday: inputs.surplusAllocation.targetCashReserveToday,
        reserveIndexingRate: inputs.surplusAllocation.reserveIndexingRate,
        operatingCashTargetToday: inputs.savingsPolicy.mode === "simple" ? inputs.savingsPolicy.operatingCashTarget?.targetToday ?? null : null,
        spending: inputs.spendingPhases.map((phase) => ({
          phaseId: phase.id, label: phase.label, startAge: phase.startAge, endAge: phase.endAge,
          annualEssentialToday: inputs.monthlyEssentialSpendingToday * phase.essentialMultiplier * 12,
          annualDiscretionaryToday: inputs.monthlyDiscretionarySpendingToday * phase.discretionaryMultiplier * 12,
          source: definition.spending.some((entry) => entry.phaseId === phase.id) ? "Comparison override of active baseline" : phase.source,
        })),
        personalContributions: inputs.accounts.flatMap((account) => account.contributionPhases.filter((phase) => phase.funding === "cash").map((phase) => ({
          accountId: account.id, phaseId: phase.id, label: phase.label, startAge: phase.startAge, endAge: phase.endAge,
          monthlyAmountToday: phase.monthlyAmountToday,
          baselineMonthlyAmountToday: baseline.accounts.find((entry) => entry.id === account.id)?.contributionPhases.find((entry) => entry.id === phase.id)?.monthlyAmountToday ?? 0,
        }))),
      };
      const firstCoastAge = definition.careerTransition?.phases.find(p => p.kind === "coast")?.startAge;
      const coastSavingWindow = (age: number) => firstCoastAge !== undefined && age >= firstCoastAge - 1e-8 && age < inputs.person.retirementAge - 1e-8;
      const careerAt = (age: number) => definition.careerTransition?.phases.find(p => age >= p.startAge - 1e-8 && age < p.endAge - 1e-8);
      if (definition.careerTransition) {
        result.warnings.push("Career inputs are explicit hypothetical terms, not employment forecasts. Cash-constrained optional savings may be omitted; required savings and withheld amounts must be served. CPP entitlement is not recalculated from earnings; the configured CPP amount is retained unless the lower-benefit multiplier is selected. Pension/benefit valuation is unavailable. Net overrides must include employee withholding and benefit deductions; employer additions require explicit taxable and RRSP-eligible overrides.");
        if (definition.careerTransition.phases.some(p => p.employment.mode === "gross_estimate")) result.warnings.push(`${payrollProvenance.description}; effective ${payrollProvenance.effectiveDate}. ${payrollProvenance.limitations}`);
      }
      const projection = calculateProjection(inputs, {
        retainSurplusAtAge: definition.careerTransition ? age => careerAt(age)?.surplusInvesting === "retain_as_cash" : undefined,
        cashConstrainedPersonalContributions: definition.contributionPolicy === "cash_constrained",
        onMonth: ({ date, age, working, inflationFactor: factor, flow, targetedEventDeposits, reserveShortfall }) => {
          const out = flow.outflows;
          const unallocated = flow.contributions.unallocatedCashFunded;
          const unfunded = out.unmetSpending + out.unmetRequiredOutflow;
          // Fixed advanced routes may be financed by asset withdrawals. They are
          // never described as affordable salary-funded saving.
          const career = careerAt(age);
          const directInvesting = inputs.savingsPolicy.mode === "advanced" && inputs.surplusAllocation.excess.mode === "allocate_to_account" &&
            inputs.accounts.find(a => inputs.surplusAllocation.excess.mode === "allocate_to_account" && a.id === inputs.surplusAllocation.excess.destinationAccountId)?.type !== "cash" ? flow.surplusAllocation.redirected : 0;
          const investments = inputs.accounts.filter(a => a.type !== "cash").reduce((sum, a) => sum + (flow.accountContributions[a.id] ?? 0), 0) + directInvesting;
          const cashForInvesting = Math.max(0, flow.income.total - targetedEventDeposits - out.essential - out.discretionary - out.liabilityCashPayment - out.oneTime - out.tax);
          const withdrawalFunded = flow.contributions.cashFunded + directInvesting > cashForInvesting + .005;
          const coastViolation = (coastSavingWindow(age) && investments > .005) ||
            (career?.kind === "coast" && (flow.withdrawals.total > .005 || reserveShortfall > .005));
          if (coastViolation) result.coastVerified = false;
          const contributionFailure = career
            ? career.contributions.some(c => (c.requirement === "required" || c.funding === "income_withheld") &&
              (flow.accountContributionDetails[c.accountId]?.unallocatedFromAccount ?? 0) > .005)
            : unallocated > .005;
          const deficit = unfunded > 0.005 || (working && (contributionFailure ||
            (definition.careerTransition !== undefined && flow.contributions.unallocatedIncomeWithheld > .005) ||
            (flow.withdrawals.total > .005 && career?.kind !== "barista") ||
            (definition.careerTransition !== undefined && reserveShortfall > .005) ||
            (career !== undefined && (withdrawalFunded || reserveShortfall > .005 || coastViolation))));
          if (working && deficit) result.workingLifeFeasible = false;
          if (deficit && result.firstFundingShortfallAge === null) result.firstFundingShortfallAge = age;
          if (deficit) result.status = "infeasible";
          if (working && reserveShortfall > 0.005 && !result.warnings.includes("The configured cash reserve target is not fully funded in every working month.")) {
            result.warnings.push("The configured cash reserve target is not fully funded in every working month.");
          }
          // Direct surplus allocations are deposits outside the contribution
          // ledger. Waterfall allocations already belong to cashFunded.
          const directSurplusDeposits = inputs.savingsPolicy.mode === "advanced" &&
            inputs.surplusAllocation.excess.mode === "allocate_to_account"
            ? flow.surplusAllocation.redirected : 0;
          const personalDeposits = flow.contributions.cashFunded + directSurplusDeposits;
          const difference = flow.income.total + flow.withdrawals.total + unfunded -
            (out.essential + out.discretionary + out.liabilityCashPayment + out.oneTime + out.tax + personalDeposits + flow.surplusAllocation.retainedAsCash + targetedEventDeposits);
          if (Math.abs(difference) > 0.01) throw new Error("Monthly comparison cash flow did not reconcile within one cent.");
          if (!working && !fullHorizon) return;
          const year = Number(date.slice(0, 4));
          let annual = result.annual.find((row) => row.year === year);
          if (!annual) {
            annual = { year, months: 0, takeHome: 0, lifestyle: 0, liabilityPayments: 0, extraDebtPayments: 0, plannedPersonal: 0, actualPersonal: 0, personalDeposits: 0, withdrawalFundedPersonal: 0, withheld: 0, withdrawals: 0, tax: 0, otherOutflows: 0, retained: 0, targetedDeposits: 0, unfunded: 0, unallocatedPersonal: 0, reconciliationDifference: 0 };
            result.annual.push(annual);
          }
          annual.months += 1;
          annual.takeHome += flow.income.total / factor;
          annual.lifestyle += (out.essential + out.discretionary) / factor;
          annual.liabilityPayments += (out.liabilityCashPayment - out.liabilityLumpSumPrincipal) / factor;
          annual.extraDebtPayments += out.liabilityLumpSumPrincipal / factor;
          annual.plannedPersonal += (flow.contributions.planned - flow.contributions.incomeWithheld - flow.contributions.unallocatedIncomeWithheld) / factor;
          // Allocate current inflows to required outflows first. Fixed-route
          // deposits financed by withdrawals are shown separately, never as
          // saving funded by the current month's income.
          const currentCashForInvesting = Math.max(0, flow.income.total - targetedEventDeposits -
            out.essential - out.discretionary - out.liabilityCashPayment - out.oneTime - out.tax);
          const fundedPersonal = Math.min(personalDeposits, currentCashForInvesting);
          annual.actualPersonal += fundedPersonal / factor;
          annual.personalDeposits += personalDeposits / factor;
          annual.withdrawalFundedPersonal += (personalDeposits - fundedPersonal) / factor;
          annual.withheld += flow.contributions.incomeWithheld / factor;
          annual.withdrawals += flow.withdrawals.total / factor;
          annual.tax += out.tax / factor;
          annual.otherOutflows += out.oneTime / factor;
          annual.retained += flow.surplusAllocation.retainedAsCash / factor;
          annual.targetedDeposits += targetedEventDeposits / factor;
          annual.unfunded += unfunded / factor;
          annual.unallocatedPersonal += unallocated / factor;
          annual.reconciliationDifference += difference / factor;
        },
      });
      result.summary = projection.summary;
      result.retirementRequirement = projection.retirementRequirement;
      result.lifetimeViable = result.status !== "infeasible" && projection.projectionCompletion.status === "complete" &&
        projection.retirementRequirement.status === "available" && (projection.retirementRequirement.fundingMarginToday ?? -1) >= -.005;
      if (definition.careerTransition && !result.lifetimeViable) result.status = "infeasible";
      if (result.coastVerified && !result.lifetimeViable) result.coastVerified = false;
      if (result.coastVerified) {
        let verificationFailed = false;
        try {
          const verification = calculateProjection(structuredClone(inputs), {
            cashConstrainedPersonalContributions: definition.contributionPolicy === "cash_constrained",
            retainSurplusAtAge: definition.careerTransition ? age => careerAt(age)?.surplusInvesting === "retain_as_cash" : undefined,
            consumeUncommittedSurplusAtAge: coastSavingWindow,
            onMonth: ({ age, working, flow, reserveShortfall }) => {
              const phase = careerAt(age);
              const requiredUnallocated = phase?.contributions.some(c => (c.requirement === "required" || c.funding === "income_withheld") && (flow.accountContributionDetails[c.accountId]?.unallocatedFromAccount ?? 0) > .005);
              if (flow.outflows.unmetSpending > .005 || flow.outflows.unmetRequiredOutflow > .005 ||
                (working && (reserveShortfall > .005 || requiredUnallocated || (flow.withdrawals.total > .005 && phase?.kind !== "barista")))) verificationFailed = true;
            },
          });
          result.coastFundingWithoutSurplusToday = verification.retirementRequirement.fundingMarginToday;
          result.coastVerified = !verificationFailed && verification.projectionCompletion.status === "complete" &&
            verification.retirementRequirement.status === "available" && (result.coastFundingWithoutSurplusToday ?? -1) >= -.005;
        } catch {
          result.coastVerified = false;
        }
        if (!result.coastVerified) result.status = "infeasible";
        result.warnings.push("Coast also runs the same engine without retaining uncommitted surplus above protected liquidity from the first Coast phase through full retirement. Verification requires that no-saving counterfactual to meet working-life cash needs and the retirement terminal floor; the displayed ledger remains the actual scenario.");
      }
      if (result.coastVerified === false) result.warnings.push("Coast is not verified: actual flows must fund required outflows and liquidity without retirement saving or withdrawals during Coast, and the lifetime plan must meet the terminal floor.");
      result.trajectory = projection.annual.map((row) => ({ age: row.age, financialAssetsToday: row.real.balances.financialAssets }));
      if (projection.projectionCompletion.status !== "complete") {
        result.status = "infeasible";
        if (projection.projectionCompletion.completedThroughAge < inputs.person.retirementAge) result.workingLifeFeasible = false;
        result.warnings.push("Projection stopped at an unfunded liability; terminal assets are unavailable.");
        result.firstFundingShortfallAge ??= projection.projectionCompletion.completedThroughAge;
      }
      if (result.status === "infeasible") result.warnings.push("The configured plan has unfunded contributions, required outflows, prohibited withdrawals, a strategy/reserve failure, or a lifetime funding gap. Deposits are not proof of affordability.");
      if (projection.taxation.provisional) result.warnings.push("Tax modelling is provisional under the active baseline assumptions.");
      result.warnings.push("Personal investing funded by current cash allocates inflows to required outflows first. Any remaining deposits funded by asset withdrawals are separate; fixed-plan balances are not evidence of affordability.");
      result.warnings.push("Tax in this ledger is additional projection-funded tax; payroll deductions are already in net pay. Amounts use today's dollars. When a career scenario is selected all allocation ledgers include the full horizon; otherwise they include working months only; withheld workplace contributions are separate from take-home cash.");
    } catch (error) {
      result.status = "unavailable";
      result.workingLifeFeasible = false;
      result.lifetimeViable = false;
      if (result.coastVerified !== null) result.coastVerified = false;
      result.summary = null;
      result.annual = [];
      result.trajectory = [];
      result.warnings.push(error instanceof Error ? error.message : "Scenario projection failed.");
    }
    return result;
  });
}
