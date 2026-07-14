import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";

const inputs: ProjectionInputs = {
  currentAge: 40,
  retirementAge: 65,
  endAge: 95,
  currentSavings: 100000,
  monthlyContribution: 1000,
  annualReturnBeforeRetirement: 0.05,
  annualReturnAfterRetirement: 0.04,
  annualInflation: 0.02,
  monthlyRetirementSpendingToday: 4000,
  monthlyGovernmentBenefitsToday: 1500,
  retirementGoalToday: 1000000,
};

describe("calculateProjection", () => {
  it("returns reproducible yearly points and a retirement summary", () => {
    const first = calculateProjection(inputs);
    const second = calculateProjection(inputs);

    expect(first).toEqual(second);
    expect(first.yearly[0]?.age).toBe(40);
    expect(first.yearly.at(-1)?.age).toBe(95);
    expect(first.summary.balanceAtRetirementToday).toBeGreaterThan(inputs.currentSavings);
  });

  it("increases the retirement balance when contributions increase", () => {
    const baseline = calculateProjection(inputs);
    const increased = calculateProjection({ ...inputs, monthlyContribution: 2000 });

    expect(increased.summary.balanceAtRetirementToday).toBeGreaterThan(
      baseline.summary.balanceAtRetirementToday,
    );
  });

  it("rejects an end age before retirement", () => {
    expect(() => calculateProjection({ ...inputs, endAge: 60 })).toThrow();
  });
});
