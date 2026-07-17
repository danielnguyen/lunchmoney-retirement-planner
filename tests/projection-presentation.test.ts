import { describe, expect, it } from "vitest";
import {
  annualPeriodLabel,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import { projectionFixture } from "./fixtures/projection";

describe("projection presentation metadata", () => {
  it("sums all included non-debt opening balances as starting financial assets", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.accounts.push(
      {
        ...inputs.accounts[1]!,
        id: "tfsa",
        type: "tfsa",
        openingBalance: 30000,
      },
      {
        ...inputs.accounts[1]!,
        id: "non-registered",
        type: "non_registered",
        openingBalance: 40000,
      },
    );

    expect(startingFinancialAssets(inputs.accounts)).toBe(270000);
  });

  it("excludes debt from starting financial assets", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.accounts.push({
      ...inputs.accounts[0]!,
      id: "debt",
      type: "debt",
      openingBalance: 75000,
      allocation: { cash: 0, fixedIncome: 0, equity: 0 },
    });

    expect(startingFinancialAssets(inputs.accounts)).toBe(200000);
  });

  it("labels a July-start first row with its partial calendar period", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-07-14";

    expect(annualPeriodLabel(inputs, 2026)).toBe("2026 (Jul–Dec)");
  });

  it("leaves a full January-start calendar year compact", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-01-14";

    expect(annualPeriodLabel(inputs, 2026)).toBe("2026");
  });

  it("labels the calculated partial final year", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-07-14";
    inputs.person.currentAge = 40;
    inputs.person.retirementAge = 42;
    inputs.endAge = 42;

    expect(annualPeriodLabel(inputs, 2028)).toBe("2028 (Jan–Jun)");
  });
});
