import { describe, expect, it } from "vitest";
import { calculateProjection, cppClaimFactor, oasClaimFactor } from "@/src/domain/projection/calculate";
import { demoInputs } from "@/src/demo/baseline";

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

describe("household projection", () => {
  it("produces annual combined and per-member report views", () => {
    const result = calculateProjection(demoInputs);

    expect(result.schemaVersion).toBe("2.0");
    expect(result.annual.length).toBeGreaterThan(40);
    expect(result.annual[0]?.members["member-a"]?.label).toBe("Member A");
    expect(result.annual[0]?.nominal.balances.netWorth).toBeGreaterThan(0);
    expect(result.annual.at(-1)?.primaryAge).toBe(demoInputs.endAge);
  });

  it("shows CPP and OAS as separate income streams after their start ages", () => {
    const result = calculateProjection(demoInputs);
    const afterBenefits = result.annual.find(
      (point) => point.nominal.income.cpp > 0 && point.nominal.income.oas > 0,
    );

    expect(afterBenefits).toBeDefined();
    expect(afterBenefits?.nominal.income.cpp).toBeGreaterThan(0);
    expect(afterBenefits?.nominal.income.oas).toBeGreaterThan(0);
  });

  it("keeps account balances non-negative and records withdrawals by account type", () => {
    const stressed = structuredClone(demoInputs);
    stressed.monthlyEssentialSpendingToday = 12000;
    stressed.monthlyDiscretionarySpendingToday = 3000;
    const result = calculateProjection(stressed);

    expect(result.annual.some((point) => point.nominal.withdrawals.total > 0)).toBe(true);
    expect(
      result.annual.every(
        (point) =>
          point.nominal.balances.cash >= 0 &&
          point.nominal.balances.tfsa >= 0 &&
          point.nominal.balances.rrspRrif >= 0 &&
          point.nominal.balances.nonRegistered >= 0,
      ),
    ).toBe(true);
  });

  it("records dated one-time events in the matching annual outflow", () => {
    const result = calculateProjection(demoInputs);
    const eventYear = result.annual.find((point) => point.calendarYear === 2038);

    expect(eventYear?.nominal.outflows.oneTime).toBeGreaterThan(0);
  });

  it("retains milestone markers for retirement, CPP, OAS, and RRIF conversion", () => {
    const result = calculateProjection(demoInputs);
    const milestones = result.annual.flatMap((point) => point.milestones);

    expect(milestones.some((label) => label.includes("retires"))).toBe(true);
    expect(milestones.some((label) => label.includes("CPP begins"))).toBe(true);
    expect(milestones.some((label) => label.includes("OAS begins"))).toBe(true);
    expect(milestones.some((label) => label.includes("RRIF conversion age"))).toBe(true);
  });
});
