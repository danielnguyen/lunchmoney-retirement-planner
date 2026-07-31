import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
} from "@/src/domain/projection/export";
import {
  baselineContextFixture,
  projectionFixture,
} from "@/tests/fixtures/projection";
import type { ProjectionInputs } from "@/src/domain/projection/types";

function canadianProjection(): ProjectionInputs {
  const inputs = structuredClone(projectionFixture);
  inputs.startDate = "2026-07-01";
  inputs.person.currentAge = 64;
  inputs.person.retirementAge = 64.5;
  inputs.endAge = 66;
  inputs.spendingPhases = [
    {
      id: "synthetic-lifestyle",
      label: "Synthetic lifestyle",
      startAge: 64,
      endAge: 66,
      essentialMultiplier: 1,
      discretionaryMultiplier: 1,
      source: "explicit_configuration",
    },
  ];
  inputs.monthlyEssentialSpendingToday = 6_000;
  inputs.monthlyDiscretionarySpendingToday = 0;
  inputs.person.employmentIncomePhases = [
    {
      id: "synthetic-employment",
      label: "Synthetic employment",
      startAge: 64,
      endAge: 64.5,
      annualNetCashToday: 60_000,
      annualTaxableEmploymentIncomeToday: 90_000,
      annualGrowth: 0,
    },
  ];
  inputs.person.annualPensionToday = 0;
  inputs.person.pensionIncomeCreditEligible = false;
  inputs.person.cpp.monthlyAmountAt65Today = 0;
  inputs.person.oas.fullMonthlyAmountAt65Today = 0;
  inputs.tax = {
    mode: "canadian_annual",
    source: "explicit_configuration",
    effectiveTaxRate: 0.2,
    oasRecoveryThresholdToday: 1,
    oasRecoveryRate: 1,
    province: "ON",
    referenceYear: 2026,
    futureIndexingRate: 0.02,
    openingTaxYearBeforeProjectionMonth: {
      calendarYear: 2026,
      throughMonth: 6,
      income: {
        employment: 40_000,
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
  inputs.accounts = [
    {
      ...inputs.accounts[0]!,
      label: "Synthetic cash",
      openingBalance: 10_000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
    },
    {
      ...inputs.accounts[1]!,
      label: "Synthetic RRSP",
      openingBalance: 150_000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 2,
    },
  ];
  inputs.registeredAccountRoom = undefined;
  inputs.contributionWaterfall = {
    mode: "fixed_source_compatibility",
    routes: [],
    surplusDestinationAccountIds: ["manual:2"],
  };
  inputs.surplusAllocation = {
    reserveAccountIds: ["manual:1"],
    reserveRefillAccountId: "manual:1",
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  inputs.events = [];
  return inputs;
}

describe("Canadian annual tax projection integration", () => {
  it("uses opening and employment income as embedded context without taxing net cash twice", () => {
    const result = calculateProjection(canadianProjection());
    const firstYear = result.annual.find((row) => row.calendarYear === 2026)!;

    expect(result.taxation).toMatchObject({
      mode: "canadian_annual",
      province: "ON",
      referenceYear: 2026,
      provisional: true,
    });
    expect(firstYear.tax.mode).toBe("canadian_annual");
    if (firstYear.tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(firstYear.tax.openingIncome.employment).toBe(40_000);
    expect(firstYear.tax.projectionIncome.employment).toBe(45_000);
    expect(firstYear.tax.totalIncome.employment).toBe(85_000);
    expect(firstYear.tax.embeddedIncome.employment).toBe(85_000);
    expect(firstYear.tax.projectionFundedTax).toBe(0);
    expect(firstYear.tax.recognizedProjectionFundedTax).toBe(0);
    expect(firstYear.tax.reconciled).toBe(true);
  });

  it("uses annual Canadian tax for registered withdrawals and requirement candidates", () => {
    const result = calculateProjection(canadianProjection());
    const withdrawalYear = result.annual.find(
      (row) => row.nominal.withdrawals.rrspRrif > 0,
    );

    expect(withdrawalYear).toBeDefined();
    expect(withdrawalYear!.tax.mode).toBe("canadian_annual");
    if (withdrawalYear!.tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(withdrawalYear!.tax.totalIncome.rrspWithdrawals).toBeCloseTo(
      withdrawalYear!.nominal.withdrawals.rrspRrif,
      8,
    );
    expect(withdrawalYear!.tax.projectionFundedTax).toBeGreaterThan(0);
    expect(withdrawalYear!.tax.recognizedProjectionFundedTax).toBe(
      withdrawalYear!.tax.projectionFundedTax,
    );
    expect(withdrawalYear!.tax.reconciled).toBe(true);
    expect(result.retirementRequirement.taxModel).toBe(
      "canadian_annual_federal_ontario_forecast",
    );
    expect(result.retirementRequirement.provisionalTax).toBe(true);
    expect(result.retirementRequirement.solver.acceptedCandidatePassed).toBe(true);
    expect(result.retirementRequirement.solver.oneCentBelowFailed).toBe(true);

    const flatInputs = canadianProjection();
    flatInputs.tax = {
      mode: "flat_compatibility",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
    };
    const flat = calculateProjection(flatInputs);
    expect(result.retirementRequirement.requiredFinancialAssetsToday).not.toBe(
      flat.retirementRequirement.requiredFinancialAssetsToday,
    );
    expect(flat.retirementRequirement.taxModel).toBe(
      "flat_retirement_tax_compatibility",
    );
  });

  it("is deterministic and does not use inactive flat recovery inputs", () => {
    const first = calculateProjection(canadianProjection());
    const changed = canadianProjection();
    changed.tax.oasRecoveryThresholdToday = 0;
    changed.tax.oasRecoveryRate = 0;
    changed.tax.effectiveTaxRate = 0;
    const second = calculateProjection(changed);

    expect(second.annual).toEqual(first.annual);
    expect(second.summary).toEqual(first.summary);
    expect(second.retirementRequirement).toEqual(first.retirementRequirement);
    expect(calculateProjection(canadianProjection())).toEqual(first);
  });

  it("uses a full insufficient RRSP account before continuing in priority order", () => {
    const inputs = canadianProjection();
    const firstRrsp = inputs.accounts[1]!;
    firstRrsp.openingBalance = 1_000;
    firstRrsp.withdrawalPriority = 2;
    inputs.accounts.push({
      ...structuredClone(firstRrsp),
      id: "synthetic-second-rrsp",
      label: "Synthetic second RRSP",
      openingBalance: 149_000,
      withdrawalPriority: 3,
    });
    inputs.contributionWaterfall.surplusDestinationAccountIds = [
      "synthetic-second-rrsp",
    ];

    const result = calculateProjection(inputs);
    const withdrawalYear = result.annual.find(
      (row) => row.nominal.withdrawals.rrspRrif > 1_000,
    )!;
    expect(withdrawalYear.nominal.accountBalances["manual:2"]).toBe(0);
    expect(
      withdrawalYear.nominal.accountBalances["synthetic-second-rrsp"],
    ).toBeLessThan(149_000);
    expect(withdrawalYear.nominal.accountBalances["synthetic-second-rrsp"]).toBeGreaterThanOrEqual(0);
    expect(withdrawalYear.tax.mode).toBe("canadian_annual");
  });

  it("retains stopped-period Canadian tax evidence without fabricating later income", () => {
    const inputs = canadianProjection();
    inputs.monthlyEssentialSpendingToday = 0;
    inputs.person.employmentIncomePhases[0]!.annualNetCashToday = 0;
    inputs.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      0;
    inputs.accounts[0]!.openingBalance = 750;
    inputs.accounts[1]!.openingBalance = 1;
    inputs.nonFinancialAssets = [
      {
        id: "synthetic-residence",
        label: "Synthetic residence",
        origin: "lunchmoney",
        type: "primary_residence",
        openingValue: 500_000,
        valueAsOf: inputs.startDate,
        annualAppreciation: 0,
        availableForWithdrawals: false,
      },
    ];
    inputs.liabilities = [
      {
        id: "synthetic-mortgage",
        label: "Synthetic mortgage",
        origin: "lunchmoney",
        openingBalance: 1_800,
        balanceAsOf: inputs.startDate,
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0,
          interestRateConvention: "effective_annual",
          regularPayment: {
            amount: 100,
            frequency: "monthly",
            monthlyEquivalent: 100,
          },
          scheduleStartDate: inputs.startDate,
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "already_excluded_or_transfer",
        historicalMonthlyAverage: 0,
      },
    ];

    const result = calculateProjection(inputs);
    const final = result.annual.at(-1)!;
    expect(result.retirementRequirement.status).toBe("available");
    expect(result.projectionCompletion.status).toBe(
      "stopped_unfunded_liability",
    );
    expect(final.tax.mode).toBe("canadian_annual");
    expect(final.tax.periodStatus).toBe("stopped_incomplete");
    expect(final.period.status).toBe("partial_period");
    expect(final.period.endDate).toBe(
      result.projectionCompletion.completedThroughDate,
    );
    expect(result.projectionCompletion.stoppedBeforeMonth).toBe("2027-02");
    expect(final.nominal.outflows.liabilityCashPayment).toBe(100);
    expect(final.nominal.balances.totalLiabilities).toBe(1_100);
  });

  it("exports an allowlisted rectangular annual tax contract", () => {
    const projection = calculateProjection(canadianProjection());
    const snapshot = createProjectionSnapshot(
      projection,
      baselineContextFixture,
      {},
      "2026-07-30T12:00:00.000Z",
    );
    const csv = projectionSnapshotToCsv(snapshot, "nominal");
    const [header, ...rows] = csv.trim().split("\n");
    const columns = header!.split(",");

    expect(snapshot.schemaVersion).toBe("11.0");
    expect(snapshot.projection.taxation.mode).toBe("canadian_annual");
    expect(columns).toEqual(
      expect.arrayContaining([
        "tax_model",
        "taxable_employment_income",
        "federal_tax",
        "ontario_net_tax",
        "ontario_surtax",
        "ontario_health_premium",
        "annual_oas_recovery_tax",
        "full_annual_tax",
        "embedded_annual_tax",
        "projection_funded_annual_tax",
      ]),
    );
    expect(rows.every((row) => row.split(",").length === columns.length)).toBe(
      true,
    );
    expect(csv).not.toContain("manual:1");
    expect(csv).not.toContain("manual:2");
  });
});
