import { calculateAnnualCanadianTax, ZERO_CANADIAN_TAX_INCOME } from "@/src/domain/projection/canadian-tax";

export const payrollProvenance = {
  source: "estimated_reference" as const,
  effectiveDate: "2026-01-01",
  description: "Ontario single-person annual approximation; 2026 CRA rates, not an employer quote",
  references: [
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html",
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/payroll-deductions-t4127-payroll-deductions-formulas/t4127-jan-122nd-edition-effective-january-1-2026/t4127-jan-payroll-deductions-formulas-computer-programs.html",
  ],
  limitations: "Annualized pay, divided into monthly cash; partial years use the same monthly estimate, without payroll true-ups or refunds. Uses the planner annual tax model, which excludes CPP/EI credits and enhanced CPP deductions, so estimated tax is conservative. No benefit premiums, union dues, RRSP deduction refund, employer match taxation or pension valuation. Use explicit net/taxable/eligible overrides for those terms. CPP contributions assume age 18–64; other ages require overrides. Future rates are not forecasts.",
};

export function estimateOntarioEmployment(annualGrossToday: number) {
  if (!Number.isFinite(annualGrossToday) || annualGrossToday < 0) throw new Error("Gross pay must be finite and non-negative");
  const round = (n: number) => Math.round(n * 100) / 100;
  const cpp = round(Math.max(0, Math.min(annualGrossToday, 74600) - 3500) * .0595);
  const cpp2 = round(Math.max(0, Math.min(annualGrossToday, 85000) - 74600) * .04);
  const ei = round(Math.min(annualGrossToday, 68900) * .0163);
  const tax = calculateAnnualCanadianTax({ calendarYear: 2026, province: "ON", ageAtYearEnd: 40,
    incomeBySource: { ...ZERO_CANADIAN_TAX_INCOME, employment: annualGrossToday }, eligiblePensionIncome: 0, futureIndexingRate: 0 }).totals.totalTax;
  return { annualNetCashToday: round(Math.max(0, annualGrossToday - tax - cpp - cpp2 - ei)),
    annualTaxableEmploymentIncomeToday: annualGrossToday, annualEligibleEarnedIncomeToday: annualGrossToday,
    tax, cpp, cpp2, ei, provenance: payrollProvenance };
}
