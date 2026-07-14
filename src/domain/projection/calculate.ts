import type {
  ProjectionInputs,
  ProjectionPoint,
  ProjectionResult,
  ProjectionSummary,
} from "./types";
import { projectionInputsSchema } from "./types";

const MONTHS_PER_YEAR = 12;

function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateProjection(rawInputs: ProjectionInputs): ProjectionResult {
  const inputs = projectionInputsSchema.parse(rawInputs);
  const totalMonths = Math.round((inputs.endAge - inputs.currentAge) * MONTHS_PER_YEAR);
  const retirementMonth = Math.round(
    (inputs.retirementAge - inputs.currentAge) * MONTHS_PER_YEAR,
  );

  const monthlyInflationRate = monthlyRate(inputs.annualInflation);
  const preRetirementMonthlyReturn = monthlyRate(inputs.annualReturnBeforeRetirement);
  const postRetirementMonthlyReturn = monthlyRate(inputs.annualReturnAfterRetirement);

  let nominalBalance = inputs.currentSavings;
  let retirementBalanceNominal = 0;
  let retirementBalanceToday = 0;
  let depletionAge: number | null = null;
  let annualContributions = 0;
  let annualWithdrawals = 0;
  let annualInvestmentGrowth = 0;

  const yearly: ProjectionPoint[] = [];

  for (let month = 0; month <= totalMonths; month += 1) {
    const phase = month < retirementMonth ? "accumulation" : "retirement";
    const inflationFactor = Math.pow(1 + monthlyInflationRate, month);
    const returnRate =
      phase === "accumulation" ? preRetirementMonthlyReturn : postRetirementMonthlyReturn;

    if (month > 0) {
      const investmentGrowth = nominalBalance * returnRate;
      nominalBalance += investmentGrowth;
      annualInvestmentGrowth += investmentGrowth;

      if (phase === "accumulation") {
        nominalBalance += inputs.monthlyContribution;
        annualContributions += inputs.monthlyContribution;
      } else {
        const spending = inputs.monthlyRetirementSpendingToday * inflationFactor;
        const benefits = inputs.monthlyGovernmentBenefitsToday * inflationFactor;
        const withdrawal = Math.max(0, spending - benefits);
        const actualWithdrawal = Math.min(withdrawal, nominalBalance);
        nominalBalance -= actualWithdrawal;
        annualWithdrawals += actualWithdrawal;

        if (depletionAge === null && nominalBalance <= 0 && withdrawal > 0) {
          depletionAge = inputs.currentAge + month / MONTHS_PER_YEAR;
        }
      }
    }

    if (month === retirementMonth) {
      retirementBalanceNominal = nominalBalance;
      retirementBalanceToday = nominalBalance / inflationFactor;
    }

    const isAnnualPoint = month % MONTHS_PER_YEAR === 0;
    const isFinalPoint = month === totalMonths;
    if (isAnnualPoint || isFinalPoint) {
      yearly.push({
        age: roundCurrency(inputs.currentAge + month / MONTHS_PER_YEAR),
        yearIndex: Math.floor(month / MONTHS_PER_YEAR),
        nominalBalance: roundCurrency(nominalBalance),
        realBalance: roundCurrency(nominalBalance / inflationFactor),
        realGoal: roundCurrency(inputs.retirementGoalToday),
        annualContributions: roundCurrency(annualContributions),
        annualWithdrawals: roundCurrency(annualWithdrawals),
        annualInvestmentGrowth: roundCurrency(annualInvestmentGrowth),
        phase,
      });
      annualContributions = 0;
      annualWithdrawals = 0;
      annualInvestmentGrowth = 0;
    }
  }

  const finalPoint = yearly.at(-1);
  if (!finalPoint) {
    throw new Error("Projection did not produce a final point");
  }

  const summary: ProjectionSummary = {
    balanceAtRetirementNominal: roundCurrency(retirementBalanceNominal),
    balanceAtRetirementToday: roundCurrency(retirementBalanceToday),
    retirementGoalToday: roundCurrency(inputs.retirementGoalToday),
    goalGapToday: roundCurrency(retirementBalanceToday - inputs.retirementGoalToday),
    depletionAge: depletionAge === null ? null : roundCurrency(depletionAge),
    endingBalanceToday: finalPoint.realBalance,
  };

  return {
    schemaVersion: "1.0",
    inputs,
    summary,
    yearly,
  };
}
