import { describe, expect, it } from "vitest";
import { calculateProjection, calculateSpendingCapacity } from "@/src/domain/projection/calculate";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import { parseRetirementDrawdown, type ProjectionInputs } from "@/src/domain/projection/types";
import { projectionFixture, baselineContextFixture } from "./fixtures/projection";
import { buildAnnualChartData } from "@/src/domain/projection/presentation";
import { createProjectionSnapshot, projectionSnapshotToCsv } from "@/src/domain/projection/export";
function drawdownFixture(): ProjectionInputs {
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
  input.endAge = 85;
  input.person.currentAge = 60;
  input.person.retirementAge = 60 + 1 / 12;
  input.person.employmentIncomePhases[0]!.startAge = 60;
  input.person.employmentIncomePhases[0]!.endAge = input.person.retirementAge;
  input.spendingPhases[0]!.startAge = 60;
  input.spendingPhases[0]!.endAge = input.endAge;
  input.monthlyEssentialSpendingToday = 1_000;
  input.monthlyDiscretionarySpendingToday = 1_000;
  input.accounts[0]!.openingBalance = 300_000;
  input.accounts[1]!.annualReturn = 0.03;
  input.accounts.push({ ...input.accounts[1]!, id: "synthetic:registered", label: "Synthetic registered", type: "rrsp_rrif", openingBalance: 900_000, withdrawalPriority: 3 });
  if (input.nonRegisteredTaxation.mode === "simplified_canadian") input.nonRegisteredTaxation.accounts[0]!.annualDistributionYields = { interest: 0, eligibleCanadianDividends: 0, foreignIncome: 0, capitalGains: 0 };
  input.surplusAllocation.excess = { mode: "allocate_to_account", destinationAccountId: "manual:2" };
  input.retirementDrawdown = { strategy: "planned_registered_bridge", annualRegisteredWithdrawalToday: 40_000, annualSpendableCashTargetToday: 24_000 };
  return input;
}


