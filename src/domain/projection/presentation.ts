import type { FinancialAccountInput, ProjectionInputs } from "./types";

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
