import {
  ZERO_CANADIAN_TAX_INCOME,
  calculateAnnualCanadianTax,
  type AnnualCanadianTaxResult,
  type CanadianTaxIncomeBySource,
} from "./canadian-tax";
import {
  resolveCanadianTaxReferences,
  type CanadianTaxReferenceSet,
} from "@/src/domain/defaults/canadian-tax-2026";
import type {
  AnnualTaxResult,
  CanadianTaxIncomeLedger,
  TaxAssumptions,
} from "./types";
import { centDifference } from "./monetary-reconciliation";

export type CanadianTaxYearState = {
  calendarYear: number;
  openingIncome: CanadianTaxIncomeLedger;
  projectionIncome: CanadianTaxIncomeLedger;
  totalIncome: CanadianTaxIncomeLedger;
  embeddedIncome: CanadianTaxIncomeLedger;
  recognizedProjectionFundedTax: number;
  recognizedOasRecoveryTax: number;
  referenceSet: CanadianTaxReferenceSet;
};

function copy(income: CanadianTaxIncomeLedger): CanadianTaxIncomeLedger {
  return { ...income };
}

export function createCanadianTaxYearState(
  calendarYear: number,
  openingIncome: CanadianTaxIncomeLedger = ZERO_CANADIAN_TAX_INCOME,
  futureIndexingRate = 0,
): CanadianTaxYearState {
  return {
    calendarYear,
    openingIncome: copy(openingIncome),
    projectionIncome: copy(ZERO_CANADIAN_TAX_INCOME),
    totalIncome: copy(openingIncome),
    embeddedIncome: copy(openingIncome),
    recognizedProjectionFundedTax: 0,
    recognizedOasRecoveryTax: 0,
    referenceSet: resolveCanadianTaxReferences(
      calendarYear,
      futureIndexingRate,
    ),
  };
}

export function cloneCanadianTaxYearState(
  state: CanadianTaxYearState,
): CanadianTaxYearState {
  return {
    calendarYear: state.calendarYear,
    openingIncome: copy(state.openingIncome),
    projectionIncome: copy(state.projectionIncome),
    totalIncome: copy(state.totalIncome),
    embeddedIncome: copy(state.embeddedIncome),
    recognizedProjectionFundedTax: state.recognizedProjectionFundedTax,
    recognizedOasRecoveryTax: state.recognizedOasRecoveryTax,
    referenceSet: state.referenceSet,
  };
}

