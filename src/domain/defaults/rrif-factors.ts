export const RRIF_REFERENCE_RETRIEVED_DATE = "2026-07-30" as const;

export const RRIF_REFERENCE_URLS = {
  rrspMaturity:
    "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/rrsp-options-when-you-turn-71.html",
  maturedRrspTransfer:
    "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/registered-retirement-income-fund-rrif/transferring-your-rrif/matured-rrsp-including-commutation-payments.html",
  minimumAmount:
    "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/completing-slips-summaries/t4rsp-t4rif-information-returns/payments/minimum-amount-a-rrif.html",
  prescribedFactors:
    "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/completing-slips-summaries/t4rsp-t4rif-information-returns/payments/chart-prescribed-factors.html",
  receivingIncome:
    "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/registered-retirement-income-fund-rrif/receiving-income-a-rrif.html",
  circular:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/ic78-18/registered-retirement-income-funds.html",
  pensionIncomeAmount:
    "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/about-your-tax-return/tax-return/completing-a-tax-return/deductions-credits-expenses/line-31400-pension-income-amount.html",
} as const;

export const RRIF_REFERENCE_EFFECTIVE_DATES = {
  rrspMaturity: "2026-01-29",
  maturedRrspTransfer: "2026-01-06",
  minimumAmount: "2026-01-07",
  prescribedFactors: "2025-10-01",
  receivingIncome: "2026-01-06",
  circular: "2025-06-05",
  pensionIncomeAmount: "2025-01-01",
} as const;

export const ALL_OTHER_RRIF_FACTORS = {
  71: 0.0528,
  72: 0.054,
  73: 0.0553,
  74: 0.0567,
  75: 0.0582,
  76: 0.0598,
  77: 0.0617,
  78: 0.0636,
  79: 0.0658,
  80: 0.0682,
  81: 0.0708,
  82: 0.0738,
  83: 0.0771,
  84: 0.0808,
  85: 0.0851,
  86: 0.0899,
  87: 0.0955,
  88: 0.1021,
  89: 0.1099,
  90: 0.1192,
  91: 0.1306,
  92: 0.1449,
  93: 0.1634,
  94: 0.1879,
} as const;

export type RrifPrescribedFactorResult = {
  age: number;
  factor: number;
  factorClass: "under_71_formula" | "all_other_rrifs_table" | "age_95_plus";
  supportedRrifClass: "all_other_rrifs";
  ageBasis: "owner_age_at_beginning_of_year";
  indexed: false;
  sourceUrl: typeof RRIF_REFERENCE_URLS.prescribedFactors;
  sourceEffectiveDate: typeof RRIF_REFERENCE_EFFECTIVE_DATES.prescribedFactors;
  retrievedDate: typeof RRIF_REFERENCE_RETRIEVED_DATE;
};

export function rrifPrescribedFactor(ageAtBeginningOfYear: number): RrifPrescribedFactorResult {
  if (!Number.isInteger(ageAtBeginningOfYear) || ageAtBeginningOfYear < 18) {
    throw new Error("RRIF prescribed-factor age must be a whole age of at least 18");
  }
  let factor: number;
  let factorClass: RrifPrescribedFactorResult["factorClass"];
  if (ageAtBeginningOfYear <= 70) {
    factor = 1 / (90 - ageAtBeginningOfYear);
    factorClass = "under_71_formula";
  } else if (ageAtBeginningOfYear >= 95) {
    factor = 0.2;
    factorClass = "age_95_plus";
  } else {
    factor = ALL_OTHER_RRIF_FACTORS[
      ageAtBeginningOfYear as keyof typeof ALL_OTHER_RRIF_FACTORS
    ];
    factorClass = "all_other_rrifs_table";
  }
  return {
    age: ageAtBeginningOfYear,
    factor,
    factorClass,
    supportedRrifClass: "all_other_rrifs",
    ageBasis: "owner_age_at_beginning_of_year",
    indexed: false,
    sourceUrl: RRIF_REFERENCE_URLS.prescribedFactors,
    sourceEffectiveDate: RRIF_REFERENCE_EFFECTIVE_DATES.prescribedFactors,
    retrievedDate: RRIF_REFERENCE_RETRIEVED_DATE,
  };
}

export function settleRrifMinimum(rawMinimum: number): number {
  if (!Number.isFinite(rawMinimum) || rawMinimum < 0) {
    throw new Error("RRIF minimum must be finite and non-negative");
  }
  const scaledCents = rawMinimum * 100;
  const nearestCent = Math.round(scaledCents);
  const representationNoiseTolerance =
    4 * Number.EPSILON * Math.max(1, Math.abs(scaledCents));
  // Snap only values within a few scaled-value ULPs of an integer cent. This
  // removes IEEE-754 representation noise; a genuine statutory fraction of a
  // cent remains outside the magnitude-derived tolerance and rounds upward.
  const settledCents =
    Math.abs(scaledCents - nearestCent) <= representationNoiseTolerance
      ? nearestCent
      : Math.ceil(scaledCents);
  return settledCents / 100;
}
