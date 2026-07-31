import { describe, expect, it } from "vitest";
import { solveTaxableWithdrawal } from "@/src/domain/projection/taxable-withdrawal";

describe("taxable registered withdrawal solver", () => {
  it("returns zero for zero required cash", () => {
    expect(
      solveTaxableWithdrawal({
        incomeSource: "rrspWithdrawals",
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
      incomeSource: "rrspWithdrawals",
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

  it("matches a hand-calculated proportional-ACB non-registered sale", () => {
    // Synthetic pooled portfolio: FMV $1,000, ACB $800. Every sale is 20%
    // gain; at a synthetic 20% tax rate on the 50% taxable gain, signed
    // incremental tax is 2% of gross proceeds.
    const result = solveTaxableWithdrawal({
      incomeSource: "nonRegisteredDisposition",
      availableBalance: 1_000,
      requiredNetCash: 381.05,
      incrementalTax: (gross) => gross * 0.02,
    });
    expect(result).toMatchObject({
      grossWithdrawal: 388.83,
      incrementalTax: 7.78,
      netProceeds: 381.05,
      acceptedCandidatePassed: true,
      oneCentBelowFailed: true,
    });
  });

  it("rounds a fractional-cent cash need upward rather than underfunding it", () => {
    const result = solveTaxableWithdrawal({
      incomeSource: "rrspWithdrawals",
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
      incomeSource: "rrspWithdrawals",
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
        incomeSource: "rrspWithdrawals",
        availableBalance: 100,
        requiredNetCash: 10,
        incrementalTax: (gross) => gross + 1,
      }),
    ).toThrow(/invalid result/);
  });

  it("fails honestly when sampled net proceeds are non-monotonic", () => {
    expect(() =>
      solveTaxableWithdrawal({
        incomeSource: "rrspWithdrawals",
        availableBalance: 100,
        requiredNetCash: 90,
        incrementalTax: (gross) => (gross > 50 ? gross : 0),
      }),
    ).toThrow(/monotonic/);
  });

  it("is deterministic", () => {
    const solve = () =>
      solveTaxableWithdrawal({
        incomeSource: "rrspWithdrawals",
        availableBalance: 9_999.99,
        requiredNetCash: 4_321.09,
        incrementalTax: (gross) => Math.max(0, gross - 5_000) * 0.3 + gross * 0.1,
      });
    expect(solve()).toEqual(solve());
  });

  it("accepts a bounded signed tax repricing adjustment", () => {
    const result = solveTaxableWithdrawal({
      incomeSource: "rrifWithdrawals",
      availableBalance: 100,
      requiredNetCash: 10,
      minimumIncrementalTax: -2,
      incrementalTax: (gross) => (gross === 0 ? 0 : -2),
    });
    expect(result.grossWithdrawal).toBe(8);
    expect(result.incrementalTax).toBe(-2);
    expect(result.netProceeds).toBe(10);
    expect(result.incomeSource).toBe("rrifWithdrawals");
    expect(result.oneCentBelowFailed).toBe(true);
  });
});
