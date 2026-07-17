import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  contributionFundingTypes,
  type AssetAllocation,
  type ProjectionEventInput,
} from "@/src/domain/projection/types";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import {
  plannerAccountTypes,
  transactionClassifications,
  type AccountMapping,
  type CategoryMapping,
  type ContributionPhaseConfig,
  type CppAmountAt65Config,
  type EmploymentIncomePhaseConfig,
  type GovernmentBenefitsConfig,
  type LiveBaselineAmount,
  type OasEligibilityConfig,
  type OasFullAmountAt65Config,
  type PlannerAssumptions,
  type PlannerConfig,
  type TransactionClassification,
} from "./types";

export const DEFAULT_CONFIG_PATH = "config/planner.local.yaml";
const PHASE_AGE_TOLERANCE = 1e-6;

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

function number(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a finite number.`,
      422,
    );
  }
  if (options.integer && !Number.isInteger(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an integer.`,
      422,
    );
  }
  if (options.min !== undefined && value < options.min) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be at least ${options.min}.`,
      422,
    );
  }
  if (options.max !== undefined && value > options.max) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be no greater than ${options.max}.`,
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

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a non-empty string.`,
      422,
    );
  }
  return value;
}

function isoCalendarDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an ISO calendar date in YYYY-MM-DD format.`,
      422,
    );
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a valid ISO calendar date.`,
      422,
    );
  }
  return value;
}

function rejectFields(
  item: Record<string, unknown>,
  field: string,
  names: string[],
): void {
  const present = names.filter((name) => item[name] !== undefined);
  if (present.length > 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} does not accept ${present.join(", ")} for this source mode.`,
      422,
    );
  }
}

function cppAmountAt65(value: unknown): CppAmountAt65Config {
  const field = "governmentBenefits.cpp.amountAt65";
  const item = record(value, field);
  if (item.source === "official_estimate" || item.source === "configured_amount") {
    return {
      source: item.source,
      monthlyAmountToday: number(item.monthlyAmountToday, `${field}.monthlyAmountToday`, {
        min: 0,
      }),
      effectiveDate: isoCalendarDate(item.effectiveDate, `${field}.effectiveDate`),
    };
  }
  if (item.source === "canadian_reference" || item.source === "explicit_zero") {
    rejectFields(item, field, ["monthlyAmountToday", "effectiveDate"]);
    return { source: item.source };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `${field}.source must be official_estimate, configured_amount, canadian_reference, or explicit_zero.`,
    422,
  );
}

function oasFullAmountAt65(value: unknown): OasFullAmountAt65Config {
  const field = "governmentBenefits.oas.fullAmountAt65";
  const item = record(value, field);
  if (item.source === "configured_amount") {
    return {
      source: item.source,
      monthlyAmountToday: number(item.monthlyAmountToday, `${field}.monthlyAmountToday`, {
        min: 0,
      }),
      effectiveDate: isoCalendarDate(item.effectiveDate, `${field}.effectiveDate`),
    };
  }
  if (item.source === "canadian_reference") {
    rejectFields(item, field, ["monthlyAmountToday", "effectiveDate"]);
    return { source: item.source };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `${field}.source must be configured_amount or canadian_reference.`,
    422,
  );
}

function oasEligibility(value: unknown): OasEligibilityConfig {
  const field = "governmentBenefits.oas.eligibility";
  const item = record(value, field);
  if (item.mode === "partial") {
    return {
      mode: "partial",
      qualifyingResidenceYearsAfter18: number(
        item.qualifyingResidenceYearsAfter18,
        `${field}.qualifyingResidenceYearsAfter18`,
        { min: 1, max: 39, integer: true },
      ),
    };
  }
  if (item.mode === "full" || item.mode === "none") {
    rejectFields(item, field, ["qualifyingResidenceYearsAfter18"]);
    return { mode: item.mode };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    `${field}.mode must be full, partial, or none.`,
    422,
  );
}

