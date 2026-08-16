import type { PlannerConfig, ReturnPathConfig } from "@/src/config/types";
import type { CurrentBaseline } from "./types";
import type {
  DeterministicInflationPath,
  DeterministicReturnPath,
} from "@/src/domain/projection/return-path";
import type {
  FinancialAccountWithReturnPath,
  ProjectionInputsWithReturnPaths,
} from "@/src/domain/projection/return-path-model";

function resolvedReturnPath(
  path: ReturnPathConfig | undefined,
): DeterministicReturnPath | undefined {
  if (!path) return undefined;
  return {
    ...path,
    source: "explicit_configuration",
    entries: path.entries.map((entry) => ({ ...entry })) as never,
  } as DeterministicReturnPath;
}

function resolvedInflationPath(
  path: PlannerConfig["returnScenario"] extends infer Scenario
    ? Scenario extends { inflationPath?: infer Path }
      ? Path
      : never
    : never,
): DeterministicInflationPath | undefined {
  if (!path) return undefined;
  return {
    ...path,
    source: "explicit_configuration",
    entries: path.entries.map((entry) => ({ ...entry })) as never,
  } as DeterministicInflationPath;
}

function importedPath(
  baseline: CurrentBaseline,
  config: PlannerConfig,
  accountId: string,
): ReturnPathConfig | undefined {
  const canonical = config.accountMappings[accountId]?.returnPath;
  if (canonical) return canonical;
  const baselineAccount = baseline.derived.accountBalances.find(
    (account) => account.id === accountId,
  );
  if (baselineAccount?.lunchMoneyId === null || baselineAccount?.lunchMoneyId === undefined) {
    return undefined;
  }
  const matchingIdCount = baseline.derived.accountBalances.filter(
    (account) => account.lunchMoneyId === baselineAccount.lunchMoneyId,
  ).length;
  if (matchingIdCount !== 1) return undefined;
  return config.accountMappings[String(baselineAccount.lunchMoneyId)]?.returnPath;
}

export function attachReturnScenarioToBaseline(
  baseline: CurrentBaseline,
  config: PlannerConfig,
): CurrentBaseline {
  if (!config.returnScenario) return baseline;

  const projectionInputs = baseline.projectionInputs as ProjectionInputsWithReturnPaths;
  const accounts: FinancialAccountWithReturnPath[] = projectionInputs.accounts.map(
    (account) => {
      const configuredPath =
        account.origin === "projection_configuration"
          ? config.projectionAccounts?.[account.id]?.returnPath
          : importedPath(baseline, config, account.id);
      const returnPath = resolvedReturnPath(configuredPath);
      if (!returnPath) return account;
      baseline.provenance[`accounts.${account.id}.returnPath`] = {
        value: returnPath,
        sourceType: "local_configuration",
        sourceDescription:
          "Explicit deterministic return path from private planner configuration",
        effectiveDate: baseline.dataThrough,
      };
      return { ...account, returnPath };
    },
  );

  const inflationPath = resolvedInflationPath(
    config.returnScenario.inflationPath,
  );
  projectionInputs.accounts = accounts;
  projectionInputs.returnScenario = {
    label: config.returnScenario.label,
    source: "explicit_configuration",
    ...(inflationPath ? { inflationPath } : {}),
  };
  baseline.provenance["returnScenario.label"] = {
    value: config.returnScenario.label,
    sourceType: "local_configuration",
    sourceDescription:
      "Owner-supplied label for the active deterministic return scenario",
    effectiveDate: baseline.dataThrough,
  };
  if (inflationPath) {
    baseline.provenance["returnScenario.inflationPath"] = {
      value: inflationPath,
      sourceType: "local_configuration",
      sourceDescription:
        "Explicit deterministic inflation path from private planner configuration",
      effectiveDate: baseline.dataThrough,
    };
  }
  return baseline;
}
