import { describe, expect, it } from "vitest";
import {
  addCanadianTaxIncome,
  annualCanadianTaxResult,
  canadianTaxPosition,
  createCanadianTaxYearState,
  recognizeCanadianProjectionTax,
} from "@/src/domain/projection/canadian-tax-ledger";
import type { TaxAssumptions } from "@/src/domain/projection/types";

const tax: Extract<TaxAssumptions, { mode: "canadian_annual" }> = {
  mode: "canadian_annual",
  source: "explicit_configuration",
  effectiveTaxRate: 0.99,
  oasRecoveryThresholdToday: 0,
  oasRecoveryRate: 1,
  province: "ON",
  referenceYear: 2026,
  futureIndexingRate: 0.02,
  openingTaxYearBeforeProjectionMonth: {
    calendarYear: 2026,
    throughMonth: 6,
    income: {
      employment: 0,
      cpp: 0,
      oas: 0,
      pension: 0,
      rrspWithdrawals: 0,
      rrifWithdrawals: 0,
      otherTaxableIncome: 0,
    },
    source: "explicit_configuration",
  },
  limitations: [
    "rrif_minimum_withdrawals_not_modelled",
    "non_registered_investment_income_not_modelled",
    "full_tax_return_deductions_and_refundable_credits_not_modelled",
  ],
};

function recognize(state: ReturnType<typeof createCanadianTaxYearState>) {
  return recognizeCanadianProjectionTax({
    state,
    tax,
    ageAtYearEnd: 70,
    pensionIncomeCreditEligible: false,
  });
}

function recognizeBeforeAgeCredits(
  state: ReturnType<typeof createCanadianTaxYearState>,
) {
  return recognizeCanadianProjectionTax({
    state,
    tax,
    ageAtYearEnd: 64,
    pensionIncomeCreditEligible: false,
  });
}

describe("Canadian annual tax YTD ledger", () => {
  it("produces the same annual OAS recovery for even monthly and December-only income", () => {
    const evenly = createCanadianTaxYearState(2026);
    for (let month = 0; month < 12; month += 1) {
      addCanadianTaxIncome(evenly, "oas", 1_000, false);
      addCanadianTaxIncome(evenly, "rrspWithdrawals", 8_000, false);
      recognize(evenly);
    }
    const december = createCanadianTaxYearState(2026);
    addCanadianTaxIncome(december, "oas", 12_000, false);
    addCanadianTaxIncome(december, "rrspWithdrawals", 96_000, false);
    recognize(december);

    const evenResult = annualCanadianTaxResult({
      state: evenly,
      tax,
      ageAtYearEnd: 70,
      pensionIncomeCreditEligible: false,
      periodStatus: "complete_tax_year",
    });
    const decemberResult = annualCanadianTaxResult({
      state: december,
      tax,
      ageAtYearEnd: 70,
      pensionIncomeCreditEligible: false,
      periodStatus: "complete_tax_year",
    });
    expect(evenResult.fullAnnualTax.oasRecovery.recoveryTax).toBe(
      decemberResult.fullAnnualTax.oasRecovery.recoveryTax,
    );
    expect(evenResult.projectionFundedTax).toBe(
      decemberResult.projectionFundedTax,
    );
    expect(evenResult.reconciled).toBe(true);
    expect(decemberResult.reconciled).toBe(true);
  });

  it("subtracts opening and net-employment tax while retaining their marginal context", () => {
    const state = createCanadianTaxYearState(2026, {
      employment: 40_000,
      cpp: 0,
      oas: 0,
      pension: 0,
      rrspWithdrawals: 0,
      rrifWithdrawals: 0,
      otherTaxableIncome: 0,
    });
    addCanadianTaxIncome(state, "employment", 50_000, true);
    expect(canadianTaxPosition({
      state,
      tax,
      ageAtYearEnd: 64,
      pensionIncomeCreditEligible: false,
    }).projectionFundedTax).toBe(0);

    addCanadianTaxIncome(state, "rrspWithdrawals", 10_000, false);
    const position = recognize(state);
    expect(position.projectionFundedTax).toBeGreaterThan(0);
    expect(position.full.totalIncome).toBe(100_000);
    expect(position.embedded.totalIncome).toBe(90_000);
    expect(position.newlyRecognizedTax).toBe(position.projectionFundedTax);
  });

  it("recognizes signed repricing adjustments while preserving cumulative reconciliation", () => {
    const state = createCanadianTaxYearState(2026);
    addCanadianTaxIncome(state, "cpp", 40_000, false);
    const initial = recognizeBeforeAgeCredits(state);
    expect(initial.newlyRecognizedTax).toBeGreaterThan(0);

    let adjustment = 0;
    for (let increment = 0; increment < 2_500; increment += 1) {
      addCanadianTaxIncome(state, "employment", 100, true);
      adjustment = recognizeBeforeAgeCredits(state).newlyRecognizedTax;
      if (adjustment < 0) break;
    }

    expect(adjustment).toBeLessThan(0);
    const result = annualCanadianTaxResult({
      state,
      tax,
      ageAtYearEnd: 64,
      pensionIncomeCreditEligible: false,
      periodStatus: "partial_tax_year",
    });
    expect(result.projectionFundedTax).toBeGreaterThanOrEqual(0);
    expect(result.recognizedProjectionFundedTax).toBe(
      result.projectionFundedTax,
    );
    expect(result.reconciled).toBe(true);
  });
});
