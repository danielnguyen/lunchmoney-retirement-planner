import { describe, expect, it } from "vitest";
import {
  ALL_OTHER_RRIF_FACTORS,
  RRIF_REFERENCE_URLS,
  RRIF_REFERENCE_EFFECTIVE_DATES,
  RRIF_REFERENCE_RETRIEVED_DATE,
  rrifPrescribedFactor,
  settleRrifMinimum,
} from "@/src/domain/defaults/rrif-factors";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
} from "@/src/domain/projection/export";
import {
  baselineContextFixture,
  projectionFixture,
} from "./fixtures/projection";
import type { ProjectionInputs } from "@/src/domain/projection/types";

function statutoryRrifFixture(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-01";
  input.person.currentAge = 70;
  input.person.retirementAge = 70.5;
  input.person.rrifConversionAge = 70.5;
  input.endAge = 72;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.spendingPhases = [
    {
      id: "synthetic-zero-spending",
      label: "Synthetic zero spending",
      startAge: 70,
      endAge: 72,
      essentialMultiplier: 1,
      discretionaryMultiplier: 1,
      source: "explicit_configuration",
    },
  ];
  input.person.employmentIncomePhases = [
    {
      id: "synthetic-zero-employment",
      label: "Synthetic zero employment",
      startAge: 70,
      endAge: 70.5,
      annualNetCashToday: 0,
      annualGrowth: 0,
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.monthlyAmountAt65Today = 0;
  input.person.oas.fullMonthlyAmountAt65Today = 0;
  input.tax = {
    mode: "flat_compatibility",
    source: "explicit_configuration",
    effectiveTaxRate: 0,
    oasRecoveryThresholdToday: 1_000_000,
    oasRecoveryRate: 0,
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
      id: "synthetic:cash",
      label: "Synthetic cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 1,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "synthetic:rrsp",
      label: "Synthetic RRSP",
      origin: "lunchmoney",
      type: "rrsp_rrif",
      openingBalance: 1_000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 2,
      allocation: { cash: 0, fixedIncome: 1, equity: 0 },
    },
  ];
  input.nonFinancialAssets = [];
  input.liabilities = [];
  input.registeredAccountRoom = undefined;
  input.contributionWaterfall = {
    mode: "fixed_source_compatibility",
    routes: [],
    surplusDestinationAccountIds: ["synthetic:cash"],
  };
  input.surplusAllocation = {
    reserveAccountIds: ["synthetic:cash"],
    reserveRefillAccountId: "synthetic:cash",
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  input.savingsPolicy = { mode: "advanced" };
  input.events = [];
  return input;
}

function csvCells(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"' && quoted && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current);
  return cells;
}

describe("RRIF prescribed references", () => {
  it("uses the official All other RRIF factors without indexing", () => {
    expect(Object.keys(RRIF_REFERENCE_URLS)).toHaveLength(7);
    for (let age = 71; age <= 94; age += 1) {
      expect(rrifPrescribedFactor(age)).toMatchObject({
        age,
        factor:
          ALL_OTHER_RRIF_FACTORS[
            age as keyof typeof ALL_OTHER_RRIF_FACTORS
          ],
        factorClass: "all_other_rrifs_table",
        supportedRrifClass: "all_other_rrifs",
        indexed: false,
      });
    }
    for (const age of [50, 60, 69, 70]) {
      expect(rrifPrescribedFactor(age).factor).toBeCloseTo(
        1 / (90 - age),
        15,
      );
    }
    expect(rrifPrescribedFactor(95).factor).toBe(0.2);
    expect(rrifPrescribedFactor(110).factor).toBe(0.2);
  });

  it("records public source URLs, dates, class, and owner-age basis", () => {
    expect(RRIF_REFERENCE_RETRIEVED_DATE).toBe("2026-07-30");
    for (const url of Object.values(RRIF_REFERENCE_URLS)) {
      expect(url).toMatch(/^https:\/\/www\.canada\.ca\//);
    }
    for (const effectiveDate of Object.values(RRIF_REFERENCE_EFFECTIVE_DATES)) {
      expect(effectiveDate).toMatch(/^20\d\d-\d\d-\d\d$/);
    }
    expect(rrifPrescribedFactor(71)).toMatchObject({
      supportedRrifClass: "all_other_rrifs",
      ageBasis: "owner_age_at_beginning_of_year",
      indexed: false,
      sourceUrl: RRIF_REFERENCE_URLS.prescribedFactors,
      sourceEffectiveDate: RRIF_REFERENCE_EFFECTIVE_DATES.prescribedFactors,
    });
  });

  it("settles a raw minimum upward to the next cent without another cushion", () => {
    expect(settleRrifMinimum(52.8)).toBe(52.8);
    expect(settleRrifMinimum(52.800001)).toBe(52.81);
  });
});

describe("statutory RRIF lifecycle", () => {
  it("converts at month close and performs the hand-calculated next-year true-up", () => {
    const result = calculateProjection(statutoryRrifFixture());
    const establishment = result.annual.find(
      (row) => row.calendarYear === 2026,
    )!;
    const firstMinimum = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!;
    const lifecycle = result.rrif.accounts.find(
      (account) => account.accountId === "synthetic:rrsp",
    )!;
    const accountMinimum = firstMinimum.rrif.accounts.find(
      (account) => account.accountId === "synthetic:rrsp",
    )!;

    expect(lifecycle).toMatchObject({
      lifecycleState: "rrif",
      conversionDate: "2026-06-30",
      establishmentYear: 2026,
      conversionSource: "configured_age_boundary",
    });
    expect(establishment.milestones).toContain("RRIF conversion age");
    expect(establishment.rrif.minimumRequired).toBe(0);
    expect(establishment.rrif.accounts[0]!.status).toBe(
      "establishment_year_no_minimum",
    );
    expect(accountMinimum.openingFairMarketValue).toBe(1_000);
    expect(accountMinimum.ownerAgeAtBeginningOfYear).toBe(71);
    expect(accountMinimum.prescribedFactor).toBe(0.0528);
    expect(accountMinimum.rawMinimum).toBe(52.8);
    expect(accountMinimum.payableMinimum).toBe(52.8);
    expect(accountMinimum.ordinaryWithdrawals).toBe(0);
    expect(accountMinimum.forcedDecemberWithdrawal).toBe(52.8);
    expect(accountMinimum.actualWithdrawals).toBe(52.8);
    expect(accountMinimum.remainingMinimum).toBe(0);
    expect(accountMinimum.status).toBe("satisfied_by_december_true_up");
    expect(firstMinimum.nominal.withdrawals.rrspRrif).toBe(52.8);
    expect(firstMinimum.nominal.balances.rrspRrif).toBe(947.2);
    expect(firstMinimum.nominal.balances.cash).toBe(53.8);
    expect(firstMinimum.nominal.balances.financialAssets).toBe(1_001);
  });

  it("captures January 1 before returns and does not recalculate the minimum", () => {
    const input = statutoryRrifFixture();
    input.accounts[1]!.annualReturn = 0.12;
    const result = calculateProjection(input);
    const account = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!.rrif.accounts.find(
      (entry) => entry.accountId === "synthetic:rrsp",
    )!;
    expect(account.openingFairMarketValue).toBeCloseTo(
      input.accounts[1]!.openingBalance * 1.12,
      8,
    );
    expect(account.rawMinimum).toBeCloseTo(
      account.openingFairMarketValue! * 0.0528,
      8,
    );
    expect(account.payableMinimum).toBe(
      settleRrifMinimum(account.rawMinimum),
    );
    expect(account.forcedDecemberWithdrawal).toBe(account.payableMinimum);
  });

  it("counts ordinary December RRIF income before the per-account true-up", () => {
    const input = statutoryRrifFixture();
    input.accounts[0]!.openingBalance = 0;
    input.events = [
      {
        id: "synthetic:december-outflow",
        label: "Synthetic December outflow",
        calendarYear: 2027,
        month: 12,
        amountToday: 20,
        direction: "outflow",
      },
    ];
    const result = calculateProjection(input);
    const period = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!.rrif;
    expect(period.ordinaryWithdrawals).toBe(20);
    expect(period.forcedDecemberWithdrawal).toBe(32.8);
    expect(period.actualWithdrawals).toBe(52.8);
    expect(period.remainingMinimum).toBe(0);
  });

  it("does not force a withdrawal when ordinary RRIF withdrawals exceed the minimum", () => {
    const input = statutoryRrifFixture();
    input.accounts[0]!.openingBalance = 0;
    input.events = [
      {
        id: "synthetic:large-december-outflow",
        label: "Synthetic large December outflow",
        calendarYear: 2027,
        month: 12,
        amountToday: 60,
        direction: "outflow",
      },
    ];
    const period = calculateProjection(input).annual.at(-1)!.rrif;
    expect(period.ordinaryWithdrawals).toBe(60);
    expect(period.forcedDecemberWithdrawal).toBe(0);
    expect(period.actualWithdrawals).toBe(60);
    expect(period.accounts[0]!.status).toBe(
      "satisfied_by_ordinary_withdrawals",
    );
  });

  it("calculates multiple RRIF accounts independently", () => {
    const input = statutoryRrifFixture();
    input.accounts.push({
      ...structuredClone(input.accounts[1]!),
      id: "synthetic:second-rrsp",
      label: "Synthetic second RRSP",
      withdrawalPriority: 3,
    });
    const result = calculateProjection(input);
    const period = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!.rrif;
    expect(period.accounts).toHaveLength(2);
    expect(period.accounts.map((account) => account.payableMinimum)).toEqual([
      52.8,
      52.8,
    ]);
    expect(period.minimumRequired).toBe(105.6);
    expect(period.forcedDecemberWithdrawal).toBe(105.6);
  });

  it("does not let one account's ordinary withdrawal satisfy another account", () => {
    const input = statutoryRrifFixture();
    input.accounts[0]!.openingBalance = 0;
    input.accounts.push({
      ...structuredClone(input.accounts[1]!),
      id: "synthetic:second-rrsp",
      label: "Synthetic second RRSP",
      withdrawalPriority: 3,
    });
    input.events = [
      {
        id: "synthetic:first-account-outflow",
        label: "Synthetic first-account outflow",
        calendarYear: 2027,
        month: 12,
        amountToday: 20,
        direction: "outflow",
      },
    ];
    const accounts = calculateProjection(input).annual.at(-1)!.rrif.accounts;
    expect(accounts[0]).toMatchObject({
      ordinaryWithdrawals: 20,
      forcedDecemberWithdrawal: 32.8,
    });
    expect(accounts[1]).toMatchObject({
      ordinaryWithdrawals: 0,
      forcedDecemberWithdrawal: 52.8,
    });
  });

  it("converts in December without creating a setup-year minimum", () => {
    const input = statutoryRrifFixture();
    input.person.rrifConversionAge = 71;
    const result = calculateProjection(input);
    expect(result.rrif.accounts[0]).toMatchObject({
      conversionDate: "2026-12-31",
      establishmentYear: 2026,
    });
    expect(result.annual[0]!.rrif.minimumRequired).toBe(0);
    expect(result.annual[0]!.rrif.forcedDecemberWithdrawal).toBe(0);
    expect(result.annual[1]!.rrif.minimumRequired).toBe(52.8);
  });

  it("withdraws only available property and reports exhaustion honestly", () => {
    const input = statutoryRrifFixture();
    input.accounts[1]!.annualReturn = -0.99;
    const result = calculateProjection(input);
    const account = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!.rrif.accounts.find(
      (entry) => entry.accountId === "synthetic:rrsp",
    )!;
    expect(account.payableMinimum).toBeGreaterThan(0);
    expect(account.actualWithdrawals).toBeLessThan(account.payableMinimum);
    expect(account.remainingMinimum).toBeGreaterThan(0);
    expect(account.status).toBe("account_exhausted");
    expect(result.annual.at(-1)!.nominal.balances.rrspRrif).toBe(0);
  });

  it("does not fabricate a December true-up in a partial final year", () => {
    const input = statutoryRrifFixture();
    input.endAge = 71.5;
    input.spendingPhases[0]!.endAge = 71.5;
    const result = calculateProjection(input);
    const period = result.annual.at(-1)!.rrif;
    expect(period.periodStatus).toBe("partial_period");
    expect(period.minimumRequired).toBe(52.8);
    expect(period.forcedDecemberWithdrawal).toBe(0);
    expect(period.remainingMinimum).toBe(52.8);
    expect(period.accounts[0]!.status).toBe("partial_year_unsettled");
  });

  it("classifies statutory withdrawals as RRIF income with age-eligible pension credit", () => {
    const input = statutoryRrifFixture();
    input.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
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
          otherTaxableIncome: 0,
        },
        source: "january_zero",
      },
      limitations: [
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    input.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      0;
    const result = calculateProjection(input);
    const tax = result.annual.find(
      (row) => row.calendarYear === 2027,
    )!.tax;
    expect(tax.mode).toBe("canadian_annual");
    if (tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(tax.totalIncome.rrspWithdrawals).toBe(0);
    expect(tax.totalIncome.rrifWithdrawals).toBe(52.8);
    expect(tax.fullAnnualTax.eligiblePensionIncome).toBe(52.8);
    expect(tax.reconciled).toBe(true);
  });

  it("classifies boundary-year withdrawals as RRSP before and RRIF after month-close conversion", () => {
    const input = statutoryRrifFixture();
    input.accounts[0]!.openingBalance = 0;
    input.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
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
          otherTaxableIncome: 0,
        },
        source: "january_zero",
      },
      limitations: [
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    input.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      0;
    input.events = [
      {
        id: "synthetic:pre-conversion",
        label: "Synthetic pre-conversion outflow",
        calendarYear: 2026,
        month: 3,
        amountToday: 10,
        direction: "outflow",
      },
      {
        id: "synthetic:post-conversion",
        label: "Synthetic post-conversion outflow",
        calendarYear: 2026,
        month: 7,
        amountToday: 10,
        direction: "outflow",
      },
    ];
    const tax = calculateProjection(input).annual[0]!.tax;
    expect(tax.mode).toBe("canadian_annual");
    if (tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(tax.totalIncome.rrspWithdrawals).toBe(10);
    expect(tax.totalIncome.rrifWithdrawals).toBe(10);
  });

  it("prohibits contributions after conversion while preserving pre-conversion deposits", () => {
    const input = statutoryRrifFixture();
    input.person.retirementAge = 71.5;
    input.person.employmentIncomePhases[0] = {
      id: "synthetic-employment",
      label: "Synthetic employment",
      startAge: 70,
      endAge: 71.5,
      annualNetCashToday: 1_200,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    };
    input.accounts[1]!.contributionPhases = [
      {
        id: "synthetic-rrsp-saving",
        label: "Synthetic RRSP saving",
        startAge: 70,
        endAge: 71.5,
        monthlyAmountToday: 50,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    input.registeredAccountRoom = structuredClone(
      projectionFixture.registeredAccountRoom,
    );
    input.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth.calendarYear =
      2026;
    input.contributionWaterfall.routes = [
      {
        sourceAccountId: "synthetic:rrsp",
        destinationAccountIds: ["synthetic:rrsp"],
      },
    ];
    const firstYear = calculateProjection(input).annual[0]!;
    expect(firstYear.nominal.contributions.planned).toBe(600);
    expect(firstYear.nominal.contributions.allowed).toBe(300);
    expect(firstYear.nominal.contributions.unallocated).toBe(300);
  });

  it("routes an unneeded forced withdrawal through TFSA room and taxable overflow", () => {
    const input = statutoryRrifFixture();
    input.accounts[1]!.openingBalance = 200_000;
    input.accounts.push(
      {
        id: "synthetic:tfsa",
        label: "Synthetic TFSA",
        origin: "lunchmoney",
        type: "tfsa",
        openingBalance: 0,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 3,
        allocation: { cash: 0, fixedIncome: 1, equity: 0 },
      },
      {
        id: "projection:taxable",
        label: "Synthetic taxable",
        origin: "projection_configuration",
        type: "non_registered",
        openingBalance: 0,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 4,
        allocation: { cash: 0, fixedIncome: 1, equity: 0 },
      },
    );
    input.registeredAccountRoom = {
      tfsa: {
        startingAvailableRoom: {
          source: "configured_amount",
          amount: 20,
          sourceDescription: "Synthetic room",
          effectiveDate: "2026-01-01",
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
          source: "explicit_zero",
          amount: 0,
          sourceDescription: "Synthetic zero room",
          effectiveDate: "2026-01-01",
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
      surplusDestinationAccountIds: [
        "synthetic:tfsa",
        "projection:taxable",
      ],
    };
    input.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    const last = calculateProjection(input).annual.at(-1)!.nominal;
    expect(last.balances.tfsa).toBeGreaterThan(0);
    expect(last.balances.nonRegistered).toBeGreaterThan(0);
    expect(last.accountContributions["synthetic:rrsp"] ?? 0).toBe(0);
    expect(last.balances.financialAssets).toBe(200_001);
  });

  it("uses the same RRIF engine in exact-cent retirement requirement candidates", () => {
    const statutory = statutoryRrifFixture();
    statutory.accounts[1]!.openingBalance = 500_000;
    statutory.retirementRequirement.minimumEndingFinancialAssetsToday =
      450_000;
    statutory.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
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
          otherTaxableIncome: 0,
        },
        source: "january_zero",
      },
      limitations: [
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    statutory.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      0;
    const compatibility = structuredClone(statutory);
    compatibility.rrifMinimumWithdrawals = {
      mode: "not_modelled_compatibility",
      source: "explicit_configuration",
    };

    const active = calculateProjection(statutory).retirementRequirement;
    const inactive = calculateProjection(compatibility).retirementRequirement;
    expect(active.status).toBe("available");
    expect(active.requiredFinancialAssetsToday).toBeGreaterThan(
      inactive.requiredFinancialAssetsToday!,
    );
    expect(active.solver.acceptedCandidatePassed).toBe(true);
    expect(active.solver.oneCentBelowFailed).toBe(true);
  });

  it("blocks unsupported opening RRIF context and conversion after age 71", () => {
    const alreadyConverted = statutoryRrifFixture();
    alreadyConverted.person.currentAge = 71;
    alreadyConverted.person.retirementAge = 71.5;
    alreadyConverted.person.rrifConversionAge = 70;
    alreadyConverted.endAge = 72;
    alreadyConverted.spendingPhases[0]!.startAge = 71;
    alreadyConverted.person.employmentIncomePhases[0]!.startAge = 71;
    alreadyConverted.person.employmentIncomePhases[0]!.endAge = 71.5;
    expect(() => calculateProjection(alreadyConverted)).toThrow(
      "require opening RRIF context",
    );

    const late = statutoryRrifFixture();
    late.person.rrifConversionAge = 72;
    expect(() => calculateProjection(late)).toThrow(
      "no greater than 71",
    );
  });

  it("exports allowlisted RRIF evidence with rectangular nominal and real rows", () => {
    const input = statutoryRrifFixture();
    input.accounts[0]!.id = "manual:1";
    input.accounts[1]!.id = "manual:2";
    input.contributionWaterfall.surplusDestinationAccountIds = ["manual:1"];
    input.surplusAllocation.reserveAccountIds = ["manual:1"];
    input.surplusAllocation.reserveRefillAccountId = "manual:1";
    const projection = calculateProjection(input);
    const snapshot = createProjectionSnapshot(
      projection,
      { ...baselineContextFixture, projectionInputs: input },
      {},
      "2026-07-30T12:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("manual:2");
    expect(snapshot.projection.rrif.accounts[0]!.accountId).toBe(
      "rrsp_1",
    );
    expect(snapshot.projection.rrif.mode).toBe("statutory");

    for (const dollarMode of ["nominal", "real"] as const) {
      const lines = projectionSnapshotToCsv(snapshot, dollarMode).split("\n");
      const headers = csvCells(lines[0]!);
      expect(headers).toContain("rrif_mode");
      expect(headers).toContain("rrif_minimum_required");
      expect(headers).toContain("rrif_forced_december_withdrawal");
      for (const line of lines.slice(1)) {
        expect(csvCells(line)).toHaveLength(headers.length);
      }
      const last = csvCells(lines.at(-1)!);
      expect(last[headers.indexOf("rrif_mode")]).toBe("statutory");
      expect(last[headers.indexOf("rrif_satisfied")]).toBe("1");
    }
  });

  it("is deterministic including lifecycle, annual ledgers, and solver evidence", () => {
    const first = calculateProjection(statutoryRrifFixture());
    const second = calculateProjection(statutoryRrifFixture());
    expect(second.rrif).toEqual(first.rrif);
    expect(second.retirementRequirement.solver).toEqual(
      first.retirementRequirement.solver,
    );
  });

  it("keeps omitted compatibility mode financially unchanged", () => {
    const input = statutoryRrifFixture();
    input.rrifMinimumWithdrawals = {
      mode: "not_modelled_compatibility",
      source: "compatibility_default",
    };
    const result = calculateProjection(input);
    expect(result.rrif.mode).toBe("not_modelled_compatibility");
    expect(result.rrif.accounts[0]).toMatchObject({
      lifecycleState: "rrsp",
      conversionDate: null,
      conversionSource: "compatibility_milestone_only",
    });
    expect(result.annual.at(-1)!.nominal.balances.rrspRrif).toBe(1_000);
    expect(result.annual.at(-1)!.rrif.forcedDecemberWithdrawal).toBe(0);
  });
});
