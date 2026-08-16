import { PlannerRuntimeError } from "@/src/runtime/errors";
import type {
  InflationPathConfig,
  ReturnPathConfig,
  ReturnScenarioConfig,
} from "./types";

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an object.`,
      422,
    );
  }
  return value as Record<string, unknown>;
}

function finiteRate(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a finite number between ${min} and ${max}.`,
      422,
    );
  }
  return value;
}

function calendarYear(value: unknown, field: string): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1900 ||
    value > 2300
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an integer calendar year between 1900 and 2300.`,
      422,
    );
  }
  return value;
}

function calendarMonth(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a calendar month in YYYY-MM format.`,
      422,
    );
  }
  const month = Number(value.slice(5, 7));
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2300 || month < 1 || month > 12) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a valid calendar month between 1900-01 and 2300-12.`,
      422,
    );
  }
  return value;
}

function entries(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must contain at least one entry.`,
      422,
    );
  }
  return value;
}

function assertStrictlyIncreasing(
  values: Array<number | string>,
  field: string,
): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index]! <= values[index - 1]!) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field} entries must be unique and strictly increasing by date.`,
        422,
      );
    }
  }
}

export function parseReturnPath(
  value: unknown,
  field: string,
): ReturnPathConfig | undefined {
  if (value === undefined) return undefined;
  const item = record(value, field);
  const rawEntries = entries(item.entries, `${field}.entries`);
  if (item.mode === "annual") {
    const parsed = rawEntries.map((raw, index) => {
      const entry = record(raw, `${field}.entries[${index}]`);
      return {
        calendarYear: calendarYear(
          entry.calendarYear,
          `${field}.entries[${index}].calendarYear`,
        ),
        annualReturn: finiteRate(
          entry.annualReturn,
          `${field}.entries[${index}].annualReturn`,
          -0.99,
          1,
        ),
      };
    });
    assertStrictlyIncreasing(
      parsed.map((entry) => entry.calendarYear),
      `${field}.entries`,
    );
    return { mode: "annual", entries: parsed };
  }
  if (item.mode === "monthly") {
    const parsed = rawEntries.map((raw, index) => {
      const entry = record(raw, `${field}.entries[${index}]`);
      return {
        calendarMonth: calendarMonth(
          entry.calendarMonth,
          `${field}.entries[${index}].calendarMonth`,
        ),
        monthlyReturn: finiteRate(
          entry.monthlyReturn,
          `${field}.entries[${index}].monthlyReturn`,
          -0.99,
          1,
        ),
      };
    });
    assertStrictlyIncreasing(
      parsed.map((entry) => entry.calendarMonth),
      `${field}.entries`,
    );
    return { mode: "monthly", entries: parsed };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `${field}.mode must be annual or monthly.`,
    422,
  );
}

function parseInflationPath(
  value: unknown,
  field: string,
): InflationPathConfig | undefined {
  if (value === undefined) return undefined;
  const item = record(value, field);
  const rawEntries = entries(item.entries, `${field}.entries`);
  if (item.mode === "annual") {
    const parsed = rawEntries.map((raw, index) => {
      const entry = record(raw, `${field}.entries[${index}]`);
      return {
        calendarYear: calendarYear(
          entry.calendarYear,
          `${field}.entries[${index}].calendarYear`,
        ),
        annualInflation: finiteRate(
          entry.annualInflation,
          `${field}.entries[${index}].annualInflation`,
          -0.2,
          0.5,
        ),
      };
    });
    assertStrictlyIncreasing(
      parsed.map((entry) => entry.calendarYear),
      `${field}.entries`,
    );
    return { mode: "annual", entries: parsed };
  }
  if (item.mode === "monthly") {
    const parsed = rawEntries.map((raw, index) => {
      const entry = record(raw, `${field}.entries[${index}]`);
      return {
        calendarMonth: calendarMonth(
          entry.calendarMonth,
          `${field}.entries[${index}].calendarMonth`,
        ),
        monthlyInflation: finiteRate(
          entry.monthlyInflation,
          `${field}.entries[${index}].monthlyInflation`,
          -0.2,
          0.5,
        ),
      };
    });
    assertStrictlyIncreasing(
      parsed.map((entry) => entry.calendarMonth),
      `${field}.entries`,
    );
    return { mode: "monthly", entries: parsed };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `${field}.mode must be annual or monthly.`,
    422,
  );
}

export function parseReturnScenario(
  value: unknown,
): ReturnScenarioConfig | undefined {
  if (value === undefined) return undefined;
  const item = record(value, "returnScenario");
  if (typeof item.label !== "string" || item.label.trim().length === 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "returnScenario.label must be a non-empty string.",
      422,
    );
  }
  const inflationPath = parseInflationPath(
    item.inflationPath,
    "returnScenario.inflationPath",
  );
  return {
    label: item.label,
    ...(inflationPath ? { inflationPath } : {}),
  };
}

export function validateReturnScenarioPresence(input: {
  returnScenario: ReturnScenarioConfig | undefined;
  accountPaths: Array<ReturnPathConfig | undefined>;
}): void {
  const hasAccountPath = input.accountPaths.some(Boolean);
  const hasInflationPath = Boolean(input.returnScenario?.inflationPath);
  if ((hasAccountPath || hasInflationPath) && !input.returnScenario) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "A returnScenario with a label is required whenever an account returnPath or inflationPath is configured.",
      422,
    );
  }
  if (input.returnScenario && !hasAccountPath && !hasInflationPath) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "returnScenario must configure at least one account returnPath or an inflationPath.",
      422,
    );
  }
}
