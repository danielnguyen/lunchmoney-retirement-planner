import { describe, expect, it } from "vitest";
import { resolveBaselineValue } from "@/src/domain/defaults/resolve";
import type { BaselineValue } from "@/src/domain/defaults/types";
import {
  canadianCppReference,
  canadianOasReference,
  cppClaimRules,
  oasClaimRules,
} from "@/src/domain/defaults/canadian-public-benefits";

function value(
  numericValue: number,
  sourceType: BaselineValue<number>["sourceType"],
): BaselineValue<number> {
  return {
    value: numericValue,
    sourceType,
    sourceDescription: sourceType,
    effectiveDate: "2026-01-01",
  };
}

describe("resolveBaselineValue", () => {
  it("prefers explicit local configuration over imported and reference values", () => {
    const resolved = resolveBaselineValue({
      localConfiguration: value(1, "local_configuration"),
      lunchMoneyDerived: value(2, "lunchmoney_derived"),
      canadianReference: value(3, "canadian_reference"),
    });
    expect(resolved.value).toBe(1);
    expect(resolved.sourceType).toBe("local_configuration");
  });

  it("uses Lunch Money-derived data when local configuration does not override it", () => {
    const resolved = resolveBaselineValue({
      lunchMoneyDerived: value(2, "lunchmoney_derived"),
      canadianReference: value(3, "canadian_reference"),
    });
    expect(resolved.sourceType).toBe("lunchmoney_derived");
  });

  it("blocks when no supported source has a value", () => {
    expect(() => resolveBaselineValue({}, "required field")).toThrow(
      "required field is missing from all supported sources",
    );
  });
});

describe("dated Canadian public-benefit references", () => {
  it("bundles the published CPP average without describing it as personal", () => {
    expect(canadianCppReference).toMatchObject({
      monthlyAmountAt65Today: 877.01,
      effectiveDate: "2026-04-01",
      referenceKind: "population_average",
    });
    expect(canadianCppReference.description).toContain("generic Canadian reference");
    expect(canadianCppReference.description).toContain("not a personal");
    expect(canadianCppReference.referenceUrl).toContain("canada.ca");
  });

  it("bundles the full OAS amount and statutory adjustment rules", () => {
    expect(canadianOasReference).toMatchObject({
      fullMonthlyAmountAt65Today: 751.97,
      effectiveDate: "2026-07-01",
      referenceKind: "statutory_program_default",
    });
    expect(cppClaimRules).toMatchObject({
      earliestAge: 60,
      latestAge: 70,
      reductionPerMonth: 0.006,
      increasePerMonth: 0.007,
    });
    expect(oasClaimRules).toMatchObject({
      earliestAge: 65,
      latestAge: 70,
      increasePerMonth: 0.006,
      maximumDelayedIncrease: 0.36,
      age75IncreaseRate: 0.1,
    });
  });
});
