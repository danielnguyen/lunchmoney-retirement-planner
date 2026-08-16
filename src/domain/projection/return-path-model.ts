import type {
  FinancialAccountInput,
  ProjectionInputs,
  ProjectionResult,
} from "./types";
import type {
  DeterministicInflationPath,
  DeterministicReturnPath,
} from "./return-path";

export type FinancialAccountWithReturnPath = FinancialAccountInput & {
  returnPath?: DeterministicReturnPath;
};

export type ReturnScenarioInput = {
  label: string;
  source: "explicit_configuration";
  inflationPath?: DeterministicInflationPath;
};

export type ProjectionInputsWithReturnPaths = Omit<ProjectionInputs, "accounts"> & {
  accounts: FinancialAccountWithReturnPath[];
  returnScenario?: ReturnScenarioInput;
};

export type ReturnScenarioCalculationSummary = {
  mode: "constant_annual_returns" | "deterministic_path";
  label: string | null;
  source: "compatibility_constant_returns" | "explicit_configuration";
  inflationMode: "constant_annual_inflation" | "deterministic_path";
  accounts: Array<{
    accountId: string;
    fallbackAnnualReturn: number;
    pathMode: "annual" | "monthly" | null;
    entryCount: number;
  }>;
  rebalancingAssumption: "account_level_returns_no_intra_account_rebalancing";
  probabilityClaim: false;
};

export type ProjectionResultWithReturnPaths = ProjectionResult & {
  inputs: ProjectionInputsWithReturnPaths;
  returnScenario?: ReturnScenarioCalculationSummary;
};

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function assertRate(
  value: number,
  field: string,
  min: number,
  max: number,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }
}

function validateReturnPath(input: {
  path: DeterministicReturnPath;
  field: string;
  startYear: number;
  startMonthKey: string;
  endYear: number;
  endMonthKey: string;
}): void {
  if (input.path.source !== "explicit_configuration") {
    throw new Error(`${input.field}.source must be explicit_configuration`);
  }
  if (input.path.entries.length === 0) {
    throw new Error(`${input.field}.entries must not be empty`);
  }
  if (input.path.mode === "annual") {
    let previousYear: number | undefined;
    for (const [index, entry] of input.path.entries.entries()) {
      assertRate(
        entry.annualReturn,
        `${input.field}.entries[${index}].annualReturn`,
        -0.99,
        1,
      );
      if (
        !Number.isInteger(entry.calendarYear) ||
        entry.calendarYear < input.startYear ||
        entry.calendarYear > input.endYear
      ) {
        throw new Error(
          `${input.field}.entries[${index}].calendarYear must fall within the projection`,
        );
      }
      if (
        previousYear !== undefined &&
        entry.calendarYear <= previousYear
      ) {
        throw new Error(
          `${input.field}.entries must be unique and strictly increasing by date`,
        );
      }
      previousYear = entry.calendarYear;
    }
    return;
  }

  let previousMonth: string | undefined;
  for (const [index, entry] of input.path.entries.entries()) {
    assertRate(
      entry.monthlyReturn,
      `${input.field}.entries[${index}].monthlyReturn`,
      -0.99,
      1,
    );
    if (
      !/^\d{4}-\d{2}$/.test(entry.calendarMonth) ||
      entry.calendarMonth < input.startMonthKey ||
      entry.calendarMonth > input.endMonthKey
    ) {
      throw new Error(
        `${input.field}.entries[${index}].calendarMonth must fall within the projection`,
      );
    }
    if (
      previousMonth !== undefined &&
      entry.calendarMonth <= previousMonth
    ) {
      throw new Error(
        `${input.field}.entries must be unique and strictly increasing by date`,
      );
    }
    previousMonth = entry.calendarMonth;
  }
}

