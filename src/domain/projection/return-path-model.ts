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

function validatePath(input: {
  path: DeterministicReturnPath | DeterministicInflationPath;
  field: string;
  startYear: number;
  startMonthKey: string;
  endYear: number;
  endMonthKey: string;
  rateField:
    | "annualReturn"
    | "monthlyReturn"
    | "annualInflation"
    | "monthlyInflation";
  min: number;
  max: number;
}): void {
  if (input.path.source !== "explicit_configuration") {
    throw new Error(`${input.field}.source must be explicit_configuration`);
  }
  if (input.path.entries.length === 0) {
    throw new Error(`${input.field}.entries must not be empty`);
  }
  let previous: number | string | undefined;
  for (const [index, entry] of input.path.entries.entries()) {
    const candidate = entry as unknown as Record<string, unknown>;
    const rate = candidate[input.rateField];
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < input.min ||
      rate > input.max
    ) {
      throw new Error(
        `${input.field}.entries[${index}].${input.rateField} must be between ${input.min} and ${input.max}`,
      );
    }
    const key =
      input.path.mode === "annual"
        ? candidate.calendarYear
        : candidate.calendarMonth;
    if (
      (typeof key !== "number" && typeof key !== "string") ||
      (previous !== undefined && key <= previous)
    ) {
      throw new Error(
        `${input.field}.entries must be unique and strictly increasing by date`,
      );
    }
    if (input.path.mode === "annual") {
      if (
        !Number.isInteger(key) ||
        (key as number) < input.startYear ||
        (key as number) > input.endYear
      ) {
        throw new Error(
          `${input.field}.entries[${index}].calendarYear must fall within the projection`,
        );
      }
    } else if (
      typeof key !== "string" ||
      !/^\d{4}-\d{2}$/.test(key) ||
      key < input.startMonthKey ||
      key > input.endMonthKey
    ) {
      throw new Error(
        `${input.field}.entries[${index}].calendarMonth must fall within the projection`,
      );
    }
    previous = key;
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
    const path = account.returnPath!;
    validatePath({
      path,
      field: `accounts.${account.id}.returnPath`,
      startYear,
      startMonthKey,
      endYear,
      endMonthKey,
      rateField: path.mode === "annual" ? "annualReturn" : "monthlyReturn",
      min: -0.99,
      max: 1,
    });
  }
  const inflationPath = input.returnScenario?.inflationPath;
  if (inflationPath) {
    validatePath({
      path: inflationPath,
      field: "returnScenario.inflationPath",
      startYear,
      startMonthKey,
      endYear,
      endMonthKey,
      rateField:
        inflationPath.mode === "annual"
          ? "annualInflation"
          : "monthlyInflation",
      min: -0.2,
      max: 0.5,
    });
  }
  return input;
}

export function projectionResultWithReturnPaths(
  result: ProjectionResult,
): ProjectionResultWithReturnPaths {
  return result as ProjectionResultWithReturnPaths;
}
