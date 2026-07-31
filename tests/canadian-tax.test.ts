import { describe, expect, it } from "vitest";
import {
  ZERO_CANADIAN_TAX_INCOME,
  calculateAnnualCanadianTax,
  ontarioHealthPremium,
  ontarioSurtax,
  ontarioTaxReduction,
  type CanadianTaxIncomeBySource,
} from "@/src/domain/projection/canadian-tax";
import { canadianTaxReference2026 } from "@/src/domain/defaults/canadian-tax-2026";

function calculate(
  incomeBySource: Partial<CanadianTaxIncomeBySource>,
  options: { age?: number; eligiblePensionIncome?: number } = {},
) {
  return calculateAnnualCanadianTax({
    calendarYear: 2026,
    province: "ON",
    ageAtYearEnd: options.age ?? 64,
    incomeBySource: { ...ZERO_CANADIAN_TAX_INCOME, ...incomeBySource },
    eligiblePensionIncome: options.eligiblePensionIncome ?? 0,
    futureIndexingRate: 0.02,
  });
}

describe("annual Canadian tax calculator", () => {
  it("calculates federal bracket boundaries and one cent around them", () => {
    const below = calculate({ otherTaxableIncome: 58_522.99 });
    const at = calculate({ otherTaxableIncome: 58_523 });
    const above = calculate({ otherTaxableIncome: 58_523.01 });

    expect(at.federal.bracketTax).toBe(8_193.22);
    expect(below.federal.bracketTax).toBe(8_193.22);
    expect(above.federal.bracketTax).toBe(8_193.22);
    expect(calculate({ otherTaxableIncome: 117_045 }).federal.bracketTax).toBe(
      20_190.23,
    );
    expect(calculate({ otherTaxableIncome: 181_440 }).federal.bracketTax).toBe(
      36_932.93,
    );
    expect(calculate({ otherTaxableIncome: 258_482 }).federal.bracketTax).toBe(
      59_275.11,
    );
  });

  it("uses maximum, phased, and minimum federal BPA amounts", () => {
    expect(calculate({ otherTaxableIncome: 100_000 }).federal.basicPersonalAmount).toBe(16_452);
    const phased = calculate({ otherTaxableIncome: 200_000 }).federal.basicPersonalAmount;
    expect(phased).toBeGreaterThan(14_829);
    expect(phased).toBeLessThan(16_452);
    expect(calculate({ otherTaxableIncome: 300_000 }).federal.basicPersonalAmount).toBe(14_829);
  });

  it("limits employment and pension credits and applies age at year end", () => {
    expect(calculate({ employment: 500 }).federal.employmentAmount).toBe(500);
    expect(calculate({ employment: 10_000 }).federal.employmentAmount).toBe(1_501);
    expect(calculate({ pension: 5_000 }, { age: 64, eligiblePensionIncome: 5_000 }).federal.ageAmount).toBe(0);
    const age65 = calculate({ pension: 20_000 }, { age: 65, eligiblePensionIncome: 5_000 });
    expect(age65.federal.ageAmount).toBe(9_208);
    expect(age65.federal.pensionIncomeAmount).toBe(2_000);
    expect(age65.ontario.pensionIncomeAmount).toBe(1_796);
    expect(calculate({ cpp: 2_000, oas: 2_000, rrspWithdrawals: 2_000 }, { age: 70 }).eligiblePensionIncome).toBe(0);
  });

  it("calculates each Ontario bracket and prescribed tax components", () => {
    expect(calculate({ otherTaxableIncome: 53_891 }).ontario.bracketTax).toBe(2_721.5);
    expect(calculate({ otherTaxableIncome: 107_785 }).ontario.bracketTax).toBe(7_652.8);
    expect(calculate({ otherTaxableIncome: 150_000 }).ontario.bracketTax).toBe(12_363.99);
    expect(calculate({ otherTaxableIncome: 220_000 }).ontario.bracketTax).toBe(20_875.99);
    const high = calculate({ otherTaxableIncome: 300_000 });
    expect(high.ontario.surtax).toBeGreaterThan(0);
    expect(high.ontario.healthPremium).toBe(900);
    expect(high.ontario.netTax).toBeGreaterThan(0);
  });

  it("uses the official Ontario surtax thresholds and tax-reduction ordering", () => {
    expect(ontarioSurtax(5_817.99, canadianTaxReference2026)).toBe(0);
    expect(ontarioSurtax(5_818, canadianTaxReference2026)).toBe(0);
    expect(ontarioSurtax(5_818.01, canadianTaxReference2026)).toBe(0);
    expect(ontarioSurtax(6_000, canadianTaxReference2026)).toBe(36.4);
    expect(ontarioSurtax(7_446, canadianTaxReference2026)).toBe(325.6);
    expect(ontarioSurtax(7_446.01, canadianTaxReference2026)).toBe(325.61);
    expect(ontarioTaxReduction(250, canadianTaxReference2026)).toBe(250);
    expect(ontarioTaxReduction(300, canadianTaxReference2026)).toBe(300);
    expect(ontarioTaxReduction(450, canadianTaxReference2026)).toBe(150);
    expect(ontarioTaxReduction(600, canadianTaxReference2026)).toBe(0);
    expect(ontarioTaxReduction(600.01, canadianTaxReference2026)).toBe(0);
  });

  it("applies federal and Ontario age amounts only from age 65 and phases them out", () => {
    const under65 = calculate({ otherTaxableIncome: 20_000 }, { age: 64 });
    const age65 = calculate({ otherTaxableIncome: 20_000 }, { age: 65 });
    const phased = calculate({ otherTaxableIncome: 60_000 }, { age: 70 });
    const eliminated = calculate({ otherTaxableIncome: 200_000 }, { age: 70 });
    expect(under65.federal.ageAmount).toBe(0);
    expect(under65.ontario.ageAmount).toBe(0);
    expect(age65.federal.ageAmount).toBe(9_208);
    expect(age65.ontario.ageAmount).toBe(6_342);
    expect(phased.federal.ageAmount).toBeGreaterThan(0);
    expect(phased.federal.ageAmount).toBeLessThan(9_208);
    expect(phased.ontario.ageAmount).toBeGreaterThan(0);
    expect(phased.ontario.ageAmount).toBeLessThan(6_342);
    expect(eliminated.federal.ageAmount).toBe(0);
    expect(eliminated.ontario.ageAmount).toBe(0);
  });

  it("distinguishes explicitly eligible pension from CPP, OAS, RRSP, and RRIF income", () => {
    const ineligible = calculate(
      {
        cpp: 2_000,
        oas: 2_000,
        rrspWithdrawals: 2_000,
        rrifWithdrawals: 2_000,
        pension: 2_000,
      },
      { age: 70, eligiblePensionIncome: 0 },
    );
    const eligible = calculate(
      { pension: 2_000 },
      { age: 70, eligiblePensionIncome: 2_000 },
    );
    expect(ineligible.federal.pensionIncomeAmount).toBe(0);
    expect(ineligible.ontario.pensionIncomeAmount).toBe(0);
    expect(eligible.federal.pensionIncomeAmount).toBe(2_000);
    expect(eligible.ontario.pensionIncomeAmount).toBe(1_796);
  });

  it.each([
    [19_999.99, 0],
    [20_000, 0],
    [20_000.01, 0],
    [25_000.01, 300],
    [25_000, 300],
    [36_000, 300],
    [36_000.01, 300],
    [38_500, 450],
    [48_000, 450],
    [48_000.01, 450],
    [48_600, 600],
    [72_000, 600],
    [72_000.01, 600],
    [72_600, 750],
    [200_000, 750],
    [200_000.01, 750],
    [200_600, 900],
    [200_600.01, 900],
  ])("calculates Ontario health premium at %s", (income, expected) => {
    expect(ontarioHealthPremium(income, canadianTaxReference2026)).toBe(expected);
  });

  it("calculates annual OAS recovery from all supported sources and caps it at OAS received", () => {
    expect(calculate({ oas: 10_000, otherTaxableIncome: 85_323 }).oasRecovery.recoveryTax).toBe(0);
    expect(calculate({ oas: 10_000, otherTaxableIncome: 85_323.01 }).oasRecovery.recoveryTax).toBe(0);
    expect(calculate({ oas: 10_000, rrspWithdrawals: 90_000 }).oasRecovery.recoveryTax).toBe(701.55);
    expect(calculate({ oas: 1_000, rrspWithdrawals: 200_000 }).oasRecovery.recoveryTax).toBe(1_000);
  });

  it("matches an independently hand-calculated synthetic example and reconciles", () => {
    const result = calculate({ employment: 40_000, cpp: 12_000, oas: 8_000 }, { age: 67 });
    expect(result.totalIncome).toBe(60_000);
    expect(result.federal.bracketTax).toBe(8_496.01);
    expect(result.federal.basicPersonalAmount).toBe(16_452);
    expect(result.federal.employmentAmount).toBe(1_501);
    expect(result.federal.ageAmount).toBe(7_172.8);
    expect(result.reconciliation.reconciled).toBe(true);
    expect(result.reconciliation.componentsDifference).toBe(0);
    expect(result.totals.totalTax).toBe(
      Math.round((result.totals.federalTax + result.totals.ontarioTax + result.totals.ontarioHealthPremium + result.totals.oasRecoveryTax) * 100) / 100,
    );
  });

  it("keeps exact-cent after-tax proceeds monotonic around statutory boundaries", () => {
    const boundaries = [
      20_000,
      36_000,
      48_000,
      53_891,
      58_523,
      72_000,
      95_323,
      107_785,
      117_045,
      150_000,
      181_440,
      200_000,
      220_000,
      258_482,
    ];
    for (const boundary of boundaries) {
      const base = boundary - 2;
      const baselineTax = calculate({ otherTaxableIncome: base }).totals.totalTax;
      let previousNet = 0;
      for (let cents = 0; cents <= 400; cents += 1) {
        const gross = cents / 100;
        const totalTax = calculate({
          otherTaxableIncome: base,
          rrspWithdrawals: gross,
        }).totals.totalTax;
        const net = gross - (totalTax - baselineTax);
        expect(net + 1e-9).toBeGreaterThanOrEqual(previousNet);
        previousNet = net;
      }
    }
  });

  it("keeps cumulative projection-funded liability non-negative as embedded employment context accrues", () => {
    let observedRepricing = false;
    for (const retirementIncome of [1_000, 10_000, 40_000]) {
      let previous: number | null = null;
      for (let employment = 0; employment <= 250_000; employment += 100) {
        const embedded = calculate({ employment }).totals.totalTax;
        const full = calculate({ employment, cpp: retirementIncome }).totals.totalTax;
        const funded = full - embedded;
        expect(funded).toBeGreaterThanOrEqual(-0.01);
        if (previous !== null && funded < previous - 0.01) {
          observedRepricing = true;
        }
        previous = funded;
      }
    }
    expect(observedRepricing).toBe(true);
  });
});