function validateInflationPath(input: {
  path: DeterministicInflationPath;
  field: string;
  startYear: number;
  startMonthKey: string;
  endYear: number;
  endMonthKey: string;
}): void {
  if (input.path.source !== "explicit_configuration") {
    throw new Error(`${input.field}.source must be explicit_configuration`);
  }
  if (input.path.entries.length === 0) {
    throw new Error(`${input.field}.entries must not be empty`);
  }
  if (input.path.mode === "annual") {
    let previousYear: number | undefined;
    for (const [index, entry] of input.path.entries.entries()) {
      assertRate(
        entry.annualInflation,
        `${input.field}.entries[${index}].annualInflation`,
        -0.2,
        0.5,
      );
      if (
        !Number.isInteger(entry.calendarYear) ||
        entry.calendarYear < input.startYear ||
        entry.calendarYear > input.endYear
      ) {
        throw new Error(
          `${input.field}.entries[${index}].calendarYear must fall within the projection`,
        );
      }
      if (
        previousYear !== undefined &&
        entry.calendarYear <= previousYear
      ) {
        throw new Error(
          `${input.field}.entries must be unique and strictly increasing by date`,
        );
      }
      previousYear = entry.calendarYear;
    }
    return;
  }

  let previousMonth: string | undefined;
  for (const [index, entry] of input.path.entries.entries()) {
    assertRate(
      entry.monthlyInflation,
      `${input.field}.entries[${index}].monthlyInflation`,
      -0.2,
      0.5,
    );
    if (
      !/^\d{4}-\d{2}$/.test(entry.calendarMonth) ||
      entry.calendarMonth < input.startMonthKey ||
      entry.calendarMonth > input.endMonthKey
    ) {
      throw new Error(
        `${input.field}.entries[${index}].calendarMonth must fall within the projection`,
      );
    }
    if (
      previousMonth !== undefined &&
      entry.calendarMonth <= previousMonth
    ) {
      throw new Error(
        `${input.field}.entries must be unique and strictly increasing by date`,
      );
    }
    previousMonth = entry.calendarMonth;
  }
}

export function validateReturnPathProjectionInputs(
  base: ProjectionInputs,
): ProjectionInputsWithReturnPaths {
  const input = base as ProjectionInputsWithReturnPaths;
  const startYear = Number(input.startDate.slice(0, 4));
  const startMonth = Number(input.startDate.slice(5, 7));
  const totalMonths = Math.round(
    (input.endAge - input.person.currentAge) * 12,
  );
  const endIndex = startMonth - 1 + totalMonths - 1;
  const endYear = startYear + Math.floor(endIndex / 12);
  const endMonth = (endIndex % 12) + 1;
  const startMonthKey = monthKey(startYear, startMonth);
  const endMonthKey = monthKey(endYear, endMonth);

  const accountPaths = input.accounts.filter((account) => account.returnPath);
  if (accountPaths.length > 0 && !input.returnScenario) {
    throw new Error(
      "A returnScenario is required when an account returnPath is active",
    );
  }
  if (input.returnScenario) {
    if (
      input.returnScenario.source !== "explicit_configuration" ||
      input.returnScenario.label.trim().length === 0
    ) {
      throw new Error(
        "returnScenario requires an explicit_configuration source and non-empty label",
      );
    }
    if (
      accountPaths.length === 0 &&
      !input.returnScenario.inflationPath
    ) {
      throw new Error(
        "returnScenario must contain at least one account returnPath or an inflationPath",
      );
    }
  }

  for (const account of accountPaths) {
    validateReturnPath({
      path: account.returnPath!,
      field: `accounts.${account.id}.returnPath`,
      startYear,
      startMonthKey,
      endYear,
      endMonthKey,
    });
  }
  if (input.returnScenario?.inflationPath) {
    validateInflationPath({
      path: input.returnScenario.inflationPath,
      field: "returnScenario.inflationPath",
      startYear,
      startMonthKey,
      endYear,
      endMonthKey,
    });
  }
  return input;
}

export function projectionResultWithReturnPaths(
  result: ProjectionResult,
): ProjectionResultWithReturnPaths {
  return result as ProjectionResultWithReturnPaths;
}
