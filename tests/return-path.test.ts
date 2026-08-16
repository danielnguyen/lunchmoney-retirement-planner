import { describe, expect, it } from "vitest";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import {
  parseReturnPath,
  parseReturnScenario,
  validateReturnScenarioPresence,
} from "@/src/config/return-path";
import {
  annualRateToMonthlyRate,
  buildInflationFactors,
  resolveMonthlyReturn,
} from "@/src/domain/projection/return-path";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { projectionFixture } from "./fixtures/projection";

function sequenceFixture(
  firstRetiredMonthReturn: number,
  secondRetiredMonthReturn: number,
): ProjectionInputsWithReturnPaths {
  const input = structuredClone(
    projectionFixture,
  ) as ProjectionInputsWithReturnPaths;
  input.startDate = "2026-01-15";
  input.person.currentAge = 40;
  input.person.retirementAge = 40 + 1 / 12;
  input.endAge = 40 + 3 / 12;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 10000;
  input.monthlyDiscretionarySpendingToday = 0;
  input.retirementGoalToday = 0;
  input.retirementRequirement = {
    minimumEndingFinancialAssetsToday: 0,
    baselineSource: "explicit_configuration",
    activeValueSource: "explicit_configuration",
  };
  input.spendingPhases = [
    {
      id: "working",
      label: "Synthetic working month",
      startAge: 40,
      endAge: 40 + 1 / 12,
      essentialMultiplier: 0,
      discretionaryMultiplier: 0,
      source: "explicit_configuration",
    },
    {
      id: "retired",
      label: "Synthetic retirement months",
      startAge: 40 + 1 / 12,
      endAge: 40 + 3 / 12,
      essentialMultiplier: 1,
      discretionaryMultiplier: 1,
      source: "explicit_configuration",
    },
  ];
  input.person.employmentIncomePhases = [
    {
      id: "working",
      label: "Synthetic working month",
      startAge: 40,
      endAge: 40 + 1 / 12,
      annualNetCashToday: 0,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.startAge = 65;
  input.person.oas.startAge = 65;
  input.events = [];
  input.tax = {
    mode: "flat_compatibility",
    source: "explicit_configuration",
    effectiveTaxRate: 0,
    oasRecoveryThresholdToday: 90000,
    oasRecoveryRate: 0,
  };
  input.accounts = input.accounts.map((account, index) => ({
    ...account,
    openingBalance: index === 1 ? 100000 : 0,
    annualReturn: 0,
    contributionPhases: [],
    ...(index === 1
      ? {
          returnPath: {
            mode: "monthly" as const,
            source: "explicit_configuration" as const,
            entries: [
              {
                calendarMonth: "2026-02",
                monthlyReturn: firstRetiredMonthReturn,
              },
              {
                calendarMonth: "2026-03",
                monthlyReturn: secondRetiredMonthReturn,
              },
            ],
          },
        }
      : {}),
  }));
  input.surplusAllocation = {
    reserveAccountIds: [input.accounts[0]!.id],
    reserveRefillAccountId: input.accounts[0]!.id,
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  input.returnScenario = {
    label: "Synthetic sequence-order stress",
    source: "explicit_configuration",
  };
  return input;
}

describe("deterministic return paths", () => {
  it("converts an annual rate to an equivalent monthly rate", () => {
    const monthly = annualRateToMonthlyRate(0.12);
    expect(Math.pow(1 + monthly, 12)).toBeCloseTo(1.12, 12);
  });

  it("uses explicit annual path entries only in covered years", () => {
    const path = {
      mode: "annual" as const,
      source: "explicit_configuration" as const,
      entries: [{ calendarYear: 2030, annualReturn: -0.2 }],
    };
    const stressed = resolveMonthlyReturn({
      fallbackAnnualReturn: 0.05,
      path,
      calendarYear: 2030,
      calendarMonth: 4,
    });
    const fallback = resolveMonthlyReturn({
      fallbackAnnualReturn: 0.05,
      path,
      calendarYear: 2031,
      calendarMonth: 4,
    });
    expect(Math.pow(1 + stressed.monthlyReturn, 12)).toBeCloseTo(0.8, 12);
    expect(stressed.source).toBe("annual_path");
    expect(Math.pow(1 + fallback.monthlyReturn, 12)).toBeCloseTo(1.05, 12);
    expect(fallback.source).toBe("constant_annual_fallback");
  });

  it("uses exact configured monthly returns", () => {
    const resolved = resolveMonthlyReturn({
      fallbackAnnualReturn: 0.05,
      path: {
        mode: "monthly",
        source: "explicit_configuration",
        entries: [{ calendarMonth: "2030-04", monthlyReturn: -0.15 }],
      },
      calendarYear: 2030,
      calendarMonth: 4,
    });
    expect(resolved.monthlyReturn).toBe(-0.15);
    expect(resolved.source).toBe("monthly_path");
  });

  it("preserves the historical constant-inflation factors when no path is active", () => {
    const factors = buildInflationFactors({
      fallbackAnnualInflation: 0.02,
      startYear: 2026,
      startMonth: 7,
      totalMonths: 60,
    });
    for (let month = 0; month <= 60; month += 1) {
      expect(factors[month]).toBe(
        Math.pow(1.02, month / 12),
      );
    }
  });

  it("applies inflation overrides cumulatively and falls back outside covered months", () => {
    const factors = buildInflationFactors({
      fallbackAnnualInflation: 0,
      path: {
        mode: "monthly",
        source: "explicit_configuration",
        entries: [
          { calendarMonth: "2026-02", monthlyInflation: 0.1 },
          { calendarMonth: "2026-03", monthlyInflation: 0.2 },
        ],
      },
      startYear: 2026,
      startMonth: 1,
      totalMonths: 4,
    });
    expect(factors).toEqual([1, 1, 1.1, 1.32, 1.32]);
  });

  it("produces different withdrawal outcomes for the same compounded returns in a different order", () => {
    const declineFirst = calculateProjection(sequenceFixture(-0.2, 0.25));
    const gainFirst = calculateProjection(sequenceFixture(0.25, -0.2));

    expect((1 - 0.2) * (1 + 0.25)).toBe(1);
    expect((1 + 0.25) * (1 - 0.2)).toBe(1);
    expect(declineFirst.summary.endingFinancialAssetsToday).toBe(77500);
    expect(gainFirst.summary.endingFinancialAssetsToday).toBe(82000);
    expect(
      declineFirst.observations.some(
        (observation) =>
          observation.code === "deterministic_return_scenario_active",
      ),
    ).toBe(true);
  });
});

describe("return path config validation", () => {
  it("parses ordered annual and monthly paths", () => {
    expect(
      parseReturnPath(
        {
          mode: "annual",
          entries: [
            { calendarYear: 2030, annualReturn: -0.2 },
            { calendarYear: 2031, annualReturn: 0.08 },
          ],
        },
        "account.returnPath",
      ),
    ).toEqual({
      mode: "annual",
      entries: [
        { calendarYear: 2030, annualReturn: -0.2 },
        { calendarYear: 2031, annualReturn: 0.08 },
      ],
    });
    expect(
      parseReturnScenario({
        label: "Synthetic stress",
        inflationPath: {
          mode: "monthly",
          entries: [{ calendarMonth: "2030-01", monthlyInflation: 0.01 }],
        },
      }),
    ).toEqual({
      label: "Synthetic stress",
      inflationPath: {
        mode: "monthly",
        entries: [{ calendarMonth: "2030-01", monthlyInflation: 0.01 }],
      },
    });
  });

  it("rejects duplicate or unsorted dates and out-of-range returns", () => {
    expect(() =>
      parseReturnPath(
        {
          mode: "annual",
          entries: [
            { calendarYear: 2030, annualReturn: 0.05 },
            { calendarYear: 2030, annualReturn: 0.06 },
          ],
        },
        "account.returnPath",
      ),
    ).toThrow(PlannerRuntimeError);
    expect(() =>
      parseReturnPath(
        {
          mode: "monthly",
          entries: [{ calendarMonth: "2030-01", monthlyReturn: -1 }],
        },
        "account.returnPath",
      ),
    ).toThrow(PlannerRuntimeError);
  });

  it("requires a labelled scenario around active paths and rejects empty scenarios", () => {
    const accountPath = parseReturnPath(
      {
        mode: "annual",
        entries: [{ calendarYear: 2030, annualReturn: -0.2 }],
      },
      "account.returnPath",
    );
    expect(() =>
      validateReturnScenarioPresence({
        returnScenario: undefined,
        accountPaths: [accountPath],
      }),
    ).toThrow(PlannerRuntimeError);
    expect(() =>
      validateReturnScenarioPresence({
        returnScenario: { label: "Empty" },
        accountPaths: [],
      }),
    ).toThrow(PlannerRuntimeError);
  });
});