export function addCanadianTaxIncome(
  state: CanadianTaxYearState,
  source: keyof CanadianTaxIncomeBySource,
  amount: number,
  embedded: boolean,
): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Canadian tax ledger ${source} income must be finite and non-negative`);
  }
  state.projectionIncome[source] += amount;
  state.totalIncome[source] += amount;
  if (embedded) state.embeddedIncome[source] += amount;
}

export type CanadianTaxPosition = {
  full: AnnualCanadianTaxResult;
  embedded: AnnualCanadianTaxResult;
  projectionFundedTax: number;
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function canadianTaxPosition(input: {
  state: CanadianTaxYearState;
  tax: Extract<TaxAssumptions, { mode: "canadian_annual" }>;
  ageAtYearEnd: number;
  pensionIncomeCreditEligible: boolean;
}): CanadianTaxPosition {
  const rrifCreditEligible = input.ageAtYearEnd >= 65;
  const eligibleFull =
    (input.pensionIncomeCreditEligible
      ? input.state.totalIncome.pension
      : 0) +
    (rrifCreditEligible ? input.state.totalIncome.rrifWithdrawals : 0);
  const eligibleEmbedded =
    (input.pensionIncomeCreditEligible
      ? input.state.embeddedIncome.pension
      : 0) +
    (rrifCreditEligible ? input.state.embeddedIncome.rrifWithdrawals : 0);
  const common = {
    calendarYear: input.state.calendarYear,
    province: input.tax.province,
    ageAtYearEnd: input.ageAtYearEnd,
    futureIndexingRate: input.tax.futureIndexingRate,
    referenceSet: input.state.referenceSet,
  } as const;
  const full = calculateAnnualCanadianTax({
    ...common,
    incomeBySource: input.state.totalIncome,
    eligiblePensionIncome: eligibleFull,
  });
  const embedded = calculateAnnualCanadianTax({
    ...common,
    incomeBySource: input.state.embeddedIncome,
    eligiblePensionIncome: eligibleEmbedded,
  });
  const projectionFundedTax = round(
    full.totals.totalTax - embedded.totals.totalTax,
  );
  if (projectionFundedTax < -0.01) {
    throw new Error(
      "Canadian projection-funded tax became negative; the supported annual tax function is not monotonic for this ledger",
    );
  }
  return {
    full,
    embedded,
    projectionFundedTax: Math.max(0, projectionFundedTax),
  };
}

export function recognizeCanadianProjectionTax(input: {
  state: CanadianTaxYearState;
  tax: Extract<TaxAssumptions, { mode: "canadian_annual" }>;
  ageAtYearEnd: number;
  pensionIncomeCreditEligible: boolean;
}): CanadianTaxPosition & {
  newlyRecognizedTax: number;
  newlyRecognizedOasRecoveryTax: number;
} {
  const position = canadianTaxPosition(input);
  const newlyRecognizedTax = round(
    position.projectionFundedTax -
      input.state.recognizedProjectionFundedTax,
  );
  const cumulativeOasRecoveryTax = round(
    position.full.oasRecovery.recoveryTax -
      position.embedded.oasRecovery.recoveryTax,
  );
  if (cumulativeOasRecoveryTax < -0.01) {
    throw new Error(
      "Canadian cumulative projection-funded OAS recovery tax became negative",
    );
  }
  const newlyRecognizedOasRecoveryTax = round(
    cumulativeOasRecoveryTax - input.state.recognizedOasRecoveryTax,
  );
  // Annual credits and Ontario premiums can reprice the incremental liability
  // when embedded employment context is added. Record that signed adjustment
  // explicitly so recognized cash always equals the current non-negative YTD
  // projection-funded liability instead of silently retaining stale tax.
  input.state.recognizedProjectionFundedTax = position.projectionFundedTax;
  input.state.recognizedOasRecoveryTax = Math.max(
    0,
    cumulativeOasRecoveryTax,
  );
  return {
    ...position,
    newlyRecognizedTax,
    newlyRecognizedOasRecoveryTax,
  };
}

export function annualCanadianTaxResult(input: {
  state: CanadianTaxYearState;
  tax: Extract<TaxAssumptions, { mode: "canadian_annual" }>;
  ageAtYearEnd: number;
  pensionIncomeCreditEligible: boolean;
  periodStatus: Extract<AnnualTaxResult, { mode: "canadian_annual" }>[
    "periodStatus"
  ];
}): Extract<AnnualTaxResult, { mode: "canadian_annual" }> {
  const position = canadianTaxPosition(input);
  const difference = centDifference(
    [position.projectionFundedTax],
    [
      position.full.totals.totalTax,
      -position.embedded.totals.totalTax,
    ],
  );
  const cashDifference = centDifference(
    [position.projectionFundedTax],
    [input.state.recognizedProjectionFundedTax],
  );
  return {
    mode: "canadian_annual",
    province: "ON",
    taxYear: input.state.calendarYear,
    periodStatus: input.periodStatus,
    openingIncome: copy(input.state.openingIncome),
    projectionIncome: copy(input.state.projectionIncome),
    totalIncome: copy(input.state.totalIncome),
    embeddedIncome: copy(input.state.embeddedIncome),
    fullAnnualTax: position.full,
    embeddedAnnualTax: position.embedded,
    projectionFundedTax: position.projectionFundedTax,
    recognizedProjectionFundedTax:
      input.state.recognizedProjectionFundedTax,
    reconciliation: {
      fullMinusEmbeddedDifference: round(difference),
      recognizedCashDifference: round(cashDifference),
    },
    reconciled:
      Math.abs(difference) <= 0.01 && Math.abs(cashDifference) <= 0.01,
    provisional: true,
    limitations: [...input.tax.limitations],
  };
}
