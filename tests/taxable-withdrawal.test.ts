import { describe, expect, it } from "vitest";
import { solveTaxableWithdrawal } from "@/src/domain/projection/taxable-withdrawal";

describe("taxable registered withdrawal solver", () => {
  it("returns zero for zero required cash", () => {
    expect(
      solveTaxableWithdrawal({
        availableBalance: 1_000,
        requiredNetCash: 0,
        incrementalTax: (gross) => gross * 0.2,
      }),
    ).toMatchObject({
      grossWithdrawal: 0,
      incrementalTax: 0,
      netProceeds: 0,
      fullySatisfied: true,
    });
  });

  it("finds the lowest passing gross cent and proves one cent below fails", () => {
    const result = solveTaxableWithdrawal({
      availableBalance: 1_000,
      requiredNetCash: 381.05,
      incrementalTax: (gross) => gross * 0.2,
    });

    expect(result.grossWithdrawal).toBe(476.31);
    expect(result.incrementalTax).toBe(95.26);
    expect(result.netProceeds).toBe(381.05);
    expect(result.acceptedCandidatePassed).toBe(true);
    expect(result.oneCentBelowFailed).toBe(true);
    expect(result.evaluations).toBeLessThanOrEqual(80);
  });

  it("rounds a fractional-cent cash need upward rather than underfunding it", () => {
    const result = solveTaxableWithdrawal({
      availableBalance: 10,
      requiredNetCash: 1.001,
      incrementalTax: () => 0,
    });
    expect(result.grossWithdrawal).toBe(1.01);
    expect(result.netProceeds).toBe(1.01);
    expect(result.oneCentBelowFailed).toBe(true);
  });

  it("withdraws the full cent balance when one account cannot satisfy the need", () => {
    const result = solveTaxableWithdrawal({
      availableBalance: 100.009,
      requiredNetCash: 100,
      incrementalTax: (gross) => gross * 0.25,
    });

    expect(result).toMatchObject({
      grossWithdrawal: 100,
      incrementalTax: 25,
      netProceeds: 75,
      fullySatisfied: false,
      acceptedCandidateCents: 10_000,
    });
  });

  it("fails honestly for an invalid tax function", () => {
    expect(() =>
      solveTaxableWithdrawal({
        availableBalance: 100,
        requiredNetCash: 10,
        incrementalTax: (gross) => gross + 1,
      }),
    ).toThrow(/invalid result/);
  });

  it("fails honestly when sampled net proceeds are non-monotonic", () => {
    expect(() =>
      solveTaxableWithdrawal({
        availableBalance: 100,
        requiredNetCash: 90,
        incrementalTax: (gross) => (gross > 50 ? gross : 0),
      }),
    ).toThrow(/monotonic/);
  });

  it("is deterministic", () => {
    const solve = () =>
      solveTaxableWithdrawal({
        availableBalance: 9_999.99,
        requiredNetCash: 4_321.09,
        incrementalTax: (gross) => Math.max(0, gross - 5_000) * 0.3 + gross * 0.1,
      });
    expect(solve()).toEqual(solve());
  });
});
