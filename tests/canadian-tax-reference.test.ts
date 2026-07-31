import { describe, expect, it } from "vitest";
import {
  CANADIAN_TAX_REFERENCE_URLS,
  canadianTaxReference2026,
  resolveCanadianTaxReferences,
} from "@/src/domain/defaults/canadian-tax-2026";

describe("2026 Canadian and Ontario tax references", () => {
  it("retains the official 2026 brackets, credits, and provenance", () => {
    expect(canadianTaxReference2026.federal.brackets).toEqual([
      { threshold: 0, rate: 0.14 },
      { threshold: 58_523, rate: 0.205 },
      { threshold: 117_045, rate: 0.26 },
      { threshold: 181_440, rate: 0.29 },
      { threshold: 258_482, rate: 0.33 },
    ]);
    expect(canadianTaxReference2026.ontario.brackets).toEqual([
      { threshold: 0, rate: 0.0505 },
      { threshold: 53_891, rate: 0.0915 },
      { threshold: 107_785, rate: 0.1116 },
      { threshold: 150_000, rate: 0.1216 },
      { threshold: 220_000, rate: 0.1316 },
    ]);
    expect(canadianTaxReference2026.federal.basicPersonalAmount).toMatchObject({
      maximum: 16_452,
      minimum: 14_829,
      phaseOutStart: 181_440,
      phaseOutEnd: 258_482,
    });
    expect(canadianTaxReference2026.federal.ageAmount).toMatchObject({
      maximum: 9_208,
      phaseOutStart: 46_432,
      phaseOutRate: 0.15,
    });
    expect(canadianTaxReference2026.ontario).toMatchObject({
      basicPersonalAmount: 12_989,
      pensionIncomeAmountMaximum: 1_796,
      taxReductionBasicAmount: 300,
      surtax: {
        firstThreshold: 5_818,
        firstRate: 0.2,
        secondThreshold: 7_446,
        secondRate: 0.36,
      },
    });
    expect(canadianTaxReference2026.oas).toEqual({
      recoveryThreshold: 95_323,
      recoveryRate: 0.15,
      thresholdSourceKind: "published_estimate",
    });
    expect(canadianTaxReference2026.metadata).toMatchObject({
      referenceYear: 2026,
      requestedYear: 2026,
      province: "ON",
      jurisdiction: "CA",
      retrievedDate: "2026-07-30",
      sourceKind: "published",
    });
    expect(canadianTaxReference2026.metadata.sourceUrls).toEqual(
      Object.values(CANADIAN_TAX_REFERENCE_URLS),
    );
    expect(
      canadianTaxReference2026.metadata.sourceUrls.every((url) =>
        url.startsWith("https://www.canada.ca/"),
      ),
    ).toBe(true);
  });

  it("forecasts indexed amounts from unrounded cumulative growth and keeps fixed values fixed", () => {
    const future = resolveCanadianTaxReferences(2031, 0.02125);
    const cumulative = Math.pow(1.02125, 5);

    expect(future.federal.brackets[1]!.threshold).toBe(
      Math.round(58_523 * cumulative),
    );
    expect(future.federal.basicPersonalAmount.maximum).toBe(
      Math.round(16_452 * cumulative),
    );
    expect(future.ontario.surtax.firstThreshold).toBe(
      Math.round(5_818 * cumulative),
    );
    expect(future.oas.recoveryThreshold).toBe(
      Math.round(95_323 * cumulative),
    );
    expect(future.federal.brackets.map((item) => item.rate)).toEqual(
      canadianTaxReference2026.federal.brackets.map((item) => item.rate),
    );
    expect(future.federal.pensionIncomeAmountMaximum).toBe(2_000);
    expect(future.ontario.healthPremium).toEqual(
      canadianTaxReference2026.ontario.healthPremium,
    );
    expect(future.metadata.sourceKind).toBe("forecast");
    expect(future.oas.thresholdSourceKind).toBe("forecast");
  });
});
