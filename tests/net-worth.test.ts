import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  buildAnnualChartData,
  buildBalanceSheetReconciliation,
} from "@/src/domain/projection/presentation";
import {
  validateProjectionInputs,
  type LiabilityInput,
  type ProjectionInputs,
} from "@/src/domain/projection/types";

function baseInputs(): ProjectionInputs {
  return {
    startDate: "2026-01-01",
    endAge: 42,
    annualInflation: 0.02,
    monthlyEssentialSpendingToday: 0,
    monthlyDiscretionarySpendingToday: 0,
    retirementGoalToday: 100000,
    tax: {
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90000,
      oasRecoveryRate: 0.15,
    },
    person: {
      currentAge: 40,
      retirementAge: 41,
      employmentIncomePhases: [
        {
          id: "synthetic-working",
          label: "Synthetic working",
          startAge: 40,
          endAge: 41,
          annualNetCashToday: 0,
          annualGrowth: 0,
        },
      ],
      annualPensionToday: 0,
      pensionStartAge: 65,
      pensionIndexingRate: 0,
      cpp: {
        startAge: 65,
        monthlyAmountAt65Today: 0,
        indexingRate: 0,
      },
      oas: {
        startAge: 65,
        fullMonthlyAmountAt65Today: 0,
        eligibility: {
          mode: "none",
          qualifyingResidenceYearsAfter18: null,
          fraction: 0,
        },
        indexingRate: 0,
        age75IncreaseRate: 0.1,
      },
      rrifConversionAge: 71,
    },
    accounts: [
      {
        id: "synthetic:cash",
        label: "Synthetic cash",
        origin: "lunchmoney",
        type: "cash",
        openingBalance: 200000,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 1,
        allocation: { cash: 1, fixedIncome: 0, equity: 0 },
      },
    ],
    nonFinancialAssets: [],
    liabilities: [],
    contributionWaterfall: {
      mode: "fixed_source_compatibility",
      routes: [],
      surplusDestinationAccountIds: [],
    },
    surplusAllocation: {
      reserveAccountIds: ["synthetic:cash"],
      reserveRefillAccountId: "synthetic:cash",
      targetCashReserveToday: 0,
      reserveIndexingRate: 0,
      excess: { mode: "retain_as_cash" },
    },
    savingsPolicy: { mode: "advanced" },
    events: [],
  };
}

function residence(
  openingValue = 500000,
  annualAppreciation = 0,
): ProjectionInputs["nonFinancialAssets"][number] {
  return {
    id: "non_financial:primary_residence",
    label: "Synthetic primary residence",
    origin: "projection_configuration",
    type: "primary_residence",
    openingValue,
    valueAsOf: "2026-01-01",
    annualAppreciation,
    availableForWithdrawals: false,
  };
}

function mortgage(
  openingBalance = 100000,
  payment = 1000,
  annualInterestRate = 0,
): LiabilityInput {
  return {
    id: "synthetic:mortgage",
    label: "Synthetic mortgage",
    origin: "lunchmoney",
    openingBalance,
    balanceAsOf: "2026-01-01",
    role: "primary_mortgage",
    treatment: {
      mode: "amortizing",
      annualInterestRate,
      regularPayment: {
        amount: payment,
        frequency: "monthly",
        monthlyEquivalent: payment,
      },
      scheduleStartDate: "2026-01-01",
      lumpSumPayments: [],
    },
    historicalPaymentHandling: "category_mapped",
    historicalMonthlyAverage: payment,
  };
}

function withHomeAndMortgage(
  openingBalance = 100000,
  payment = 1000,
  annualInterestRate = 0,
): ProjectionInputs {
  const inputs = baseInputs();
  inputs.nonFinancialAssets = [residence()];
  inputs.liabilities = [
    mortgage(openingBalance, payment, annualInterestRate),
  ];
  return inputs;
}