function governmentBenefits(value: unknown): GovernmentBenefitsConfig {
  const item = record(value, "governmentBenefits");
  const cpp = record(item.cpp, "governmentBenefits.cpp");
  const oas = record(item.oas, "governmentBenefits.oas");
  return {
    cpp: {
      startAge: number(cpp.startAge, "governmentBenefits.cpp.startAge", {
        min: 60,
        max: 70,
      }),
      indexingRate: number(cpp.indexingRate, "governmentBenefits.cpp.indexingRate", {
        min: -0.2,
        max: 0.5,
      }),
      amountAt65: cppAmountAt65(cpp.amountAt65),
    },
    oas: {
      startAge: number(oas.startAge, "governmentBenefits.oas.startAge", {
        min: 65,
        max: 70,
      }),
      indexingRate: number(oas.indexingRate, "governmentBenefits.oas.indexingRate", {
        min: -0.2,
        max: 0.5,
      }),
      fullAmountAt65: oasFullAmountAt65(oas.fullAmountAt65),
      eligibility: oasEligibility(oas.eligibility),
    },
  };
}

function liveBaselineAmount(value: unknown, field: string): LiveBaselineAmount {
  if (value === "live_baseline") return value;
  if (typeof value === "string") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be a non-negative number or the exact string live_baseline.`,
      422,
    );
  }
  return number(value, field, { min: 0 });
}

function contributionPhases(value: unknown, field: string): ContributionPhaseConfig[] {
  if (!Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must be an array.`,
      422,
    );
  }
  return value.map((raw, index) => {
    const phaseField = `${field}[${index}]`;
    const item = record(raw, phaseField);
    if (
      typeof item.funding !== "string" ||
      !contributionFundingTypes.includes(item.funding as never)
    ) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${phaseField}.funding must be cash or income_withheld.`,
        422,
      );
    }
    return {
      id: nonEmptyString(item.id, `${phaseField}.id`),
      label: nonEmptyString(item.label, `${phaseField}.label`),
      startAge: number(item.startAge, `${phaseField}.startAge`, { min: 18, max: 100 }),
      endAge: number(item.endAge, `${phaseField}.endAge`, { min: 18, max: 100 }),
      monthlyAmountToday: liveBaselineAmount(
        item.monthlyAmountToday,
        `${phaseField}.monthlyAmountToday`,
      ),
      funding: item.funding as ContributionPhaseConfig["funding"],
      indexingRate: number(item.indexingRate, `${phaseField}.indexingRate`, {
        min: -0.2,
        max: 0.5,
      }),
    };
  });
}

function accountMapping(value: unknown, field: string): AccountMapping {
  const item = record(value, field);
  if (typeof item.include !== "boolean") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.include must be a boolean.`,
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
  const investmentTypes = ["tfsa", "rrsp", "non_registered"];
  if (
    item.contributionPhases !== undefined &&
    (item.monthlyContribution !== undefined || item.contributionFunding !== undefined)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} cannot combine contributionPhases with legacy monthlyContribution or contributionFunding fields.`,
      422,
    );
  }
  if (item.contributionPhases !== undefined && !investmentTypes.includes(item.type)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionPhases may only be configured for a TFSA, RRSP/RRIF, or non-registered account.`,
      422,
    );
  }
  if (item.monthlyContribution !== undefined && !investmentTypes.includes(item.type)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.monthlyContribution may only be configured for an investment account.`,
      422,
    );
  }
  if (item.monthlyContribution !== undefined && item.contributionFunding === undefined) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionFunding must be cash or income_withheld when monthlyContribution is configured.`,
      422,
    );
  }
  if (
    item.contributionFunding !== undefined &&
    (typeof item.contributionFunding !== "string" ||
      !contributionFundingTypes.includes(item.contributionFunding as never))
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionFunding must be cash or income_withheld.`,
      422,
    );
  }
  if (item.contributionFunding !== undefined && !investmentTypes.includes(item.type)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionFunding may only be configured for an investment account.`,
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
    ...(item.contributionFunding === undefined
      ? {}
      : { contributionFunding: item.contributionFunding as AccountMapping["contributionFunding"] }),
    ...(item.contributionPhases === undefined
      ? {}
      : {
          contributionPhases: contributionPhases(
            item.contributionPhases,
            `${field}.contributionPhases`,
          ),
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
    incomeGrowth:
      item.incomeGrowth === undefined
        ? 0
        : number(item.incomeGrowth, "assumptions.incomeGrowth", { min: -0.2, max: 0.5 }),
    contributionIndexing:
      item.contributionIndexing === undefined
        ? 0
        : number(item.contributionIndexing, "assumptions.contributionIndexing", {
            min: -0.2,
            max: 0.5,
          }),
    ...(item.cppIndexing === undefined
      ? {}
      : {
          cppIndexing: number(item.cppIndexing, "assumptions.cppIndexing", {
            min: -0.2,
            max: 0.5,
          }),
        }),
    ...(item.oasIndexing === undefined
      ? {}
      : {
          oasIndexing: number(item.oasIndexing, "assumptions.oasIndexing", {
            min: -0.2,
            max: 0.5,
          }),
        }),
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

function employmentIncomePhases(value: unknown): EmploymentIncomePhaseConfig[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "employmentIncomePhases must contain at least one phase when configured.",
      422,
    );
  }
  return value.map((raw, index) => {
    const field = `employmentIncomePhases[${index}]`;
    const item = record(raw, field);
    return {
      id: nonEmptyString(item.id, `${field}.id`),
      label: nonEmptyString(item.label, `${field}.label`),
      startAge: number(item.startAge, `${field}.startAge`, { min: 18, max: 100 }),
      endAge: number(item.endAge, `${field}.endAge`, { min: 18, max: 100 }),
      annualNetCashToday: liveBaselineAmount(
        item.annualNetCashToday,
        `${field}.annualNetCashToday`,
      ),
      annualGrowth: number(item.annualGrowth, `${field}.annualGrowth`, {
        min: -0.2,
        max: 0.5,
      }),
    };
  });
}

function sameAge(left: number, right: number): boolean {
  return Math.abs(left - right) <= PHASE_AGE_TOLERANCE;
}

function assertMonthAligned(age: number, currentAge: number, field: string): void {
  const elapsedMonths = (age - currentAge) * 12;
  if (Math.abs(elapsedMonths - Math.round(elapsedMonths)) > PHASE_AGE_TOLERANCE) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must align to a projection month relative to currentAge.`,
      422,
    );
  }
}

function validateEmploymentPhaseRanges(config: PlannerConfig): void {
  const phases = config.employmentIncomePhases;
  if (!phases) return;
  const ids = new Set<string>();
  for (const [index, phase] of phases.entries()) {
    const field = `employmentIncomePhases[${index}]`;
    if (ids.has(phase.id)) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `employmentIncomePhases contains duplicate phase id "${phase.id}".`,
        422,
      );
    }
    ids.add(phase.id);
    if (phase.startAge < config.currentAge - PHASE_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.startAge must not be before currentAge.`,
        422,
      );
    }
    if (phase.endAge > config.retirementAge + PHASE_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.endAge must not be after retirementAge.`,
        422,
      );
    }
    if (phase.endAge <= phase.startAge + PHASE_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.endAge must be greater than startAge.`,
        422,
      );
    }
    assertMonthAligned(phase.startAge, config.currentAge, `${field}.startAge`);
    assertMonthAligned(phase.endAge, config.currentAge, `${field}.endAge`);
    const previous = phases[index - 1];
    if (!previous) continue;
    if (phase.startAge < previous.endAge - PHASE_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `employmentIncomePhases overlap between "${previous.id}" and "${phase.id}".`,
        422,
      );
    }
    if (phase.startAge > previous.endAge + PHASE_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `employmentIncomePhases have a gap between "${previous.id}" and "${phase.id}".`,
        422,
      );
    }
  }
  if (!sameAge(phases[0]!.startAge, config.currentAge)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The first employmentIncomePhase must begin at currentAge.",
      422,
    );
  }
  if (!sameAge(phases.at(-1)!.endAge, config.retirementAge)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The final employmentIncomePhase must end at retirementAge.",
      422,
    );
  }
}