describe("retirement spendable cash and registered bridge", () => {
  it("compares the full horizon and reconciles each annual cash ledger", () => {
    const input = drawdownFixture();
    const result = calculateProjection(input);
    expect(result.annual[0]!.nominal.spendableCash!.plannedRegisteredWithdrawals).toBeCloseTo(3_333.33 * 11, 2);
    expect(result.drawdownComparison!.planned.terminalLiquidationAssetsToday).toBeLessThan(result.drawdownComparison!.planned.terminalAssetsToday!);
    expect(result.drawdownComparison!.planned.terminalLiquidationAssetsToday).toBeGreaterThan(result.drawdownComparison!.baseline.terminalLiquidationAssetsToday!);
    expect(result.drawdownComparison!.planned.terminalAssetsToday).not.toBe(result.drawdownComparison!.baseline.terminalAssetsToday);
    for (const year of result.annual) {
      for (const view of [year.nominal, year.real]) {
        const cash = view.spendableCash!;
        expect(Math.abs(cash.grossInflow - cash.taxes - cash.netAvailable)).toBeLessThanOrEqual(0.011);
        expect(Math.abs(cash.netAvailable - cash.consumption - cash.otherFundedOutflows - cash.retainedOrReinvested)).toBeLessThanOrEqual(0.011);
        expect(cash.retainedOrReinvested).toBeGreaterThanOrEqual(-0.01);
        expect(cash.shortfall).toBe(0);
      }
      if (year.tax.mode === "canadian_annual") expect(year.nominal.outflows.tax).toBeCloseTo(year.tax.projectionFundedTax, 2);
    }
  });

  it("retains the visible downside of holding bridge surplus at a lower return", () => {
    const input = drawdownFixture(); input.surplusAllocation.excess = { mode: "retain_as_cash" };
    const result = calculateProjection(input);
    expect(result.drawdownComparison!.planned.terminalLiquidationAssetsToday).toBeLessThan(result.drawdownComparison!.baseline.terminalLiquidationAssetsToday!);
  });

  it("supports elective RRIF draws in the conversion year and stops the bridge before mandatory years", () => {
    const input = drawdownFixture();
    input.person.rrifConversionAge = 60.5; input.endAge = 62;
    input.spendingPhases[0]!.endAge = 62;
    const result = calculateProjection(input);
    expect(result.annual[0]!.rrif.ordinaryWithdrawals).toBeGreaterThan(0);
    expect(result.annual[0]!.nominal.spendableCash!.plannedRegisteredWithdrawals).toBeCloseTo(3_333.33 * 11, 2);
    expect(result.annual[0]!.nominal.spendableCash!.mandatoryRrifPayments).toBe(0);
    expect(result.annual[1]!.nominal.spendableCash!.plannedRegisteredWithdrawals).toBe(0);
    expect(result.annual[1]!.nominal.spendableCash!.mandatoryRrifPayments).toBeGreaterThan(0);
  });

  it("never caps late mandatory RRIF payouts at the consumption target", () => {
    const result = calculateProjection(drawdownFixture());
    const year = result.annual.find((row) => (row.nominal.spendableCash?.mandatoryRrifTrueUp ?? 0) > 24_000)!;
    expect(year).toBeDefined();
    expect(year.nominal.spendableCash!.consumption).toBe(24_000);
    expect(year.nominal.spendableCash!.retainedOrReinvested).toBeGreaterThan(0);
  });

  it("preserves default results and static priority financial flows", () => {
    const input = drawdownFixture(); delete input.retirementDrawdown;
    const baseline = calculateProjection(input);
    const selected = calculateProjection({ ...input, retirementDrawdown: { strategy: "static_priority" } });
    for (const [index, year] of baseline.annual.entries()) {
      expect(selected.annual[index]!.nominal.balances).toEqual(year.nominal.balances);
      expect(selected.annual[index]!.nominal.withdrawals).toEqual(year.nominal.withdrawals);
    }
    expect(baseline.annual[0]!.nominal.spendableCash).toBeUndefined();
  });

  it("labels an infeasible target and never calls unfunded cash consumption", () => {
    const input = drawdownFixture(); input.retirementDrawdown = { strategy: "static_priority", annualSpendableCashTargetToday: 1_000_000 };
    const result = calculateProjection(input);
    expect(result.observations.some((item) => item.code === "spendable_cash_target_infeasible")).toBe(true);
    expect(result.annual.some((year) => year.nominal.spendableCash!.shortfall > 0)).toBe(true);
    expect(result.annual.at(-1)!.nominal.spendableCash!.consumption).toBeLessThan(1_000_000);
  });

  it("exposes gross and net chart totals and allowlisted export ledger", () => {
    const input = drawdownFixture(); const result = calculateProjection(input);
    const rows = buildAnnualChartData(input, result, "real");
    expect(rows[0]!.grossCashInflow - rows[0]!.netCashAvailable).toBeCloseTo(result.annual[0]!.real.outflows.tax, 2);
    const snapshot = createProjectionSnapshot(result, { ...baselineContextFixture, projectionInputs: input }, {}, "2026-01-01T00:00:00.000Z");
    expect(snapshot.projection.inputs.retirementDrawdown).toEqual(input.retirementDrawdown);
    expect(snapshot.projection.annual[0]!.real.spendableCash).toEqual(result.annual[0]!.real.spendableCash);
    const csv = projectionSnapshotToCsv(snapshot, "real");
    expect(csv).toContain("spendable_netAvailable");
    expect(csv).not.toContain("synthetic:registered");
    const lines = csv.split("\n");
    expect(lines[1]!.split(",").length).toBe(lines[0]!.split(",").length);
  });

  it("indexes partial-year targets monthly and keeps shock comparisons deterministic", () => {
    const input = drawdownFixture() as ProjectionInputsWithReturnPaths;
    input.endAge = 61.25; input.spendingPhases[0]!.endAge = input.endAge;
    input.returnScenario = { label: "Synthetic adverse path", source: "explicit_configuration", inflationPath: {
      mode: "monthly", source: "explicit_configuration", entries: [{ calendarMonth: "2026-02", monthlyInflation: 0.01 }],
    } };
    input.accounts[2]!.returnPath = { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2026, annualReturn: -0.2 }] };
    const result = calculateProjection(input);
    expect(result.annual[0]!.real.spendableCash!.target).toBe(24_000);
    expect(result.annual[0]!.nominal.spendableCash!.target).toBe(24_220);
    expect(result.annual[1]!.real.spendableCash!.target).toBe(6_000);
    expect(calculateProjection(input).drawdownComparison).toEqual(result.drawdownComparison);
    input.retirementRequirement.minimumEndingFinancialAssetsToday = 5_000_000;
    expect(calculateProjection(input).drawdownComparison!.planned.terminalFloorMet).toBe(false);
  });

  it("changes OAS recovery through the annual Canadian tax ledger", () => {
    const input = drawdownFixture();
    input.accounts[2]!.openingBalance = 2_000_000;
    input.person.oas.fullMonthlyAmountAt65Today = 700;
    input.person.cpp.monthlyAmountAt65Today = 1_000;
    const planned = calculateProjection(input);
    input.retirementDrawdown = { strategy: "static_priority", annualSpendableCashTargetToday: 24_000 };
    const baseline = calculateProjection(input);
    const recovery = (result: typeof planned) => result.annual.reduce((sum, year) => sum + year.nominal.outflows.oasRecoveryTax, 0);
    expect(recovery(planned)).toBeGreaterThan(0);
    expect(recovery(planned)).toBeLessThan(recovery(baseline));
    for (const year of planned.annual) {
      if (year.tax.mode === "canadian_annual") {
        expect(year.nominal.outflows.oasRecoveryTax).toBeCloseTo(year.tax.fullAnnualTax.totals.oasRecoveryTax - year.tax.embeddedAnnualTax.totals.oasRecoveryTax, 2);
      }
    }
  });

  it("routes funded surplus through limited TFSA room and taxable ACB without RRSP recycling", () => {
    const input = drawdownFixture(); input.endAge = 61; input.spendingPhases[0]!.endAge = 61;
    input.accounts.push({ ...input.accounts[0]!, id: "synthetic:tfsa", label: "Synthetic TFSA", type: "tfsa", openingBalance: 0, withdrawalPriority: 4 });
    input.registeredAccountRoom = {
      tfsa: { startingAvailableRoom: { source: "configured_amount", amount: 100, sourceDescription: "Synthetic room", effectiveDate: input.startDate }, annualNewRoom: { source: "canadian_reference", futureIndexingRate: 0, roundingIncrement: 500 }, carryForwardUnusedRoom: true, withdrawalRoomRecredit: "next_calendar_year" },
      rrsp: { startingAvailableDeductionRoom: { source: "configured_amount", amount: 10_000, sourceDescription: "Synthetic room", effectiveDate: input.startDate }, carryForwardUnusedRoom: true, newRoom: { source: "earned_income", annualCap: { source: "canadian_reference", futureGrowthRate: 0, futureRoundingIncrement: 10 }, startYearBeforeProjectionMonth: { calendarYear: 2026, eligibleEarnedIncome: 0, pensionAdjustment: 0, otherRoomReduction: 0 } } },
    };
    input.person.employmentIncomePhases[0]!.rrspRoomGeneration = { annualEligibleEarnedIncomeToday: 0, annualPensionAdjustmentToday: 0, annualOtherRoomReductionToday: 0, annualGrowth: 0 };
    input.contributionWaterfall = { mode: "canonical", routes: [], surplusDestinationAccountIds: ["synthetic:tfsa", "synthetic:registered", "manual:2"] };
    input.surplusAllocation.excess = { mode: "allocate_through_contribution_waterfall" };
    const result = calculateProjection(input);
    const view = result.annual[0]!.nominal;
    expect(view.registeredAccountRoom.tfsa.allowedContributions).toBe(100);
    expect(view.registeredAccountRoom.rrsp.allowedContributions).toBe(0);
    expect(view.accountSurplusAllocations["manual:2"]).toBeGreaterThan(0);
    expect(view.spendableCash!.retainedOrReinvested).toBeCloseTo(view.surplusAllocation.generated, 2);
  });

  it("uses the active bridge in the existing inverse solver when no fixed target overrides phases", () => {
    const input = drawdownFixture(); input.endAge = 62;
    input.retirementDrawdown = { strategy: "planned_registered_bridge", annualRegisteredWithdrawalToday: 40_000 };
    input.spendingPhases = [
      { ...input.spendingPhases[0]!, endAge: input.person.retirementAge },
      { ...input.spendingPhases[0]!, id: "synthetic-retirement", startAge: input.person.retirementAge, endAge: 62 },
    ];
    const result = calculateSpendingCapacity(input, { phaseIds: ["synthetic-retirement"] });
    expect(result.status, result.reason ?? "inverse capacity").toBe("available");
    expect(result.effectiveInputs.withdrawalStrategy).toBe("planned_registered_bridge");
    expect(result.nextCentFails).toBe(true);
  });

  it("rejects invalid strategy inputs and explains fixed-target inverse analysis", () => {
    expect(() => parseRetirementDrawdown({ strategy: "planned_registered_bridge" })).toThrow();
    expect(() => parseRetirementDrawdown({ strategy: "static_priority", annualSpendableCashTargetToday: -1 })).toThrow();
    const input = drawdownFixture();
    expect(calculateSpendingCapacity(input, { phaseIds: [input.spendingPhases[0]!.id] }).reason).toContain("fixed spendable-cash target");
  });
});
