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

  it("reconciles retirement bridges from raw balances while keeping snapshots display-rounded", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.person.currentAge = 40;
    inputs.person.retirementAge = 41;
    inputs.endAge = 42;
    inputs.annualInflation = 0.12;
    inputs.monthlyEssentialSpendingToday = 0;
    inputs.monthlyDiscretionarySpendingToday = 0;
    inputs.person.employmentIncomePhases = [
      {
        id: "synthetic-zero-income",
        label: "Synthetic zero income",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 0,
        annualGrowth: 0,
      },
    ];
    inputs.spendingPhases = [
      {
        id: "synthetic-zero-spending",
        label: "Synthetic zero spending",
        startAge: 40,
        endAge: 42,
        essentialMultiplier: 1,
        discretionaryMultiplier: 1,
        source: "explicit_configuration",
      },
    ];
    inputs.accounts = [
      {
        id: "synthetic:cash",
        label: "Synthetic cash",
        origin: "lunchmoney",
        type: "cash",
        openingBalance: 100.004,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 1,
        allocation: { cash: 1, fixedIncome: 0, equity: 0 },
      },
      {
        id: "synthetic:tfsa",
        label: "Synthetic TFSA",
        origin: "lunchmoney",
        type: "tfsa",
        openingBalance: 100.004,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 2,
        allocation: { cash: 0, fixedIncome: 0, equity: 1 },
      },
      {
        id: "synthetic:rrsp",
        label: "Synthetic RRSP",
        origin: "lunchmoney",
        type: "rrsp_rrif",
        openingBalance: 100.004,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 3,
        allocation: { cash: 0, fixedIncome: 0, equity: 1 },
      },
      {
        id: "synthetic:taxable",
        label: "Synthetic taxable account",
        origin: "lunchmoney",
        type: "non_registered",
        openingBalance: 100.004,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 4,
        allocation: { cash: 0, fixedIncome: 0, equity: 1 },
      },
    ];
    inputs.nonFinancialAssets = [
      {
        id: "synthetic:residence",
        label: "Synthetic residence",
        origin: "projection_configuration",
        type: "primary_residence",
        openingValue: 1000.004,
        valueAsOf: "2026-07-01",
        annualAppreciation: 0,
        availableForWithdrawals: false,
      },
    ];
    inputs.liabilities = [];
    inputs.events = [];
    inputs.registeredAccountRoom = undefined;
    inputs.contributionWaterfall = {
      mode: "fixed_source_compatibility",
      routes: [],
      surplusDestinationAccountIds: [],
    };
    inputs.surplusAllocation = {
      reserveAccountIds: ["synthetic:cash"],
      reserveRefillAccountId: "synthetic:cash",
      targetCashReserveToday: 0,
      reserveIndexingRate: 0,
      excess: { mode: "retain_as_cash" },
    };
    inputs.savingsPolicy = { mode: "advanced" };

    const rawFinancialAssets = inputs.accounts.reduce(
      (total, account) => total + account.openingBalance,
      0,
    );
    const rawNetWorth =
      rawFinancialAssets + inputs.nonFinancialAssets[0]!.openingValue;
    const retirementInflationFactor = Math.pow(
      1 + inputs.annualInflation,
      inputs.person.retirementAge - inputs.person.currentAge,
    );

    const result = calculateProjection(inputs);
    const snapshot = result.retirementSnapshot;

    expect(Object.values(snapshot.nominal.accountBalances)).toEqual([
      100,
      100,
      100,
      100,
    ]);
    expect(snapshot.nominal.nonFinancialAssetValues["synthetic:residence"]).toBe(
      1000,
    );
    expect(snapshot.nominal.balances.financialAssets).toBe(
      Object.values(snapshot.nominal.accountBalances).reduce(
        (total, balance) => total + balance,
        0,
      ),
    );
    expect(snapshot.nominal.balances.totalNetWorth).toBe(
      snapshot.nominal.balances.financialAssets +
        snapshot.nominal.balances.totalNonFinancialAssets -
        snapshot.nominal.balances.totalLiabilities,
    );
    expect(
      Math.abs(
        centDifference(
          [rawFinancialAssets],
          [snapshot.nominal.balances.financialAssets],
        ),
      ),
    ).toBeGreaterThanOrEqual(2);

    expect(result.financialAssetsBridge.nominal.endingFinancialAssets).toBe(
      rawFinancialAssets,
    );
    expect(result.financialAssetsBridge.real.endingFinancialAssets).toBeCloseTo(
      rawFinancialAssets / retirementInflationFactor,
      12,
    );
    expect(result.netWorthBridge.nominal.endingNetWorth).toBe(rawNetWorth);
    expect(result.netWorthBridge.real.endingNetWorth).toBeCloseTo(
      rawNetWorth / retirementInflationFactor,
      12,
    );

    for (const bridge of [
      result.financialAssetsBridge.nominal,
      result.financialAssetsBridge.real,
    ]) {
      expect(
        Math.abs(
          centDifference(
            [
              bridge.startingFinancialAssets,
              bridge.employmentNetCash,
              bridge.publicBenefitsAndPension,
              bridge.otherInflows,
              bridge.incomeWithheldContributions,
              bridge.investmentReturns,
            ],
            [
              bridge.essentialSpending,
              bridge.discretionarySpending,
              bridge.liabilityCashPayments,
              bridge.oneTimeOutflows,
              bridge.taxes,
              bridge.endingFinancialAssets,
            ],
          ),
        ),
      ).toBeLessThanOrEqual(1);
    }
    for (const bridge of [
      result.netWorthBridge.nominal,
      result.netWorthBridge.real,
    ]) {
      expect(
        Math.abs(
          centDifference(
            [
              bridge.startingFinancialAssets,
              bridge.startingNonFinancialAssets,
              bridge.externalNetCashInflows,
              bridge.incomeWithheldContributions,
              bridge.investmentReturns,
              bridge.nonFinancialAssetAppreciation,
              bridge.liabilityPrincipalReduction,
            ],
            [
              bridge.startingLiabilities,
              bridge.nonDebtEssentialSpending,
              bridge.discretionarySpending,
              bridge.liabilityInterest,
              bridge.liabilityPrincipalPayments,
              bridge.taxes,
              bridge.oneTimeConsumptionOutflows,
              bridge.endingNetWorth,
            ],
          ),
        ),
      ).toBeLessThanOrEqual(1);
    }
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
