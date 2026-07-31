import {
  resolveCanadianTaxReferences,
  type CanadianTaxReferenceSet,
} from "@/src/domain/defaults/canadian-tax-2026";
import { centDifference } from "./monetary-reconciliation";

export type CanadianTaxIncomeBySource = {
  employment: number;
  cpp: number;
  oas: number;
  pension: number;
  rrspWithdrawals: number;
  rrifWithdrawals: number;
  interest: number;
  eligibleCanadianDividends: number;
  foreignIncome: number;
  capitalGains: number;
  capitalLosses: number;
  otherTaxableIncome: number;
};

export const ZERO_CANADIAN_TAX_INCOME: CanadianTaxIncomeBySource = {
  employment: 0,
  cpp: 0,
  oas: 0,
  pension: 0,
  rrspWithdrawals: 0,
  rrifWithdrawals: 0,
  interest: 0,
  eligibleCanadianDividends: 0,
  foreignIncome: 0,
  capitalGains: 0,
  capitalLosses: 0,
  otherTaxableIncome: 0,
};

export type AnnualCanadianTaxResult = {
  mode: "canadian_annual";
  province: "ON";
  taxYear: number;
  referenceYear: 2026;
  incomeBySource: CanadianTaxIncomeBySource;
  incomeAdjustments: {
    eligibleDividendGrossUp: number;
    taxableEligibleDividends: number;
    currentYearNetCapitalGain: number;
    currentYearExcessCapitalLoss: number;
    capitalGainsInclusionRate: number;
    taxableCapitalGain: number;
    allowableCapitalLoss: number;
  };
  actualIncomeTotal: number;
  totalIncome: number;
  netIncomeBasis: number;
  taxableIncomeBasis: number;
  recoveryIncomeBasis: number;
  eligiblePensionIncome: number;
  federal: {
    bracketTax: number;
    basicPersonalAmount: number;
    employmentAmount: number;
    ageAmount: number;
    pensionIncomeAmount: number;
    nonRefundableCreditValue: number;
    eligibleDividendTaxCredit: number;
    netTax: number;
  };
  ontario: {
    bracketTax: number;
    basicPersonalAmount: number;
    ageAmount: number;
    pensionIncomeAmount: number;
    nonRefundableCreditValue: number;
    eligibleDividendTaxCredit: number;
    taxAfterSurtaxAndDividendCredit: number;
    taxBeforeSurtaxAndReduction: number;
    taxReduction: number;
    surtax: number;
    healthPremium: number;
    netTax: number;
  };
  oasRecovery: {
    incomeBasis: number;
    threshold: number;
    excessIncome: number;
    uncappedRecovery: number;
    annualOasReceived: number;
    recoveryTax: number;
  };
  totals: {
    federalTax: number;
    ontarioTax: number;
    ontarioHealthPremium: number;
    oasRecoveryTax: number;
    totalTax: number;
    effectiveTaxRate: number;
  };
  provenance: CanadianTaxReferenceSet["metadata"] & {
    oasThresholdSourceKind: "published_estimate" | "forecast";
  };
  reconciliation: {
    componentsDifference: number;
    reconciled: boolean;
  };
  limitations: string[];
};

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertIncome(income: CanadianTaxIncomeBySource): void {
  for (const [source, value] of Object.entries(income)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Canadian annual tax income ${source} must be finite and non-negative`);
    }
  }
}

function taxBasis(
  income: CanadianTaxIncomeBySource,
  reference: CanadianTaxReferenceSet,
) {
  const ordinary =
    income.employment +
    income.cpp +
    income.oas +
    income.pension +
    income.rrspWithdrawals +
    income.rrifWithdrawals +
    income.interest +
    income.foreignIncome +
    income.otherTaxableIncome;
  const taxableEligibleDividends =
    income.eligibleCanadianDividends *
    reference.federal.eligibleDividendGrossUp;
  const eligibleDividendGrossUp =
    taxableEligibleDividends - income.eligibleCanadianDividends;
  const currentYearNetCapitalGain = Math.max(
    0,
    income.capitalGains - income.capitalLosses,
  );
  const currentYearExcessCapitalLoss = Math.max(
    0,
    income.capitalLosses - income.capitalGains,
  );
  const taxableCapitalGain =
    currentYearNetCapitalGain * reference.federal.capitalGainsInclusionRate;
  return {
    ordinary,
    taxableEligibleDividends,
    eligibleDividendGrossUp,
    currentYearNetCapitalGain,
    currentYearExcessCapitalLoss,
    taxableCapitalGain,
    taxableIncome:
      ordinary + taxableEligibleDividends + taxableCapitalGain,
  };
}

function bracketTaxRaw(
  taxableIncome: number,
  brackets: Array<{ threshold: number; rate: number }>,
): number {
  let tax = 0;
  for (let index = 0; index < brackets.length; index += 1) {
    const bracket = brackets[index]!;
    const next = brackets[index + 1];
    const width = Math.max(
      0,
      Math.min(taxableIncome, next?.threshold ?? taxableIncome) -
        bracket.threshold,
    );
    tax += width * bracket.rate;
  }
  return tax;
}

function federalBasicPersonalAmountRaw(
  income: number,
  reference: CanadianTaxReferenceSet,
): number {
  const bpa = reference.federal.basicPersonalAmount;
  if (income <= bpa.phaseOutStart) return bpa.maximum;
  if (income >= bpa.phaseOutEnd) return bpa.minimum;
  return (
    bpa.maximum -
    ((income - bpa.phaseOutStart) * (bpa.maximum - bpa.minimum)) /
      (bpa.phaseOutEnd - bpa.phaseOutStart)
  );
}

function phasedAgeAmountRaw(
  ageAtYearEnd: number,
  income: number,
  amount: { maximum: number; phaseOutStart: number; phaseOutRate: number },
): number {
  if (ageAtYearEnd < 65) return 0;
  return Math.max(
    0,
    amount.maximum -
      Math.max(0, income - amount.phaseOutStart) * amount.phaseOutRate,
  );
}

function ontarioHealthPremiumRaw(
  income: number,
  reference: CanadianTaxReferenceSet,
): number {
  const band = [...reference.ontario.healthPremium.bands]
    .reverse()
    .find((candidate) => income > candidate.threshold);
  if (!band) return 0;
  return Math.min(
    band.maximum,
    band.base + band.rate * (income - band.threshold),
  );
}

export function ontarioHealthPremium(
  income: number,
  reference: CanadianTaxReferenceSet,
): number {
  return money(ontarioHealthPremiumRaw(income, reference));
}


function ontarioSurtaxRaw(
  basicOntarioTax: number,
  reference: CanadianTaxReferenceSet,
): number {
  return (
    Math.max(
      0,
      (basicOntarioTax - reference.ontario.surtax.firstThreshold) *
        reference.ontario.surtax.firstRate,
    ) +
    Math.max(
      0,
      (basicOntarioTax - reference.ontario.surtax.secondThreshold) *
        reference.ontario.surtax.secondRate,
    )
  );
}

export function ontarioSurtax(
  basicOntarioTax: number,
  reference: CanadianTaxReferenceSet,
): number {
  return money(ontarioSurtaxRaw(basicOntarioTax, reference));
}

function ontarioTaxReductionRaw(
  taxIncludingSurtax: number,
  reference: CanadianTaxReferenceSet,
): number {
  return Math.max(
    0,
    Math.min(
      taxIncludingSurtax,
      2 * reference.ontario.taxReductionBasicAmount - taxIncludingSurtax,
    ),
  );
}

export function ontarioTaxReduction(
  taxIncludingSurtax: number,
  reference: CanadianTaxReferenceSet,
): number {
  return money(ontarioTaxReductionRaw(taxIncludingSurtax, reference));
}

export function calculateAnnualCanadianTax(input: {
  calendarYear: number;
  province: "ON";
  ageAtYearEnd: number;
  incomeBySource: CanadianTaxIncomeBySource;
  eligiblePensionIncome: number;
  futureIndexingRate: number;
  referenceSet?: CanadianTaxReferenceSet;
}): AnnualCanadianTaxResult {
  if (input.province !== "ON") {
    throw new Error(`Unsupported Canadian annual tax province: ${String(input.province)}`);
  }
  assertIncome(input.incomeBySource);
  if (!Number.isFinite(input.eligiblePensionIncome) || input.eligiblePensionIncome < 0) {
    throw new Error("eligiblePensionIncome must be finite and non-negative");
  }
  const reference =
    input.referenceSet ??
    resolveCanadianTaxReferences(input.calendarYear, input.futureIndexingRate);
  const basis = taxBasis(input.incomeBySource, reference);
  const total = basis.taxableIncome;
  const actualIncomeTotal =
    basis.ordinary +
    input.incomeBySource.eligibleCanadianDividends +
    basis.currentYearNetCapitalGain;
  const federalBracketTaxRaw = bracketTaxRaw(
    total,
    reference.federal.brackets,
  );
  const federalBpaRaw = federalBasicPersonalAmountRaw(total, reference);
  const federalEmploymentRaw =
    Math.min(
      input.incomeBySource.employment,
      reference.federal.employmentAmountMaximum,
    );
  const federalAgeRaw = phasedAgeAmountRaw(
    input.ageAtYearEnd,
    total,
    reference.federal.ageAmount,
  );
  const federalPensionRaw =
    Math.min(
      input.eligiblePensionIncome,
      reference.federal.pensionIncomeAmountMaximum,
    );
  const federalCreditsRaw =
    (federalBpaRaw +
      federalEmploymentRaw +
      federalAgeRaw +
      federalPensionRaw) *
    reference.federal.nonRefundableCreditRate;
  const federalDividendTaxCreditRaw =
    basis.taxableEligibleDividends *
    reference.federal.eligibleDividendTaxCreditRate;
  const federalNetRaw = Math.max(
    0,
    federalBracketTaxRaw - federalCreditsRaw - federalDividendTaxCreditRaw,
  );

  const ontarioBracketTaxRaw = bracketTaxRaw(
    total,
    reference.ontario.brackets,
  );
  const ontarioAgeRaw = phasedAgeAmountRaw(
    input.ageAtYearEnd,
    total,
    reference.ontario.ageAmount,
  );
  const ontarioPensionRaw =
    Math.min(
      input.eligiblePensionIncome,
      reference.ontario.pensionIncomeAmountMaximum,
    );
  const ontarioCreditsRaw =
    (reference.ontario.basicPersonalAmount +
      ontarioAgeRaw +
      ontarioPensionRaw) *
    reference.ontario.nonRefundableCreditRate;
  const ontarioBeforeSurtaxRaw = Math.max(
    0,
    ontarioBracketTaxRaw - ontarioCreditsRaw,
  );
  const surtaxRaw = ontarioSurtaxRaw(ontarioBeforeSurtaxRaw, reference);
  const ontarioDividendTaxCreditRaw =
    basis.taxableEligibleDividends *
    reference.ontario.eligibleDividendTaxCreditRate;
  const taxAfterSurtaxAndDividendCreditRaw = Math.max(
    0,
    ontarioBeforeSurtaxRaw + surtaxRaw - ontarioDividendTaxCreditRaw,
  );
  const taxBeforeReductionRaw = taxAfterSurtaxAndDividendCreditRaw;
  const reductionRaw = ontarioTaxReductionRaw(
    taxBeforeReductionRaw,
    reference,
  );
  const ontarioNetRaw = Math.max(
    0,
    taxBeforeReductionRaw - reductionRaw,
  );
  const healthPremiumRaw = ontarioHealthPremiumRaw(total, reference);

  const oasExcessRaw = Math.max(0, total - reference.oas.recoveryThreshold);
  const uncappedRecoveryRaw = oasExcessRaw * reference.oas.recoveryRate;
  const recoveryTaxRaw = Math.min(
    input.incomeBySource.oas,
    uncappedRecoveryRaw,
  );
  const aggregate = money(
    federalNetRaw + ontarioNetRaw + healthPremiumRaw + recoveryTaxRaw,
  );
  const federalNet = money(federalNetRaw);
  const healthPremium = money(healthPremiumRaw);
  const recoveryTax = money(recoveryTaxRaw);
  // The aggregate tax is rounded once so exact-cent after-tax proceeds remain
  // monotonic. Assign any component-rounding residual to Ontario net tax,
  // deterministically preserving the reconciled displayed total.
  const ontarioNet = money(
    aggregate - federalNet - healthPremium - recoveryTax,
  );
  const difference = centDifference(
    [aggregate],
    [federalNet, ontarioNet, healthPremium, recoveryTax],
  );
  const normalizedDifference = difference === 0 ? 0 : difference;

  return {
    mode: "canadian_annual",
    province: "ON",
    taxYear: input.calendarYear,
    referenceYear: 2026,
    incomeBySource: { ...input.incomeBySource },
    incomeAdjustments: {
      eligibleDividendGrossUp: money(basis.eligibleDividendGrossUp),
      taxableEligibleDividends: money(basis.taxableEligibleDividends),
      currentYearNetCapitalGain: money(basis.currentYearNetCapitalGain),
      currentYearExcessCapitalLoss: money(basis.currentYearExcessCapitalLoss),
      capitalGainsInclusionRate: reference.federal.capitalGainsInclusionRate,
      taxableCapitalGain: money(basis.taxableCapitalGain),
      allowableCapitalLoss: money(
        input.incomeBySource.capitalLosses *
          reference.federal.capitalGainsInclusionRate,
      ),
    },
    actualIncomeTotal: money(actualIncomeTotal),
    totalIncome: money(total),
    netIncomeBasis: money(total),
    taxableIncomeBasis: money(total),
    recoveryIncomeBasis: money(total),
    eligiblePensionIncome: money(input.eligiblePensionIncome),
    federal: {
      bracketTax: money(federalBracketTaxRaw),
      basicPersonalAmount: money(federalBpaRaw),
      employmentAmount: money(federalEmploymentRaw),
      ageAmount: money(federalAgeRaw),
      pensionIncomeAmount: money(federalPensionRaw),
      nonRefundableCreditValue: money(federalCreditsRaw),
      eligibleDividendTaxCredit: money(federalDividendTaxCreditRaw),
      netTax: federalNet,
    },
    ontario: {
      bracketTax: money(ontarioBracketTaxRaw),
      basicPersonalAmount: reference.ontario.basicPersonalAmount,
      ageAmount: money(ontarioAgeRaw),
      pensionIncomeAmount: money(ontarioPensionRaw),
      nonRefundableCreditValue: money(ontarioCreditsRaw),
      eligibleDividendTaxCredit: money(ontarioDividendTaxCreditRaw),
      taxBeforeSurtaxAndReduction: money(ontarioBeforeSurtaxRaw),
      taxAfterSurtaxAndDividendCredit: money(
        taxAfterSurtaxAndDividendCreditRaw,
      ),
      taxReduction: money(reductionRaw),
      surtax: money(surtaxRaw),
      healthPremium,
      netTax: ontarioNet,
    },
    oasRecovery: {
      incomeBasis: money(total),
      threshold: reference.oas.recoveryThreshold,
      excessIncome: money(oasExcessRaw),
      uncappedRecovery: money(uncappedRecoveryRaw),
      annualOasReceived: money(input.incomeBySource.oas),
      recoveryTax,
    },
    totals: {
      federalTax: federalNet,
      ontarioTax: ontarioNet,
      ontarioHealthPremium: healthPremium,
      oasRecoveryTax: recoveryTax,
      totalTax: aggregate,
      effectiveTaxRate: total > 0 ? aggregate / total : 0,
    },
    provenance: {
      ...reference.metadata,
      oasThresholdSourceKind: reference.oas.thresholdSourceKind,
    },
    reconciliation: {
      componentsDifference: normalizedDifference,
      reconciled: Math.abs(normalizedDifference) <= 0.01,
    },
    limitations: [
      "Current-year capital losses offset current-year capital gains only; carryback and carryforward are not modelled.",
      "Eligible Canadian dividends use the supported gross-up and non-refundable federal and Ontario credits.",
      "Foreign tax credits and non-eligible Canadian dividend credits are not modelled.",
      "Refundable credits and full tax-return deductions are not modelled.",
    ],
  };
}
