import { describe, expect, it } from "vitest";
import { calculateProjection, cppClaimFactor, oasClaimFactor } from "@/src/domain/projection/calculate";
import { projectionFixture } from "./fixtures/projection";

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

describe("single-person projection", () => {
  it("produces one annual report and account-level balances", () => {
    const result = calculateProjection(projectionFixture);
    expect(result.schemaVersion).toBe("3.0");
    expect(result.annual.length).toBeGreaterThan(40);
    expect(result.annual[0]?.nominal.accountBalances["manual:1"]).toBeDefined();
    expect(result.annual.at(-1)?.age).toBe(projectionFixture.endAge);
  });

  it("shows CPP and OAS as separate income streams after their start ages", () => {
    const result = calculateProjection(projectionFixture);
    const afterBenefits = result.annual.find(
      (point) => point.nominal.income.cpp > 0 && point.nominal.income.oas > 0,
    );
    expect(afterBenefits?.nominal.income.cpp).toBeGreaterThan(0);
    expect(afterBenefits?.nominal.income.oas).toBeGreaterThan(0);
  });

  it("uses financial assets rather than net worth for the retirement goal comparison", () => {
    const withDebt = structuredClone(projectionFixture);
    withDebt.accounts.push({
      id: "manual:3",
      label: "Debt",
      type: "debt",
      openingBalance: 50000,
      annualReturn: 0,
      monthlyContributionToday: 0,
      contributionIndexingRate: 0,
      withdrawalPriority: 999,
      allocation: { cash: 0, fixedIncome: 0, equity: 0 },
    });
    const result = calculateProjection(withDebt);
    const retirement = result.annual.find((point) => point.calendarYear === result.summary.retirementYear)!;
    expect(result.summary.financialAssetsAtRetirementToday).toBe(
      retirement.real.balances.financialAssets,
    );
    expect(retirement.real.balances.netWorth).toBeLessThan(retirement.real.balances.financialAssets);
  });

  it("keeps financial account balances non-negative and records withdrawals", () => {
    const stressed = structuredClone(projectionFixture);
    stressed.monthlyEssentialSpendingToday = 12000;
    stressed.monthlyDiscretionarySpendingToday = 3000;
    const result = calculateProjection(stressed);
    expect(result.annual.some((point) => point.nominal.withdrawals.total > 0)).toBe(true);
    expect(
      result.annual.every((point) =>
        Object.values(point.nominal.accountBalances).every((balance) => balance >= 0),
      ),
    ).toBe(true);
  });

  it("retains retirement, CPP, OAS, and RRIF milestone markers", () => {
    const milestones = calculateProjection(projectionFixture).annual.flatMap((point) => point.milestones);
    expect(milestones).toContain("Retirement");
    expect(milestones).toContain("CPP begins");
    expect(milestones).toContain("OAS begins");
    expect(milestones).toContain("RRIF conversion age");
  });

  it("does not tax net deposited employment cash but still taxes gross retirement income and RRSP withdrawals", () => {
    const employment = structuredClone(projectionFixture);
    employment.startDate = "2026-01-15";
    employment.endAge = 41;
    employment.person.retirementAge = 41;
    employment.person.annualIncomeGrowth = 0;
    employment.person.annualPensionToday = 0;
    employment.monthlyEssentialSpendingToday = 0;
    employment.monthlyDiscretionarySpendingToday = 0;
    employment.events = [];
    for (const account of employment.accounts) {
      account.annualReturn = 0;
      account.monthlyContributionToday = 0;
    }
    const employmentResult = calculateProjection(employment);
    expect(employmentResult.annual[0]?.nominal.income.employment).toBe(77000);
    expect(employmentResult.annual[0]?.nominal.outflows.tax).toBe(0);

    const retirement = structuredClone(projectionFixture);
    retirement.startDate = "2026-07-14";
    retirement.person.currentAge = 64.5;
    retirement.person.retirementAge = 65;
    retirement.endAge = 66;
    retirement.person.annualEmploymentNetCashToday = 0;
    retirement.person.annualPensionToday = 12000;
    retirement.person.pensionStartAge = 65;
    retirement.monthlyEssentialSpendingToday = 20000;
    retirement.monthlyDiscretionarySpendingToday = 0;
    retirement.events = [];
    for (const account of retirement.accounts) {
      account.annualReturn = 0;
      account.monthlyContributionToday = 0;
    }
    const retirementResult = calculateProjection(retirement);
    expect(retirementResult.annual.some((point) => point.nominal.income.pension > 0)).toBe(true);
    expect(retirementResult.annual.some((point) => point.nominal.withdrawals.rrspRrif > 0)).toBe(true);
    expect(retirementResult.annual.some((point) => point.nominal.outflows.tax > 0)).toBe(true);
  });

  it("always invests contributions and reduces cash only for cash-funded contributions", () => {
    const cashFunded = structuredClone(projectionFixture);
    cashFunded.startDate = "2026-01-15";
    cashFunded.endAge = 41;
    cashFunded.person.retirementAge = 41;
    cashFunded.person.annualEmploymentNetCashToday = 0;
    cashFunded.monthlyEssentialSpendingToday = 0;
    cashFunded.monthlyDiscretionarySpendingToday = 0;
    cashFunded.events = [];
    for (const account of cashFunded.accounts) account.annualReturn = 0;
    cashFunded.accounts[0]!.openingBalance = 100000;
    cashFunded.accounts[1]!.openingBalance = 0;
    cashFunded.accounts[1]!.monthlyContributionToday = 1200;
    cashFunded.accounts[1]!.contributionIndexingRate = 0;
    cashFunded.accounts[1]!.contributionFunding = "cash";

    const incomeWithheld = structuredClone(cashFunded);
    incomeWithheld.accounts[1]!.contributionFunding = "income_withheld";
    const cashResult = calculateProjection(cashFunded);
    const withheldResult = calculateProjection(incomeWithheld);

    expect(cashResult.annual[0]?.nominal.accountBalances["manual:2"]).toBe(13200);
    expect(withheldResult.annual[0]?.nominal.accountBalances["manual:2"]).toBe(13200);
    expect(cashResult.annual[0]?.nominal.outflows.contributions).toBe(13200);
    expect(withheldResult.annual[0]?.nominal.outflows.contributions).toBe(0);
    expect(withheldResult.annual[0]!.nominal.balances.cash).toBe(
      cashResult.annual[0]!.nominal.balances.cash + 13200,
    );

    const missingChoice = structuredClone(cashFunded);
    delete missingChoice.accounts[1]!.contributionFunding;
    expect(() => calculateProjection(missingChoice)).toThrow(
      "contributionFunding is required for manual:2",
    );
  });

  it("anchors partial annual rows, events, benefits, and milestones to the live start month", () => {
    const calendar = structuredClone(projectionFixture);
    calendar.startDate = "2026-07-14";
    calendar.person.currentAge = 64.5;
    calendar.person.retirementAge = 65;
    calendar.person.rrifConversionAge = 65;
    calendar.person.cpp.startAge = 65;
    calendar.person.oas.startAge = 65;
    calendar.person.annualIncomeGrowth = 0;
    calendar.endAge = 66;
    calendar.annualInflation = 0;
    calendar.monthlyEssentialSpendingToday = 0;
    calendar.monthlyDiscretionarySpendingToday = 0;
    calendar.accounts[1]!.monthlyContributionToday = 0;
    calendar.events = [
      {
        id: "august-event",
        label: "August event",
        calendarYear: 2026,
        month: 8,
        amountToday: 1234,
        direction: "inflow",
      },
    ];

    const result = calculateProjection(calendar);
    expect(result.annual.map((point) => point.calendarYear)).toEqual([2026, 2027]);
    expect(result.annual[0]?.age).toBe(65);
    expect(result.annual[0]?.nominal.income.employment).toBe(35000);
    expect(result.annual[0]?.nominal.income.other).toBe(1234);
    expect(result.annual[0]?.nominal.income.cpp).toBeGreaterThan(0);
    expect(result.annual[0]?.milestones).toEqual(
      expect.arrayContaining(["Retirement", "CPP begins", "OAS begins", "RRIF conversion age"]),
    );
    expect(result.summary.retirementYear).toBe(2026);
    expect(result.annual[1]?.age).toBe(66);
  });
});

