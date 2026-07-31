export const CANADIAN_TAX_REFERENCE_URLS = {
  payrollTables:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html",
  payrollFormulas:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html",
  payrollFormulasJanuary:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jan/t4127-jan-payroll-deductions-formulas-computer-programs.html",
  federalCredits:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1.html",
  ontarioCredits:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1on.html",
  ontarioCreditsWorksheet:
    "https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1on-ws.html",
  oasRecovery:
    "https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/recovery-tax.html",
  annualRates:
    "https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets.html",
} as const;

export type CanadianTaxReferenceValueKind =
  | "indexed"
  | "fixed"
  | "income_dependent"
  | "derived";

export type CanadianTaxReferenceSourceKind =
  | "published"
  | "published_estimate"
  | "forecast";

export type CanadianTaxReferenceMetadata = {
  referenceYear: 2026;
  requestedYear: number;
  province: "ON";
  jurisdiction: "CA";
  effectiveDate: string;
  retrievedDate: "2026-07-30";
  forecastIndexingRate: number;
  sourceKind: CanadianTaxReferenceSourceKind;
  sourceUrls: string[];
  limitations: string[];
};

export type CanadianTaxReferenceSet = {
  metadata: CanadianTaxReferenceMetadata;
  federal: {
    brackets: Array<{ threshold: number; rate: number }>;
    basicPersonalAmount: {
      maximum: number;
      minimum: number;
      phaseOutStart: number;
      phaseOutEnd: number;
      kind: "income_dependent";
    };
    employmentAmountMaximum: number;
    ageAmount: {
      maximum: number;
      phaseOutStart: number;
      phaseOutRate: 0.15;
    };
    pensionIncomeAmountMaximum: 2000;
    nonRefundableCreditRate: 0.14;
  };
  ontario: {
    brackets: Array<{ threshold: number; rate: number }>;
    basicPersonalAmount: number;
    ageAmount: {
      maximum: number;
      phaseOutStart: number;
      phaseOutRate: 0.15;
    };
    pensionIncomeAmountMaximum: number;
    nonRefundableCreditRate: 0.0505;
    taxReductionBasicAmount: number;
    surtax: {
      firstThreshold: number;
      firstRate: 0.2;
      secondThreshold: number;
      secondRate: 0.36;
    };
    healthPremium: {
      bands: Array<{
        threshold: number;
        base: number;
        rate: number;
        maximum: number;
      }>;
    };
  };
  oas: {
    recoveryThreshold: number;
    recoveryRate: 0.15;
    thresholdSourceKind: "published_estimate" | "forecast";
  };
  valueKinds: Record<string, CanadianTaxReferenceValueKind>;
};

const BASE: Omit<CanadianTaxReferenceSet, "metadata"> = {
  federal: {
    brackets: [
      { threshold: 0, rate: 0.14 },
      { threshold: 58_523, rate: 0.205 },
      { threshold: 117_045, rate: 0.26 },
      { threshold: 181_440, rate: 0.29 },
      { threshold: 258_482, rate: 0.33 },
    ],
    basicPersonalAmount: {
      maximum: 16_452,
      minimum: 14_829,
      phaseOutStart: 181_440,
      phaseOutEnd: 258_482,
      kind: "income_dependent",
    },
    employmentAmountMaximum: 1_501,
    ageAmount: {
      maximum: 9_208,
      phaseOutStart: 46_432,
      phaseOutRate: 0.15,
    },
    pensionIncomeAmountMaximum: 2_000,
    nonRefundableCreditRate: 0.14,
  },
  ontario: {
    brackets: [
      { threshold: 0, rate: 0.0505 },
      { threshold: 53_891, rate: 0.0915 },
      { threshold: 107_785, rate: 0.1116 },
      { threshold: 150_000, rate: 0.1216 },
      { threshold: 220_000, rate: 0.1316 },
    ],
    basicPersonalAmount: 12_989,
    ageAmount: {
      maximum: 6_342,
      phaseOutStart: 47_210,
      phaseOutRate: 0.15,
    },
    pensionIncomeAmountMaximum: 1_796,
    nonRefundableCreditRate: 0.0505,
    taxReductionBasicAmount: 300,
    surtax: {
      firstThreshold: 5_818,
      firstRate: 0.2,
      secondThreshold: 7_446,
      secondRate: 0.36,
    },
    healthPremium: {
      bands: [
        { threshold: 20_000, base: 0, rate: 0.06, maximum: 300 },
        { threshold: 36_000, base: 300, rate: 0.06, maximum: 450 },
        { threshold: 48_000, base: 450, rate: 0.25, maximum: 600 },
        { threshold: 72_000, base: 600, rate: 0.25, maximum: 750 },
        { threshold: 200_000, base: 750, rate: 0.25, maximum: 900 },
      ],
    },
  },
  oas: {
    recoveryThreshold: 95_323,
    recoveryRate: 0.15,
    thresholdSourceKind: "published_estimate",
  },
  valueKinds: {
    "federal.brackets.thresholds": "indexed",
    "federal.brackets.rates": "fixed",
    "federal.basicPersonalAmount": "income_dependent",
    "federal.employmentAmountMaximum": "indexed",
    "federal.ageAmount": "income_dependent",
    "federal.pensionIncomeAmountMaximum": "fixed",
    "federal.nonRefundableCreditRate": "fixed",
    "ontario.brackets.thresholds": "indexed",
    "ontario.brackets.rates": "fixed",
    "ontario.basicPersonalAmount": "indexed",
    "ontario.ageAmount": "income_dependent",
    "ontario.pensionIncomeAmountMaximum": "indexed",
    "ontario.nonRefundableCreditRate": "fixed",
    "ontario.taxReductionBasicAmount": "indexed",
    "ontario.surtax.thresholds": "indexed",
    "ontario.surtax.rates": "fixed",
    "ontario.healthPremium": "fixed",
    "oas.recoveryThreshold": "indexed",
    "oas.recoveryRate": "fixed",
  },
};

