import { describe, expect, it } from "vitest";
import {
  calculateProjection,
  cppClaimFactor,
  oasClaimFactor,
} from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { projectionFixture } from "./fixtures/projection";

function oneYearFixture(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-15";
  input.person.currentAge = 40;
  input.person.retirementAge = 41;
  input.endAge = 41;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.person.employmentIncomePhases = [
    {
      id: "working-year",
      label: "Working year",
      startAge: 40,
      endAge: 41,
      annualNetCashToday: 0,
      annualGrowth: 0,
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.startAge = 65;
  input.person.oas.startAge = 65;
  input.events = [];
  input.accounts = input.accounts.map((account) => ({
    ...account,
    annualReturn: 0,
    contributionPhases: [],
  }));
  input.accounts[0]!.openingBalance = 100000;
  input.accounts[1]!.openingBalance = 0;
  return input;
}

function bridgeEnding(result: ReturnType<typeof calculateProjection>, mode: "real" | "nominal") {
  const bridge = result.financialAssetsBridge[mode];
  return (
    bridge.startingFinancialAssets +
    bridge.employmentNetCash +
    bridge.publicBenefitsAndPension +
    bridge.otherInflows +
    bridge.incomeWithheldContributions +
    bridge.investmentReturns -
    bridge.essentialSpending -
    bridge.discretionarySpending -
    bridge.oneTimeOutflows -
    bridge.taxes
  );
}

describe("public benefit timing", () => {
  it("applies current CPP early and delayed-claim factors", () => {
    expect(cppClaimFactor(60)).toBeCloseTo(0.64);
    expect(cppClaimFactor(65)).toBe(1);
    expect(cppClaimFactor(70)).toBeCloseTo(1.42);
  });

  it("applies the OAS deferral factor", () => {
    expect(oasClaimFactor(65)).toBe(1);
    expect(oasClaimFactor(70)).toBeCloseTo(1.36);
  });
});

describe("resolved employment-income phases", () => {
  it("uses two phases month by month and stops income at each configured boundary", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 42;
    input.endAge = 42;
    input.person.employmentIncomePhases = [
      {
        id: "high-income",
        label: "High income",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0,
      },
      {
        id: "lower-income",
        label: "Lower income",
        startAge: 41,
        endAge: 42,
        annualNetCashToday: 6000,
        annualGrowth: 0,
      },
    ];

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.income.employment).toBe(12000);
    expect(result.annual[1]!.nominal.income.employment).toBe(6000);
    expect(result.annual[0]!.employmentPhaseLabels).toEqual(["High income"]);
    expect(result.annual[1]!.employmentPhaseLabels).toEqual(["Lower income"]);
  });

  it("resets phase-local growth when a new phase begins", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 42;
    input.endAge = 42;
    input.person.employmentIncomePhases = [
      {
        id: "growing",
        label: "Growing",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0.12,
      },
      {
        id: "reset",
        label: "Reset",
        startAge: 41,
        endAge: 42,
        annualNetCashToday: 12000,
        annualGrowth: 0,
      },
    ];

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.income.employment).toBeGreaterThan(12000);
    expect(result.annual[1]!.nominal.income.employment).toBe(12000);
  });

  it("a lower future-income phase materially reduces assets at retirement", () => {
    const uninterrupted = structuredClone(projectionFixture);
    const phased = structuredClone(projectionFixture);
    phased.person.employmentIncomePhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 42,
        annualNetCashToday: 84000,
        annualGrowth: 0.02,
      },
      {
        id: "future",
        label: "Future",
        startAge: 42,
        endAge: 65,
        annualNetCashToday: 50000,
        annualGrowth: 0,
      },
    ];

    expect(
      calculateProjection(phased).summary.financialAssetsAtRetirementToday,
    ).toBeLessThan(
      calculateProjection(uninterrupted).summary.financialAssetsAtRetirementToday,
    );
  });

  it("rejects gaps, overlaps, duplicate ids, and unresolved income strings", () => {
    const gap = oneYearFixture();
    gap.person.retirementAge = 42;
    gap.endAge = 42;
    gap.person.employmentIncomePhases = [
      { id: "one", label: "One", startAge: 40, endAge: 41, annualNetCashToday: 1, annualGrowth: 0 },
      { id: "two", label: "Two", startAge: 41.5, endAge: 42, annualNetCashToday: 1, annualGrowth: 0 },
    ];
    expect(() => calculateProjection(gap)).toThrow("gap");

    const overlap = structuredClone(gap);
    overlap.person.employmentIncomePhases[1]!.startAge = 40.5;
    expect(() => calculateProjection(overlap)).toThrow("overlap");

    const duplicate = structuredClone(gap);
    duplicate.person.employmentIncomePhases[1]!.startAge = 41;
    duplicate.person.employmentIncomePhases[1]!.id = "one";
    expect(() => calculateProjection(duplicate)).toThrow("unique");

    const unresolved = oneYearFixture();
    (
      unresolved.person.employmentIncomePhases[0] as unknown as Record<string, unknown>
    ).annualNetCashToday = "live_baseline";
    expect(() => calculateProjection(unresolved)).toThrow(
      "annualNetCashToday must be resolved before projection",
    );

    const empty = oneYearFixture();
    empty.person.employmentIncomePhases = [];
    expect(() => calculateProjection(empty)).toThrow(
      "At least one resolved employment income phase is required",
    );
  });
});

