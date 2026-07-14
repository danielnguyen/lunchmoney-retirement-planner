import { describe, expect, it } from "vitest";
import { resolveBaselineValue } from "@/src/domain/defaults/resolve";
import type { BaselineValue } from "@/src/domain/defaults/types";

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
  it("prefers a saved baseline over imported and reference values", () => {
    const resolved = resolveBaselineValue({
      savedPersonalBaseline: value(1, "saved_personal_baseline"),
      lunchMoneyDerived: value(2, "lunchmoney_derived"),
      canadianReference: value(3, "canadian_reference"),
      applicationFallback: value(4, "application_fallback"),
    });

    expect(resolved.value).toBe(1);
    expect(resolved.sourceType).toBe("saved_personal_baseline");
  });

  it("uses Lunch Money-derived data when no saved baseline exists", () => {
    const resolved = resolveBaselineValue({
      lunchMoneyDerived: value(2, "lunchmoney_derived"),
      canadianReference: value(3, "canadian_reference"),
      applicationFallback: value(4, "application_fallback"),
    });

    expect(resolved.sourceType).toBe("lunchmoney_derived");
  });

  it("falls back to a Canadian reference before an application fallback", () => {
    const resolved = resolveBaselineValue({
      canadianReference: value(3, "canadian_reference"),
      applicationFallback: value(4, "application_fallback"),
    });

    expect(resolved.sourceType).toBe("canadian_reference");
  });
});
