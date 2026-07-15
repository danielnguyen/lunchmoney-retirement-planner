import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import type { AssetAllocation, ProjectionEventInput } from "@/src/domain/projection/types";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import {
  plannerAccountTypes,
  transactionClassifications,
  type AccountMapping,
  type CategoryMapping,
  type PlannerAssumptions,
  type PlannerConfig,
  type TransactionClassification,
} from "./types";

export const DEFAULT_CONFIG_PATH = "config/planner.local.json";

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an object in planner.local.json.`,
      422,
    );
  }
  return value as Record<string, unknown>;
}

function number(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a finite number in planner.local.json.`,
      422,
    );
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an integer in planner.local.json.`,
      422,
    );
  }
  if (options.min !== undefined && value < options.min) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be at least ${options.min} in planner.local.json.`,
      422,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be no greater than ${options.max} in planner.local.json.`,
      422,
    );
  }
  return value;
}

function allocation(value: unknown, field: string): AssetAllocation {
  const item = record(value, field);
  return {
    cash: number(item.cash, `${field}.cash`, { min: 0, max: 1 }),
    fixedIncome: number(item.fixedIncome, `${field}.fixedIncome`, { min: 0, max: 1 }),
    equity: number(item.equity, `${field}.equity`, { min: 0, max: 1 }),
  };
}

function accountMapping(value: unknown, field: string): AccountMapping {
  const item = record(value, field);
  if (typeof item.include !== "boolean") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.include must be a boolean in planner.local.json.`,
      422,
    );
  }
  if (typeof item.type !== "string" || !plannerAccountTypes.includes(item.type as never)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.type is not a supported planner account type.`,
      422,
    );
  }
  if ((item.include && item.type === "exclude") || (!item.include && item.type !== "exclude")) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must use include=true with a financial type or include=false with type=exclude.`,
      422,
    );
  }
  return {
    include: item.include,
    type: item.type as AccountMapping["type"],
    ...(item.monthlyContribution === undefined
      ? {}
      : {
          monthlyContribution: number(item.monthlyContribution, `${field}.monthlyContribution`, {
            min: 0,
          }),
        }),
    ...(item.annualReturn === undefined
      ? {}
      : { annualReturn: number(item.annualReturn, `${field}.annualReturn`, { min: -0.99, max: 1 }) }),
    ...(item.withdrawalPriority === undefined
      ? {}
      : {
          withdrawalPriority: number(item.withdrawalPriority, `${field}.withdrawalPriority`, {
            min: 1,
            integer: true,
          }),
        }),
    ...(item.allocation === undefined ? {} : { allocation: allocation(item.allocation, `${field}.allocation`) }),
  };
}

function classification(value: unknown, field: string): TransactionClassification {
  if (typeof value !== "string" || !transactionClassifications.includes(value as never)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} is not a supported transaction classification.`,
      422,
    );
  }
  return value as TransactionClassification;
}

function categoryMapping(value: unknown, field: string): CategoryMapping {
  if (typeof value === "string") return classification(value, field);
  const item = record(value, field);
  const mapped: Exclude<CategoryMapping, string> = {
    classification: classification(item.classification, `${field}.classification`),
  };
  if (item.contributionAccountId !== undefined) {
    if (typeof item.contributionAccountId !== "string" || !item.contributionAccountId) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.contributionAccountId must be a non-empty string.`,
        422,
      );
    }
    mapped.contributionAccountId = item.contributionAccountId;
  }
  if (item.contributionDirection !== undefined) {
    if (item.contributionDirection !== "debit" && item.contributionDirection !== "credit") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.contributionDirection must be debit or credit.`,
        422,
      );
    }
    mapped.contributionDirection = item.contributionDirection;
  }
  if (
    mapped.classification !== "investment_contribution" &&
    (mapped.contributionAccountId || mapped.contributionDirection)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} may set contribution fields only for investment_contribution.`,
      422,
    );
  }
  return mapped;
}

function assumptions(value: unknown): PlannerAssumptions {
  const item = record(value, "assumptions");
  const allocations = record(item.allocations, "assumptions.allocations");
  return {
    inflation: number(item.inflation, "assumptions.inflation", { min: -0.2, max: 0.5 }),
    cashReturn: number(item.cashReturn, "assumptions.cashReturn", { min: -0.99, max: 1 }),
    tfsaReturn: number(item.tfsaReturn, "assumptions.tfsaReturn", { min: -0.99, max: 1 }),
    rrspReturn: number(item.rrspReturn, "assumptions.rrspReturn", { min: -0.99, max: 1 }),
    nonRegisteredReturn: number(item.nonRegisteredReturn, "assumptions.nonRegisteredReturn", {
      min: -0.99,
      max: 1,
    }),
    debtReturn: number(item.debtReturn, "assumptions.debtReturn", { min: -0.99, max: 1 }),
    incomeGrowth: number(item.incomeGrowth, "assumptions.incomeGrowth", { min: -0.2, max: 0.5 }),
    contributionIndexing: number(item.contributionIndexing, "assumptions.contributionIndexing", {
      min: -0.2,
      max: 0.5,
    }),
    cppIndexing: number(item.cppIndexing, "assumptions.cppIndexing", { min: -0.2, max: 0.5 }),
    oasIndexing: number(item.oasIndexing, "assumptions.oasIndexing", { min: -0.2, max: 0.5 }),
    effectiveTaxRate: number(item.effectiveTaxRate, "assumptions.effectiveTaxRate", {
      min: 0,
      max: 0.8,
    }),
    oasRecoveryThreshold: number(item.oasRecoveryThreshold, "assumptions.oasRecoveryThreshold", {
      min: 0,
    }),
    oasRecoveryRate: number(item.oasRecoveryRate, "assumptions.oasRecoveryRate", { min: 0, max: 1 }),
    pensionAnnualIncome: number(item.pensionAnnualIncome, "assumptions.pensionAnnualIncome", { min: 0 }),
    pensionStartAge: number(item.pensionStartAge, "assumptions.pensionStartAge", {
      min: 18,
      max: 100,
      integer: true,
    }),
    pensionIndexing: number(item.pensionIndexing, "assumptions.pensionIndexing", {
      min: -0.2,
      max: 0.5,
    }),
    rrifConversionAge: number(item.rrifConversionAge, "assumptions.rrifConversionAge", {
      min: 18,
      max: 100,
      integer: true,
    }),
    allocations: {
      cash: allocation(allocations.cash, "assumptions.allocations.cash"),
      tfsa: allocation(allocations.tfsa, "assumptions.allocations.tfsa"),
      rrsp: allocation(allocations.rrsp, "assumptions.allocations.rrsp"),
      non_registered: allocation(
        allocations.non_registered,
        "assumptions.allocations.non_registered",
      ),
      debt: allocation(allocations.debt, "assumptions.allocations.debt"),
    },
  };
}

