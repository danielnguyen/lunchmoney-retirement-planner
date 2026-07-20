import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { extname } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  contributionFundingTypes,
  PROJECTION_AGE_TOLERANCE,
  projectionMonthOffset,
  type AssetAllocation,
  type ProjectionEventInput,
  type RegisteredAccountRoomInput,
  type ContributionWaterfallInput,
  type SurplusAllocationPolicyInput,
} from "@/src/domain/projection/types";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import {
  accountRoles,
  plannerAccountTypes,
  transactionClassifications,
  type AccountRole,
  type AccountMapping,
  type CategoryMapping,
  type ContributionPhaseConfig,
  type CppAmountAt65Config,
  type EmploymentIncomePhaseConfig,
  type GovernmentBenefitsConfig,
  type LiveBaselineAmount,
  type LiabilityTreatmentConfig,
  type OasEligibilityConfig,
  type OasFullAmountAt65Config,
  type PlannerAccountType,
  type PlannerAssumptions,
  type PlannerConfig,
  type ProjectionAccountConfig,
  type PrimaryResidenceConfig,
  type RegisteredRoomConfig,
  type SavingsPlanPhaseConfig,
  type SavingsPolicyConfig,
  type TransactionClassification,
} from "./types";

export const DEFAULT_CONFIG_PATH = "config/planner.local.yaml";

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

function savingsPlanPhases(
  value: unknown,
  field: string,
): SavingsPlanPhaseConfig[] {
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
    return {
      id: nonEmptyString(item.id, `${phaseField}.id`),
      label: nonEmptyString(item.label, `${phaseField}.label`),
      startAge: number(item.startAge, `${phaseField}.startAge`, {
        min: 18,
        max: 100,
      }),
      endAge: number(item.endAge, `${phaseField}.endAge`, {
        min: 18,
        max: 100,
      }),
      monthlyAmountToday: number(
        item.monthlyAmountToday,
        `${phaseField}.monthlyAmountToday`,
        { min: 0 },
      ),
      indexingRate: number(
        item.indexingRate,
        `${phaseField}.indexingRate`,
        { min: -0.2, max: 0.5 },
      ),
    };
  });
}

function registeredRoom(value: unknown): RegisteredRoomConfig {
  const item = record(value, "registeredRoom");
  const tfsa = record(item.tfsa, "registeredRoom.tfsa");
  const rrsp = record(item.rrsp, "registeredRoom.rrsp");
  if (rrsp.beforeProjectionStart !== undefined) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredRoom.rrsp.beforeProjectionStart was renamed to registeredRoom.rrsp.currentYearBeforePlanStart. Update the simple configuration field name.",
      422,
    );
  }
  const before =
    rrsp.currentYearBeforePlanStart === undefined
      ? undefined
      : record(
          rrsp.currentYearBeforePlanStart,
          "registeredRoom.rrsp.currentYearBeforePlanStart",
        );
  return {
    tfsa: {
      availableAtStart: number(
        tfsa.availableAtStart,
        "registeredRoom.tfsa.availableAtStart",
        { min: 0 },
      ),
      asOf: isoCalendarDate(tfsa.asOf, "registeredRoom.tfsa.asOf"),
    },
    rrsp: {
      availableAtStart: number(
        rrsp.availableAtStart,
        "registeredRoom.rrsp.availableAtStart",
        { min: 0 },
      ),
      asOf: isoCalendarDate(rrsp.asOf, "registeredRoom.rrsp.asOf"),
      ...(before
        ? {
            currentYearBeforePlanStart: {
              eligibleEarnedIncome: number(
                before.eligibleEarnedIncome,
                "registeredRoom.rrsp.currentYearBeforePlanStart.eligibleEarnedIncome",
                { min: 0 },
              ),
              pensionAdjustment: number(
                before.pensionAdjustment,
                "registeredRoom.rrsp.currentYearBeforePlanStart.pensionAdjustment",
                { min: 0 },
              ),
              otherReduction: number(
                before.otherReduction,
                "registeredRoom.rrsp.currentYearBeforePlanStart.otherReduction",
                { min: 0 },
              ),
            },
          }
        : {}),
    },
  };
}

function primaryResidence(value: unknown): PrimaryResidenceConfig {
  const item = record(value, "primaryResidence");
  return {
    currentValue: number(
      item.currentValue,
      "primaryResidence.currentValue",
      { min: 0 },
    ),
    asOf: isoCalendarDate(item.asOf, "primaryResidence.asOf"),
    annualAppreciation: number(
      item.annualAppreciation,
      "primaryResidence.annualAppreciation",
      { min: -0.99, max: 1 },
    ),
  };
}

