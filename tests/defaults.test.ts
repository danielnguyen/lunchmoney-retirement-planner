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