describe("real net worth and debt amortization", () => {
  it("keeps financial assets, residence, mortgage, home equity, and net worth distinct", () => {
    const result = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0),
    );
    const balances = result.annual[0]!.nominal.balances;

    expect(balances.financialAssets).toBe(188000);
    expect(balances.residenceValue).toBe(500000);
    expect(balances.mortgageBalance).toBe(88000);
    expect(balances.homeEquity).toBe(412000);
    expect(balances.totalAssets).toBe(688000);
    expect(balances.totalLiabilities).toBe(88000);
    expect(balances.totalNetWorth).toBe(600000);
    expect(balances.retirementFundingAssets).toBe(
      balances.financialAssets,
    );
  });

  it("appreciates the residence without changing retirement-funding assets", () => {
    const inputs = baseInputs();
    inputs.nonFinancialAssets = [residence(500000, 0.02)];
    const result = calculateProjection(inputs);
    const retirement = result.retirementSnapshot.nominal.balances;

    expect(retirement.residenceValue).toBeCloseTo(510000, 2);
    expect(retirement.financialAssets).toBe(200000);
    expect(retirement.totalNetWorth).toBeCloseTo(710000, 2);
  });

  it("splits interest and principal, adjusts the final payment, and stops at payoff", () => {
    const inputs = withHomeAndMortgage(1000, 600, 0.12);
    const result = calculateProjection(inputs);
    const schedule =
      result.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!;
    const firstMonthInterest =
      1000 * (Math.pow(1.12, 1 / 12) - 1);

    expect(schedule.interest).toBeGreaterThan(firstMonthInterest);
    expect(schedule.regularPayment).toBeLessThan(1200);
    expect(schedule.regularPayment).toBeCloseTo(
      schedule.interest + schedule.principal,
      2,
    );
    expect(schedule.principal).toBeCloseTo(1000, 2);
    expect(schedule.closingBalance).toBe(0);
    expect(result.liabilityPayoffDates["synthetic:mortgage"]).toBe(
      "2026-02-28",
    );
    expect(
      result.annual[1]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!.regularPayment,
    ).toBe(0);
  });

  it("makes principal an internal balance-sheet transfer and interest consumption", () => {
    const zeroRate = calculateProjection(
      withHomeAndMortgage(1000, 600, 0),
    );
    const interestBearing = calculateProjection(
      withHomeAndMortgage(1000, 600, 0.12),
    );
    const startingNetWorth = 200000 + 500000 - 1000;
    const zeroRateEnding =
      zeroRate.annual[0]!.nominal.balances.totalNetWorth;
    const interestSchedule =
      interestBearing.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!;

    expect(zeroRateEnding).toBe(startingNetWorth);
    expect(
      interestBearing.annual[0]!.nominal.balances.totalNetWorth,
    ).toBeCloseTo(startingNetWorth - interestSchedule.interest, 2);
    expect(
      zeroRate.netWorthBridge.nominal.liabilityPrincipalPayments,
    ).toBe(
      zeroRate.netWorthBridge.nominal.liabilityPrincipalReduction,
    );
  });

  it("applies dated lump sums once and reconciles the schedule", () => {
    const inputs = withHomeAndMortgage(1000, 400, 0);
    const liability = inputs.liabilities[0]!;
    if (liability.treatment.mode !== "amortizing") {
      throw new Error("Synthetic mortgage must amortize");
    }
    liability.treatment.lumpSumPayments = [
      { date: "2026-01-15", amount: 200 },
    ];
    const result = calculateProjection(inputs);
    const schedule =
      result.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!;

    expect(schedule.regularPayment).toBe(800);
    expect(schedule.lumpSumPrincipal).toBe(200);
    expect(schedule.closingBalance).toBe(0);
    expect(
      schedule.openingBalance +
        schedule.interest -
        schedule.regularPayment -
        schedule.lumpSumPrincipal,
    ).toBeCloseTo(schedule.closingBalance, 2);
  });

  it("pays an explicit payoff-at-start liability in month one", () => {
    const inputs = baseInputs();
    inputs.liabilities = [
      {
        ...mortgage(1000, 1000, 0),
        role: null,
        treatment: { mode: "payoff_at_projection_start" },
      },
    ];
    const result = calculateProjection(inputs);
    const schedule =
      result.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!;

    expect(schedule.interest).toBe(0);
    expect(schedule.regularPayment).toBe(1000);
    expect(schedule.principal).toBe(1000);
    expect(schedule.closingBalance).toBe(0);
    expect(result.liabilityPayoffDates["synthetic:mortgage"]).toBe(
      "2026-01-31",
    );
  });

  it("fails visibly when financial assets cannot fund a required liability payment", () => {
    const inputs = withHomeAndMortgage(1000, 1000, 0);
    inputs.accounts[0]!.openingBalance = 0;

    expect(() => calculateProjection(inputs)).toThrow(
      "Required liability payment could not be funded",
    );
  });

  it("keeps home equity unavailable to depletion and withdrawal logic", () => {
    const inputs = baseInputs();
    inputs.accounts[0]!.openingBalance = 100;
    inputs.monthlyEssentialSpendingToday = 200;
    inputs.nonFinancialAssets = [residence(500000, 0)];
    const result = calculateProjection(inputs);

    expect(result.summary.financialAssetsDepletionAge).not.toBeNull();
    expect(result.summary.endingFinancialAssetsToday).toBe(0);
    expect(result.summary.endingNetWorthToday).toBeGreaterThan(0);
    expect(
      result.annual.some(
        (point) => point.nominal.withdrawals.total > 100,
      ),
    ).toBe(false);
  });

  it("uses identical liability schedule semantics in nominal and real modes", () => {
    const result = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0.04),
    );
    const nominal =
      result.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!;
    const real =
      result.annual[0]!.real.liabilitySchedules[
        "synthetic:mortgage"
      ]!;

    expect(nominal.openingBalance).toBeGreaterThan(real.openingBalance);
    expect(nominal.closingBalance).toBeGreaterThan(real.closingBalance);
    expect(real.regularPayment).toBeGreaterThan(0);
    expect(
      real.openingBalance +
        real.interest -
        real.regularPayment -
        real.lumpSumPrincipal,
    ).toBeCloseTo(real.closingBalance, 2);
  });

  it("exposes the retirement and ending balance-sheet summaries and chart rows", () => {
    const inputs = withHomeAndMortgage(100000, 1000, 0);
    const result = calculateProjection(inputs);
    const rows = buildAnnualChartData(inputs, result, "real");

    expect(result.summary.nonFinancialAssetsAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.totalNonFinancialAssets,
    );
    expect(result.summary.liabilitiesAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.totalLiabilities,
    );
    expect(result.summary.homeEquityAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.homeEquity,
    );
    expect(result.summary.totalNetWorthAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.totalNetWorth,
    );
    expect(rows[0]).toMatchObject({
      financialAssets:
        result.annual[0]!.real.balances.financialAssets,
      residenceValue:
        result.annual[0]!.real.balances.residenceValue,
      mortgageBalance:
        result.annual[0]!.real.balances.mortgageBalance,
      homeEquity: result.annual[0]!.real.balances.homeEquity,
      totalNetWorth:
        result.annual[0]!.real.balances.totalNetWorth,
    });
  });

  it("rejects invalid liability inputs and accepts a mortgage-free residence", () => {
    const mortgageFree = baseInputs();
    mortgageFree.nonFinancialAssets = [residence()];
    expect(validateProjectionInputs(mortgageFree)).toBe(mortgageFree);

    const duplicateMortgage = withHomeAndMortgage();
    duplicateMortgage.liabilities.push({
      ...mortgage(),
      id: "synthetic:mortgage-two",
    });
    expect(() => validateProjectionInputs(duplicateMortgage)).toThrow(
      "primary_mortgage liability role must be unique",
    );

    const untreated = withHomeAndMortgage();
    (untreated.liabilities[0] as unknown as { treatment: undefined })
      .treatment = undefined;
    expect(() => validateProjectionInputs(untreated)).toThrow(
      "requires a treatment",
    );

    const underpaying = withHomeAndMortgage(100000, 1, 0.12);
    expect(() => validateProjectionInputs(underpaying)).toThrow(
      "must exceed monthly interest",
    );

    const overpayingLumpSum = withHomeAndMortgage(1000, 900, 0);
    const treatment = overpayingLumpSum.liabilities[0]!.treatment;
    if (treatment.mode !== "amortizing") {
      throw new Error("Synthetic mortgage must amortize");
    }
    treatment.lumpSumPayments = [
      { date: "2026-01-15", amount: 200 },
    ];
    expect(() => calculateProjection(overpayingLumpSum)).toThrow(
      "exceeds its remaining projected principal",
    );
  });

  it("allows a zero-balance liability to remain zero without a schedule", () => {
    const inputs = baseInputs();
    inputs.liabilities = [
      {
        ...mortgage(0, 1, 0),
        role: null,
        treatment: { mode: "zero_balance" },
        historicalPaymentHandling: "not_applicable",
        historicalMonthlyAverage: 0,
      },
    ];
    const result = calculateProjection(inputs);

    expect(result.annual[0]!.nominal.balances.totalLiabilities).toBe(0);
    expect(
      result.annual[0]!.nominal.liabilitySchedules[
        "synthetic:mortgage"
      ]!.regularPayment,
    ).toBe(0);
  });

  it("reconciles every balance sheet, liability schedule, and bridge within one cent", () => {
    const result = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0.04),
    );

    for (const mode of ["nominal", "real"] as const) {
      const reconciliation = buildBalanceSheetReconciliation(
        result,
        mode,
      );
      expect(reconciliation.matched).toBe(true);
      expect(reconciliation.maximumBalanceSheetDifference).toBeLessThanOrEqual(
        0.01,
      );
      expect(
        reconciliation.maximumLiabilityScheduleDifference,
      ).toBeLessThanOrEqual(0.01);
      expect(
        reconciliation.financialAssetsBridgeDifference,
      ).toBeLessThanOrEqual(0.01);
      expect(reconciliation.netWorthBridgeDifference).toBeLessThanOrEqual(
        0.01,
      );
    }
  });

  it("detects one-cent-plus schedule and balance-sheet mutations without cancellation", () => {
    const scheduleMutation = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0.04),
    );
    scheduleMutation.annual[0]!.nominal.liabilitySchedules[
      "synthetic:mortgage"
    ]!.closingBalance += 0.02;
    expect(
      buildBalanceSheetReconciliation(
        scheduleMutation,
        "nominal",
      ).matched,
    ).toBe(false);

    const principalAsConsumption = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0.04),
    );
    principalAsConsumption.netWorthBridge.nominal.liabilityInterest +=
      principalAsConsumption.netWorthBridge.nominal
        .liabilityPrincipalPayments;
    expect(
      buildBalanceSheetReconciliation(
        principalAsConsumption,
        "nominal",
      ).matched,
    ).toBe(false);

    const omittedResidence = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0),
    );
    omittedResidence.annual[0]!.nominal.balances.totalAssets -= 0.02;
    expect(
      buildBalanceSheetReconciliation(
        omittedResidence,
        "nominal",
      ).matched,
    ).toBe(false);

    const omittedMortgage = calculateProjection(
      withHomeAndMortgage(100000, 1000, 0),
    );
    omittedMortgage.annual[0]!.nominal.balances.totalLiabilities -=
      0.02;
    expect(
      buildBalanceSheetReconciliation(
        omittedMortgage,
        "nominal",
      ).matched,
    ).toBe(false);
  });
});