function liabilityTreatment(
  value: unknown,
  field: string,
): LiabilityTreatmentConfig {
  const item = record(value, field);
  const historicalPaymentHandling =
    item.historicalPaymentHandling === undefined
      ? undefined
      : item.historicalPaymentHandling;
  if (
    historicalPaymentHandling !== undefined &&
    historicalPaymentHandling !== "already_excluded_or_transfer"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.historicalPaymentHandling must be already_excluded_or_transfer when debt payments are intentionally absent from category mappings.`,
      422,
    );
  }
  if (item.mode === "payoff_at_projection_start") {
    rejectFields(item, field, [
      "annualInterestRate",
      "regularPayment",
      "scheduleStartDate",
      "lumpSumPayments",
    ]);
    return {
      mode: "payoff_at_projection_start",
      ...(historicalPaymentHandling
        ? { historicalPaymentHandling }
        : {}),
    };
  }
  if (item.mode !== "amortizing") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.mode must be amortizing or payoff_at_projection_start.`,
      422,
    );
  }
  const payment = record(item.regularPayment, `${field}.regularPayment`);
  if (
    payment.frequency !== "monthly" &&
    payment.frequency !== "semimonthly" &&
    payment.frequency !== "biweekly" &&
    payment.frequency !== "weekly"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.regularPayment.frequency must be monthly, semimonthly, biweekly, or weekly.`,
      422,
    );
  }
  if (!Array.isArray(item.lumpSumPayments)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.lumpSumPayments must be an array, including [] when none apply.`,
      422,
    );
  }
  return {
    mode: "amortizing",
    annualInterestRate: number(
      item.annualInterestRate,
      `${field}.annualInterestRate`,
      { min: 0, max: 1 },
    ),
    regularPayment: {
      amount: number(payment.amount, `${field}.regularPayment.amount`, {
        min: Number.MIN_VALUE,
      }),
      frequency: payment.frequency,
    },
    scheduleStartDate: isoCalendarDate(
      item.scheduleStartDate,
      `${field}.scheduleStartDate`,
    ),
    lumpSumPayments: item.lumpSumPayments.map((raw, index) => {
      const lump = record(raw, `${field}.lumpSumPayments[${index}]`);
      return {
        date: isoCalendarDate(
          lump.date,
          `${field}.lumpSumPayments[${index}].date`,
        ),
        amount: number(
          lump.amount,
          `${field}.lumpSumPayments[${index}].amount`,
          { min: Number.MIN_VALUE },
        ),
      };
    }),
    ...(historicalPaymentHandling
      ? { historicalPaymentHandling }
      : {}),
  };
}

function savingsPolicy(value: unknown): SavingsPolicyConfig {
  const item = record(value, "savingsPolicy");
  if (item.unplannedCash !== "retain_in_operating_cash") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "savingsPolicy.unplannedCash must be retain_in_operating_cash.",
      422,
    );
  }
  const personal = record(
    item.personalInvesting,
    "savingsPolicy.personalInvesting",
  );
  if (
    !Array.isArray(personal.order) ||
    personal.order.length !== 3 ||
    personal.order[0] !== "personal_tfsa" ||
    personal.order[1] !== "personal_rrsp" ||
    personal.order[2] !== "taxable"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "savingsPolicy.personalInvesting.order must be [personal_tfsa, personal_rrsp, taxable].",
      422,
    );
  }
  const reserve = record(
    item.reserveBuilding,
    "savingsPolicy.reserveBuilding",
  );
  if (reserve.afterTarget !== "personal_investing") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "savingsPolicy.reserveBuilding.afterTarget must be personal_investing.",
      422,
    );
  }
  const workplace =
    item.workplaceRrsp === undefined
      ? undefined
      : record(item.workplaceRrsp, "savingsPolicy.workplaceRrsp");
  if (workplace && workplace.roomPriority !== "first") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "savingsPolicy.workplaceRrsp.roomPriority must be first.",
      422,
    );
  }
  if (workplace && workplace.overflow !== "unallocated") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "savingsPolicy.workplaceRrsp.overflow must be unallocated.",
      422,
    );
  }
  return {
    unplannedCash: "retain_in_operating_cash",
    personalInvesting: {
      order: ["personal_tfsa", "personal_rrsp", "taxable"],
      phases: savingsPlanPhases(
        personal.phases,
        "savingsPolicy.personalInvesting.phases",
      ),
    },
    reserveBuilding: {
      targetToday: number(
        reserve.targetToday,
        "savingsPolicy.reserveBuilding.targetToday",
        { min: 0 },
      ),
      indexingRate: number(
        reserve.indexingRate,
        "savingsPolicy.reserveBuilding.indexingRate",
        { min: -0.2, max: 0.5 },
      ),
      phases: savingsPlanPhases(
        reserve.phases,
        "savingsPolicy.reserveBuilding.phases",
      ),
      afterTarget: "personal_investing",
    },
    ...(workplace
      ? {
          workplaceRrsp: {
            roomPriority: "first",
            overflow: "unallocated",
            phases: savingsPlanPhases(
              workplace.phases,
              "savingsPolicy.workplaceRrsp.phases",
            ),
          },
        }
      : {}),
  };
}

function projectionAccount(
  value: unknown,
  field: string,
): ProjectionAccountConfig {
  const item = record(value, field);
  if ("openingBalance" in item) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.openingBalance is not configurable; projection-only accounts always open at zero.`,
      422,
    );
  }
  if (
    item.type !== "cash" &&
    item.type !== "tfsa" &&
    item.type !== "rrsp" &&
    item.type !== "non_registered"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.type must be cash, tfsa, rrsp, or non_registered; debt and exclude are not supported.`,
      422,
    );
  }
  const phases = contributionPhases(
    item.contributionPhases,
    `${field}.contributionPhases`,
  );
  if (phases.some((phase) => phase.monthlyAmountToday === "live_baseline")) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionPhases must use explicit numeric amounts because projection-only accounts have no imported contribution baseline.`,
      422,
    );
  }
  if (
    phases.length > 0 &&
    !["tfsa", "rrsp", "non_registered"].includes(item.type)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.contributionPhases may only be configured for a TFSA, RRSP/RRIF, or non-registered account.`,
      422,
    );
  }
  return {
    label: nonEmptyString(item.label, `${field}.label`),
    type: item.type,
    annualReturn: number(item.annualReturn, `${field}.annualReturn`, {
      min: -0.99,
      max: 1,
    }),
    withdrawalPriority: number(
      item.withdrawalPriority,
      `${field}.withdrawalPriority`,
      { min: 1, integer: true },
    ),
    allocation: allocation(item.allocation, `${field}.allocation`),
    contributionPhases: phases,
  };
}