describe("resolved contribution phases", () => {
  it("ends a workplace contribution and begins a later TFSA contribution at the transition", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 42;
    input.endAge = 42;
    input.person.employmentIncomePhases[0]!.endAge = 42;
    input.accounts[1]!.contributionPhases = [
      {
        id: "workplace",
        label: "Workplace",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 100,
        funding: "income_withheld",
        indexingRate: 0,
      },
    ];
    input.accounts.push({
      id: "manual:later-tfsa",
      label: "Later TFSA",
      type: "tfsa",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [
        {
          id: "later-tfsa",
          label: "Later TFSA",
          startAge: 41,
          endAge: 42,
          monthlyAmountToday: 200,
          funding: "cash",
          indexingRate: 0,
        },
      ],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    });

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.contributions.incomeWithheld).toBe(1200);
    expect(result.annual[0]!.nominal.contributions.cashFunded).toBe(0);
    expect(result.annual[1]!.nominal.contributions.incomeWithheld).toBe(0);
    expect(result.annual[1]!.nominal.contributions.cashFunded).toBe(2400);
    expect(result.annual[0]!.nominal.accountContributions["manual:2"]).toBe(1200);
    expect(
      result.annual[1]!.nominal.accountContributions["manual:later-tfsa"],
    ).toBe(2400);
  });

  it("treats gaps as zero contribution and zero-valued phases as no contribution", () => {
    const input = oneYearFixture();
    input.accounts[1]!.contributionPhases = [
      {
        id: "later",
        label: "Later",
        startAge: 40.5,
        endAge: 41,
        monthlyAmountToday: 100,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    const result = calculateProjection(input);
    expect(result.annual[0]!.nominal.contributions.total).toBe(600);
    expect(result.retirementSnapshot.nominal.contributions.total).toBe(100);

    input.accounts[1]!.contributionPhases[0]!.monthlyAmountToday = 0;
    expect(calculateProjection(input).retirementSnapshot.nominal.contributions.total).toBe(0);
  });

  it("keeps cash-funded transfers distinct from income-withheld external additions", () => {
    const cashFunded = oneYearFixture();
    cashFunded.accounts[1]!.contributionPhases = [
      {
        id: "saving",
        label: "Saving",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 1200,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    const incomeWithheld = structuredClone(cashFunded);
    incomeWithheld.accounts[1]!.contributionPhases[0]!.funding = "income_withheld";

    const cashResult = calculateProjection(cashFunded);
    const withheldResult = calculateProjection(incomeWithheld);

    expect(cashResult.retirementSnapshot.nominal.accountBalances["manual:2"]).toBe(14400);
    expect(cashResult.financialAssetsBridge.nominal.incomeWithheldContributions).toBe(0);
    expect(cashResult.financialAssetsBridge.nominal.endingFinancialAssets).toBe(100000);
    expect(withheldResult.financialAssetsBridge.nominal.incomeWithheldContributions).toBe(14400);
    expect(withheldResult.financialAssetsBridge.nominal.endingFinancialAssets).toBe(114400);
  });

  it("rejects contribution phases on cash and debt accounts", () => {
    const input = oneYearFixture();
    input.accounts[0]!.contributionPhases = [
      {
        id: "invalid",
        label: "Invalid",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 10,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    expect(() => calculateProjection(input)).toThrow(
      "Contribution phases may only be configured for investment account",
    );
  });
});

describe("exact retirement snapshot and accumulation bridge", () => {
  it("captures an integer-age retirement after the final working month", () => {
    const result = calculateProjection(oneYearFixture());

    expect(result.schemaVersion).toBe("4.0");
    expect(result.retirementSnapshot.calendarDate).toBe("2026-12-31");
    expect(result.retirementSnapshot.age).toBe(41);
    expect(result.retirementSnapshot.flowPeriod).toEqual({
      kind: "final_working_month",
      calendarMonth: "2026-12",
    });
    expect(result.summary.retirementDate).toBe("2026-12-31");
  });

  it("keeps snapshot flows monthly while balances and the bridge retain retirement totals", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 55;
    input.endAge = 55;
    input.person.employmentIncomePhases = [{
      id: "fifteen-working-years",
      label: "Fifteen working years",
      startAge: 40,
      endAge: 55,
      annualNetCashToday: 12000,
      annualGrowth: 0,
    }];
    input.accounts[1]!.contributionPhases = [{
      id: "fifteen-saving-years",
      label: "Fifteen saving years",
      startAge: 40,
      endAge: 55,
      monthlyAmountToday: 100,
      funding: "cash",
      indexingRate: 0,
    }];

    const result = calculateProjection(input);
    const finalAnnualRow = result.annual.at(-1)!;

    expect(result.annual).toHaveLength(15);
    expect(result.annual.map((row) => row.nominal.income.employment))
      .toEqual(Array.from({ length: 15 }, () => 12000));
    expect(result.annual.map((row) => row.nominal.contributions.total))
      .toEqual(Array.from({ length: 15 }, () => 1200));
    expect(result.retirementSnapshot.nominal.income.employment).toBe(1000);
    expect(result.retirementSnapshot.nominal.contributions.total).toBe(100);
    expect(
      result.retirementSnapshot.nominal.accountContributions["manual:2"],
    ).toBe(100);
    expect(result.retirementSnapshot.nominal.balances).toEqual(
      finalAnnualRow.nominal.balances,
    );
    expect(result.retirementSnapshot.nominal.accountBalances).toEqual(
      finalAnnualRow.nominal.accountBalances,
    );
    expect(result.financialAssetsBridge.nominal.employmentNetCash).toBe(180000);
    expect(result.financialAssetsBridge.nominal.endingFinancialAssets).toBe(280000);
    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
  });

  it("captures a mid-calendar-year retirement instead of the following December snapshot", () => {
    const input = oneYearFixture();
    input.startDate = "2026-07-15";
    input.endAge = 42;
    input.accounts[0]!.annualReturn = 0.12;
    const result = calculateProjection(input);

    expect(result.retirementSnapshot.calendarDate).toBe("2027-06-30");
    expect(result.summary.financialAssetsAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.financialAssets,
    );
    const followingDecember = result.annual.find(
      (point) => point.calendarYear === 2027,
    )!;
    expect(followingDecember.age).toBe(41.5);
    expect(result.summary.financialAssetsAtRetirementToday).not.toBe(
      followingDecember.real.balances.financialAssets,
    );
  });

  it("has no employment income or contribution after retirement", () => {
    const input = oneYearFixture();
    input.endAge = 42;
    const result = calculateProjection(input);
    const retiredRow = result.annual.find((point) => point.age === 42)!;

    expect(retiredRow.nominal.income.employment).toBe(0);
    expect(retiredRow.nominal.contributions.total).toBe(0);
  });

  it("reconciles real and nominal bridges within one cent", () => {
    const result = calculateProjection(projectionFixture);

    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
    expect(bridgeEnding(result, "real")).toBeCloseTo(
      result.summary.financialAssetsAtRetirementToday,
      2,
    );
  });

  it("includes actual investment returns and future events in the bridge", () => {
    const input = oneYearFixture();
    input.accounts[0]!.annualReturn = 0.12;
    input.events = [
      {
        id: "inflow",
        label: "Inflow",
        calendarYear: 2026,
        month: 3,
        amountToday: 1000,
        direction: "inflow",
      },
      {
        id: "outflow",
        label: "Outflow",
        calendarYear: 2026,
        month: 6,
        amountToday: 500,
        direction: "outflow",
      },
    ];
    const result = calculateProjection(input);

    expect(result.financialAssetsBridge.nominal.investmentReturns).toBeGreaterThan(0);
    expect(result.financialAssetsBridge.nominal.otherInflows).toBe(1000);
    expect(result.financialAssetsBridge.nominal.oneTimeOutflows).toBe(500);
    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
  });
});

describe("annual presentation compatibility", () => {
  it("retains account balances, benefit streams, milestones, and partial-year rows", () => {
    const result = calculateProjection(projectionFixture);
    expect(result.annual.length).toBeGreaterThan(40);
    expect(result.annual[0]!.nominal.accountBalances["manual:1"]).toBeDefined();
    expect(result.annual.at(-1)!.age).toBe(projectionFixture.endAge);
    expect(result.annual.some((point) => point.nominal.income.cpp > 0)).toBe(true);
    expect(result.annual.some((point) => point.nominal.income.oas > 0)).toBe(true);
    expect(result.annual.flatMap((point) => point.milestones)).toEqual(
      expect.arrayContaining(["Retirement", "CPP begins", "OAS begins", "RRIF conversion age"]),
    );
  });

  it("keeps debt out of financial assets and the retirement bridge", () => {
    const input = structuredClone(projectionFixture);
    input.accounts.push({
      id: "manual:3",
      label: "Debt",
      type: "debt",
      openingBalance: 50000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 999,
      allocation: { cash: 0, fixedIncome: 0, equity: 0 },
    });
    const result = calculateProjection(input);

    expect(result.retirementSnapshot.real.balances.netWorth).toBeLessThan(
      result.retirementSnapshot.real.balances.financialAssets,
    );
    expect(result.financialAssetsBridge.real.startingFinancialAssets).toBe(200000);
  });
});