function validateContributionPhaseRanges(config: PlannerConfig): void {
  for (const [accountId, mapping] of Object.entries(config.accountMappings)) {
    const phases = mapping.contributionPhases;
    if (!phases) continue;
    const ids = new Set<string>();
    for (const [index, phase] of phases.entries()) {
      const field = `accountMappings.${accountId}.contributionPhases[${index}]`;
      if (ids.has(phase.id)) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} duplicates contribution phase id "${phase.id}".`,
          422,
        );
      }
      ids.add(phase.id);
      if (
        phase.startAge < config.currentAge - PHASE_AGE_TOLERANCE ||
        phase.endAge > config.retirementAge + PHASE_AGE_TOLERANCE
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} must stay within currentAge and retirementAge.`,
          422,
        );
      }
      if (phase.endAge <= phase.startAge + PHASE_AGE_TOLERANCE) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field}.endAge must be greater than startAge.`,
          422,
        );
      }
      assertMonthAligned(phase.startAge, config.currentAge, `${field}.startAge`);
      assertMonthAligned(phase.endAge, config.currentAge, `${field}.endAge`);
      const previous = phases[index - 1];
      if (previous && phase.startAge < previous.endAge - PHASE_AGE_TOLERANCE) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} overlaps contribution phase "${previous.id}".`,
          422,
        );
      }
    }
  }
}