function surplusAllocation(value: unknown): SurplusAllocationPolicyInput {
  if (value === undefined) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "surplusAllocation is required. Configure explicit reserve accounts, a reserve refill account, reserve target, indexing rate, and excess strategy.",
      422,
    );
  }
  const item = record(value, "surplusAllocation");
  const excess = record(item.excess, "surplusAllocation.excess");
  if (
    !Array.isArray(item.reserveAccountIds) ||
    item.reserveAccountIds.length === 0
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "surplusAllocation.reserveAccountIds must be a non-empty array.",
      422,
    );
  }
  const reserveAccountIds = item.reserveAccountIds.map((accountId, index) =>
    nonEmptyString(
      accountId,
      `surplusAllocation.reserveAccountIds[${index}]`,
    ),
  );
  if (new Set(reserveAccountIds).size !== reserveAccountIds.length) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "surplusAllocation.reserveAccountIds must not contain duplicate accounts.",
      422,
    );
  }
  const reserveRefillAccountId = nonEmptyString(
    item.reserveRefillAccountId,
    "surplusAllocation.reserveRefillAccountId",
  );
  if (!reserveAccountIds.includes(reserveRefillAccountId)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "surplusAllocation.reserveRefillAccountId must be included in reserveAccountIds.",
      422,
    );
  }
  const policy = {
    reserveAccountIds,
    reserveRefillAccountId,
    targetCashReserveToday: number(
      item.targetCashReserveToday,
      "surplusAllocation.targetCashReserveToday",
      { min: 0 },
    ),
    reserveIndexingRate: number(
      item.reserveIndexingRate,
      "surplusAllocation.reserveIndexingRate",
      { min: -0.2, max: 0.5 },
    ),
  };
  if (excess.mode === "retain_as_cash") {
    if ("destinationAccountId" in excess) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        "surplusAllocation.excess.destinationAccountId is not allowed when mode is retain_as_cash.",
        422,
      );
    }
    return { ...policy, excess: { mode: "retain_as_cash" } };
  }
  if (excess.mode === "allocate_to_account") {
    return {
      ...policy,
      excess: {
        mode: "allocate_to_account",
        destinationAccountId: nonEmptyString(
          excess.destinationAccountId,
          "surplusAllocation.excess.destinationAccountId",
        ),
      },
    };
  }
  if (excess.mode === "allocate_through_contribution_waterfall") {
    rejectFields(excess, "surplusAllocation.excess", [
      "destinationAccountId",
    ]);
    return {
      ...policy,
      excess: { mode: "allocate_through_contribution_waterfall" },
    };
  }
  throw new PlannerRuntimeError(
    "invalid_planner_config",
    "surplusAllocation.excess.mode must be retain_as_cash, allocate_to_account, or allocate_through_contribution_waterfall.",
    422,
  );
}

function startingRoomSource(
  value: unknown,
  field: string,
): RegisteredAccountRoomInput["tfsa"]["startingAvailableRoom"] {
  const item = record(value, field);
  if (item.source === "explicit_zero") {
    if (item.amount !== undefined && item.amount !== 0) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.amount must be zero for explicit_zero.`,
        422,
      );
    }
    return {
      source: "explicit_zero",
      amount: 0,
      sourceDescription: "Explicit zero starting room",
      effectiveDate: "1970-01-01",
    };
  }
  if (
    item.source !== "official_estimate" &&
    item.source !== "configured_amount"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.source must be official_estimate, configured_amount, or explicit_zero.`,
      422,
    );
  }
  return {
    source: item.source,
    amount: number(item.amount, `${field}.amount`, { min: 0 }),
    sourceDescription: nonEmptyString(
      item.sourceDescription,
      `${field}.sourceDescription`,
    ),
    effectiveDate: isoCalendarDate(
      item.effectiveDate,
      `${field}.effectiveDate`,
    ),
  };
}