function indexed(value: number, requestedYear: number, rate: number): number {
  if (requestedYear === 2026) return value;
  return Math.round(value * Math.pow(1 + rate, requestedYear - 2026));
}

export function resolveCanadianTaxReferences(
  requestedYear: number,
  futureIndexingRate: number,
): CanadianTaxReferenceSet {
  if (!Number.isInteger(requestedYear) || requestedYear < 2026) {
    throw new Error("Canadian annual tax reference year must be 2026 or later");
  }
  if (!Number.isFinite(futureIndexingRate) || futureIndexingRate < -0.2 || futureIndexingRate > 0.5) {
    throw new Error("Canadian tax future indexing rate must be between -0.2 and 0.5");
  }
  const amount = (value: number) => indexed(value, requestedYear, futureIndexingRate);
  return {
    metadata: {
      referenceYear: 2026,
      requestedYear,
      province: "ON",
      jurisdiction: "CA",
      effectiveDate: `${requestedYear}-01-01`,
      retrievedDate: "2026-07-30",
      forecastIndexingRate: futureIndexingRate,
      sourceKind: requestedYear === 2026 ? "published" : "forecast",
      sourceUrls: Object.values(CANADIAN_TAX_REFERENCE_URLS),
      limitations: [
        "The 2026 OAS recovery threshold is an official published estimate until finalized.",
        "Future indexed values are deterministic forecasts from the 2026 reference set.",
      ],
    },
    federal: {
      ...BASE.federal,
      brackets: BASE.federal.brackets.map((bracket, index) => ({
        threshold: index === 0 ? 0 : amount(bracket.threshold),
        rate: bracket.rate,
      })),
      basicPersonalAmount: {
        ...BASE.federal.basicPersonalAmount,
        maximum: amount(BASE.federal.basicPersonalAmount.maximum),
        minimum: amount(BASE.federal.basicPersonalAmount.minimum),
        phaseOutStart: amount(BASE.federal.basicPersonalAmount.phaseOutStart),
        phaseOutEnd: amount(BASE.federal.basicPersonalAmount.phaseOutEnd),
      },
      employmentAmountMaximum: amount(BASE.federal.employmentAmountMaximum),
      ageAmount: {
        ...BASE.federal.ageAmount,
        maximum: amount(BASE.federal.ageAmount.maximum),
        phaseOutStart: amount(BASE.federal.ageAmount.phaseOutStart),
      },
    },
    ontario: {
      ...BASE.ontario,
      brackets: BASE.ontario.brackets.map((bracket, index) => ({
        threshold: index === 0 ? 0 : amount(bracket.threshold),
        rate: bracket.rate,
      })),
      basicPersonalAmount: amount(BASE.ontario.basicPersonalAmount),
      ageAmount: {
        ...BASE.ontario.ageAmount,
        maximum: amount(BASE.ontario.ageAmount.maximum),
        phaseOutStart: amount(BASE.ontario.ageAmount.phaseOutStart),
      },
      pensionIncomeAmountMaximum: amount(
        BASE.ontario.pensionIncomeAmountMaximum,
      ),
      taxReductionBasicAmount: amount(BASE.ontario.taxReductionBasicAmount),
      surtax: {
        ...BASE.ontario.surtax,
        firstThreshold: amount(BASE.ontario.surtax.firstThreshold),
        secondThreshold: amount(BASE.ontario.surtax.secondThreshold),
      },
    },
    oas: {
      ...BASE.oas,
      recoveryThreshold: amount(BASE.oas.recoveryThreshold),
      thresholdSourceKind:
        requestedYear === 2026 ? "published_estimate" : "forecast",
    },
    valueKinds: { ...BASE.valueKinds },
  };
}

export const canadianTaxReference2026 = resolveCanadianTaxReferences(2026, 0);
