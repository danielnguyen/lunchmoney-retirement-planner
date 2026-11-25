import type { ComparisonScenarioConfig } from "@/src/config/types";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { validateProjectionInputs, type ProjectionInputs, type ProjectionSummary } from "@/src/domain/projection/types";

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
  activeInputs: {
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
  return validateProjectionInputs(inputs);
}

export function calculateComparison(baseline: ProjectionInputs, scenarios: ComparisonScenarioConfig[]): ComparisonResult[] {
  return scenarios.map((definition) => {
    const result: ComparisonResult = {
      activeInputs: null, id: definition.id, label: definition.label, definition,
      status: "calculated", warnings: [], retirementAge: baseline.person.retirementAge,
      terminalAge: baseline.endAge, summary: null, firstFundingShortfallAge: null,
      annual: [], trajectory: [],
    };
    try {
      const inputs = materializeComparisonInputs(baseline, definition);
      result.activeInputs = {
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
          baselineMonthlyAmountToday: baseline.accounts.find((entry) => entry.id === account.id)!.contributionPhases.find((entry) => entry.id === phase.id)!.monthlyAmountToday,
        }))),
      };
      const projection = calculateProjection(inputs, {
        cashConstrainedPersonalContributions: definition.contributionPolicy === "cash_constrained",
        onMonth: ({ date, age, working, inflationFactor: factor, flow, targetedEventDeposits, reserveShortfall }) => {
          const out = flow.outflows;
          const unallocated = flow.contributions.unallocatedCashFunded;
          const unfunded = out.unmetSpending + out.unmetRequiredOutflow;
          // Fixed advanced routes may be financed by asset withdrawals. They are
          // never described as affordable salary-funded saving.
          const deficit = unfunded > 0.005 || (working && (unallocated > 0.005 || flow.withdrawals.total > 0.005));
          if (deficit && result.firstFundingShortfallAge === null) result.firstFundingShortfallAge = age;
          if (deficit) result.status = "infeasible";
          if (working && reserveShortfall > 0.005 && !result.warnings.includes("The configured cash reserve target is not fully funded in every working month.")) {
            result.warnings.push("The configured cash reserve target is not fully funded in every working month.");
          }
          const difference = flow.income.total + flow.withdrawals.total + unfunded -
            (out.essential + out.discretionary + out.liabilityCashPayment + out.oneTime + out.tax + flow.contributions.cashFunded + flow.surplusAllocation.retainedAsCash + targetedEventDeposits);
          if (Math.abs(difference) > 0.01) throw new Error("Monthly comparison cash flow did not reconcile within one cent.");
          if (!working) return;
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
          const fundedPersonal = Math.min(flow.contributions.cashFunded, currentCashForInvesting);
          annual.actualPersonal += fundedPersonal / factor;
          annual.personalDeposits += flow.contributions.cashFunded / factor;
          annual.withdrawalFundedPersonal += (flow.contributions.cashFunded - fundedPersonal) / factor;
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
      result.trajectory = projection.annual.map((row) => ({ age: row.age, financialAssetsToday: row.real.balances.financialAssets }));
      if (projection.projectionCompletion.status !== "complete") {
        result.status = "infeasible";
        result.warnings.push("Projection stopped at an unfunded liability; terminal assets are unavailable.");
        result.firstFundingShortfallAge ??= projection.projectionCompletion.completedThroughAge;
      }
      if (result.status === "infeasible") result.warnings.push("The configured plan has unfunded contributions, required outflows, or working-life asset withdrawals. Deposits are not proof of affordability.");
      if (projection.taxation.provisional) result.warnings.push("Tax modelling is provisional under the active baseline assumptions.");
      result.warnings.push("Personal investing funded by current cash allocates inflows to required outflows first. Any remaining deposits funded by asset withdrawals are separate; fixed-plan balances are not evidence of affordability.");
      result.warnings.push("Amounts use today's dollars. Annual allocation includes working months only; withheld workplace contributions are separate from take-home cash.");
    } catch (error) {
      result.status = "unavailable";
      result.summary = null;
      result.annual = [];
      result.trajectory = [];
      result.warnings.push(error instanceof Error ? error.message : "Scenario projection failed.");
    }
    return result;
  });
}