function registeredAccountRoom(value: unknown): RegisteredAccountRoomInput {
  const item = record(value, "registeredAccountRoom");
  const tfsa = record(item.tfsa, "registeredAccountRoom.tfsa");
  const annualNewRoom = record(
    tfsa.annualNewRoom,
    "registeredAccountRoom.tfsa.annualNewRoom",
  );
  const rrsp = record(item.rrsp, "registeredAccountRoom.rrsp");
  const newRoom = record(
    rrsp.newRoom,
    "registeredAccountRoom.rrsp.newRoom",
  );
  const annualCap = record(
    newRoom.annualCap,
    "registeredAccountRoom.rrsp.newRoom.annualCap",
  );
  const startYear = record(
    newRoom.startYearBeforeProjectionMonth,
    "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth",
  );
  if (annualNewRoom.source !== "canadian_reference") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.tfsa.annualNewRoom.source must be canadian_reference.",
      422,
    );
  }
  if (newRoom.source !== "earned_income") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.rrsp.newRoom.source must be earned_income.",
      422,
    );
  }
  if (annualCap.source !== "canadian_reference") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.rrsp.newRoom.annualCap.source must be canadian_reference.",
      422,
    );
  }
  if (typeof tfsa.carryForwardUnusedRoom !== "boolean") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.tfsa.carryForwardUnusedRoom must be a boolean.",
      422,
    );
  }
  if (tfsa.withdrawalRoomRecredit !== "next_calendar_year") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.tfsa.withdrawalRoomRecredit must be next_calendar_year.",
      422,
    );
  }
  if (typeof rrsp.carryForwardUnusedRoom !== "boolean") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom.rrsp.carryForwardUnusedRoom must be a boolean.",
      422,
    );
  }
  return {
    tfsa: {
      startingAvailableRoom: startingRoomSource(
        tfsa.startingAvailableRoom,
        "registeredAccountRoom.tfsa.startingAvailableRoom",
      ),
      annualNewRoom: {
        source: "canadian_reference",
        futureIndexingRate: number(
          annualNewRoom.futureIndexingRate,
          "registeredAccountRoom.tfsa.annualNewRoom.futureIndexingRate",
          { min: -0.2, max: 0.5 },
        ),
        roundingIncrement: number(
          annualNewRoom.roundingIncrement,
          "registeredAccountRoom.tfsa.annualNewRoom.roundingIncrement",
          { min: 1 },
        ),
      },
      carryForwardUnusedRoom: tfsa.carryForwardUnusedRoom,
      withdrawalRoomRecredit: "next_calendar_year",
    },
    rrsp: {
      startingAvailableDeductionRoom: startingRoomSource(
        rrsp.startingAvailableDeductionRoom,
        "registeredAccountRoom.rrsp.startingAvailableDeductionRoom",
      ),
      carryForwardUnusedRoom: rrsp.carryForwardUnusedRoom,
      newRoom: {
        source: "earned_income",
        annualCap: {
          source: "canadian_reference",
          futureGrowthRate: number(
            annualCap.futureGrowthRate,
            "registeredAccountRoom.rrsp.newRoom.annualCap.futureGrowthRate",
            { min: -0.2, max: 0.5 },
          ),
          futureRoundingIncrement: number(
            annualCap.futureRoundingIncrement,
            "registeredAccountRoom.rrsp.newRoom.annualCap.futureRoundingIncrement",
            { min: 1 },
          ),
        },
        startYearBeforeProjectionMonth: {
          calendarYear: number(
            startYear.calendarYear,
            "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.calendarYear",
            { min: 1900, max: 2300, integer: true },
          ),
          eligibleEarnedIncome: number(
            startYear.eligibleEarnedIncome,
            "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.eligibleEarnedIncome",
            { min: 0 },
          ),
          pensionAdjustment: number(
            startYear.pensionAdjustment,
            "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.pensionAdjustment",
            { min: 0 },
          ),
          otherRoomReduction: number(
            startYear.otherRoomReduction,
            "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.otherRoomReduction",
            { min: 0 },
          ),
        },
      },
    },
  };
}

function contributionWaterfall(
  value: unknown,
): Omit<ContributionWaterfallInput, "mode"> {
  const item = record(value, "contributionWaterfall");
  if (!Array.isArray(item.routes)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "contributionWaterfall.routes must be an array.",
      422,
    );
  }
  if (!Array.isArray(item.surplusDestinationAccountIds)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "contributionWaterfall.surplusDestinationAccountIds must be an array.",
      422,
    );
  }
  return {
    routes: item.routes.map((raw, index) => {
      const field = `contributionWaterfall.routes[${index}]`;
      const route = record(raw, field);
      if (
        !Array.isArray(route.destinationAccountIds) ||
        route.destinationAccountIds.length === 0
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field}.destinationAccountIds must be a non-empty array.`,
          422,
        );
      }
      return {
        sourceAccountId: nonEmptyString(
          route.sourceAccountId,
          `${field}.sourceAccountId`,
        ),
        destinationAccountIds: route.destinationAccountIds.map(
          (destination, destinationIndex) =>
            nonEmptyString(
              destination,
              `${field}.destinationAccountIds[${destinationIndex}]`,
            ),
        ),
      };
    }),
    surplusDestinationAccountIds: item.surplusDestinationAccountIds.map(
      (destination, index) =>
        nonEmptyString(
          destination,
          `contributionWaterfall.surplusDestinationAccountIds[${index}]`,
        ),
    ),
  };
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
  let roles: AccountRole[] | undefined;
  if (item.roles !== undefined) {
    if (!Array.isArray(item.roles)) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.roles must be an array.`,
        422,
      );
    }
    roles = item.roles.map((role, index) => {
      if (
        typeof role !== "string" ||
        !accountRoles.includes(role as AccountRole)
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field}.roles[${index}] is not a supported account role.`,
          422,
        );
      }
      return role as AccountRole;
    });
    if (new Set(roles).size !== roles.length) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.roles must not contain duplicates.`,
        422,
      );
    }
    if (!item.include && roles.length > 0) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field} is excluded and cannot hold active roles.`,
        422,
      );
    }
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
  if (item.liability !== undefined && item.type !== "debt") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field}.liability may be configured only for an included debt account.`,
      422,
    );
  }
  if (item.type === "debt") {
    if (item.annualReturn !== undefined && item.annualReturn !== 0) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.annualReturn is not valid for a liability. Remove it; debt interest belongs in liability.annualInterestRate.`,
        422,
      );
    }
    if (
      item.allocation !== undefined &&
      Object.values(allocation(item.allocation, `${field}.allocation`)).some(
        (value) => value !== 0,
      )
    ) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.allocation must be removed for a liability; debt is not an investment account.`,
        422,
      );
    }
  }
  return {
    include: item.include,
    type: item.type as AccountMapping["type"],
    ...(roles === undefined ? {} : { roles }),
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
    ...(item.liability === undefined
      ? {}
      : {
          liability: liabilityTreatment(
            item.liability,
            `${field}.liability`,
          ),
        }),
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
  if (typeof value === "string") {
    const result = classification(value, field);
    if (result === "debt_payment") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field} must use an object with classification: debt_payment and a liabilityRole or liabilityId.`,
        422,
      );
    }
    return result;
  }
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
  if (item.liabilityRole !== undefined) {
    if (item.liabilityRole !== "primary_mortgage") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.liabilityRole must be primary_mortgage.`,
        422,
      );
    }
    mapped.liabilityRole = item.liabilityRole;
  }
  if (item.liabilityId !== undefined) {
    mapped.liabilityId = nonEmptyString(
      item.liabilityId,
      `${field}.liabilityId`,
    );
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
  if (mapped.classification === "debt_payment") {
    if (Boolean(mapped.liabilityRole) === Boolean(mapped.liabilityId)) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field} with classification debt_payment requires exactly one liabilityRole or liabilityId.`,
        422,
      );
    }
  } else if (mapped.liabilityRole || mapped.liabilityId) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} may set liability fields only for debt_payment.`,
      422,
    );
  }
  return mapped;
}

