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
  returnScenario: ReturnScenarioCalculationSummary;
};

export function projectionInputsWithReturnPaths(
  input: ProjectionInputs,
): ProjectionInputsWithReturnPaths {
  return input as ProjectionInputsWithReturnPaths;
}

export function projectionResultWithReturnPaths(
  result: ProjectionResult,
): ProjectionResultWithReturnPaths {
  return result as ProjectionResultWithReturnPaths;
}