function annualRollupFixture(startDate = "2026-01-15") {
  const input = structuredClone(projectionFixture);
  input.startDate = startDate;
  input.person.currentAge = 40;
  input.person.retirementAge = 42;
  input.endAge = 42;
  input.annualInflation = 0.12;
  input.person.annualEmploymentNetCashToday = 12000;
  input.person.annualIncomeGrowth = input.annualInflation;
  input.monthlyEssentialSpendingToday = 800;
  input.monthlyDiscretionarySpendingToday = 400;
  input.events = [
    {
      id: "rollup-event",
      label: "Rollup event",
      calendarYear: 2026,
      month: 6,
      amountToday: 600,
      direction: "outflow",
    },
  ];
  for (const account of input.accounts) account.annualReturn = 0;
  input.accounts[0]!.openingBalance = 120000;
  input.accounts[1]!.openingBalance = 0;
  input.accounts[1]!.monthlyContributionToday = 100;
  input.accounts[1]!.contributionIndexingRate = input.annualInflation;
  return input;
}

describe("annual today-dollar rollups", () => {
  it("sums a full year of constant real monthly flows before rounding the annual view", () => {
    const row = calculateProjection(annualRollupFixture()).annual[0]!;

    expect(row.real.income.employment).toBe(12000);
    expect(row.real.outflows.essential).toBe(9600);
    expect(row.real.outflows.discretionary).toBe(4800);
    expect(row.real.outflows.contributions).toBe(1200);
    expect(row.real.outflows.oneTime).toBe(600);
    expect(row.real.withdrawals.cash).toBe(4200);
  });

  it("keeps positive-inflation nominal annual flows above their today-dollar values", () => {
    const row = calculateProjection(annualRollupFixture()).annual[0]!;

    expect(row.nominal.income.employment).toBeGreaterThan(row.real.income.employment);
    expect(row.nominal.outflows.essential).toBeGreaterThan(row.real.outflows.essential);
    expect(row.nominal.outflows.discretionary).toBeGreaterThan(
      row.real.outflows.discretionary,
    );
    expect(row.nominal.outflows.contributions).toBeGreaterThan(
      row.real.outflows.contributions,
    );
    expect(row.nominal.outflows.oneTime).toBeGreaterThan(row.real.outflows.oneTime);
    expect(row.nominal.withdrawals.cash).toBeGreaterThan(row.real.withdrawals.cash);
  });

  it("sums exactly six real months in the first row of a July-start projection", () => {
    const row = calculateProjection(annualRollupFixture("2026-07-15")).annual[0]!;

    expect(row.calendarYear).toBe(2026);
    expect(row.real.income.employment).toBe(6000);
    expect(row.real.outflows.essential).toBe(4800);
    expect(row.real.outflows.discretionary).toBe(2400);
    expect(row.real.outflows.essential + row.real.outflows.discretionary).toBe(7200);
  });

  it("deflates balances and allocation at the snapshot month", () => {
    const input = annualRollupFixture();
    input.person.retirementAge = 41;
    input.endAge = 41;
    input.person.annualEmploymentNetCashToday = 0;
    input.monthlyEssentialSpendingToday = 0;
    input.monthlyDiscretionarySpendingToday = 0;
    input.events = [];
    input.accounts = [input.accounts[0]!];
    const result = calculateProjection(input);
    const row = result.annual[0]!;
    const expectedTodayBalance = 107142.86;

    expect(row.nominal.balances.financialAssets).toBe(120000);
    expect(row.real.balances.financialAssets).toBe(expectedTodayBalance);
    expect(row.real.accountBalances["manual:1"]).toBe(expectedTodayBalance);
    expect(row.real.allocation.cash).toBe(expectedTodayBalance);
  });

  it("uses the corrected real snapshot balance in the retirement summary", () => {
    const input = annualRollupFixture();
    input.person.retirementAge = 41;
    input.endAge = 41;
    input.person.annualEmploymentNetCashToday = 0;
    input.monthlyEssentialSpendingToday = 0;
    input.monthlyDiscretionarySpendingToday = 0;
    input.events = [];
    input.accounts = [input.accounts[0]!];
    const result = calculateProjection(input);

    expect(result.summary.financialAssetsAtRetirementToday).toBe(107142.86);
    expect(result.summary.financialAssetsAtRetirementToday).toBe(
      result.annual[0]!.real.balances.financialAssets,
    );
    expect(result.summary.financialAssetsAtRetirementToday).not.toBe(
      result.annual[0]!.nominal.balances.financialAssets,
    );
  });
});
