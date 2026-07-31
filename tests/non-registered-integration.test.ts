import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
} from "@/src/domain/projection/export";
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

function csvRows(csv: string): string[][] {
  return csv
    .trimEnd()
    .split("\n")
    .map((line) => line.split(","));
}

describe("simplified non-registered projection integration", () => {
  it("distinguishes every supported tax-coverage combination", () => {
    const complete = calculateProjection(simplifiedTaxableProjection());
    expect(complete.taxation.coverageStatus).toBe(
      "complete_supported_deterministic_model",
    );

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

    const rrifCompatibility = simplifiedTaxableProjection();
    rrifCompatibility.rrifMinimumWithdrawals = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };
    expect(calculateProjection(rrifCompatibility).taxation).toMatchObject({
      coverageStatus: "canadian_annual_rrif_compatibility",
      provisional: true,
    });

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
    expect(calculateProjection(flat).taxation).toMatchObject({
      coverageStatus: "flat_tax_compatibility",
      provisional: true,
    });
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
});