function assumptions(value: unknown): PlannerAssumptions {
  const item = record(value, "assumptions");
  const allocations = record(item.allocations, "assumptions.allocations");
  if (item.debtReturn !== undefined && item.debtReturn !== 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "assumptions.debtReturn must be removed; a liability is not an investment account. A legacy zero is accepted temporarily.",
      422,
    );
  }
  const legacyDebtAllocation =
    allocations.debt === undefined
      ? undefined
      : allocation(allocations.debt, "assumptions.allocations.debt");
  if (
    legacyDebtAllocation &&
    Object.values(legacyDebtAllocation).some((value) => value !== 0)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "assumptions.allocations.debt must be removed; a liability has no asset allocation. A legacy all-zero allocation is accepted temporarily.",
      422,
    );
  }
  return {
    inflation: number(item.inflation, "assumptions.inflation", { min: -0.2, max: 0.5 }),
    cashReturn: number(item.cashReturn, "assumptions.cashReturn", { min: -0.99, max: 1 }),
    tfsaReturn: number(item.tfsaReturn, "assumptions.tfsaReturn", { min: -0.99, max: 1 }),
    rrspReturn: number(item.rrspReturn, "assumptions.rrspReturn", { min: -0.99, max: 1 }),
    nonRegisteredReturn: number(item.nonRegisteredReturn, "assumptions.nonRegisteredReturn", {
      min: -0.99,
      max: 1,
    }),
    ...(item.debtReturn === undefined ? {} : { debtReturn: 0 }),
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
      ...(legacyDebtAllocation ? { debt: legacyDebtAllocation } : {}),
    },
  };
}