function events(value: unknown): ProjectionEventInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "futureEvents must be an array in planner.local.json.",
      422,
    );
  }
  return value.map((raw, index) => {
    const item = record(raw, `futureEvents[${index}]`);
    if (typeof item.id !== "string" || typeof item.label !== "string") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `futureEvents[${index}] requires string id and label values.`,
        422,
      );
    }
    if (item.direction !== "inflow" && item.direction !== "outflow") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `futureEvents[${index}].direction must be inflow or outflow.`,
        422,
      );
    }
    return {
      id: item.id,
      label: item.label,
      calendarYear: number(item.calendarYear, `futureEvents[${index}].calendarYear`, {
        min: 1900,
        max: 2300,
        integer: true,
      }),
      month: number(item.month, `futureEvents[${index}].month`, { min: 1, max: 12, integer: true }),
      amountToday: number(item.amountToday, `futureEvents[${index}].amountToday`, { min: 0 }),
      direction: item.direction,
      ...(typeof item.targetAccountId === "string" ? { targetAccountId: item.targetAccountId } : {}),
    };
  });
}

export function validatePlannerConfig(value: unknown): PlannerConfig {
  const item = record(value, "planner.local.json");
  const rawAccountMappings = record(item.accountMappings, "accountMappings");
  const rawCategoryMappings = record(item.categoryMappings, "categoryMappings");
  const config: PlannerConfig = {
    currentAge: number(item.currentAge, "currentAge", { min: 18, max: 100, integer: true }),
    retirementAge: number(item.retirementAge, "retirementAge", { min: 19, max: 100, integer: true }),
    projectionEndAge: number(item.projectionEndAge, "projectionEndAge", {
      min: 19,
      max: 120,
      integer: true,
    }),
    cppStartAge: number(item.cppStartAge, "cppStartAge", { min: 60, max: 70, integer: true }),
    oasStartAge: number(item.oasStartAge, "oasStartAge", { min: 65, max: 70, integer: true }),
    cppMonthlyAmountAt65: number(item.cppMonthlyAmountAt65, "cppMonthlyAmountAt65", { min: 0 }),
    oasMonthlyAmountAt65: number(item.oasMonthlyAmountAt65, "oasMonthlyAmountAt65", { min: 0 }),
    retirementGoal: number(item.retirementGoal, "retirementGoal", { min: 0 }),
    transactionTrailingMonths: number(item.transactionTrailingMonths, "transactionTrailingMonths", {
      min: 1,
      max: 60,
      integer: true,
    }),
    accountMappings: Object.fromEntries(
      Object.entries(rawAccountMappings).map(([id, mapping]) => [
        id,
        accountMapping(mapping, `accountMappings.${id}`),
      ]),
    ),
    categoryMappings: Object.fromEntries(
      Object.entries(rawCategoryMappings).map(([id, mapping]) => [
        id,
        categoryMapping(mapping, `categoryMappings.${id}`),
      ]),
    ),
    assumptions: assumptions(item.assumptions),
    futureEvents: events(item.futureEvents),
  };

  if (config.retirementAge <= config.currentAge) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "retirementAge must be greater than currentAge in planner.local.json.",
      422,
    );
  }
  if (config.projectionEndAge < config.retirementAge) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "projectionEndAge must be at least retirementAge in planner.local.json.",
      422,
    );
  }
  return config;
}

export function plannerConfigPath(): string {
  return process.env.PLANNER_CONFIG_PATH || DEFAULT_CONFIG_PATH;
}

export async function plannerConfigPresent(path = plannerConfigPath()): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadPlannerConfig(path = plannerConfigPath()): Promise<PlannerConfig> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch {
    throw new PlannerRuntimeError(
      "planner_config_missing",
      "Private planner configuration is missing. Copy config/planner.example.json to config/planner.local.json and map your Lunch Money records.",
      422,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Private planner configuration is not valid JSON.",
      422,
    );
  }
  return validatePlannerConfig(parsed);
}
