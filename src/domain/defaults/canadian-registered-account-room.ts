export type CanadianAnnualLimitReference = {
  calendarYear: number;
  amount: number;
  effectiveDate: string;
  referenceKind: "statutory_annual_limit";
  referenceUrl: string;
  sourceKind: "published_reference" | "configured_forecast";
};

export const TFSA_LIMIT_REFERENCE_URL =
  "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html";
export const TFSA_WITHDRAWAL_REFERENCE_URL =
  "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/how.html";
export const RRSP_LIMIT_REFERENCE_URL =
  "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html";
export const RRSP_FORMULA_REFERENCE_URL =
  "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html";

export const TFSA_ANNUAL_LIMITS: readonly CanadianAnnualLimitReference[] = [
  {
    calendarYear: 2026,
    amount: 7000,
    effectiveDate: "2026-01-01",
    referenceKind: "statutory_annual_limit",
    referenceUrl: TFSA_LIMIT_REFERENCE_URL,
    sourceKind: "published_reference",
  },
];

export const RRSP_ANNUAL_LIMITS: readonly CanadianAnnualLimitReference[] = [
  {
    calendarYear: 2026,
    amount: 33810,
    effectiveDate: "2026-01-01",
    referenceKind: "statutory_annual_limit",
    referenceUrl: RRSP_LIMIT_REFERENCE_URL,
    sourceKind: "published_reference",
  },
  {
    calendarYear: 2027,
    amount: 35390,
    effectiveDate: "2027-01-01",
    referenceKind: "statutory_annual_limit",
    referenceUrl: RRSP_LIMIT_REFERENCE_URL,
    sourceKind: "published_reference",
  },
];

export const RRSP_EARNED_INCOME_RATE = 0.18;

export const SIMPLE_POLICY_TFSA_FUTURE_INDEXING_RATE = 0.02;
export const SIMPLE_POLICY_TFSA_ROUNDING_INCREMENT = 500;
export const SIMPLE_POLICY_RRSP_FUTURE_GROWTH_RATE = 0.03;
export const SIMPLE_POLICY_RRSP_ROUNDING_INCREMENT = 10;

function roundedForecast(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

export function tfsaAnnualLimit(
  calendarYear: number,
  futureIndexingRate: number,
  roundingIncrement: number,
): CanadianAnnualLimitReference {
  const published = TFSA_ANNUAL_LIMITS.find(
    (reference) => reference.calendarYear === calendarYear,
  );
  if (published) return published;
  let previous = TFSA_ANNUAL_LIMITS.at(-1)!;
  for (let year = previous.calendarYear + 1; year <= calendarYear; year += 1) {
    previous = {
      calendarYear: year,
      amount: roundedForecast(
        previous.amount * (1 + futureIndexingRate),
        roundingIncrement,
      ),
      effectiveDate: `${year}-01-01`,
      referenceKind: "statutory_annual_limit",
      referenceUrl: TFSA_LIMIT_REFERENCE_URL,
      sourceKind: "configured_forecast",
    };
  }
  return previous;
}

export function rrspAnnualCap(
  calendarYear: number,
  futureGrowthRate: number,
  roundingIncrement: number,
): CanadianAnnualLimitReference {
  const published = RRSP_ANNUAL_LIMITS.find(
    (reference) => reference.calendarYear === calendarYear,
  );
  if (published) return published;
  let previous = RRSP_ANNUAL_LIMITS.at(-1)!;
  for (let year = previous.calendarYear + 1; year <= calendarYear; year += 1) {
    previous = {
      calendarYear: year,
      amount: roundedForecast(
        previous.amount * (1 + futureGrowthRate),
        roundingIncrement,
      ),
      effectiveDate: `${year}-01-01`,
      referenceKind: "statutory_annual_limit",
      referenceUrl: RRSP_LIMIT_REFERENCE_URL,
      sourceKind: "configured_forecast",
    };
  }
  return previous;
}
