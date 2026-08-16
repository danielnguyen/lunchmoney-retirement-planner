import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  parseAndValidatePlannerConfig,
  plannerConfigPath,
} from "./loader";
import type { PlannerConfig } from "./types";
import {
  parseReturnPath,
  parseReturnScenario,
  validateReturnScenarioPresence,
} from "./return-path";
import { PlannerRuntimeError } from "@/src/runtime/errors";

function rawRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an object.`,
      422,
    );
  }
  return value as Record<string, unknown>;
}

function parseRaw(
  contents: string,
  format: "YAML" | "JSON",
  sourceDescription: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = format === "YAML" ? parseYaml(contents) : JSON.parse(contents);
  } catch {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `The planner configuration ${sourceDescription} is not valid ${format}.`,
      422,
    );
  }
  return rawRecord(parsed, "The planner configuration");
}

function formatForPath(path: string): "YAML" | "JSON" {
  const extension = extname(path).toLowerCase();
  if (extension === ".yaml" || extension === ".yml") return "YAML";
  if (extension === ".json") return "JSON";
  const extensionDescription = extension ? `"${extension}"` : "no extension";
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `The planner configuration path "${path}" has an unsupported extension (${extensionDescription}). Use .yaml, .yml, or .json.`,
    422,
  );
}

export function parseAndValidatePlannerConfigWithReturnPaths(
  contents: string,
  format: "YAML" | "JSON",
  sourceDescription = "provided to the planner",
): PlannerConfig {
  const config = parseAndValidatePlannerConfig(
    contents,
    format,
    sourceDescription,
  );
  const raw = parseRaw(contents, format, sourceDescription);
  const rawAccountMappings = rawRecord(
    raw.accountMappings,
    "accountMappings",
  );
  const rawProjectionAccounts =
    raw.projectionAccounts === undefined
      ? {}
      : rawRecord(raw.projectionAccounts, "projectionAccounts");

  const accountPaths: Array<PlannerConfig["accountMappings"][string]["returnPath"]> = [];
  for (const [accountId, mapping] of Object.entries(config.accountMappings)) {
    const rawMapping = rawRecord(
      rawAccountMappings[accountId],
      `accountMappings.${accountId}`,
    );
    const returnPath = parseReturnPath(
      rawMapping.returnPath,
      `accountMappings.${accountId}.returnPath`,
    );
    if (
      returnPath &&
      (!mapping.include ||
        mapping.type === "exclude" ||
        mapping.type === "debt" ||
        mapping.type === "real_estate")
    ) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `accountMappings.${accountId}.returnPath may be configured only for an included financial account.`,
        422,
      );
    }
    if (returnPath) mapping.returnPath = returnPath;
    accountPaths.push(returnPath);
  }

  for (const [accountId, account] of Object.entries(
    config.projectionAccounts ?? {},
  )) {
    const rawAccount = rawRecord(
      rawProjectionAccounts[accountId],
      `projectionAccounts.${accountId}`,
    );
    const returnPath = parseReturnPath(
      rawAccount.returnPath,
      `projectionAccounts.${accountId}.returnPath`,
    );
    if (returnPath) account.returnPath = returnPath;
    accountPaths.push(returnPath);
  }

  const returnScenario = parseReturnScenario(raw.returnScenario);
  validateReturnScenarioPresence({ returnScenario, accountPaths });
  if (returnScenario) config.returnScenario = returnScenario;
  return config;
}

export async function plannerConfigWithReturnPathsPresent(
  path = plannerConfigPath(),
): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadPlannerConfigWithReturnPaths(
  path = plannerConfigPath(),
): Promise<PlannerConfig> {
  const format = formatForPath(path);
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new PlannerRuntimeError(
      "planner_config_missing",
      `The planner configuration is missing at "${path}". Copy config/planner.example.yaml to config/planner.local.yaml and map your Lunch Money records.`,
      422,
    );
  }
  return parseAndValidatePlannerConfigWithReturnPaths(
    contents,
    format,
    `at "${path}"`,
  );
}