function events(value: unknown): ProjectionEventInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "futureEvents must be an array.",
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
  const item = record(value, "The planner configuration");
  const rawAssumptions = record(item.assumptions, "assumptions");
  const legacyBenefitFields = [
    "cppStartAge",
    "oasStartAge",
    "cppMonthlyAmountAt65",
    "oasMonthlyAmountAt65",
  ] as const;
  const presentLegacyFields = legacyBenefitFields.filter(
    (field) => item[field] !== undefined,
  );
  const presentLegacyIndexing = ["cppIndexing", "oasIndexing"].filter(
    (field) => rawAssumptions[field] !== undefined,
  );
  if (
    item.governmentBenefits !== undefined &&
    (presentLegacyFields.length > 0 || presentLegacyIndexing.length > 0)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "governmentBenefits cannot be combined with legacy CPP or OAS fields.",
      422,
    );
  }
  if (
    item.governmentBenefits === undefined &&
    (presentLegacyFields.length !== legacyBenefitFields.length ||
      presentLegacyIndexing.length !== 2)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Configure governmentBenefits, or provide the complete legacy CPP and OAS scalar configuration.",
      422,
    );
  }
  const rawAccountMappings = record(item.accountMappings, "accountMappings");
  const rawCategoryMappings = record(item.categoryMappings, "categoryMappings");
  const config: PlannerConfig = {
    currentAge: number(item.currentAge, "currentAge", { min: 18, max: 100 }),
    retirementAge: number(item.retirementAge, "retirementAge", { min: 19, max: 100 }),
    projectionEndAge: number(item.projectionEndAge, "projectionEndAge", {
      min: 19,
      max: 120,
    }),
    ...(item.governmentBenefits === undefined
      ? {
          cppStartAge: number(item.cppStartAge, "cppStartAge", {
            min: 60,
            max: 70,
            integer: true,
          }),
          oasStartAge: number(item.oasStartAge, "oasStartAge", {
            min: 65,
            max: 70,
            integer: true,
          }),
          cppMonthlyAmountAt65: number(
            item.cppMonthlyAmountAt65,
            "cppMonthlyAmountAt65",
            { min: 0 },
          ),
          oasMonthlyAmountAt65: number(
            item.oasMonthlyAmountAt65,
            "oasMonthlyAmountAt65",
            { min: 0 },
          ),
        }
      : { governmentBenefits: governmentBenefits(item.governmentBenefits) }),
    retirementGoal: number(item.retirementGoal, "retirementGoal", { min: 0 }),
    transactionTrailingMonths: number(item.transactionTrailingMonths, "transactionTrailingMonths", {
      min: 1,
      max: 60,
      integer: true,
    }),
    ...(item.employmentIncomePhases === undefined
      ? {}
      : {
          employmentIncomePhases: employmentIncomePhases(
            item.employmentIncomePhases,
          ),
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
      "retirementAge must be greater than currentAge in the planner configuration.",
      422,
    );
  }
  if (config.projectionEndAge < config.retirementAge) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "projectionEndAge must be at least retirementAge in the planner configuration.",
      422,
    );
  }
  assertMonthAligned(config.retirementAge, config.currentAge, "retirementAge");
  assertMonthAligned(config.projectionEndAge, config.currentAge, "projectionEndAge");
  validateEmploymentPhaseRanges(config);
  validateContributionPhaseRanges(config);
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
  const extension = extname(path).toLowerCase();
  const format =
    extension === ".yaml" || extension === ".yml"
      ? "YAML"
      : extension === ".json"
        ? "JSON"
        : undefined;

  if (!format) {
    const extensionDescription = extension ? `"${extension}"` : "no extension";
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `The planner configuration path "${path}" has an unsupported extension (${extensionDescription}). Use .yaml, .yml, or .json.`,
      422,
    );
  }

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

  let parsed: unknown;
  try {
    parsed = format === "YAML" ? parseYaml(contents) : JSON.parse(contents);
  } catch {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `The planner configuration at "${path}" is not valid ${format}.`,
      422,
    );
  }
  return validatePlannerConfig(parsed);
}