function employmentIncomePhases(
  value: unknown,
  configurationMode: PlannerConfig["configurationMode"],
): EmploymentIncomePhaseConfig[] {
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
    const rrspRoomGeneration =
      item.rrspRoomGeneration === undefined
        ? undefined
        : record(item.rrspRoomGeneration, `${field}.rrspRoomGeneration`);
    const simpleRrspRoom =
      item.rrspRoom === undefined
        ? undefined
        : record(item.rrspRoom, `${field}.rrspRoom`);
    if (configurationMode === "simple" && !simpleRrspRoom) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.rrspRoom is required in simple mode; configure eligible earned income, pension adjustment, other reduction, and annual growth, including explicit zeros.`,
        422,
      );
    }
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
      ...(rrspRoomGeneration
        ? {
            rrspRoomGeneration: {
              annualEligibleEarnedIncomeToday: number(
                rrspRoomGeneration.annualEligibleEarnedIncomeToday,
                `${field}.rrspRoomGeneration.annualEligibleEarnedIncomeToday`,
                { min: 0 },
              ),
              annualPensionAdjustmentToday: number(
                rrspRoomGeneration.annualPensionAdjustmentToday,
                `${field}.rrspRoomGeneration.annualPensionAdjustmentToday`,
                { min: 0 },
              ),
              annualOtherRoomReductionToday: number(
                rrspRoomGeneration.annualOtherRoomReductionToday,
                `${field}.rrspRoomGeneration.annualOtherRoomReductionToday`,
                { min: 0 },
              ),
              annualGrowth: number(
                rrspRoomGeneration.annualGrowth,
                `${field}.rrspRoomGeneration.annualGrowth`,
                { min: -0.2, max: 0.5 },
              ),
            },
          }
        : {}),
      ...(simpleRrspRoom
        ? {
            rrspRoom: {
              eligibleEarnedIncomeToday: number(
                simpleRrspRoom.eligibleEarnedIncomeToday,
                `${field}.rrspRoom.eligibleEarnedIncomeToday`,
                { min: 0 },
              ),
              pensionAdjustmentToday: number(
                simpleRrspRoom.pensionAdjustmentToday,
                `${field}.rrspRoom.pensionAdjustmentToday`,
                { min: 0 },
              ),
              otherReductionToday: number(
                simpleRrspRoom.otherReductionToday,
                `${field}.rrspRoom.otherReductionToday`,
                { min: 0 },
              ),
              annualGrowth: number(
                simpleRrspRoom.annualGrowth,
                `${field}.rrspRoom.annualGrowth`,
                { min: -0.2, max: 0.5 },
              ),
            },
          }
        : {}),
    };
  });
}

function sameAge(left: number, right: number): boolean {
  return Math.abs(left - right) <= PROJECTION_AGE_TOLERANCE;
}

function assertMonthAligned(age: number, currentAge: number, field: string): void {
  if (projectionMonthOffset(age, currentAge) === null) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `${field} must align to a projection month relative to currentAge.`,
      422,
    );
  }
}

function configurationMode(
  item: Record<string, unknown>,
  rawAccountMappings: Record<string, unknown>,
): PlannerConfig["configurationMode"] {
  const rawEmployment = Array.isArray(item.employmentIncomePhases)
    ? item.employmentIncomePhases
    : [];
  const rawCategories =
    item.categoryMappings &&
    typeof item.categoryMappings === "object" &&
    !Array.isArray(item.categoryMappings)
      ? Object.values(item.categoryMappings)
      : [];
  const rawEvents = Array.isArray(item.futureEvents)
    ? item.futureEvents
    : [];
  const hasSimpleFields =
    item.primaryResidence !== undefined ||
    item.registeredRoom !== undefined ||
    item.savingsPolicy !== undefined ||
    Object.values(rawAccountMappings).some((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      return "roles" in value || "liability" in value;
    }) ||
    rawEmployment.some(
      (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "rrspRoom" in value,
    );
  const hasAdvancedFields =
    item.projectionAccounts !== undefined ||
    item.registeredAccountRoom !== undefined ||
    item.contributionWaterfall !== undefined ||
    item.surplusAllocation !== undefined ||
    Object.values(rawAccountMappings).some((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      return (
        "contributionPhases" in value ||
        "monthlyContribution" in value ||
        "contributionFunding" in value
      );
    }) ||
    rawEmployment.some(
      (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "rrspRoomGeneration" in value,
    ) ||
    rawCategories.some(
      (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "contributionAccountId" in value,
    ) ||
    rawEvents.some(
      (value) =>
        Boolean(value) &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "targetAccountId" in value,
    );
  if (hasSimpleFields && hasAdvancedFields) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Simple planner configuration cannot be mixed with advanced projectionAccounts, registeredAccountRoom, contributionWaterfall, surplusAllocation, account contribution fields, rrspRoomGeneration, contribution account references, or targeted event account references. Choose one configuration mode.",
      422,
    );
  }
  return hasSimpleFields ? "simple" : "advanced";
}

function roleAccounts(
  config: PlannerConfig,
  role: AccountRole,
): Array<[string, AccountMapping]> {
  return Object.entries(config.accountMappings).filter(
    ([, mapping]) => mapping.roles?.includes(role),
  );
}

function validateSimpleAccountRoles(config: PlannerConfig): void {
  if (config.configurationMode !== "simple") return;
  const requiredSingletons: Array<[AccountRole, PlannerAccountType]> = [
    ["operating_cash", "cash"],
    ["reserve_refill", "cash"],
    ["personal_tfsa", "tfsa"],
    ["personal_rrsp", "rrsp"],
  ];
  for (const [role, type] of requiredSingletons) {
    const matches = roleAccounts(config, role);
    if (matches.length !== 1) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `Simple configuration requires exactly one included ${role} role; found ${matches.length}.`,
        422,
      );
    }
    if (matches[0]![1].type !== type) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `Account role ${role} requires planner type ${type}.`,
        422,
      );
    }
  }
  const reserveMembers = roleAccounts(config, "reserve_member");
  if (reserveMembers.length === 0) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Simple configuration requires one or more included reserve_member accounts.",
      422,
    );
  }
  for (const [, mapping] of reserveMembers) {
    if (mapping.type !== "cash") {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        "Account role reserve_member requires planner type cash.",
        422,
      );
    }
  }
  const operating = roleAccounts(config, "operating_cash")[0]!;
  const refill = roleAccounts(config, "reserve_refill")[0]!;
  if (!operating[1].roles?.includes("reserve_member")) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The operating_cash account must also have the reserve_member role.",
      422,
    );
  }
  if (!refill[1].roles?.includes("reserve_member")) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The reserve_refill account must also have the reserve_member role.",
      422,
    );
  }
  const taxable = roleAccounts(config, "personal_taxable");
  if (taxable.length > 1) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `Simple configuration permits at most one included personal_taxable role; found ${taxable.length}.`,
      422,
    );
  }
  if (taxable[0] && taxable[0][1].type !== "non_registered") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Account role personal_taxable requires planner type non_registered.",
      422,
    );
  }
  const workplace = roleAccounts(config, "workplace_rrsp");
  const hasWorkplacePlan = config.savingsPolicy?.workplaceRrsp !== undefined;
  if (workplace.length !== (hasWorkplacePlan ? 1 : 0)) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      hasWorkplacePlan
        ? `savingsPolicy.workplaceRrsp requires exactly one included workplace_rrsp role; found ${workplace.length}.`
        : "A workplace_rrsp role requires savingsPolicy.workplaceRrsp.",
      422,
    );
  }
  if (workplace[0] && workplace[0][1].type !== "rrsp") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Account role workplace_rrsp requires planner type rrsp.",
      422,
    );
  }
  if (
    workplace[0] &&
    workplace[0][0] === roleAccounts(config, "personal_rrsp")[0]![0]
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "personal_rrsp and workplace_rrsp must be different accounts.",
      422,
    );
  }
  const mortgages = roleAccounts(config, "primary_mortgage");
  if (mortgages.length > 1) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      `Simple configuration permits at most one included primary_mortgage role; found ${mortgages.length}.`,
      422,
    );
  }
  if (mortgages[0] && mortgages[0][1].type !== "debt") {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Account role primary_mortgage requires planner type debt.",
      422,
    );
  }
  if (
    mortgages[0] &&
    mortgages[0][1].liability?.mode !== "amortizing"
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The primary_mortgage role requires liability.mode: amortizing.",
      422,
    );
  }
  if (mortgages.length > 0 && !config.primaryResidence) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "The primary_mortgage role requires primaryResidence.",
      422,
    );
  }
}

function validateSavingsPlanPhaseRanges(config: PlannerConfig): void {
  if (config.configurationMode !== "simple" || !config.savingsPolicy) return;
  const plans: Array<[string, SavingsPlanPhaseConfig[]]> = [
    [
      "savingsPolicy.personalInvesting.phases",
      config.savingsPolicy.personalInvesting.phases,
    ],
    [
      "savingsPolicy.reserveBuilding.phases",
      config.savingsPolicy.reserveBuilding.phases,
    ],
    ...(
      config.savingsPolicy.workplaceRrsp
        ? [[
            "savingsPolicy.workplaceRrsp.phases",
            config.savingsPolicy.workplaceRrsp.phases,
          ] as [string, SavingsPlanPhaseConfig[]]]
        : []
    ),
  ];
  for (const [fieldPrefix, phases] of plans) {
    const ids = new Set<string>();
    for (const [index, phase] of phases.entries()) {
      const field = `${fieldPrefix}[${index}]`;
      if (ids.has(phase.id)) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} duplicates phase id "${phase.id}".`,
          422,
        );
      }
      ids.add(phase.id);
      if (
        phase.startAge < config.currentAge - PROJECTION_AGE_TOLERANCE ||
        phase.endAge > config.retirementAge + PROJECTION_AGE_TOLERANCE
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} must stay within currentAge and retirementAge.`,
          422,
        );
      }
      if (phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field}.endAge must be greater than startAge.`,
          422,
        );
      }
      assertMonthAligned(phase.startAge, config.currentAge, `${field}.startAge`);
      assertMonthAligned(phase.endAge, config.currentAge, `${field}.endAge`);
      const previous = phases[index - 1];
      if (
        previous &&
        phase.startAge < previous.endAge - PROJECTION_AGE_TOLERANCE
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} overlaps phase "${previous.id}".`,
          422,
        );
      }
    }
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
    if (phase.startAge < config.currentAge - PROJECTION_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.startAge must not be before currentAge.`,
        422,
      );
    }
    if (phase.endAge > config.retirementAge + PROJECTION_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `${field}.endAge must not be after retirementAge.`,
        422,
      );
    }
    if (phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE) {
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
    if (phase.startAge < previous.endAge - PROJECTION_AGE_TOLERANCE) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `employmentIncomePhases overlap between "${previous.id}" and "${phase.id}".`,
        422,
      );
    }
    if (phase.startAge > previous.endAge + PROJECTION_AGE_TOLERANCE) {
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
  const configuredAccounts = [
    ...Object.entries(config.accountMappings).map(([accountId, mapping]) => ({
      fieldPrefix: `accountMappings.${accountId}`,
      phases: mapping.contributionPhases,
    })),
    ...Object.entries(config.projectionAccounts ?? {}).map(
      ([accountId, account]) => ({
        fieldPrefix: `projectionAccounts.${accountId}`,
        phases: account.contributionPhases,
      }),
    ),
  ];
  for (const { fieldPrefix, phases } of configuredAccounts) {
    if (!phases) continue;
    const ids = new Set<string>();
    for (const [index, phase] of phases.entries()) {
      const field = `${fieldPrefix}.contributionPhases[${index}]`;
      if (ids.has(phase.id)) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} duplicates contribution phase id "${phase.id}".`,
          422,
        );
      }
      ids.add(phase.id);
      if (
        phase.startAge < config.currentAge - PROJECTION_AGE_TOLERANCE ||
        phase.endAge > config.retirementAge + PROJECTION_AGE_TOLERANCE
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} must stay within currentAge and retirementAge.`,
          422,
        );
      }
      if (phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field}.endAge must be greater than startAge.`,
          422,
        );
      }
      assertMonthAligned(phase.startAge, config.currentAge, `${field}.startAge`);
      assertMonthAligned(phase.endAge, config.currentAge, `${field}.endAge`);
      const previous = phases[index - 1];
      if (previous && phase.startAge < previous.endAge - PROJECTION_AGE_TOLERANCE) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `${field} overlaps contribution phase "${previous.id}".`,
          422,
        );
      }
    }
  }
}

function validateRrspRoomGenerationReachability(
  config: PlannerConfig,
): void {
  if (config.configurationMode === "simple") return;
  const plannerType = (accountId: string) =>
    config.projectionAccounts?.[accountId]?.type ??
    config.accountMappings[accountId]?.type;
  const hasPositiveContribution = (accountId: string) => {
    const projection = config.projectionAccounts?.[accountId];
    const mapping = config.accountMappings[accountId];
    return (
      projection?.contributionPhases.some(
        (phase) =>
          phase.monthlyAmountToday === "live_baseline" ||
          phase.monthlyAmountToday > 0,
      ) ??
      mapping?.contributionPhases?.some(
        (phase) =>
          phase.monthlyAmountToday === "live_baseline" ||
          phase.monthlyAmountToday > 0,
      ) ??
      ((mapping?.monthlyContribution ?? 0) > 0)
    );
  };
  const rrspMayReceiveContributions =
    Object.keys({
      ...config.accountMappings,
      ...config.projectionAccounts,
    }).some(
      (accountId) =>
        plannerType(accountId) === "rrsp" &&
        hasPositiveContribution(accountId),
    ) ||
    Boolean(
      config.contributionWaterfall?.routes.some((route) =>
        route.destinationAccountIds.some(
          (accountId) => plannerType(accountId) === "rrsp",
        ),
      ),
    ) ||
    (config.surplusAllocation?.excess.mode ===
      "allocate_through_contribution_waterfall" &&
      Boolean(
        config.contributionWaterfall?.surplusDestinationAccountIds.some(
          (accountId) => plannerType(accountId) === "rrsp",
        ),
      ));

  if (!rrspMayReceiveContributions) return;
  if (!config.registeredAccountRoom) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "registeredAccountRoom is required whenever RRSP/RRIF can receive contributions.",
      422,
    );
  }
  if (
    !config.employmentIncomePhases ||
    config.employmentIncomePhases.some(
      (phase) => phase.rrspRoomGeneration === undefined,
    )
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Every employmentIncomePhase requires explicit rrspRoomGeneration values whenever RRSP/RRIF can receive contributions; configure numeric values, including zeros.",
      422,
    );
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
  const mode = configurationMode(item, rawAccountMappings);
  if (
    mode === "simple" &&
    (item.registeredRoom === undefined || item.savingsPolicy === undefined)
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Simple planner configuration requires both registeredRoom and savingsPolicy.",
      422,
    );
  }
  const rawProjectionAccounts =
    item.projectionAccounts === undefined
      ? {}
      : record(item.projectionAccounts, "projectionAccounts");
  const rawCategoryMappings = record(item.categoryMappings, "categoryMappings");
  for (const id of Object.keys(rawProjectionAccounts)) {
    if (!id.startsWith("projection:")) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `projectionAccounts key "${id}" must begin with projection:.`,
        422,
      );
    }
    if (id in rawAccountMappings) {
      throw new PlannerRuntimeError(
        "invalid_planner_config",
        `Account id "${id}" cannot appear in both accountMappings and projectionAccounts.`,
        422,
      );
    }
  }
  const config: PlannerConfig = {
    configurationMode: mode,
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
            mode,
          ),
        }),
    accountMappings: Object.fromEntries(
      Object.entries(rawAccountMappings).map(([id, mapping]) => [
        id,
        accountMapping(mapping, `accountMappings.${id}`),
      ]),
    ),
    ...(Object.keys(rawProjectionAccounts).length === 0
      ? {}
      : {
          projectionAccounts: Object.fromEntries(
            Object.entries(rawProjectionAccounts).map(([id, account]) => [
              id,
              projectionAccount(account, `projectionAccounts.${id}`),
            ]),
          ),
        }),
    ...(mode === "simple"
      ? {
          registeredRoom: registeredRoom(item.registeredRoom),
          savingsPolicy: savingsPolicy(item.savingsPolicy),
          ...(item.primaryResidence === undefined
            ? {}
            : {
                primaryResidence: primaryResidence(
                  item.primaryResidence,
                ),
              }),
        }
      : {}),
    ...(item.registeredAccountRoom === undefined
      ? {}
      : {
          registeredAccountRoom: registeredAccountRoom(
            item.registeredAccountRoom,
          ),
        }),
    ...(item.contributionWaterfall === undefined
      ? {}
      : {
          contributionWaterfall: contributionWaterfall(
            item.contributionWaterfall,
          ),
        }),
    ...(mode === "advanced"
      ? { surplusAllocation: surplusAllocation(item.surplusAllocation) }
      : {}),
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
  for (const [categoryId, mapping] of Object.entries(
    config.categoryMappings,
  )) {
    if (
      typeof mapping !== "string" &&
      mapping.classification === "debt_payment"
    ) {
      if (
        config.configurationMode === "simple" &&
        mapping.liabilityRole !== "primary_mortgage"
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `categoryMappings.${categoryId} must use liabilityRole: primary_mortgage in simple configuration.`,
          422,
        );
      }
      if (
        config.configurationMode === "advanced" &&
        !mapping.liabilityId
      ) {
        throw new PlannerRuntimeError(
          "invalid_planner_config",
          `categoryMappings.${categoryId} must use an explicit liabilityId in advanced configuration.`,
          422,
        );
      }
    }
  }
  if (
    config.configurationMode === "advanced" &&
    Object.values(config.accountMappings).some(
      (mapping) => mapping.include && mapping.type === "debt",
    )
  ) {
    throw new PlannerRuntimeError(
      "invalid_planner_config",
      "Advanced static debt accounts are no longer supported. Migrate each included debt to simple accountMappings with an explicit liability treatment so balances cannot remain fixed silently.",
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
  if (config.governmentBenefits) {
    assertMonthAligned(
      config.governmentBenefits.cpp.startAge,
      config.currentAge,
      "governmentBenefits.cpp.startAge",
    );
    assertMonthAligned(
      config.governmentBenefits.oas.startAge,
      config.currentAge,
      "governmentBenefits.oas.startAge",
    );
  }
  validateEmploymentPhaseRanges(config);
  validateContributionPhaseRanges(config);
  validateSavingsPlanPhaseRanges(config);
  validateSimpleAccountRoles(config);
  validateRrspRoomGenerationReachability(config);
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
