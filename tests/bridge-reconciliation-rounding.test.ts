import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  centDifference,
  sumMonetaryCents,
} from "@/src/domain/projection/monetary-reconciliation";
import { projectionFixture } from "./fixtures/projection";

function monthlyLumpSums(
  startYear: number,
  startMonth: number,
  count: number,
  amount: number,
): Array<{ date: string; amount: number }> {
  return Array.from({ length: count }, (_, index) => {
    const monthIndex = startMonth - 1 + index;
    const year = startYear + Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    return {
      date: `${year}-${String(month).padStart(2, "0")}-01`,
      amount,
    };
  });
}

describe("aggregate monetary reconciliation", () => {
  it("does not manufacture a two-cent difference by rounding components first", () => {
    const left = [100.004, 100.004, 100.004, 100.004];
    const right = [400.016];

    expect(sumMonetaryCents(left) - sumMonetaryCents(right)).toBe(-2);
    expect(centDifference(left, right)).toBe(0);
  });

  it("still reports a genuine aggregate two-cent difference", () => {
    expect(centDifference([100], [99.98])).toBe(2);
    expect(centDifference([99.98], [100])).toBe(-2);
  });

  it("reconciles a long synthetic mortgage double-up schedule", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.person.currentAge = 39;
    inputs.person.retirementAge = 55;
    inputs.endAge = 95;
    inputs.monthlyEssentialSpendingToday = 1000;
    inputs.monthlyDiscretionarySpendingToday = 200;
    inputs.person.employmentIncomePhases = [
      {
        id: "synthetic-working-income",
        label: "Synthetic working income",
        startAge: 39,
        endAge: 55,
        annualNetCashToday: 120000,
        annualGrowth: 0,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 120000,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0,
        },
      },
    ];
    inputs.spendingPhases = [
      {
        id: "synthetic-lifetime-spending",
        label: "Synthetic lifetime spending",
        startAge: 39,
        endAge: 95,
        essentialMultiplier: 1,
        discretionaryMultiplier: 1,
        source: "explicit_configuration",
      },
    ];
    inputs.accounts[0]!.openingBalance = 500000;
    inputs.accounts[1]!.openingBalance = 500000;
    inputs.accounts[1]!.contributionPhases = [];
    inputs.events = [];
    inputs.nonFinancialAssets = [
      {
        id: "synthetic:residence",
        label: "Synthetic residence",
        origin: "projection_configuration",
        type: "primary_residence",
        openingValue: 700000,
        valueAsOf: "2026-07-01",
        annualAppreciation: 0.02,
        availableForWithdrawals: false,
      },
    ];
    inputs.liabilities = [
      {
        id: "synthetic:mortgage",
        label: "Synthetic mortgage",
        origin: "lunchmoney",
        openingBalance: 400000,
        balanceAsOf: "2026-07-01",
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0.056,
          interestRateConvention: "canadian_mortgage",
          regularPayment: {
            amount: 1968.56,
            frequency: "monthly",
            monthlyEquivalent: 1968.56,
          },
          scheduleStartDate: "2024-03-12",
          lumpSumPayments: monthlyLumpSums(2027, 5, 183, 600),
        },
        historicalPaymentHandling: "category_mapped",
        historicalMonthlyAverage: 1968.56,
      },
    ];

    const result = calculateProjection(inputs);

    expect(
      result.netWorthBridge.nominal.liabilityPrincipalPayments,
    ).toBeGreaterThan(100000);
    expect(result.summary.liabilitiesAtRetirementToday).toBeGreaterThan(0);
    expect(result.summary.financialAssetsAtRetirementToday).toBeGreaterThan(0);
  });
});
