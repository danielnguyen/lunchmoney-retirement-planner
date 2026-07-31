import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
} from "@/src/domain/projection/export";
import { centDifference } from "@/src/domain/projection/monetary-reconciliation";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import {
  baselineContextFixture,
  projectionFixture,
} from "@/tests/fixtures/projection";

function simplifiedTaxableProjection(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-01";
  input.endAge = 65;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 5_000;
  input.monthlyDiscretionarySpendingToday = 0;
  input.spendingPhases = [
    {
      id: "synthetic-spending",
      label: "Synthetic spending",
      startAge: 64,
      endAge: 65,
      essentialMultiplier: 1,
      discretionaryMultiplier: 1,
      source: "explicit_configuration",
    },
  ];
  input.person.currentAge = 64;
  input.person.retirementAge = 64 + 1 / 12;
  input.person.rrifConversionAge = 71;
  input.person.employmentIncomePhases = [
    {
      id: "synthetic-zero-employment",
      label: "Synthetic zero employment",
      startAge: 64,
      endAge: 64 + 1 / 12,
      annualNetCashToday: 0,
      annualTaxableEmploymentIncomeToday: 0,
      annualGrowth: 0,
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.monthlyAmountAt65Today = 0;
  input.person.oas.fullMonthlyAmountAt65Today = 0;
  input.tax = {
    mode: "canadian_annual",
    source: "explicit_configuration",
    effectiveTaxRate: 0,
    oasRecoveryThresholdToday: 1_000_000,
    oasRecoveryRate: 0,
    province: "ON",
    referenceYear: 2026,
    futureIndexingRate: 0,
    openingTaxYearBeforeProjectionMonth: {
      calendarYear: 2026,
      throughMonth: 0,
      income: {
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
      },
      source: "january_zero",
    },
    limitations: [
      "full_tax_return_deductions_and_refundable_credits_not_modelled",
    ],
  };
  input.rrifMinimumWithdrawals = {
    mode: "statutory",
    source: "explicit_configuration",
    ageBasis: "owner_age",
    settlementTiming: "december_true_up",
    supportedRrifClass: "all_other_rrifs",
  };
  input.accounts = [
    {
      id: "manual:1",
      label: "Synthetic cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "manual:2",
      label: "Synthetic taxable portfolio",
      origin: "lunchmoney",
      type: "non_registered",
      openingBalance: 100_000,
      annualReturn: 0.06,
      contributionPhases: [],
      withdrawalPriority: 2,
      allocation: { cash: 0, fixedIncome: 0.4, equity: 0.6 },
    },
  ];
  input.nonRegisteredTaxation = {
    mode: "simplified_canadian",
    source: "explicit_configuration",
    accounts: [
      {
        accountId: "manual:2",
        openingAdjustedCostBase: {
          amount: 20_000,
          effectiveDate: "2026-01-01",
          sourceDescription: "Synthetic opening ACB",
          source: "explicit_configuration",
        },
        annualDistributionYields: {
          interest: 0.01,
          eligibleCanadianDividends: 0.02,
          foreignIncome: 0.005,
          capitalGains: 0.005,
        },
      },
    ],
    limitations: [],
  };
  input.registeredAccountRoom = undefined;
  input.contributionWaterfall = {
    mode: "fixed_source_compatibility",
    routes: [],
    surplusDestinationAccountIds: ["manual:2"],
  };
  input.surplusAllocation = {
    reserveAccountIds: ["manual:1"],
    reserveRefillAccountId: "manual:1",
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  input.savingsPolicy = { mode: "advanced" };
  input.events = [];
  return input;
}

function capitalLossRefundProjection(): ProjectionInputs {
  const input = simplifiedTaxableProjection();
  input.endAge = 64 + 2 / 12;
  input.person.retirementAge = input.endAge;
  input.person.employmentIncomePhases[0]!.endAge = input.endAge;
  input.spendingPhases[0]!.endAge = input.endAge;
  input.monthlyEssentialSpendingToday = 100;
  input.events = [
    {
      id: "synthetic-opening-cash",
      label: "Synthetic opening-month cash",
      calendarYear: 2026,
      month: 1,
      amountToday: 1_420.47,
      direction: "inflow",
    },
  ];
  input.accounts[1]!.openingBalance = 1_000_000;
  input.accounts[1]!.annualReturn = 0;
  if (input.nonRegisteredTaxation.mode !== "simplified_canadian") {
    throw new Error("expected simplified mode");
  }
  input.nonRegisteredTaxation.accounts[0]!.openingAdjustedCostBase.amount =
    1_000_000_000_000;
  input.nonRegisteredTaxation.accounts[0]!.annualDistributionYields = {
    interest: 0,
    eligibleCanadianDividends: 0,
    foreignIncome: 0,
    capitalGains: 1,
  };
  input.surplusAllocation.excess = { mode: "retain_as_cash" };
  return input;
}

function csvRows(csv: string): string[][] {
  return csv
    .trimEnd()
    .split("\n")
    .map((line) => line.split(","));
}

describe("simplified non-registered projection integration", () => {
  it("retains a material capital-loss refund as cash without breaking either bridge", () => {
    const result = calculateProjection(capitalLossRefundProjection());
    const year = result.annual[0]!;
    const bridge = result.financialAssetsBridge.nominal;

    // Independent synthetic cash proof: month one recognizes $1,320.47 of
    // tax. The final annual tax is $267.79, so month two reprices tax by
    // -$1,052.68. The $0.07 sale plus that refund generates $1,052.75;
    // $100 funds spending and the remaining $952.75 must stay in assets.
    expect(year.nominal.withdrawals.nonRegistered).toBe(0.07);
    expect(year.nominal.outflows.tax).toBe(267.79);
    expect(year.nonRegisteredTaxation.realizedCapitalLosses).toBe(69_999.94);
    expect(year.nominal.surplusAllocation).toMatchObject({
      generated: 952.75,
      retainedAsCash: 952.75,
      redirected: 0,
    });
    expect(year.nominal.accountBalances["manual:1"]).toBe(952.75);
    expect(year.nominal.balances.financialAssets).toBe(1_000_952.68);
    expect(
      centDifference(
        [0.07, 1_052.68],
        [100, 952.75],
      ),
    ).toBe(0);
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
    ).toBe(0);
    expect(result.netWorthBridge.nominal.endingNetWorth).toBe(
      bridge.endingFinancialAssets,
    );
  });

  it("routes capital-loss refund excess into taxable FMV and ACB", () => {
    const input = capitalLossRefundProjection();
    input.surplusAllocation.excess = {
      mode: "allocate_to_account",
      destinationAccountId: "manual:2",
    };
    const year = calculateProjection(input).annual[0]!;
    const nonRegistered = year.nonRegisteredTaxation;

    expect(year.nominal.surplusAllocation).toMatchObject({
      generated: 952.75,
      retainedAsCash: 0,
      redirected: 952.75,
    });
    expect(nonRegistered.contributions).toBe(952.75);
    expect(nonRegistered.closingMarketValue).toBe(1_000_952.68);
    expect(
      Math.abs(
        centDifference(
          [
            nonRegistered.openingAdjustedCostBase,
            nonRegistered.totalDistributions,
            nonRegistered.contributions,
          ],
          [
            nonRegistered.adjustedCostBaseDisposed,
            nonRegistered.closingAdjustedCostBase,
          ],
        ),
      ),
    ).toBe(0);
  });

  it("stops at the funded account instead of withdrawing to create more surplus", () => {
    const input = capitalLossRefundProjection();
    if (input.nonRegisteredTaxation.mode !== "simplified_canadian") {
      throw new Error("expected simplified mode");
    }
    input.accounts.push({
      id: "synthetic:unused-taxable",
      label: "Synthetic unused taxable account",
      origin: "lunchmoney",
      type: "non_registered",
      openingBalance: 1_000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 1, equity: 0 },
    });
    input.nonRegisteredTaxation.accounts.push({
      accountId: "synthetic:unused-taxable",
      openingAdjustedCostBase: {
        amount: 800,
        effectiveDate: input.startDate,
        sourceDescription: "Synthetic unused opening ACB",
        source: "explicit_configuration",
      },
      annualDistributionYields: {
        interest: 0,
        eligibleCanadianDividends: 0,
        foreignIncome: 0,
        capitalGains: 0,
      },
    });

    const year = calculateProjection(input).annual[0]!.nonRegisteredTaxation;
    const first = year.accounts.find(
      (account) => account.accountId === "manual:2",
    )!;
    const unused = year.accounts.find(
      (account) => account.accountId === "synthetic:unused-taxable",
    )!;
    expect(first.dispositionProceeds).toBe(0.07);
    expect(unused.dispositionProceeds).toBe(0);
    expect(unused.closingMarketValue).toBe(1_000);
    expect(unused.closingAdjustedCostBase).toBe(800);
  });

  it("routes capital-loss refund excess into available TFSA room", () => {
    const input = capitalLossRefundProjection();
    input.accounts.push({
      id: "synthetic:refund-tfsa",
      label: "Synthetic refund TFSA",
      origin: "lunchmoney",
      type: "tfsa",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0, equity: 1 },
    });
    input.registeredAccountRoom = {
      tfsa: {
        startingAvailableRoom: {
          source: "configured_amount",
          amount: 1_000,
          sourceDescription: "Synthetic TFSA starting room",
          effectiveDate: input.startDate,
        },
        annualNewRoom: {
          source: "canadian_reference",
          futureIndexingRate: 0,
          roundingIncrement: 500,
        },
        carryForwardUnusedRoom: true,
        withdrawalRoomRecredit: "next_calendar_year",
      },
      rrsp: {
        startingAvailableDeductionRoom: {
          source: "configured_amount",
          amount: 0,
          sourceDescription: "Synthetic RRSP starting room",
          effectiveDate: input.startDate,
        },
        carryForwardUnusedRoom: true,
        newRoom: {
          source: "earned_income",
          annualCap: {
            source: "canadian_reference",
            futureGrowthRate: 0,
            futureRoundingIncrement: 10,
          },
          startYearBeforeProjectionMonth: {
            calendarYear: 2026,
            eligibleEarnedIncome: 0,
            pensionAdjustment: 0,
            otherRoomReduction: 0,
          },
        },
      },
    };
    input.contributionWaterfall = {
      mode: "canonical",
      routes: [],
      surplusDestinationAccountIds: ["synthetic:refund-tfsa"],
    };
    input.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };

    const year = calculateProjection(input).annual[0]!;
    expect(year.nominal.surplusAllocation.redirected).toBe(952.75);
    expect(year.nominal.accountBalances["synthetic:refund-tfsa"]).toBe(
      952.75,
    );
    expect(year.nominal.registeredAccountRoom.tfsa).toMatchObject({
      surplusFundedContributions: 952.75,
      allowedContributions: 952.75,
    });
  });

  it("keeps liability-funded refund excess available for later monthly cash flow", () => {
    const input = capitalLossRefundProjection();
    input.monthlyEssentialSpendingToday = 0;
    input.events[0]!.amountToday = 1_370.47;
    input.liabilities = [
      {
        id: "synthetic:refund-liability",
        label: "Synthetic refund-funded liability",
        origin: "lunchmoney",
        openingBalance: 100,
        balanceAsOf: input.startDate,
        role: null,
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0,
          interestRateConvention: "effective_annual",
          regularPayment: {
            amount: 50,
            frequency: "monthly",
            monthlyEquivalent: 50,
          },
          scheduleStartDate: input.startDate,
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "already_excluded_or_transfer",
        historicalMonthlyAverage: 0,
      },
    ];

    const result = calculateProjection(input);
    const year = result.annual[0]!;
    expect(result.projectionCompletion.status).toBe("complete");
    expect(year.nominal.outflows.unmetRequiredOutflow).toBe(0);
    expect(year.nominal.outflows.liabilityCashPayment).toBe(100);
    expect(year.nominal.surplusAllocation.retainedAsCash).toBe(14.75);
    expect(year.nominal.accountBalances["manual:1"]).toBe(14.75);
    expect(
      year.nominal.liabilitySchedules["synthetic:refund-liability"]!
        .closingBalance,
    ).toBe(0);
  });

  it("uses the corrected refund cash path for exact-cent retirement candidates", () => {
    const input = capitalLossRefundProjection();
    input.person.retirementAge = 64 + 1 / 12;
    input.person.employmentIncomePhases[0]!.endAge =
      input.person.retirementAge;

    const first = calculateProjection(input);
    const repeated = calculateProjection(input);
    expect(first.retirementRequirement).toMatchObject({
      status: "available",
      provisionalTax: false,
      solver: {
        acceptedCandidatePassed: true,
        oneCentBelowFailed: true,
      },
    });
    expect(
      first.retirementRequirement.requiredFinancialAssetsToday,
    ).toBeGreaterThan(0);
    expect(repeated.retirementRequirement).toEqual(
      first.retirementRequirement,
    );
  });
  it("distinguishes every supported tax-coverage combination", () => {
    const complete = calculateProjection(simplifiedTaxableProjection());
    expect(complete.taxation).toMatchObject({
      coverageStatus: "complete_supported_deterministic_model",
      provisional: false,
      fullTaxReturnFidelity: false,
    });
    expect(complete.rrif.provisional).toBe(false);
    expect(complete.nonRegisteredTaxation.provisional).toBe(false);
    expect(complete.retirementRequirement.provisionalTax).toBe(false);

    const nonRegisteredCompatibility = simplifiedTaxableProjection();
    nonRegisteredCompatibility.nonRegisteredTaxation = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };
    const statutoryCompatibility = calculateProjection(
      nonRegisteredCompatibility,
    );
    expect(statutoryCompatibility.taxation).toMatchObject({
      coverageStatus:
        "canadian_annual_rrif_statutory_non_registered_compatibility",
      provisional: true,
    });
    expect(statutoryCompatibility.rrif.provisional).toBe(true);
    expect(statutoryCompatibility.nonRegisteredTaxation.provisional).toBe(
      true,
    );
    expect(
      statutoryCompatibility.retirementRequirement.provisionalTax,
    ).toBe(true);

    const rrifCompatibility = simplifiedTaxableProjection();
    rrifCompatibility.rrifMinimumWithdrawals = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };
    const simplifiedWithRrifCompatibility = calculateProjection(
      rrifCompatibility,
    );
    expect(simplifiedWithRrifCompatibility.taxation).toMatchObject({
      coverageStatus: "canadian_annual_rrif_compatibility",
      provisional: true,
    });
    expect(simplifiedWithRrifCompatibility.rrif.provisional).toBe(true);
    expect(
      simplifiedWithRrifCompatibility.nonRegisteredTaxation.provisional,
    ).toBe(true);
    expect(
      simplifiedWithRrifCompatibility.retirementRequirement.provisionalTax,
    ).toBe(true);

    const flat = simplifiedTaxableProjection();
    flat.nonRegisteredTaxation = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };
    flat.tax = {
      mode: "flat_compatibility",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
    };
    const flatCompatibility = calculateProjection(flat);
    expect(flatCompatibility.taxation).toMatchObject({
      coverageStatus: "flat_tax_compatibility",
      provisional: true,
    });
    expect(flatCompatibility.rrif.provisional).toBe(true);
    expect(flatCompatibility.nonRegisteredTaxation.provisional).toBe(true);
    expect(flatCompatibility.retirementRequirement.provisionalTax).toBe(true);
  });

  it("characterizes the existing return, taxes distributions, and disposes pooled ACB", () => {
    const result = calculateProjection(simplifiedTaxableProjection());
    const year = result.annual[0]!;
    const tax = year.tax;

    expect(result.taxation).toMatchObject({
      coverageStatus: "complete_supported_deterministic_model",
      provisional: false,
      fullTaxReturnFidelity: false,
    });
    expect(result.nonRegisteredTaxation).toMatchObject({
      mode: "simplified_canadian",
      provisional: false,
      supportedAdjustedCostBaseModel: "pooled_account_portfolio",
    });
    expect(result.rrif.provisional).toBe(false);
    expect(year.nonRegisteredTaxation.totalDistributions).toBeGreaterThan(0);
    expect(year.nonRegisteredTaxation.unrealizedChange).toBeGreaterThan(0);
    expect(year.nonRegisteredTaxation.dispositionProceeds).toBe(
      year.nominal.withdrawals.nonRegistered,
    );
    expect(year.nominal.outflows.tax).toBeGreaterThan(0);
    expect(
      Math.abs(
        year.nominal.withdrawals.nonRegistered -
          year.nominal.outflows.tax -
          year.nominal.outflows.essential,
      ),
    ).toBeLessThanOrEqual(0.01);
    expect(year.nonRegisteredTaxation.adjustedCostBaseDisposed).toBeGreaterThan(
      0,
    );
    expect(year.nonRegisteredTaxation.realizedCapitalGains).toBeGreaterThan(0);
    expect(year.nonRegisteredTaxation.reconciled).toBe(true);
    expect(tax.mode).toBe("canadian_annual");
    if (tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(tax.totalIncome.interest).toBeGreaterThan(0);
    expect(tax.totalIncome.eligibleCanadianDividends).toBeGreaterThan(0);
    expect(tax.totalIncome.foreignIncome).toBeGreaterThan(0);
    expect(tax.totalIncome.capitalGains).toBeGreaterThan(
      year.nonRegisteredTaxation.capitalGainDistributions,
    );
    expect(tax.fullAnnualTax.incomeAdjustments.taxableEligibleDividends).toBe(
      Math.round((tax.totalIncome.eligibleCanadianDividends ?? 0) * 1.38 * 100) /
        100,
    );
    expect(tax.fullAnnualTax.incomeAdjustments.capitalGainsInclusionRate).toBe(
      0.5,
    );
    expect(tax.reconciled).toBe(true);
    expect(result.retirementRequirement.provisionalTax).toBe(false);
    expect(result.retirementRequirement.solver.acceptedCandidatePassed).toBe(
      true,
    );
    expect(result.retirementRequirement.solver.oneCentBelowFailed).toBe(true);
    expect(calculateProjection(simplifiedTaxableProjection())).toEqual(result);
  });

  it("supports positive distributions during a negative total-return year", () => {
    const input = simplifiedTaxableProjection();
    input.accounts[1]!.annualReturn = -0.12;
    const result = calculateProjection(input);
    const year = result.annual[0]!.nonRegisteredTaxation;

    expect(year.totalDistributions).toBeGreaterThan(0);
    expect(year.unrealizedChange).toBeLessThan(0);
    expect(year.reconciled).toBe(true);
  });

  it("consumes an insufficient first taxable account before the next priority", () => {
    const input = simplifiedTaxableProjection();
    input.accounts[1]!.openingBalance = 1_000;
    if (input.nonRegisteredTaxation.mode !== "simplified_canadian") {
      throw new Error("expected simplified mode");
    }
    input.nonRegisteredTaxation.accounts[0]!.openingAdjustedCostBase.amount =
      800;
    input.accounts.push({
      ...structuredClone(input.accounts[1]!),
      id: "synthetic:taxable-two",
      label: "Synthetic taxable portfolio two",
      openingBalance: 100_000,
      withdrawalPriority: 3,
    });
    input.nonRegisteredTaxation.accounts.push({
      ...structuredClone(input.nonRegisteredTaxation.accounts[0]!),
      accountId: "synthetic:taxable-two",
      openingAdjustedCostBase: {
        ...input.nonRegisteredTaxation.accounts[0]!.openingAdjustedCostBase,
        amount: 80_000,
      },
    });

    const result = calculateProjection(input);
    const year = result.annual[0]!.nonRegisteredTaxation;
    const first = year.accounts.find((account) => account.accountId === "manual:2")!;
    const second = year.accounts.find(
      (account) => account.accountId === "synthetic:taxable-two",
    )!;
    expect(first.closingMarketValue).toBe(0);
    expect(first.closingAdjustedCostBase).toBe(0);
    expect(first.dispositionProceeds).toBeGreaterThan(0);
    expect(second.dispositionProceeds).toBeGreaterThan(0);
    expect(second.closingMarketValue).toBeGreaterThan(0);
    expect(first.reconciled).toBe(true);
    expect(second.reconciled).toBe(true);
  });

  it("rolls back the failed month's ACB, distributions, disposition, and tax", () => {
    const input = simplifiedTaxableProjection();
    input.monthlyEssentialSpendingToday = 0;
    input.accounts[1]!.openingBalance = 1_000;
    if (input.nonRegisteredTaxation.mode !== "simplified_canadian") {
      throw new Error("expected simplified mode");
    }
    input.nonRegisteredTaxation.accounts[0]!.openingAdjustedCostBase.amount =
      800;
    input.liabilities = [
      {
        id: "synthetic:liability",
        label: "Synthetic required liability",
        origin: "lunchmoney",
        openingBalance: 1_800,
        balanceAsOf: input.startDate,
        role: null,
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0,
          interestRateConvention: "effective_annual",
          regularPayment: {
            amount: 600,
            frequency: "monthly",
            monthlyEquivalent: 600,
          },
          scheduleStartDate: input.startDate,
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "already_excluded_or_transfer",
        historicalMonthlyAverage: 0,
      },
    ];

    const result = calculateProjection(input);
    const period = result.annual[0]!;
    const expectedFirstMonthInterest =
      Math.round(
        1_000 * (Math.pow(1.01, 1 / 12) - 1) * 100,
      ) / 100;
    expect(result.projectionCompletion.status).toBe(
      "stopped_unfunded_liability",
    );
    expect(result.projectionCompletion.completedThroughDate).toBe(
      "2026-01-31",
    );
    expect(period.nonRegisteredTaxation.periodStatus).toBe(
      "stopped_incomplete",
    );
    expect(period.nonRegisteredTaxation.interestDistributions).toBe(
      expectedFirstMonthInterest,
    );
    expect(period.nonRegisteredTaxation.dispositionProceeds).toBeGreaterThan(0);
    expect(period.nonRegisteredTaxation.reconciled).toBe(true);
    expect(period.tax.mode).toBe("canadian_annual");
    if (period.tax.mode !== "canadian_annual") {
      throw new Error("expected Canadian tax");
    }
    expect(period.tax.reconciled).toBe(true);
    expect(calculateProjection(input)).toEqual(result);
  });

  it("exports one anonymized rectangular shared tax and ACB contract", () => {
    const input = simplifiedTaxableProjection();
    const projection = calculateProjection(input);
    const context = structuredClone(baselineContextFixture);
    context.projectionInputs = input;
    const snapshot = createProjectionSnapshot(
      projection,
      context,
      {},
      "2026-07-31T12:00:00.000Z",
    );

    expect(snapshot.schemaVersion).toBe("13.0");
    expect(snapshot.projection.nonRegisteredTaxation.accounts[0]!.accountId).toBe(
      "non_registered_1",
    );
    expect(JSON.stringify(snapshot)).not.toContain("Synthetic opening ACB");
    expect(JSON.stringify(snapshot)).not.toContain("manual:2");
    for (const mode of ["nominal", "real"] as const) {
      const rows = csvRows(projectionSnapshotToCsv(snapshot, mode));
      const header = rows[0]!;
      expect(header).toEqual(
        expect.arrayContaining([
          "tax_coverage_status",
          "non_registered_tax_mode",
          "actual_eligible_dividends",
          "taxable_eligible_dividends",
          "realized_capital_gains",
          "non_registered_opening_acb",
          "non_registered_closing_acb",
        ]),
      );
      expect(rows.slice(1).every((row) => row.length === header.length)).toBe(
        true,
      );
      expect(projectionSnapshotToCsv(snapshot, mode)).not.toContain(
        "manual:2",
      );
    }
  });

  it("exports shared provisional flags when RRIF compatibility is active", () => {
    const input = simplifiedTaxableProjection();
    input.rrifMinimumWithdrawals = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };
    const projection = calculateProjection(input);
    const context = structuredClone(baselineContextFixture);
    context.projectionInputs = input;
    const snapshot = createProjectionSnapshot(
      projection,
      context,
      {},
      "2026-07-31T12:00:00.000Z",
    );

    expect(snapshot.projection.taxation.provisional).toBe(true);
    expect(snapshot.projection.rrif.provisional).toBe(true);
    expect(snapshot.projection.nonRegisteredTaxation.provisional).toBe(true);
    expect(snapshot.projection.retirementRequirement.provisionalTax).toBe(
      true,
    );
    for (const mode of ["nominal", "real"] as const) {
      const rows = csvRows(projectionSnapshotToCsv(snapshot, mode));
      const header = rows[0]!;
      const first = rows[1]!;
      expect(first[header.indexOf("tax_provisional")]).toBe("1");
      expect(first[header.indexOf("non_registered_tax_mode")]).toBe(
        "simplified_canadian",
      );
      expect(rows.slice(1).every((row) => row.length === header.length)).toBe(
        true,
      );
    }
  });
});
