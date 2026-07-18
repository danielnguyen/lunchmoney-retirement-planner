import type {
  AnnualProjection,
  FinancialAccountInput,
  ProjectionInputs,
  ProjectionResult,
} from "./types";

const FINANCIAL_ASSET_TYPES = new Set(["cash", "tfsa", "rrsp_rrif", "non_registered"]);
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function startingFinancialAssets(accounts: FinancialAccountInput[]): number {
  return roundCurrency(
    accounts.reduce(
      (total, account) =>
        FINANCIAL_ASSET_TYPES.has(account.type) ? total + account.openingBalance : total,
      0,
    ),
  );
}

export function monthlyEmploymentNetCash(inputs: ProjectionInputs): number {
  const phase = inputs.person.employmentIncomePhases.find(
    (item) =>
      inputs.person.currentAge >= item.startAge &&
      inputs.person.currentAge < item.endAge,
  );
  return roundCurrency((phase?.annualNetCashToday ?? 0) / 12);
}

export function monthlyInvestmentContributions(inputs: ProjectionInputs): number {
  return roundCurrency(
    inputs.accounts
      .filter((account) => ["tfsa", "rrsp_rrif", "non_registered"].includes(account.type))
      .reduce((total, account) => {
        const phase = account.contributionPhases.find(
          (item) =>
            inputs.person.currentAge >= item.startAge &&
            inputs.person.currentAge < item.endAge,
        );
        return total + (phase?.monthlyAmountToday ?? 0);
      }, 0),
  );
}

export function annualPeriodLabel(inputs: ProjectionInputs, calendarYear: number): string {
  const startYear = Number(inputs.startDate.slice(0, 4));
  const startMonth = Number(inputs.startDate.slice(5, 7));
  const totalMonths = Math.round((inputs.endAge - inputs.person.currentAge) * 12);
  const endingMonthIndex = startMonth - 1 + totalMonths - 1;
  const endYear = startYear + Math.floor(endingMonthIndex / 12);
  const endMonth = (endingMonthIndex % 12) + 1;

  if (calendarYear < startYear || calendarYear > endYear) return String(calendarYear);

  const periodStartMonth = calendarYear === startYear ? startMonth : 1;
  const periodEndMonth = calendarYear === endYear ? endMonth : 12;
  if (periodStartMonth === 1 && periodEndMonth === 12) return String(calendarYear);

  return `${calendarYear} (${MONTH_LABELS[periodStartMonth - 1]}–${MONTH_LABELS[periodEndMonth - 1]})`;
}

export type DisplayMode = "real" | "nominal";

export type AnnualChartRow = {
  [key: string]: string | number;
  year: number;
  periodLabel: string;
  age: number;
  essential: number;
  discretionary: number;
  oneTime: number;
  tax: number;
  contributions: number;
  cashFundedContributions: number;
  incomeWithheldContributions: number;
  employmentNetCash: number;
  employmentPhase: string;
  contributionPhases: string;
  cpp: number;
  oas: number;
  pension: number;
  otherIncome: number;
  cashWithdrawal: number;
  tfsaWithdrawal: number;
  rrspWithdrawal: number;
  nonRegisteredWithdrawal: number;
  surplusGenerated: number;
  surplusReserveRefill: number;
  surplusRetainedAsCash: number;
  surplusRedirected: number;
  surplusReserveTarget: number;
  financialAssets: number;
  goal: number;
  milestones: string;
};

export type AnnualLedgerRow = {
  periodLabel: string;
  year: number;
  age: number;
  income: number;
  withdrawals: number;
  tax: number;
  spending: number;
  surplusGenerated: number;
  surplusReserveRefill: number;
  surplusRetainedAsCash: number;
  surplusRedirected: number;
  surplusReserveTarget: number;
  financialAssets: number;
  milestones: string;
};

export function buildAnnualChartData(
  inputs: ProjectionInputs,
  projection: ProjectionResult,
  mode: DisplayMode,
): AnnualChartRow[] {
  return projection.annual.map((point) => {
    const view = point[mode];
    return {
      year: point.calendarYear,
      periodLabel: annualPeriodLabel(inputs, point.calendarYear),
      age: point.age,
      essential: view.outflows.essential,
      discretionary: view.outflows.discretionary,
      oneTime: view.outflows.oneTime,
      tax: view.outflows.tax,
      contributions: view.outflows.contributions,
      cashFundedContributions: view.contributions.cashFunded,
      incomeWithheldContributions: view.contributions.incomeWithheld,
      employmentNetCash: view.income.employment,
      employmentPhase: point.employmentPhaseLabels.join(" → "),
      contributionPhases: Object.values(point.contributionPhaseLabels)
        .flat()
        .join(" · "),
      cpp: view.income.cpp,
      oas: view.income.oas,
      pension: view.income.pension,
      otherIncome: view.income.other,
      cashWithdrawal: view.withdrawals.cash,
      tfsaWithdrawal: view.withdrawals.tfsa,
      rrspWithdrawal: view.withdrawals.rrspRrif,
      nonRegisteredWithdrawal: view.withdrawals.nonRegistered,
      surplusGenerated: view.surplusAllocation.generated,
      surplusReserveRefill: view.surplusAllocation.reserveRefill,
      surplusRetainedAsCash: view.surplusAllocation.retainedAsCash,
      surplusRedirected: view.surplusAllocation.redirected,
      surplusReserveTarget: view.surplusAllocation.reserveTarget,
      financialAssets: view.balances.financialAssets,
      goal:
        mode === "real"
          ? inputs.retirementGoalToday
          : inputs.retirementGoalToday *
            Math.pow(1 + inputs.annualInflation, point.age - inputs.person.currentAge),
      milestones: point.milestones.join(" · "),
      ...Object.fromEntries(
        Object.entries(view.accountBalances).map(([id, value]) => [`account:${id}`, value]),
      ),
      ...Object.fromEntries(
        Object.entries(view.accountContributions).map(([id, value]) => [
          `contribution:${id}`,
          value,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(view.accountSurplusAllocations).map(([id, value]) => [
          `surplusAllocation:${id}`,
          value,
        ]),
      ),
    };
  });
}

export function buildAnnualLedgerData(
  inputs: ProjectionInputs,
  projection: ProjectionResult,
  mode: DisplayMode,
): AnnualLedgerRow[] {
  return projection.annual.map((point) => {
    const view = point[mode];
    return {
      periodLabel: annualPeriodLabel(inputs, point.calendarYear),
      year: point.calendarYear,
      age: point.age,
      income: view.income.total,
      withdrawals: view.withdrawals.total,
      tax: view.outflows.tax,
      spending: roundCurrency(
        view.outflows.essential + view.outflows.discretionary + view.outflows.oneTime,
      ),
      surplusGenerated: view.surplusAllocation.generated,
      surplusReserveRefill: view.surplusAllocation.reserveRefill,
      surplusRetainedAsCash: view.surplusAllocation.retainedAsCash,
      surplusRedirected: view.surplusAllocation.redirected,
      surplusReserveTarget: view.surplusAllocation.reserveTarget,
      financialAssets: view.balances.financialAssets,
      milestones: point.milestones.join(" · ") || "—",
    };
  });
}

export function closestAnnualPoint(
  annual: AnnualProjection[],
  selectedYear: number,
): AnnualProjection | undefined {
  return annual.reduce<AnnualProjection | undefined>(
    (closest, point) =>
      !closest ||
      Math.abs(point.calendarYear - selectedYear) <
        Math.abs(closest.calendarYear - selectedYear)
        ? point
        : closest,
    undefined,
  );
}
