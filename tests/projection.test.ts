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
});
