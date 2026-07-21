import type {
  BaselineExportContext,
  BaselineWarning,
  BaselineWarningCode,
  DerivedBaseline,
} from "@/src/domain/baseline/types";
import type {
  BaselineSourceType,
  CanadianReferenceKind,
} from "@/src/domain/defaults/types";
import {
  annualPeriodLabel,
  buildSavingsPolicyPreview,
  type SavingsPolicyPreview,
} from "./presentation";
import {
  validateProjectionInputs,
  type AccountType,
  type AssetAllocation,
  type ContributionFunding,
  type FinancialAccountInput,
  type FinancialAssetsBridge,
  type LiabilityInput,
  type NetWorthBridge,
  type NonFinancialAssetInput,
  type ProjectionEventInput,
  type ProjectionInputs,
  type ProjectionResult,
  type ProjectionView,
  type SurplusAllocationTotals,
} from "./types";

export type ProjectionExportRequest = {
  inputs: ProjectionInputs;
  baseline: BaselineExportContext;
  overrides: Record<string, number>;
};

export type ShareSafeAccountAlias = {
  key: string;
  label: string;
  plannerType: AccountType;
};

export type ShareSafeBalanceSheetAlias = {
  key: string;
  label: string;
};

export type ShareSafeProvenanceData =
  | string
  | number
  | boolean
  | null
  | AssetAllocation
  | string[]
  | Array<{ date: string; amount: number }>
  | ProjectionEventInput[];

export type ShareSafeProvenanceValue = {
  fieldReference: string;
  value: ShareSafeProvenanceData;
  sourceType: BaselineSourceType;
  sourceDescription: string;
  effectiveDate: string;
  referenceKind?: CanadianReferenceKind;
  referenceUrl?: string;
};

export type ShareSafeDerivedBaseline = {
  accountBalances: Array<{
    id: string;
    source: "manual" | "plaid" | "cash";
    name: string;
    plannerType: AccountType | "debt";
    balance: number;
    balanceAsOf: string;
    monthlyContribution: number;
    contributionSource: "lunchmoney_derived" | "local_configuration";
    contributionFunding: ContributionFunding | undefined;
  }>;
  nonFinancialAssetBalances: Array<{
    id: string;
    source: "manual" | "plaid";
    name: string;
    plannerType: "real_estate";
    value: number;
    valueAsOf: string;
  }>;
  monthlyIncome: DerivedBaseline["monthlyIncome"];
  essentialSpending: DerivedBaseline["essentialSpending"];
  discretionarySpending: DerivedBaseline["discretionarySpending"];
  investmentContributions: {
    trailingTotal: number;
    monthlyAverage: number;
    transactionCount: number;
    accounts: Array<{
      accountId: string;
      monthlyAverage: number;
      source: "lunchmoney_derived" | "local_configuration";
      funding: ContributionFunding;
    }>;
  };
  recurringExpenses: {
    monthlyTotal: number;
    count: number;
    items: Array<{
      id: string;
      description: string;
      classification: "essential" | "discretionary";
      monthlyAmount: number;
      accountId: string;
      categoryId: string;
    }>;
  };
  debtPayments: DerivedBaseline["debtPayments"];
};

export type ProjectionSnapshot = {
  schemaVersion: "8.0";
  generatedAt: string;
  exportMetadata: {
    transformation: "typed_allowlist_and_automatic_anonymization";
    automaticSanitizationApplied: true;
    rawLunchMoneyIdentifiersIncluded: false;
    sourceSystemRecordIdsIncluded: false;
    descriptiveFinancialTextIncluded: false;
    credentialsIncluded: false;
    accountAliases: ShareSafeAccountAlias[];
    nonFinancialAssetAliases: ShareSafeBalanceSheetAlias[];
    liabilityAliases: ShareSafeBalanceSheetAlias[];
  };
  connection: {
    status: "connected";
    checkedAt: string;
    message: "Lunch Money connection verified.";
  };
  dataThrough: string;
  transactionWindow: BaselineExportContext["transactionWindow"];
  recordsAnalyzed: BaselineExportContext["recordsAnalyzed"];
  resolvedBaseline: ProjectionInputs;
  activeInputs: ProjectionInputs;
  calculationBasis: {
    employmentIncome: "net_deposited_cash_no_additional_tax";
    simplifiedTax: "gross_retirement_income_and_taxable_rrsp_rrif_withdrawals";
    contributions: "cash_funded_reduce_cash_income_withheld_do_not";
  };
  provenance: Record<string, ShareSafeProvenanceValue>;
  derivedBaseline: ShareSafeDerivedBaseline;
  debtPaymentAudit: {
    trailingTotal: number;
    monthlyAverage: number;
    transactionCount: number;
    liabilities: Array<{
      liabilityId: string;
      liabilityRole: "primary_mortgage" | null;
      monthlyAverage: number;
      scheduleReplaced: boolean;
    }>;
  };
  warnings: Array<{
    code: string;
    severity: "warning" | "error";
    identifier?: string;
    name: string;
    message: string;
  }>;
  unmappedAccounts: Array<{
    id: string;
    source: "manual" | "plaid" | "cash";
    name: string;
  }>;
  unmappedCategories: Array<{
    id: string;
    name: string;
    transactionCount: number;
  }>;
  activeOverrides: Record<string, number>;
  policyPreview: SavingsPolicyPreview;
  projection: ProjectionResult;
};

type AccountAlias = ShareSafeAccountAlias & {
  rawId: string;
};

type RecordAlias = {
  key: string;
  label: string;
};

type RawRecordAlias = RecordAlias & {
  rawId: string;
};

type ShareSafeContext = {
  accounts: AccountAlias[];
  accountByRawId: Map<string, AccountAlias>;
  nonFinancialAssets: RawRecordAlias[];
  nonFinancialAssetByRawId: Map<string, RawRecordAlias>;
  liabilities: RawRecordAlias[];
  liabilityByRawId: Map<string, RawRecordAlias>;
  accountByNumericId: Map<string, RecordAlias>;
  employmentPhaseByRawId: Map<string, RecordAlias>;
  employmentPhaseByRawLabel: Map<string, RecordAlias>;
  contributionPhaseByAccountAndRawId: Map<string, RecordAlias>;
  contributionPhaseByAccountAndRawLabel: Map<string, RecordAlias>;
  savingsPhaseByRawId: Map<string, RecordAlias>;
  savingsPhaseByRawLabel: Map<string, RecordAlias>;
  eventsByRawId: Map<string, RecordAlias>;
  recurringByRawId: Map<string, RecordAlias>;
  unmappedAccountsByRawId: Map<string, RecordAlias>;
  categoriesByRawId: Map<string, RecordAlias>;
};

type ProvenanceField = {
  reference: string;
  account?: AccountAlias;
  accountReference?: AccountAlias;
  accountReferences?: AccountAlias[];
  accountField?: string;
  employmentPhase?: RecordAlias;
  contributionPhase?: RecordAlias;
  savingsPhase?: RecordAlias;
  balanceSheetRecord?: RawRecordAlias;
  finalField?: string;
};

const ACCOUNT_ALIAS_BASE: Record<AccountType, string> = {
  cash: "cash",
  tfsa: "tfsa",
  rrsp_rrif: "rrsp",
  non_registered: "non_registered",
};

const ACCOUNT_ALIAS_LABEL: Record<AccountType, string> = {
  cash: "Cash account",
  tfsa: "TFSA account",
  rrsp_rrif: "RRSP/RRIF account",
  non_registered: "Non-registered account",
};

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "cash",
  "tfsa",
  "rrsp_rrif",
  "non_registered",
];

const ACCOUNT_PROVENANCE_FIELDS = new Set([
  "openingBalance",
  "annualReturn",
  "label",
  "origin",
  "type",
  "allocation",
  "withdrawalPriority",
  "roles",
]);
const CONTRIBUTION_PHASE_PROVENANCE_FIELDS = new Set([
  "label",
  "startAge",
  "endAge",
  "monthlyAmountToday",
  "funding",
  "indexingRate",
]);
const EMPLOYMENT_PHASE_PROVENANCE_FIELDS = new Set([
  "label",
  "startAge",
  "endAge",
  "annualNetCashToday",
  "annualGrowth",
]);
const RRSP_ROOM_GENERATION_PROVENANCE_FIELDS = new Set([
  "annualEligibleEarnedIncomeToday",
  "annualPensionAdjustmentToday",
  "annualOtherRoomReductionToday",
  "annualGrowth",
]);
const SIMPLE_RRSP_ROOM_PROVENANCE_FIELDS = new Set([
  "eligibleEarnedIncomeToday",
  "pensionAdjustmentToday",
  "otherReductionToday",
  "annualGrowth",
]);
const SAVINGS_PHASE_PROVENANCE_FIELDS = new Set([
  "label",
  "startAge",
  "endAge",
  "monthlyAmountToday",
  "indexingRate",
]);

const SAFE_PROVENANCE_FIELDS = new Set([
  "monthlyEssentialSpendingToday",
  "monthlyDiscretionarySpendingToday",
  "currentAge",
  "retirementAge",
  "endAge",
  "cppStartAge",
  "oasStartAge",
  "cppMonthlyAmountAt65",
  "oasMonthlyAmountAt65",
  "retirementGoalToday",
  "annualInflation",
  "effectiveTaxRate",
  "oasRecoveryThresholdToday",
  "oasRecoveryRate",
  "person.currentAge",
  "person.retirementAge",
  "person.annualPensionToday",
  "person.pensionStartAge",
  "person.pensionIndexingRate",
  "person.cpp.startAge",
  "person.cpp.monthlyAmountAt65Today",
  "person.cpp.amountSourceMode",
  "person.cpp.effectiveDate",
  "person.cpp.claimAdjustmentRule",
  "person.cpp.indexingRate",
  "person.oas.startAge",
  "person.oas.fullAmountSourceMode",
  "person.oas.fullMonthlyAmountAt65Today",
  "person.oas.effectiveDate",
  "person.oas.eligibility.mode",
  "person.oas.eligibility.qualifyingResidenceYearsAfter18",
  "person.oas.eligibility.fraction",
  "person.oas.indexingRate",
  "person.oas.delayedClaimRule",
  "person.oas.age75IncreaseRule",
  "person.oas.age75IncreaseRate",
  "person.rrifConversionAge",
  "tax.effectiveTaxRate",
  "tax.oasRecoveryThresholdToday",
  "tax.oasRecoveryRate",
  "transactionTrailingMonths",
  "startDate",
  "events",
  "surplusAllocation.targetCashReserveToday",
  "surplusAllocation.reserveIndexingRate",
  "surplusAllocation.excess.mode",
  "registeredAccountRoom.tfsa.startingAvailableRoom.source",
  "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
  "registeredAccountRoom.tfsa.startingAvailableRoom.effectiveDate",
  "registeredAccountRoom.tfsa.annualNewRoom.futureIndexingRate",
  "registeredAccountRoom.tfsa.annualNewRoom.roundingIncrement",
  "registeredAccountRoom.tfsa.annualNewRoom.2026",
  "registeredAccountRoom.tfsa.carryForwardUnusedRoom",
  "registeredAccountRoom.tfsa.withdrawalRoomRecredit",
  "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.source",
  "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
  "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.effectiveDate",
  "registeredAccountRoom.rrsp.newRoom.earnedIncomeRate",
  "registeredAccountRoom.rrsp.newRoom.annualCap.2026",
  "registeredAccountRoom.rrsp.newRoom.annualCap.2027",
  "registeredAccountRoom.rrsp.newRoom.annualCap.futureGrowthRate",
  "registeredAccountRoom.rrsp.newRoom.annualCap.futureRoundingIncrement",
  "registeredAccountRoom.rrsp.carryForwardUnusedRoom",
  "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.calendarYear",
  "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.eligibleEarnedIncome",
  "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.pensionAdjustment",
  "registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.otherRoomReduction",
  "contributionWaterfall.mode",
  "savingsPolicy.mode",
  "savingsPolicy.taxableAccountOrigin",
  "savingsPolicy.unplannedCash",
  "savingsPolicy.operatingCash.targetToday",
  "savingsPolicy.operatingCash.indexingRate",
  "savingsPolicy.personalOrder",
  "savingsPolicy.workplaceRoomPriority",
  "savingsPolicy.workplaceOverflow",
  "savingsPolicy.reserveAfterTarget",
  "savingsPolicy.reserveBuilding.targetToday",
  "savingsPolicy.reserveBuilding.indexingRate",
  "registeredRoom.tfsa.availableAtStart",
  "registeredRoom.tfsa.asOf",
  "registeredRoom.rrsp.availableAtStart",
  "registeredRoom.rrsp.asOf",
  "registeredRoom.rrsp.currentYearBeforePlanStart.eligibleEarnedIncome",
  "registeredRoom.rrsp.currentYearBeforePlanStart.pensionAdjustment",
  "registeredRoom.rrsp.currentYearBeforePlanStart.otherReduction",
  "nonFinancialAssets.primaryResidence.openingValue",
  "nonFinancialAssets.primaryResidence.valueAsOf",
  "nonFinancialAssets.primaryResidence.annualAppreciation",
  "nonFinancialAssets.primaryResidence.availableForWithdrawals",
]);

const SIMPLE_OVERRIDE_KEYS = new Set([
  "retirementAge",
  "cppStartAge",
  "oasStartAge",
  "monthlyEssentialSpendingToday",
  "monthlyDiscretionarySpendingToday",
  "annualInflation",
  "endAge",
  "surplusAllocation.targetCashReserveToday",
  "surplusAllocation.reserveIndexingRate",
  "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
  "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
  "registeredRoom.tfsa.availableAtStart",
  "registeredRoom.rrsp.availableAtStart",
  "savingsPolicy.reserveBuilding.targetToday",
  "savingsPolicy.reserveBuilding.indexingRate",
  "savingsPolicy.operatingCash.targetToday",
  "savingsPolicy.operatingCash.indexingRate",
  "primaryResidence.currentValue",
  "primaryResidence.annualAppreciation",
]);

const SAFE_MILESTONES = new Set([
  "Retirement",
  "CPP begins",
  "OAS begins",
  "RRIF conversion age",
]);

const SAFE_OBSERVATION_CODES = new Set([
  "retirement",
  "cpp_start",
  "oas_start",
  "portfolio_duration",
]);

const SOURCE_TYPES = new Set<BaselineSourceType>([
  "local_configuration",
  "lunchmoney_derived",
  "canadian_reference",
]);

const ACCOUNT_SOURCES = ["manual", "plaid", "cash"] as const;
const CONTRIBUTION_SOURCES = ["lunchmoney_derived", "local_configuration"] as const;
const CONTRIBUTION_FUNDING = ["cash", "income_withheld"] as const;
const RECURRING_CLASSIFICATIONS = ["essential", "discretionary"] as const;
const WARNING_SEVERITIES = ["warning", "error"] as const;
const SAFE_WARNING_MESSAGES: Record<BaselineWarningCode, string> = {
  transactions_skipped: "Some transactions were excluded from baseline calculations.",
  no_transactions: "No eligible transactions were available for a baseline calculation.",
  unused_account_mapping: "A configured account mapping did not match an imported account.",
  contribution_target_required: "An investment contribution requires a mapped target account.",
  suggested_recurring_ignored: "A suggested recurring item was excluded from the baseline.",
  negative_derived_total: "A derived baseline total was negative and requires review.",
  cash_account_required: "The projection requires an included cash account.",
  invalid_manual_contribution: "A configured contribution requires review.",
  withdrawal_priority_required: "An investment account requires a withdrawal priority.",
  negative_asset_balance: "An included financial account has a negative opening balance.",
  long_live_baseline_income:
    "Current imported employment income is assumed to continue for more than five years.",
  cpp_canadian_reference_in_use:
    "CPP uses a generic published Canadian reference rather than a personal entitlement estimate.",
  oas_canadian_reference_in_use:
    "OAS uses a generic published Canadian reference amount.",
  legacy_zero_cpp_amount:
    "A legacy zero CPP amount remains in effect until canonical configuration is supplied.",
  legacy_zero_oas_amount:
    "A legacy zero OAS amount remains in effect until canonical configuration is supplied.",
  contribution_waterfall_compatibility:
    "Contribution plans use fixed source-only compatibility routes.",
  liability_payment_mismatch:
    "A configured liability payment differs materially from historical payment evidence.",
};

const REFERENCE_KINDS = new Set<CanadianReferenceKind>([
  "population_median",
  "population_average",
  "statutory_program_default",
  "statutory_annual_limit",
  "published_planning_assumption",
]);

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function safeDateLike(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)
    ? value
    : fallback;
}

function requireIsoTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) {
    throw new Error("generatedAt must be an ISO timestamp");
  }
  return value;
}

function finiteNumber(value: number, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number for export`);
  }
  return value;
}

function allowedValue<const T extends readonly string[]>(
  value: string,
  allowed: T,
  field: string,
): T[number] {
  if (!allowed.includes(value)) throw new Error(`${field} is not allowed in the export`);
  return value as T[number];
}

function metric(value: DerivedBaseline["essentialSpending"]) {
  return {
    trailingTotal: finiteNumber(value.trailingTotal, "trailingTotal"),
    monthlyAverage: finiteNumber(value.monthlyAverage, "monthlyAverage"),
    transactionCount: finiteNumber(value.transactionCount, "transactionCount"),
  };
}

function contributionPhaseKey(accountId: string, phaseValue: string): string {
  return `${accountId}\u0000${phaseValue}`;
}

function createShareSafeContext(
  projection: ProjectionResult,
  baseline: BaselineExportContext,
): ShareSafeContext {
  const descriptors = new Map<string, { id: string; type: AccountType; label: string }>();
  for (const account of [...baseline.projectionInputs.accounts, ...projection.inputs.accounts]) {
    if (!descriptors.has(account.id)) {
      descriptors.set(account.id, { id: account.id, type: account.type, label: account.label });
    }
  }
  for (const account of baseline.derived.accountBalances) {
    if (account.plannerType !== "debt" && !descriptors.has(account.id)) {
      descriptors.set(account.id, {
        id: account.id,
        type: account.plannerType,
        label: account.name,
      });
    }
  }
  const counters = Object.fromEntries(ACCOUNT_TYPE_ORDER.map((type) => [type, 0])) as Record<
    AccountType,
    number
  >;
  const accounts = [...descriptors.values()].map((account): AccountAlias => {
      const sequence = (counters[account.type] += 1);
      const base = ACCOUNT_ALIAS_BASE[account.type];
      return {
        rawId: account.id,
        key: `${base}_${sequence}`,
        label: `${ACCOUNT_ALIAS_LABEL[account.type]} ${sequence}`,
        plannerType: account.type,
      };
    });
  const accountByRawId = new Map(accounts.map((account) => [account.rawId, account]));
  const nonFinancialAssetDescriptors = new Map<string, string>();
  for (const asset of [
    ...baseline.projectionInputs.nonFinancialAssets,
    ...projection.inputs.nonFinancialAssets,
  ]) {
    if (!nonFinancialAssetDescriptors.has(asset.id)) {
      nonFinancialAssetDescriptors.set(asset.id, asset.label);
    }
  }
  const nonFinancialAssets = [...nonFinancialAssetDescriptors].map(
    ([rawId], index): RawRecordAlias => ({
      rawId,
      key: `non_financial_asset_${index + 1}`,
      label: `Non-financial asset ${index + 1}`,
    }),
  );
  const nonFinancialAssetByRawId = new Map(
    nonFinancialAssets.map((asset) => [asset.rawId, asset]),
  );
  const liabilityDescriptors = new Map<string, string>();
  for (const liability of [
    ...baseline.projectionInputs.liabilities,
    ...projection.inputs.liabilities,
  ]) {
    if (!liabilityDescriptors.has(liability.id)) {
      liabilityDescriptors.set(liability.id, liability.label);
    }
  }
  const liabilities = [...liabilityDescriptors].map(
    ([rawId], index): RawRecordAlias => ({
      rawId,
      key: `liability_${index + 1}`,
      label: `Liability ${index + 1}`,
    }),
  );
  const liabilityByRawId = new Map(
    liabilities.map((liability) => [liability.rawId, liability]),
  );
  const accountByNumericId = new Map<string, RecordAlias>();
  for (const account of baseline.derived.accountBalances) {
    const alias =
      accountByRawId.get(account.id) ??
      liabilityByRawId.get(account.id);
    if (alias && account.lunchMoneyId !== null) {
      accountByNumericId.set(String(account.lunchMoneyId), alias);
    }
  }
  for (const asset of baseline.derived.nonFinancialAssetBalances) {
    const alias = nonFinancialAssetByRawId.get(asset.id);
    if (alias && asset.lunchMoneyId !== null) {
      accountByNumericId.set(String(asset.lunchMoneyId), alias);
    }
  }

  const employmentPhaseByRawId = new Map<string, RecordAlias>();
  const employmentPhaseByRawLabel = new Map<string, RecordAlias>();
  for (const phase of [
    ...baseline.projectionInputs.person.employmentIncomePhases,
    ...projection.inputs.person.employmentIncomePhases,
  ]) {
    let alias = employmentPhaseByRawId.get(phase.id);
    if (!alias) {
      const sequence = employmentPhaseByRawId.size + 1;
      alias = {
        key: `employment_phase_${sequence}`,
        label: `Employment phase ${sequence}`,
      };
      employmentPhaseByRawId.set(phase.id, alias);
    }
    if (!employmentPhaseByRawLabel.has(phase.label)) {
      employmentPhaseByRawLabel.set(phase.label, alias);
    }
  }

  const contributionPhaseByAccountAndRawId = new Map<string, RecordAlias>();
  const contributionPhaseByAccountAndRawLabel = new Map<string, RecordAlias>();
  let contributionSequence = 0;
  for (const input of [baseline.projectionInputs, projection.inputs]) {
    for (const account of input.accounts) {
      for (const phase of account.contributionPhases) {
        const idKey = contributionPhaseKey(account.id, phase.id);
        let alias = contributionPhaseByAccountAndRawId.get(idKey);
        if (!alias) {
          contributionSequence += 1;
          alias = {
            key: `contribution_phase_${contributionSequence}`,
            label: `Contribution phase ${contributionSequence}`,
          };
          contributionPhaseByAccountAndRawId.set(idKey, alias);
        }
        const labelKey = contributionPhaseKey(account.id, phase.label);
        if (!contributionPhaseByAccountAndRawLabel.has(labelKey)) {
          contributionPhaseByAccountAndRawLabel.set(labelKey, alias);
        }
      }
    }
  }

  const savingsPhaseByRawId = new Map<string, RecordAlias>();
  const savingsPhaseByRawLabel = new Map<string, RecordAlias>();
  for (const input of [baseline.projectionInputs, projection.inputs]) {
    if (input.savingsPolicy.mode !== "simple") continue;
    for (const phase of input.savingsPolicy.reserveBuildingPhases) {
      let alias = savingsPhaseByRawId.get(phase.id);
      if (!alias) {
        const sequence = savingsPhaseByRawId.size + 1;
        alias = {
          key: `savings_phase_${sequence}`,
          label: `Savings phase ${sequence}`,
        };
        savingsPhaseByRawId.set(phase.id, alias);
      }
      if (!savingsPhaseByRawLabel.has(phase.label)) {
        savingsPhaseByRawLabel.set(phase.label, alias);
      }
    }
  }

  const unmappedAccountsByRawId = new Map<string, RecordAlias>();
  baseline.unmappedAccounts.forEach((account, index) => {
      const alias = {
        key: `unmapped_account_${index + 1}`,
        label: `Unmapped account ${index + 1}`,
      };
      unmappedAccountsByRawId.set(account.id, alias);
      if (account.lunchMoneyId !== null && !accountByNumericId.has(String(account.lunchMoneyId))) {
        accountByNumericId.set(String(account.lunchMoneyId), alias);
      }
    });

  const eventDescriptions = new Map<string, string>();
  for (const event of [...baseline.projectionInputs.events, ...projection.inputs.events]) {
    if (!eventDescriptions.has(event.id)) eventDescriptions.set(event.id, event.label);
  }
  const eventsByRawId = new Map<string, RecordAlias>();
  [...eventDescriptions].forEach(([id], index) => {
      eventsByRawId.set(id, {
        key: `event_${index + 1}`,
        label: `Future event ${index + 1}`,
      });
    });

  const recurringByRawId = new Map<string, RecordAlias>();
  baseline.derived.recurringExpenses.items.forEach((item, index) => {
    recurringByRawId.set(String(item.id), {
      key: `recurring_expense_${index + 1}`,
      label: `Recurring expense ${index + 1}`,
    });
  });

  const categoryIds = new Set<string>();
  for (const category of baseline.unmappedCategories) {
    categoryIds.add(category.id);
  }
  for (const item of baseline.derived.recurringExpenses.items) {
    categoryIds.add(item.categoryId);
  }
  const categoriesByRawId = new Map<string, RecordAlias>();
  [...categoryIds].forEach((id, index) => {
      categoriesByRawId.set(id, {
        key: `category_${index + 1}`,
        label: `Category ${index + 1}`,
      });
    });

  return {
    accounts,
    accountByRawId,
    nonFinancialAssets,
    nonFinancialAssetByRawId,
    liabilities,
    liabilityByRawId,
    accountByNumericId,
    employmentPhaseByRawId,
    employmentPhaseByRawLabel,
    contributionPhaseByAccountAndRawId,
    contributionPhaseByAccountAndRawLabel,
    savingsPhaseByRawId,
    savingsPhaseByRawLabel,
    eventsByRawId,
    recurringByRawId,
    unmappedAccountsByRawId,
    categoriesByRawId,
  };
}

function requiredAccountAlias(rawId: string, context: ShareSafeContext): AccountAlias {
  const alias = context.accountByRawId.get(rawId);
  if (!alias) throw new Error("Export encountered an unknown account reference");
  return alias;
}

function requiredNonFinancialAssetAlias(
  rawId: string,
  context: ShareSafeContext,
): RawRecordAlias {
  const alias = context.nonFinancialAssetByRawId.get(rawId);
  if (!alias) {
    throw new Error("Export encountered an unknown non-financial asset reference");
  }
  return alias;
}

function requiredLiabilityAlias(
  rawId: string,
  context: ShareSafeContext,
): RawRecordAlias {
  const alias = context.liabilityByRawId.get(rawId);
  if (!alias) throw new Error("Export encountered an unknown liability reference");
  return alias;
}

function requiredRecordAlias(
  rawId: string,
  aliases: Map<string, RecordAlias>,
  recordType: string,
): RecordAlias {
  const alias = aliases.get(rawId);
  if (!alias) throw new Error(`Export encountered an unknown ${recordType} reference`);
  return alias;
}

function requiredEmploymentPhaseAlias(
  rawId: string,
  context: ShareSafeContext,
): RecordAlias {
  return requiredRecordAlias(
    rawId,
    context.employmentPhaseByRawId,
    "employment phase",
  );
}

function requiredContributionPhaseAlias(
  accountId: string,
  phaseValue: string,
  aliases: Map<string, RecordAlias>,
): RecordAlias {
  return requiredRecordAlias(
    contributionPhaseKey(accountId, phaseValue),
    aliases,
    "contribution phase",
  );
}

function safeAllocation(value: AssetAllocation): AssetAllocation {
  return {
    cash: value.cash,
    fixedIncome: value.fixedIncome,
    equity: value.equity,
  };
}

function safeAccountInput(
  account: FinancialAccountInput,
  context: ShareSafeContext,
): FinancialAccountInput {
  const alias = requiredAccountAlias(account.id, context);
  return {
    id: alias.key,
    label: alias.label,
    origin: account.origin,
    type: account.type,
    openingBalance: account.openingBalance,
    annualReturn: account.annualReturn,
    contributionPhases: account.contributionPhases.map((phase) => {
      const phaseAlias = requiredContributionPhaseAlias(
        account.id,
        phase.id,
        context.contributionPhaseByAccountAndRawId,
      );
      return {
        id: phaseAlias.key,
        label: phaseAlias.label,
        startAge: phase.startAge,
        endAge: phase.endAge,
        monthlyAmountToday: phase.monthlyAmountToday,
        funding: phase.funding,
        indexingRate: phase.indexingRate,
      };
    }),
    withdrawalPriority: account.withdrawalPriority,
    allocation: safeAllocation(account.allocation),
  };
}

function safeNonFinancialAssetInput(
  asset: NonFinancialAssetInput,
  context: ShareSafeContext,
): NonFinancialAssetInput {
  const alias = requiredNonFinancialAssetAlias(asset.id, context);
  return {
    id: alias.key,
    label: alias.label,
    origin: asset.origin,
    type: asset.type,
    openingValue: asset.openingValue,
    valueAsOf: asset.valueAsOf,
    annualAppreciation: asset.annualAppreciation,
    availableForWithdrawals: false,
  };
}

function safeLiabilityInput(
  liability: LiabilityInput,
  context: ShareSafeContext,
): LiabilityInput {
  const alias = requiredLiabilityAlias(liability.id, context);
  return {
    id: alias.key,
    label: alias.label,
    origin: liability.origin,
    openingBalance: liability.openingBalance,
    balanceAsOf: liability.balanceAsOf,
    role: liability.role,
    treatment:
      liability.treatment.mode === "amortizing"
        ? {
            mode: "amortizing",
            annualInterestRate: liability.treatment.annualInterestRate,
            interestRateConvention:
              liability.treatment.interestRateConvention,
            regularPayment: { ...liability.treatment.regularPayment },
            scheduleStartDate: liability.treatment.scheduleStartDate,
            lumpSumPayments: liability.treatment.lumpSumPayments.map(
              (payment) => ({ ...payment }),
            ),
          }
        : { mode: liability.treatment.mode },
    historicalPaymentHandling: liability.historicalPaymentHandling,
    historicalMonthlyAverage: liability.historicalMonthlyAverage,
  };
}

function safeEventInput(
  event: ProjectionEventInput,
  context: ShareSafeContext,
): ProjectionEventInput {
  const alias = requiredRecordAlias(event.id, context.eventsByRawId, "event");
  return {
    id: alias.key,
    label: alias.label,
    calendarYear: event.calendarYear,
    month: event.month,
    amountToday: event.amountToday,
    direction: event.direction,
    ...(event.targetAccountId
      ? { targetAccountId: requiredAccountAlias(event.targetAccountId, context).key }
      : {}),
  };
}

function safeProjectionInputs(
  inputs: ProjectionInputs,
  context: ShareSafeContext,
): ProjectionInputs {
  return {
    startDate: inputs.startDate,
    endAge: inputs.endAge,
    annualInflation: inputs.annualInflation,
    monthlyEssentialSpendingToday: inputs.monthlyEssentialSpendingToday,
    monthlyDiscretionarySpendingToday: inputs.monthlyDiscretionarySpendingToday,
    retirementGoalToday: inputs.retirementGoalToday,
    tax: {
      effectiveTaxRate: inputs.tax.effectiveTaxRate,
      oasRecoveryThresholdToday: inputs.tax.oasRecoveryThresholdToday,
      oasRecoveryRate: inputs.tax.oasRecoveryRate,
    },
    person: {
      currentAge: inputs.person.currentAge,
      retirementAge: inputs.person.retirementAge,
      employmentIncomePhases: inputs.person.employmentIncomePhases.map((phase) => {
        const alias = requiredEmploymentPhaseAlias(phase.id, context);
        return {
          id: alias.key,
          label: alias.label,
          startAge: phase.startAge,
          endAge: phase.endAge,
          annualNetCashToday: phase.annualNetCashToday,
          annualGrowth: phase.annualGrowth,
          ...(phase.rrspRoomGeneration
            ? { rrspRoomGeneration: { ...phase.rrspRoomGeneration } }
            : {}),
        };
      }),
      annualPensionToday: inputs.person.annualPensionToday,
      pensionStartAge: inputs.person.pensionStartAge,
      pensionIndexingRate: inputs.person.pensionIndexingRate,
      cpp: {
        startAge: inputs.person.cpp.startAge,
        monthlyAmountAt65Today: inputs.person.cpp.monthlyAmountAt65Today,
        indexingRate: inputs.person.cpp.indexingRate,
      },
      oas: {
        startAge: inputs.person.oas.startAge,
        fullMonthlyAmountAt65Today:
          inputs.person.oas.fullMonthlyAmountAt65Today,
        eligibility: {
          mode: inputs.person.oas.eligibility.mode,
          qualifyingResidenceYearsAfter18:
            inputs.person.oas.eligibility.qualifyingResidenceYearsAfter18,
          fraction: inputs.person.oas.eligibility.fraction,
        },
        indexingRate: inputs.person.oas.indexingRate,
        age75IncreaseRate: inputs.person.oas.age75IncreaseRate,
      },
      rrifConversionAge: inputs.person.rrifConversionAge,
    },
    accounts: inputs.accounts.map((account) => safeAccountInput(account, context)),
    nonFinancialAssets: inputs.nonFinancialAssets.map((asset) =>
      safeNonFinancialAssetInput(asset, context),
    ),
    liabilities: inputs.liabilities.map((liability) =>
      safeLiabilityInput(liability, context),
    ),
    ...(inputs.registeredAccountRoom
      ? {
          registeredAccountRoom: {
            tfsa: {
              ...inputs.registeredAccountRoom.tfsa,
              startingAvailableRoom: {
                ...inputs.registeredAccountRoom.tfsa.startingAvailableRoom,
                sourceDescription:
                  "Personal TFSA room supplied through private configuration",
              },
            },
            rrsp: {
              ...inputs.registeredAccountRoom.rrsp,
              startingAvailableDeductionRoom: {
                ...inputs.registeredAccountRoom.rrsp
                  .startingAvailableDeductionRoom,
                sourceDescription:
                  "Personal RRSP room supplied through private configuration",
              },
            },
          },
        }
      : {}),
    contributionWaterfall: {
      mode: inputs.contributionWaterfall.mode,
      routes: inputs.contributionWaterfall.routes.map((route) => ({
        sourceAccountId: requiredAccountAlias(
          route.sourceAccountId,
          context,
        ).key,
        destinationAccountIds: route.destinationAccountIds.map(
          (accountId) => requiredAccountAlias(accountId, context).key,
        ),
      })),
      surplusDestinationAccountIds:
        inputs.contributionWaterfall.surplusDestinationAccountIds.map(
          (accountId) => requiredAccountAlias(accountId, context).key,
        ),
    },
    surplusAllocation: {
      reserveAccountIds: inputs.surplusAllocation.reserveAccountIds.map(
        (accountId) => requiredAccountAlias(accountId, context).key,
      ),
      reserveRefillAccountId: requiredAccountAlias(
        inputs.surplusAllocation.reserveRefillAccountId,
        context,
      ).key,
      targetCashReserveToday:
        inputs.surplusAllocation.targetCashReserveToday,
      reserveIndexingRate: inputs.surplusAllocation.reserveIndexingRate,
      excess:
        inputs.surplusAllocation.excess.mode === "retain_as_cash"
          ? { mode: "retain_as_cash" }
          : inputs.surplusAllocation.excess.mode === "allocate_to_account"
            ? {
              mode: "allocate_to_account",
              destinationAccountId: requiredAccountAlias(
                inputs.surplusAllocation.excess.destinationAccountId,
                context,
              ).key,
              }
            : { mode: "allocate_through_contribution_waterfall" },
    },
    savingsPolicy:
      inputs.savingsPolicy.mode === "advanced"
        ? { mode: "advanced" }
        : {
            mode: "simple",
            operatingCashAccountId: requiredAccountAlias(
              inputs.savingsPolicy.operatingCashAccountId,
              context,
            ).key,
            reserveAccountIds:
              inputs.savingsPolicy.reserveAccountIds.map(
                (accountId) =>
                  requiredAccountAlias(accountId, context).key,
              ),
            reserveRefillAccountId: requiredAccountAlias(
              inputs.savingsPolicy.reserveRefillAccountId,
              context,
            ).key,
            personalTfsaAccountId: requiredAccountAlias(
              inputs.savingsPolicy.personalTfsaAccountId,
              context,
            ).key,
            personalRrspAccountId: requiredAccountAlias(
              inputs.savingsPolicy.personalRrspAccountId,
              context,
            ).key,
            workplaceRrspAccountId:
              inputs.savingsPolicy.workplaceRrspAccountId === null
                ? null
                : requiredAccountAlias(
                    inputs.savingsPolicy.workplaceRrspAccountId,
                    context,
                  ).key,
            taxableAccountId: requiredAccountAlias(
              inputs.savingsPolicy.taxableAccountId,
              context,
            ).key,
            taxableAccountOrigin:
              inputs.savingsPolicy.taxableAccountOrigin,
            reserveBuildingPhases:
              inputs.savingsPolicy.reserveBuildingPhases.map(
                (phase) => {
                  const alias = requiredRecordAlias(
                    phase.id,
                    context.savingsPhaseByRawId,
                    "savings phase",
                  );
                  return {
                    id: alias.key,
                    label: alias.label,
                    startAge: phase.startAge,
                    endAge: phase.endAge,
                    monthlyAmountToday: phase.monthlyAmountToday,
                    indexingRate: phase.indexingRate,
                  };
                },
              ),
            operatingCashTarget:
              inputs.savingsPolicy.operatingCashTarget === null
                ? null
                : { ...inputs.savingsPolicy.operatingCashTarget },
            unplannedCash: inputs.savingsPolicy.unplannedCash,
            personalOrder: [
              "personal_tfsa",
              "personal_rrsp",
              "taxable",
            ],
            workplaceRoomPriority: "first",
            workplaceOverflow: "unallocated",
            reserveAfterTarget: "personal_investing",
          },
    events: inputs.events.map((event) => safeEventInput(event, context)),
  };
}

function safeProjectionView(view: ProjectionView, context: ShareSafeContext): ProjectionView {
  const accountBalances: Record<string, number> = {};
  for (const [rawId, value] of Object.entries(view.accountBalances)) {
    accountBalances[requiredAccountAlias(rawId, context).key] = value;
  }
  const accountContributions: Record<string, number> = {};
  for (const [rawId, value] of Object.entries(view.accountContributions)) {
    accountContributions[requiredAccountAlias(rawId, context).key] = value;
  }
  const accountSurplusAllocations: Record<string, number> = {};
  for (const [rawId, value] of Object.entries(
    view.accountSurplusAllocations,
  )) {
    accountSurplusAllocations[requiredAccountAlias(rawId, context).key] =
      value;
  }
  const accountSweepAllocations: Record<string, number> = {};
  for (const [rawId, value] of Object.entries(
    view.accountSweepAllocations,
  )) {
    accountSweepAllocations[requiredAccountAlias(rawId, context).key] =
      value;
  }
  const accountContributionDetails = Object.fromEntries(
    Object.entries(view.accountContributionDetails).map(([rawId, detail]) => [
      requiredAccountAlias(rawId, context).key,
      { ...detail },
    ]),
  );
  const nonFinancialAssetValues = Object.fromEntries(
    Object.entries(view.nonFinancialAssetValues).map(([rawId, value]) => [
      requiredNonFinancialAssetAlias(rawId, context).key,
      value,
    ]),
  );
  const liabilityBalances = Object.fromEntries(
    Object.entries(view.liabilityBalances).map(([rawId, value]) => [
      requiredLiabilityAlias(rawId, context).key,
      value,
    ]),
  );
  const liabilitySchedules = Object.fromEntries(
    Object.entries(view.liabilitySchedules).map(([rawId, schedule]) => [
      requiredLiabilityAlias(rawId, context).key,
      { ...schedule },
    ]),
  );
  return {
    income: {
      employment: view.income.employment,
      cpp: view.income.cpp,
      oas: view.income.oas,
      pension: view.income.pension,
      other: view.income.other,
      total: view.income.total,
    },
    withdrawals: {
      cash: view.withdrawals.cash,
      tfsa: view.withdrawals.tfsa,
      rrspRrif: view.withdrawals.rrspRrif,
      nonRegistered: view.withdrawals.nonRegistered,
      total: view.withdrawals.total,
    },
    outflows: {
      essential: view.outflows.essential,
      discretionary: view.outflows.discretionary,
      oneTime: view.outflows.oneTime,
      tax: view.outflows.tax,
      oasRecoveryTax: view.outflows.oasRecoveryTax,
      contributions: view.outflows.contributions,
      liabilityInterest: view.outflows.liabilityInterest,
      liabilityPrincipal: view.outflows.liabilityPrincipal,
      liabilityLumpSumPrincipal:
        view.outflows.liabilityLumpSumPrincipal,
      liabilityCashPayment: view.outflows.liabilityCashPayment,
      unmetRequiredOutflow: view.outflows.unmetRequiredOutflow,
      unmetSpending: view.outflows.unmetSpending,
      total: view.outflows.total,
    },
    contributions: {
      planned: view.contributions.planned,
      allowed: view.contributions.allowed,
      surplusFunded: view.contributions.surplusFunded,
      sourceAccount: view.contributions.sourceAccount,
      redirected: view.contributions.redirected,
      cashFunded: view.contributions.cashFunded,
      incomeWithheld: view.contributions.incomeWithheld,
      unallocatedCashFunded: view.contributions.unallocatedCashFunded,
      unallocatedIncomeWithheld:
        view.contributions.unallocatedIncomeWithheld,
      unallocated: view.contributions.unallocated,
      total: view.contributions.total,
    },
    balances: {
      cash: view.balances.cash,
      tfsa: view.balances.tfsa,
      rrspRrif: view.balances.rrspRrif,
      nonRegistered: view.balances.nonRegistered,
      financialAssets: view.balances.financialAssets,
      retirementFundingAssets: view.balances.retirementFundingAssets,
      residenceValue: view.balances.residenceValue,
      otherNonFinancialAssets: view.balances.otherNonFinancialAssets,
      totalNonFinancialAssets: view.balances.totalNonFinancialAssets,
      totalAssets: view.balances.totalAssets,
      mortgageBalance: view.balances.mortgageBalance,
      otherLiabilities: view.balances.otherLiabilities,
      totalLiabilities: view.balances.totalLiabilities,
      homeEquity: view.balances.homeEquity,
      totalNetWorth: view.balances.totalNetWorth,
    },
    accountBalances,
    nonFinancialAssetValues,
    liabilityBalances,
    liabilitySchedules,
    accountContributions,
    accountContributionDetails,
    registeredAccountRoom: {
      tfsa: { ...view.registeredAccountRoom.tfsa },
      rrsp: { ...view.registeredAccountRoom.rrsp },
    },
    surplusAllocation: {
      generated: view.surplusAllocation.generated,
      reserveRefill: view.surplusAllocation.reserveRefill,
      retainedAsCash: view.surplusAllocation.retainedAsCash,
      redirected: view.surplusAllocation.redirected,
      reserveTarget: view.surplusAllocation.reserveTarget,
    },
    savingsPolicy: { ...view.savingsPolicy },
    accountSurplusAllocations,
    accountSweepAllocations,
    allocation: safeAllocation(view.allocation),
  };
}

function safeSurplusTotals(
  totals: SurplusAllocationTotals,
  context: ShareSafeContext,
): SurplusAllocationTotals {
  return {
    generated: totals.generated,
    reserveRefill: totals.reserveRefill,
    retainedAsCash: totals.retainedAsCash,
    redirected: totals.redirected,
    accountAllocations: Object.fromEntries(
      Object.entries(totals.accountAllocations).map(([rawId, value]) => [
        requiredAccountAlias(rawId, context).key,
        value,
      ]),
    ),
  };
}

function safeSavingsTotals(
  totals: ProjectionResult["savingsPolicy"]["throughRetirement"]["nominal"],
  context: ShareSafeContext,
): ProjectionResult["savingsPolicy"]["throughRetirement"]["nominal"] {
  return {
    ...totals,
    accountSweepAllocations: Object.fromEntries(
      Object.entries(totals.accountSweepAllocations).map(
        ([rawId, amount]) => [
          requiredAccountAlias(rawId, context).key,
          amount,
        ],
      ),
    ),
  };
}

function safeFinancialAssetsBridge(bridge: FinancialAssetsBridge): FinancialAssetsBridge {
  return {
    startingFinancialAssets: bridge.startingFinancialAssets,
    employmentNetCash: bridge.employmentNetCash,
    publicBenefitsAndPension: bridge.publicBenefitsAndPension,
    otherInflows: bridge.otherInflows,
    incomeWithheldContributions: bridge.incomeWithheldContributions,
    investmentReturns: bridge.investmentReturns,
    essentialSpending: bridge.essentialSpending,
    discretionarySpending: bridge.discretionarySpending,
    liabilityCashPayments: bridge.liabilityCashPayments,
    oneTimeOutflows: bridge.oneTimeOutflows,
    taxes: bridge.taxes,
    endingFinancialAssets: bridge.endingFinancialAssets,
  };
}

function safeNetWorthBridge(bridge: NetWorthBridge): NetWorthBridge {
  return { ...bridge };
}

function safeObservationMessage(
  code: string,
  calendarYear: number | undefined,
  age: number | undefined,
  index: number,
): string {
  if (code === "retirement" && calendarYear !== undefined) {
    return `Retirement begins in ${calendarYear}.`;
  }
  if (code === "cpp_start" && age !== undefined) return `CPP begins at age ${age}.`;
  if (code === "oas_start" && age !== undefined) return `OAS begins at age ${age}.`;
  if (code === "portfolio_duration") return "Financial-asset duration observation.";
  return `Projection observation ${index + 1}`;
}

function safeProjectionResult(
  projection: ProjectionResult,
  context: ShareSafeContext,
): ProjectionResult {
  return {
    schemaVersion: "8.0",
    inputs: safeProjectionInputs(projection.inputs, context),
    summary: {
      retirementYear: projection.summary.retirementYear,
      retirementDate: projection.summary.retirementDate,
      financialAssetsAtRetirementToday: projection.summary.financialAssetsAtRetirementToday,
      nonFinancialAssetsAtRetirementToday:
        projection.summary.nonFinancialAssetsAtRetirementToday,
      liabilitiesAtRetirementToday:
        projection.summary.liabilitiesAtRetirementToday,
      homeEquityAtRetirementToday:
        projection.summary.homeEquityAtRetirementToday,
      totalNetWorthAtRetirementToday:
        projection.summary.totalNetWorthAtRetirementToday,
      retirementGoalToday: projection.summary.retirementGoalToday,
      goalGapToday: projection.summary.goalGapToday,
      financialAssetsDepletionAge: projection.summary.financialAssetsDepletionAge,
      endingFinancialAssetsToday: projection.summary.endingFinancialAssetsToday,
      endingNetWorthToday: projection.summary.endingNetWorthToday,
      mortgagePayoffDate: projection.summary.mortgagePayoffDate,
      mortgagePayoffAge: projection.summary.mortgagePayoffAge,
    },
    retirementSnapshot: {
      calendarDate: projection.retirementSnapshot.calendarDate,
      age: projection.retirementSnapshot.age,
      flowPeriod: {
        kind: projection.retirementSnapshot.flowPeriod.kind,
        calendarMonth: projection.retirementSnapshot.flowPeriod.calendarMonth,
      },
      nominal: safeProjectionView(projection.retirementSnapshot.nominal, context),
      real: safeProjectionView(projection.retirementSnapshot.real, context),
    },
    financialAssetsBridge: {
      nominal: safeFinancialAssetsBridge(projection.financialAssetsBridge.nominal),
      real: safeFinancialAssetsBridge(projection.financialAssetsBridge.real),
    },
    netWorthBridge: {
      nominal: safeNetWorthBridge(projection.netWorthBridge.nominal),
      real: safeNetWorthBridge(projection.netWorthBridge.real),
    },
    liabilityPayoffDates: Object.fromEntries(
      Object.entries(projection.liabilityPayoffDates).map(
        ([rawId, payoffDate]) => [
          requiredLiabilityAlias(rawId, context).key,
          payoffDate,
        ],
      ),
    ),
    governmentBenefits: {
      cpp: {
        ...projection.governmentBenefits.cpp,
      },
      oas: {
        ...projection.governmentBenefits.oas,
      },
    },
    surplusAllocation: {
      policy: {
        reserveAccountIds:
          projection.surplusAllocation.policy.reserveAccountIds.map(
            (accountId) => requiredAccountAlias(accountId, context).key,
          ),
        reserveRefillAccountId: requiredAccountAlias(
          projection.surplusAllocation.policy.reserveRefillAccountId,
          context,
        ).key,
        targetCashReserveToday:
          projection.surplusAllocation.policy.targetCashReserveToday,
        reserveIndexingRate:
          projection.surplusAllocation.policy.reserveIndexingRate,
        excessMode: projection.surplusAllocation.policy.excessMode,
        destinationAccountId:
          projection.surplusAllocation.policy.destinationAccountId === null
            ? null
            : requiredAccountAlias(
                projection.surplusAllocation.policy.destinationAccountId,
                context,
              ).key,
      },
      throughRetirement: {
        nominal: safeSurplusTotals(
          projection.surplusAllocation.throughRetirement.nominal,
          context,
        ),
        real: safeSurplusTotals(
          projection.surplusAllocation.throughRetirement.real,
          context,
        ),
      },
      reserveTargetAtRetirement: {
        ...projection.surplusAllocation.reserveTargetAtRetirement,
      },
      reserveAccountsBalanceAtRetirement: {
        ...projection.surplusAllocation.reserveAccountsBalanceAtRetirement,
      },
      destinationAccountBalanceAtRetirement:
        projection.surplusAllocation.destinationAccountBalanceAtRetirement
          ? {
              ...projection.surplusAllocation
                .destinationAccountBalanceAtRetirement,
            }
          : null,
    },
    registeredAccountRoom: {
      modelled: projection.registeredAccountRoom.modelled,
      denomination: projection.registeredAccountRoom.denomination,
      policy: {
        tfsaStartingRoomSource:
          projection.registeredAccountRoom.policy.tfsaStartingRoomSource
            ? {
                ...projection.registeredAccountRoom.policy
                  .tfsaStartingRoomSource,
                sourceDescription:
                  "Personal TFSA room supplied through private configuration",
              }
            : null,
        rrspStartingRoomSource:
          projection.registeredAccountRoom.policy.rrspStartingRoomSource
            ? {
                ...projection.registeredAccountRoom.policy
                  .rrspStartingRoomSource,
                sourceDescription:
                  "Personal RRSP room supplied through private configuration",
              }
            : null,
        tfsaCarryForwardUnusedRoom:
          projection.registeredAccountRoom.policy
            .tfsaCarryForwardUnusedRoom,
        rrspCarryForwardUnusedRoom:
          projection.registeredAccountRoom.policy
            .rrspCarryForwardUnusedRoom,
        waterfallMode:
          projection.registeredAccountRoom.policy.waterfallMode,
        routes: projection.registeredAccountRoom.policy.routes.map(
          (route) => ({
            sourceAccountId: requiredAccountAlias(
              route.sourceAccountId,
              context,
            ).key,
            destinationAccountIds: route.destinationAccountIds.map(
              (accountId) => requiredAccountAlias(accountId, context).key,
            ),
          }),
        ),
        surplusDestinationAccountIds:
          projection.registeredAccountRoom.policy.surplusDestinationAccountIds.map(
            (accountId) => requiredAccountAlias(accountId, context).key,
          ),
      },
      references: {
        tfsaAnnualLimit: {
          ...projection.registeredAccountRoom.references.tfsaAnnualLimit,
        },
        rrspAnnualCaps:
          projection.registeredAccountRoom.references.rrspAnnualCaps.map(
            (reference) => ({ ...reference }),
          ),
        rrspEarnedIncomeRate:
          projection.registeredAccountRoom.references.rrspEarnedIncomeRate,
        rrspFormulaReferenceUrl:
          projection.registeredAccountRoom.references
            .rrspFormulaReferenceUrl,
        tfsaWithdrawalReferenceUrl:
          projection.registeredAccountRoom.references
            .tfsaWithdrawalReferenceUrl,
      },
      annual: projection.registeredAccountRoom.annual.map((row) => ({
        calendarYear: row.calendarYear,
        nominal: {
          tfsa: { ...row.nominal.tfsa },
          rrsp: { ...row.nominal.rrsp },
        },
        real: {
          tfsa: { ...row.real.tfsa },
          rrsp: { ...row.real.rrsp },
        },
      })),
    },
    savingsPolicy: {
      mode: projection.savingsPolicy.mode,
      policy:
        projection.savingsPolicy.policy.mode === "advanced"
          ? { mode: "advanced" }
          : {
              mode: "simple",
              reserveAccountIds:
                projection.savingsPolicy.policy.reserveAccountIds.map(
                  (accountId) =>
                    requiredAccountAlias(accountId, context).key,
                ),
              reserveRefillAccountId: requiredAccountAlias(
                projection.savingsPolicy.policy
                  .reserveRefillAccountId,
                context,
              ).key,
              operatingCashAccountId: requiredAccountAlias(
                projection.savingsPolicy.policy.operatingCashAccountId,
                context,
              ).key,
              personalTfsaAccountId: requiredAccountAlias(
                projection.savingsPolicy.policy.personalTfsaAccountId,
                context,
              ).key,
              personalRrspAccountId: requiredAccountAlias(
                projection.savingsPolicy.policy.personalRrspAccountId,
                context,
              ).key,
              workplaceRrspAccountId:
                projection.savingsPolicy.policy
                  .workplaceRrspAccountId === null
                  ? null
                  : requiredAccountAlias(
                      projection.savingsPolicy.policy
                        .workplaceRrspAccountId,
                      context,
                    ).key,
              taxableAccountId: requiredAccountAlias(
                projection.savingsPolicy.policy.taxableAccountId,
                context,
              ).key,
              taxableAccountOrigin:
                projection.savingsPolicy.policy.taxableAccountOrigin,
              operatingCashTarget:
                projection.savingsPolicy.policy.operatingCashTarget === null
                  ? null
                  : { ...projection.savingsPolicy.policy.operatingCashTarget },
              operatingCashIsReserveMember:
                projection.savingsPolicy.policy
                  .operatingCashIsReserveMember,
              personalOrder: [
                "personal_tfsa",
                "personal_rrsp",
                "taxable",
              ],
              workplaceRoomPriority: "first",
              workplaceOverflow: "unallocated",
              reserveAfterTarget: "personal_investing",
              unplannedCash:
                projection.savingsPolicy.policy.unplannedCash,
            },
      throughRetirement: {
        nominal: safeSavingsTotals(
          projection.savingsPolicy.throughRetirement.nominal,
          context,
        ),
        real: safeSavingsTotals(
          projection.savingsPolicy.throughRetirement.real,
          context,
        ),
      },
    },
    annual: projection.annual.map((point) => ({
      calendarYear: point.calendarYear,
      age: point.age,
      phase: point.phase,
      nominal: safeProjectionView(point.nominal, context),
      real: safeProjectionView(point.real, context),
      milestones: point.milestones.map((milestone, index) =>
        SAFE_MILESTONES.has(milestone) ? milestone : `Milestone ${index + 1}`,
      ),
      employmentPhaseLabels: point.employmentPhaseLabels.map((label) =>
        requiredRecordAlias(
          label,
          context.employmentPhaseByRawLabel,
          "employment phase label",
        ).label
      ),
      contributionPhaseLabels: Object.fromEntries(
        Object.entries(point.contributionPhaseLabels).map(([rawAccountId, labels]) => [
          requiredAccountAlias(rawAccountId, context).key,
          labels.map((label) =>
            requiredContributionPhaseAlias(
              rawAccountId,
              label,
              context.contributionPhaseByAccountAndRawLabel,
            ).label
          ),
        ]),
      ),
    })),
    observations: projection.observations.map((observation, index) => {
      const code = SAFE_OBSERVATION_CODES.has(observation.code)
        ? observation.code
        : `observation_${index + 1}`;
      return {
        code,
        message: safeObservationMessage(
          code,
          observation.calendarYear,
          observation.age,
          index,
        ),
        ...(observation.calendarYear !== undefined
          ? { calendarYear: observation.calendarYear }
          : {}),
        ...(observation.age !== undefined ? { age: observation.age } : {}),
      };
    }),
  };
}

function safeDerivedBaseline(
  derived: DerivedBaseline,
  context: ShareSafeContext,
  dataThrough: string,
): ShareSafeDerivedBaseline {
  return {
    accountBalances: derived.accountBalances.map((account) => {
      const alias =
        account.plannerType === "debt"
          ? requiredLiabilityAlias(account.id, context)
          : requiredAccountAlias(account.id, context);
      return {
        id: alias.key,
        source: allowedValue(account.source, ACCOUNT_SOURCES, "account source"),
        name: alias.label,
        plannerType: allowedValue(
          account.plannerType,
          [...ACCOUNT_TYPE_ORDER, "debt"] as const,
          "planner account type",
        ),
        balance: finiteNumber(account.balance, "account balance"),
        balanceAsOf: safeDateLike(account.balanceAsOf, dataThrough),
        monthlyContribution: finiteNumber(account.monthlyContribution, "monthly contribution"),
        contributionSource: allowedValue(
          account.contributionSource,
          CONTRIBUTION_SOURCES,
          "contribution source",
        ),
        contributionFunding: account.contributionFunding
          ? allowedValue(
              account.contributionFunding,
              CONTRIBUTION_FUNDING,
              "contribution funding",
            )
          : undefined,
      };
    }),
    nonFinancialAssetBalances:
      derived.nonFinancialAssetBalances.map((asset) => {
        const alias = requiredNonFinancialAssetAlias(
          asset.id,
          context,
        );
        return {
          id: alias.key,
          source: allowedValue(
            asset.source,
            ["manual", "plaid"] as const,
            "non-financial asset source",
          ),
          name: alias.label,
          plannerType: "real_estate",
          value: finiteNumber(
            asset.value,
            "non-financial asset value",
          ),
          valueAsOf: safeDateLike(asset.valueAsOf, dataThrough),
        };
      }),
    monthlyIncome: {
      ...metric(derived.monthlyIncome),
      basis: "net_deposited_cash",
    },
    essentialSpending: metric(derived.essentialSpending),
    discretionarySpending: metric(derived.discretionarySpending),
    investmentContributions: {
      ...metric(derived.investmentContributions),
      accounts: derived.investmentContributions.accounts.map((account) => ({
        accountId: requiredAccountAlias(account.accountId, context).key,
        monthlyAverage: finiteNumber(account.monthlyAverage, "contribution monthly average"),
        source: allowedValue(account.source, CONTRIBUTION_SOURCES, "contribution source"),
        funding: allowedValue(account.funding, CONTRIBUTION_FUNDING, "contribution funding"),
      })),
    },
    debtPayments: metric(derived.debtPayments),
    recurringExpenses: {
      monthlyTotal: finiteNumber(derived.recurringExpenses.monthlyTotal, "recurring monthly total"),
      count: finiteNumber(derived.recurringExpenses.count, "recurring count"),
      items: derived.recurringExpenses.items.map((item) => {
        const alias = requiredRecordAlias(
          String(item.id),
          context.recurringByRawId,
          "recurring expense",
        );
        return {
          id: alias.key,
          description: alias.label,
          classification: allowedValue(
            item.classification,
            RECURRING_CLASSIFICATIONS,
            "recurring classification",
          ),
          monthlyAmount: finiteNumber(item.monthlyAmount, "recurring monthly amount"),
          accountId: requiredAccountAlias(item.accountId, context).key,
          categoryId: requiredRecordAlias(
            item.categoryId,
            context.categoriesByRawId,
            "category",
          ).key,
        };
      }),
    },
  };
}

function safeDebtPaymentAudit(
  baseline: BaselineExportContext,
  context: ShareSafeContext,
): ProjectionSnapshot["debtPaymentAudit"] {
  return {
    trailingTotal: finiteNumber(
      baseline.cashFlowAudit.debtPayments.trailingTotal,
      "debt-payment trailing total",
    ),
    monthlyAverage: finiteNumber(
      baseline.cashFlowAudit.debtPayments.monthlyAverage,
      "debt-payment monthly average",
    ),
    transactionCount: finiteNumber(
      baseline.cashFlowAudit.debtPayments.transactionCount,
      "debt-payment transaction count",
    ),
    liabilities:
      baseline.cashFlowAudit.debtPayments.liabilities.map(
        (liability) => ({
          liabilityId: requiredLiabilityAlias(
            liability.liabilityId,
            context,
          ).key,
          liabilityRole: liability.liabilityRole,
          monthlyAverage: finiteNumber(
            liability.monthlyAverage,
            "liability historical monthly average",
          ),
          scheduleReplaced: liability.scheduleReplaced,
        }),
      ),
  };
}

function safeWarnings(
  warnings: BaselineWarning[],
): ProjectionSnapshot["warnings"] {
  return warnings.map((warning, index) => {
    const sequence = index + 1;
    return {
      code: warning.code,
      severity: allowedValue(warning.severity, WARNING_SEVERITIES, "warning severity"),
      ...(warning.identifier ? { identifier: `warning_${sequence}` } : {}),
      name: `Warning ${sequence}`,
      message: SAFE_WARNING_MESSAGES[warning.code],
    };
  });
}

function provenanceField(
  rawField: string,
  context: ShareSafeContext,
  rawValue: unknown,
): ProvenanceField | undefined {
  if (
    rawField === "contributionWaterfall.surplusDestinationAccountIds" ||
    /^contributionWaterfall\.routes\.\d+\.destinationAccountIds$/.test(
      rawField,
    )
  ) {
    if (
      !Array.isArray(rawValue) ||
      rawValue.some((value) => typeof value !== "string")
    ) {
      return undefined;
    }
    const accountReferences = rawValue.map((value) =>
      context.accountByRawId.get(value as string),
    );
    if (accountReferences.some((value) => !value)) return undefined;
    return {
      reference: rawField,
      accountReferences: accountReferences as AccountAlias[],
      finalField: "destinationAccountIds",
    };
  }
  if (
    /^contributionWaterfall\.routes\.\d+\.sourceAccountId$/.test(
      rawField,
    )
  ) {
    if (typeof rawValue !== "string") return undefined;
    const accountReference = context.accountByRawId.get(rawValue);
    return accountReference
      ? {
          reference: rawField,
          accountReference,
          finalField: "sourceAccountId",
        }
      : undefined;
  }
  if (rawField === "surplusAllocation.reserveAccountIds") {
    if (
      !Array.isArray(rawValue) ||
      rawValue.some((value) => typeof value !== "string")
    ) {
      return undefined;
    }
    const accountReferences = rawValue.map((value) =>
      context.accountByRawId.get(value as string),
    );
    if (accountReferences.some((value) => !value)) return undefined;
    return {
      reference: rawField,
      accountReferences: accountReferences as AccountAlias[],
      finalField: "reserveAccountIds",
    };
  }
  if (
    rawField === "surplusAllocation.reserveRefillAccountId" ||
    rawField === "surplusAllocation.excess.destinationAccountId"
  ) {
    if (typeof rawValue !== "string") return undefined;
    const accountReference = context.accountByRawId.get(rawValue);
    if (!accountReference) return undefined;
    return {
      reference: rawField,
      accountReference,
      finalField: rawField.slice(rawField.lastIndexOf(".") + 1),
    };
  }
  if (rawField === "savingsPolicy.reserveAccountIds") {
    if (
      !Array.isArray(rawValue) ||
      rawValue.some((value) => typeof value !== "string")
    ) {
      return undefined;
    }
    const accountReferences = rawValue.map((value) =>
      context.accountByRawId.get(value as string),
    );
    if (accountReferences.some((value) => !value)) return undefined;
    return {
      reference: rawField,
      accountReferences: accountReferences as AccountAlias[],
      finalField: "reserveAccountIds",
    };
  }
  if (
    [
      "savingsPolicy.operatingCashAccountId",
      "savingsPolicy.reserveRefillAccountId",
      "savingsPolicy.personalTfsaAccountId",
      "savingsPolicy.personalRrspAccountId",
      "savingsPolicy.workplaceRrspAccountId",
      "savingsPolicy.taxableAccountId",
    ].includes(rawField)
  ) {
    if (rawValue === null) {
      return {
        reference: rawField,
        finalField: rawField.slice(rawField.lastIndexOf(".") + 1),
      };
    }
    if (typeof rawValue !== "string") return undefined;
    const accountReference = context.accountByRawId.get(rawValue);
    return accountReference
      ? {
          reference: rawField,
          accountReference,
          finalField: rawField.slice(rawField.lastIndexOf(".") + 1),
        }
      : undefined;
  }
  const savingsPhasePrefix = "savingsPolicy.reserveBuilding.phases.";
  if (rawField.startsWith(savingsPhasePrefix)) {
    const remainder = rawField.slice(savingsPhasePrefix.length);
    const separator = remainder.lastIndexOf(".");
    if (separator < 0) return undefined;
    const rawPhaseId = remainder.slice(0, separator);
    const finalField = remainder.slice(separator + 1);
    if (!SAVINGS_PHASE_PROVENANCE_FIELDS.has(finalField)) {
      return undefined;
    }
    const phase = context.savingsPhaseByRawId.get(rawPhaseId);
    return phase
      ? {
          reference: `${savingsPhasePrefix}${phase.key}.${finalField}`,
          savingsPhase: phase,
          finalField,
        }
      : undefined;
  }
  if (SAFE_PROVENANCE_FIELDS.has(rawField)) {
    return {
      reference: rawField,
      finalField: rawField.slice(rawField.lastIndexOf(".") + 1),
    };
  }
  const nonFinancialAssetPrefix = "nonFinancialAssets.";
  if (rawField.startsWith(nonFinancialAssetPrefix)) {
    const remainder = rawField.slice(
      nonFinancialAssetPrefix.length,
    );
    for (const asset of context.nonFinancialAssets) {
      const prefix = `${asset.rawId}.`;
      if (!remainder.startsWith(prefix)) continue;
      const finalField = remainder.slice(prefix.length);
      if (
        ![
          "openingValue",
          "valueAsOf",
          "annualAppreciation",
          "availableForWithdrawals",
        ].includes(finalField)
      ) {
        return undefined;
      }
      return {
        reference: `nonFinancialAssets.${asset.key}.${finalField}`,
        balanceSheetRecord: asset,
        finalField,
      };
    }
  }
  const liabilityPrefix = "liabilities.";
  if (rawField.startsWith(liabilityPrefix)) {
    const remainder = rawField.slice(liabilityPrefix.length);
    for (const liability of context.liabilities) {
      const prefix = `${liability.rawId}.`;
      if (!remainder.startsWith(prefix)) continue;
      const finalField = remainder.slice(prefix.length);
      if (
        ![
          "openingBalance",
          "balanceAsOf",
          "role",
          "treatment.mode",
          "treatment.annualInterestRate",
          "treatment.interestRateConvention",
          "treatment.regularPaymentAmount",
          "treatment.regularPaymentFrequency",
          "treatment.monthlyEquivalent",
          "treatment.scheduleStartDate",
          "treatment.lumpSumPayments",
          "historicalPaymentHandling",
        ].includes(finalField)
      ) {
        return undefined;
      }
      return {
        reference: `liabilities.${liability.key}.${finalField}`,
        balanceSheetRecord: liability,
        finalField,
      };
    }
  }
  const employmentPrefix = "person.employmentIncomePhases.";
  if (rawField.startsWith(employmentPrefix)) {
    const remainder = rawField.slice(employmentPrefix.length);
    const separator = remainder.lastIndexOf(".");
    if (separator < 0) return undefined;
    const rawPhaseId = remainder.slice(0, separator);
    const finalField = remainder.slice(separator + 1);
    const phase = context.employmentPhaseByRawId.get(rawPhaseId);
    if (EMPLOYMENT_PHASE_PROVENANCE_FIELDS.has(finalField)) {
      if (!phase) return undefined;
      return {
        reference: `${employmentPrefix}${phase.key}.${finalField}`,
        employmentPhase: phase,
        finalField,
      };
    }
    const roomMarker = ".rrspRoomGeneration.";
    const roomMarkerIndex = remainder.indexOf(roomMarker);
    if (roomMarkerIndex > 0) {
      const roomPhaseId = remainder.slice(0, roomMarkerIndex);
      const roomField = remainder.slice(
        roomMarkerIndex + roomMarker.length,
      );
      const roomPhase =
        context.employmentPhaseByRawId.get(roomPhaseId);
      if (
        roomPhase &&
        RRSP_ROOM_GENERATION_PROVENANCE_FIELDS.has(roomField)
      ) {
        return {
          reference: `${employmentPrefix}${roomPhase.key}.rrspRoomGeneration.${roomField}`,
          employmentPhase: roomPhase,
          finalField: roomField,
        };
      }
    }
    const simpleRoomMarker = ".rrspRoom.";
    const simpleRoomMarkerIndex = remainder.indexOf(simpleRoomMarker);
    if (simpleRoomMarkerIndex > 0) {
      const roomPhaseId = remainder.slice(0, simpleRoomMarkerIndex);
      const roomField = remainder.slice(
        simpleRoomMarkerIndex + simpleRoomMarker.length,
      );
      const roomPhase =
        context.employmentPhaseByRawId.get(roomPhaseId);
      if (
        roomPhase &&
        SIMPLE_RRSP_ROOM_PROVENANCE_FIELDS.has(roomField)
      ) {
        return {
          reference: `${employmentPrefix}${roomPhase.key}.rrspRoom.${roomField}`,
          employmentPhase: roomPhase,
          finalField: roomField,
        };
      }
    }
  }
  for (const account of context.accounts) {
    const prefix = `accounts.${account.rawId}.`;
    if (!rawField.startsWith(prefix)) continue;
    const accountField = rawField.slice(prefix.length);
    if (accountField.startsWith("contributionPhases.")) {
      const remainder = accountField.slice("contributionPhases.".length);
      const separator = remainder.lastIndexOf(".");
      if (separator < 0) return undefined;
      const rawPhaseId = remainder.slice(0, separator);
      const finalField = remainder.slice(separator + 1);
      if (!CONTRIBUTION_PHASE_PROVENANCE_FIELDS.has(finalField)) return undefined;
      const phase = context.contributionPhaseByAccountAndRawId.get(
        contributionPhaseKey(account.rawId, rawPhaseId),
      );
      if (!phase) return undefined;
      return {
        reference: `accounts.${account.key}.contributionPhases.${phase.key}.${finalField}`,
        account,
        contributionPhase: phase,
        finalField,
      };
    }
    if (!ACCOUNT_PROVENANCE_FIELDS.has(accountField)) return undefined;
    return {
      reference: `accounts.${account.key}.${accountField}`,
      account,
      accountField,
      finalField: accountField,
    };
  }
  return undefined;
}

function safeSourceType(value: BaselineSourceType): BaselineSourceType {
  if (!SOURCE_TYPES.has(value)) throw new Error("Unsupported provenance source type");
  return value;
}

function safeReferenceKind(
  value: CanadianReferenceKind | undefined,
): CanadianReferenceKind | undefined {
  return value && REFERENCE_KINDS.has(value) ? value : undefined;
}

function safeReferenceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "www.canada.ca"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function safeProvenanceValue(
  value: unknown,
  field: ProvenanceField,
  safeEvents: ProjectionEventInput[],
): ShareSafeProvenanceData {
  if (field.reference === "events") return safeEvents;
  if (field.accountReferences) {
    return field.accountReferences.map((account) => account.key);
  }
  if (field.accountReference) return field.accountReference.key;
  if (field.accountField === "label" && field.account) {
    return field.account.label;
  }
  if (field.finalField === "label" && field.employmentPhase) {
    return field.employmentPhase.label;
  }
  if (field.finalField === "label" && field.contributionPhase) {
    return field.contributionPhase.label;
  }
  if (field.finalField === "label" && field.savingsPhase) {
    return field.savingsPhase.label;
  }
  if (
    field.finalField === "treatment.lumpSumPayments" &&
    Array.isArray(value) &&
    value.every(
      (payment) =>
        payment &&
        typeof payment === "object" &&
        typeof (payment as { date?: unknown }).date === "string" &&
        typeof (payment as { amount?: unknown }).amount === "number",
    )
  ) {
    return (value as Array<{ date: string; amount: number }>).map(
      (payment) => ({ ...payment }),
    );
  }
  if (
    field.accountField === "roles" &&
    Array.isArray(value) &&
    value.every(
      (role) =>
        typeof role === "string" &&
        [
          "operating_cash",
          "reserve_member",
          "reserve_refill",
          "personal_tfsa",
          "personal_rrsp",
          "workplace_rrsp",
          "personal_taxable",
          "primary_mortgage",
        ].includes(role),
    )
  ) {
    return value as string[];
  }
  if (
    field.reference === "savingsPolicy.personalOrder" &&
    Array.isArray(value) &&
    value.length === 3 &&
    value[0] === "personal_tfsa" &&
    value[1] === "personal_rrsp" &&
    value[2] === "taxable"
  ) {
    return value as string[];
  }
  if (typeof value === "number") return finiteNumber(value, `provenance ${field.reference}`);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "string") {
    if (
      field.reference.endsWith(".effectiveDate") &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return value;
    }
    if (
      [
        "valueAsOf",
        "balanceAsOf",
        "treatment.scheduleStartDate",
      ].includes(field.finalField ?? "") &&
      /^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return value;
    }
    if (field.finalField === "funding") {
      return allowedValue(value, CONTRIBUTION_FUNDING, "provenance contribution funding");
    }
    if (field.accountField === "type") {
      return allowedValue(value, ACCOUNT_TYPE_ORDER, "provenance account type");
    }
    if (field.accountField === "origin") {
      return allowedValue(
        value,
        ["lunchmoney", "projection_configuration"] as const,
        "provenance account origin",
      );
    }
    if (
      field.reference === "surplusAllocation.excess.mode" &&
      [
        "retain_as_cash",
        "allocate_to_account",
        "allocate_through_contribution_waterfall",
      ].includes(value)
    ) {
      return value;
    }
    if (
      (field.reference.endsWith(".startingAvailableRoom.source") ||
        field.reference.endsWith(
          ".startingAvailableDeductionRoom.source",
        )) &&
      ["official_estimate", "configured_amount", "explicit_zero"].includes(
        value,
      )
    ) {
      return value;
    }
    if (
      field.reference === "contributionWaterfall.mode" &&
      [
        "canonical",
        "fixed_source_compatibility",
        "simple_policy",
      ].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.mode" &&
      ["simple", "advanced"].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.taxableAccountOrigin" &&
      ["lunchmoney", "projection_configuration"].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.unplannedCash" &&
      ["retain_in_operating_cash", "sweep_above_targets"].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.workplaceRoomPriority" &&
      value === "first"
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.workplaceOverflow" &&
      value === "unallocated"
    ) {
      return value;
    }
    if (
      field.reference === "savingsPolicy.reserveAfterTarget" &&
      value === "personal_investing"
    ) {
      return value;
    }
    if (
      field.finalField === "role" &&
      (value === "primary_mortgage" || value === null)
    ) {
      return value;
    }
    if (
      field.finalField === "treatment.mode" &&
      [
        "amortizing",
        "payoff_at_projection_start",
        "zero_balance",
      ].includes(value)
    ) {
      return value;
    }
    if (
      field.finalField === "treatment.interestRateConvention" &&
      ["canadian_mortgage", "effective_annual"].includes(value)
    ) {
      return value;
    }
    if (
      field.finalField === "treatment.regularPaymentFrequency" &&
      ["monthly", "semimonthly", "biweekly", "weekly"].includes(value)
    ) {
      return value;
    }
    if (
      field.finalField === "historicalPaymentHandling" &&
      [
        "category_mapped",
        "payee_and_source_account",
        "already_excluded_or_transfer",
        "not_applicable",
      ].includes(value)
    ) {
      return value;
    }
    if (
      field.reference ===
        "registeredAccountRoom.tfsa.withdrawalRoomRecredit" &&
      value === "next_calendar_year"
    ) {
      return value;
    }
    if (
      field.reference === "person.cpp.amountSourceMode" &&
      ["official_estimate", "configured_amount", "canadian_reference", "explicit_zero"].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "person.oas.fullAmountSourceMode" &&
      ["configured_amount", "canadian_reference"].includes(value)
    ) {
      return value;
    }
    if (
      field.reference === "person.oas.eligibility.mode" &&
      ["full", "partial", "none"].includes(value)
    ) {
      return value;
    }
    if (field.reference === "person.cpp.claimAdjustmentRule") {
      return "Statutory monthly CPP claim-age adjustment";
    }
    if (field.reference === "person.oas.delayedClaimRule") {
      return "Statutory monthly OAS delayed-claim adjustment";
    }
    if (field.reference === "person.oas.age75IncreaseRule") {
      return "Statutory OAS increase after age 75";
    }
    return "descriptive_value_omitted";
  }
  if (field.accountField === "allocation" && value && typeof value === "object") {
    const allocation = value as Partial<AssetAllocation>;
    if (
      typeof allocation.cash === "number" &&
      typeof allocation.fixedIncome === "number" &&
      typeof allocation.equity === "number"
    ) {
      return safeAllocation(allocation as AssetAllocation);
    }
  }
  return "unsupported_value_omitted";
}

function safeProvenanceDescription(
  sourceType: BaselineSourceType,
  sourceDescription: string,
): string {
  if (/legacy|compatib/i.test(sourceDescription)) {
    return "Value resolved through legacy compatibility behaviour";
  }
  if (sourceType === "lunchmoney_derived") {
    return "Value imported from Lunch Money and aggregated for the baseline";
  }
  if (sourceType === "local_configuration") {
    return "Value supplied through private local configuration";
  }
  return "Published Canadian reference";
}

function safeProvenance(
  provenance: BaselineExportContext["provenance"],
  context: ShareSafeContext,
  safeEvents: ProjectionEventInput[],
  dataThrough: string,
): ProjectionSnapshot["provenance"] {
  const result: ProjectionSnapshot["provenance"] = {};
  for (const [rawField, source] of Object.entries(provenance).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const field = provenanceField(rawField, context, source.value);
    if (!field) continue;
    const sourceType = safeSourceType(source.sourceType);
    const referenceKind = safeReferenceKind(source.referenceKind);
    const referenceUrl = safeReferenceUrl(source.referenceUrl);
    result[field.reference] = {
      fieldReference: field.reference,
      value: safeProvenanceValue(source.value, field, safeEvents),
      sourceType,
      sourceDescription: safeProvenanceDescription(
        sourceType,
        source.sourceDescription,
      ),
      effectiveDate: safeDateLike(source.effectiveDate, dataThrough),
      ...(referenceKind ? { referenceKind } : {}),
      ...(referenceUrl ? { referenceUrl } : {}),
    };
  }
  return result;
}

function safeOverrideKey(
  rawKey: string,
  context: ShareSafeContext,
): string | undefined {
  if (SIMPLE_OVERRIDE_KEYS.has(rawKey)) return rawKey;
  if (rawKey.startsWith("liability.")) {
    for (const liability of context.liabilities) {
      const prefix = `liability.${liability.rawId}.`;
      if (!rawKey.startsWith(prefix)) continue;
      const field = rawKey.slice(prefix.length);
      return ["annualInterestRate", "regularPayment.amount"].includes(field)
        ? `liability.${liability.key}.${field}`
        : undefined;
    }
    return undefined;
  }
  if (rawKey.startsWith("employmentPhase.")) {
    const remainder = rawKey.slice("employmentPhase.".length);
    const separator = remainder.lastIndexOf(".");
    if (separator < 0) return undefined;
    const rawPhaseId = remainder.slice(0, separator);
    const field = remainder.slice(separator + 1);
    const phase = context.employmentPhaseByRawId.get(rawPhaseId);
    if (
      phase &&
      (field === "annualNetCashToday" || field === "annualGrowth")
    ) {
      return `employmentPhase.${phase.key}.${field}`;
    }
    const roomMarker = ".rrspRoomGeneration.";
    const markerIndex = remainder.indexOf(roomMarker);
    if (markerIndex > 0) {
      const roomPhaseId = remainder.slice(0, markerIndex);
      const roomField = remainder.slice(markerIndex + roomMarker.length);
      const roomPhase =
        context.employmentPhaseByRawId.get(roomPhaseId);
      return roomPhase &&
        RRSP_ROOM_GENERATION_PROVENANCE_FIELDS.has(roomField)
        ? `employmentPhase.${roomPhase.key}.rrspRoomGeneration.${roomField}`
        : undefined;
    }
    return undefined;
  }
  if (rawKey.startsWith("contributionPhase.")) {
    for (const account of context.accounts) {
      const prefix = `contributionPhase.${account.rawId}.`;
      if (!rawKey.startsWith(prefix)) continue;
      const remainder = rawKey.slice(prefix.length);
      const separator = remainder.lastIndexOf(".");
      if (separator < 0) return undefined;
      const rawPhaseId = remainder.slice(0, separator);
      const field = remainder.slice(separator + 1);
      const phase = context.contributionPhaseByAccountAndRawId.get(
        contributionPhaseKey(account.rawId, rawPhaseId),
      );
      return phase && (field === "monthlyAmountToday" || field === "indexingRate")
        ? `contributionPhase.${account.key}.${phase.key}.${field}`
        : undefined;
    }
  }
  if (rawKey.startsWith("reserveBuildingPhase.")) {
    const remainder = rawKey.slice("reserveBuildingPhase.".length);
    const separator = remainder.lastIndexOf(".");
    if (separator < 0) return undefined;
    const rawPhaseId = remainder.slice(0, separator);
    const field = remainder.slice(separator + 1);
    const phase = context.savingsPhaseByRawId.get(rawPhaseId);
    return phase &&
      (field === "monthlyAmountToday" || field === "indexingRate")
      ? `reserveBuildingPhase.${phase.key}.${field}`
      : undefined;
  }
  if (rawKey.startsWith("return.")) {
    const accountType = rawKey.slice("return.".length) as AccountType;
    return ACCOUNT_TYPE_ORDER.includes(accountType) ? rawKey : undefined;
  }
  for (const account of context.accounts) {
    const prefix = `accounts.${account.rawId}.`;
    if (!rawKey.startsWith(prefix)) continue;
    const accountField = rawKey.slice(prefix.length);
    return ACCOUNT_PROVENANCE_FIELDS.has(accountField)
      ? `accounts.${account.key}.${accountField}`
      : undefined;
  }
  return undefined;
}

function safeOverrides(
  overrides: Record<string, number>,
  context: ShareSafeContext,
): Record<string, number> {
  const result: Record<string, number> = {};
  let unknownIndex = 0;
  for (const [rawKey, value] of Object.entries(overrides).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const key = safeOverrideKey(rawKey, context) ?? `override_${(unknownIndex += 1)}`;
    result[key] = value;
  }
  return result;
}

export function validateProjectionExportRequest(value: unknown): ProjectionExportRequest {
  const payload = record(value, "Export payload");
  const baseline = record(payload.baseline, "baseline");
  const overrides = record(payload.overrides ?? {}, "overrides");
  const numericOverrides = Object.fromEntries(
    Object.entries(overrides).map(([key, entry]) => {
      if (typeof entry !== "number" || !Number.isFinite(entry)) {
        throw new Error(`Override ${key} must be a finite number`);
      }
      return [key, entry];
    }),
  );
  if (typeof baseline.dataThrough !== "string") throw new Error("baseline.dataThrough is required");
  if (!Array.isArray(baseline.warnings)) throw new Error("baseline.warnings must be an array");
  record(baseline.provenance, "baseline.provenance");
  record(baseline.derived, "baseline.derived");
  record(baseline.cashFlowAudit, "baseline.cashFlowAudit");
  record(baseline.transactionWindow, "baseline.transactionWindow");
  record(baseline.recordsAnalyzed, "baseline.recordsAnalyzed");
  return {
    inputs: validateProjectionInputs(payload.inputs),
    baseline: {
      connection: record(baseline.connection, "baseline.connection") as BaselineExportContext["connection"],
      projectionInputs: validateProjectionInputs(baseline.projectionInputs),
      provenance: baseline.provenance as BaselineExportContext["provenance"],
      derived: baseline.derived as DerivedBaseline,
      cashFlowAudit:
        baseline.cashFlowAudit as BaselineExportContext["cashFlowAudit"],
      dataThrough: baseline.dataThrough,
      transactionWindow:
        baseline.transactionWindow as BaselineExportContext["transactionWindow"],
      recordsAnalyzed: baseline.recordsAnalyzed as BaselineExportContext["recordsAnalyzed"],
      warnings: baseline.warnings as BaselineWarning[],
      unmappedAccounts: Array.isArray(baseline.unmappedAccounts)
        ? (baseline.unmappedAccounts as BaselineExportContext["unmappedAccounts"])
        : [],
      unmappedCategories: Array.isArray(baseline.unmappedCategories)
        ? (baseline.unmappedCategories as BaselineExportContext["unmappedCategories"])
        : [],
    },
    overrides: numericOverrides,
  };
}

export function createProjectionSnapshot(
  projection: ProjectionResult,
  baseline: BaselineExportContext,
  activeOverrides: Record<string, number>,
  generatedAt = new Date().toISOString(),
): ProjectionSnapshot {
  const context = createShareSafeContext(projection, baseline);
  const safeResolvedBaseline = safeProjectionInputs(baseline.projectionInputs, context);
  const safeProjection = safeProjectionResult(projection, context);
  const dataThrough = safeDateLike(baseline.dataThrough, projection.inputs.startDate);
  const safeGeneratedAt = requireIsoTimestamp(generatedAt);
  return {
    schemaVersion: "8.0",
    generatedAt: safeGeneratedAt,
    exportMetadata: {
      transformation: "typed_allowlist_and_automatic_anonymization",
      automaticSanitizationApplied: true,
      rawLunchMoneyIdentifiersIncluded: false,
      sourceSystemRecordIdsIncluded: false,
      descriptiveFinancialTextIncluded: false,
      credentialsIncluded: false,
      accountAliases: context.accounts.map(({ key, label, plannerType }) => ({
        key,
        label,
        plannerType,
      })),
      nonFinancialAssetAliases: context.nonFinancialAssets.map(
        ({ key, label }) => ({ key, label }),
      ),
      liabilityAliases: context.liabilities.map(({ key, label }) => ({
        key,
        label,
      })),
    },
    connection: {
      status: "connected",
      checkedAt: safeDateLike(baseline.connection.checkedAt, safeGeneratedAt),
      message: "Lunch Money connection verified.",
    },
    dataThrough,
    transactionWindow: {
      startDate: safeDateLike(baseline.transactionWindow.startDate, dataThrough),
      endDate: safeDateLike(baseline.transactionWindow.endDate, dataThrough),
      trailingMonths: finiteNumber(
        baseline.transactionWindow.trailingMonths,
        "transaction trailing months",
      ),
      transactionCount: finiteNumber(
        baseline.transactionWindow.transactionCount,
        "transaction window count",
      ),
    },
    recordsAnalyzed: {
      accounts: finiteNumber(baseline.recordsAnalyzed.accounts, "analyzed account count"),
      categories: finiteNumber(baseline.recordsAnalyzed.categories, "analyzed category count"),
      recurringItems: finiteNumber(
        baseline.recordsAnalyzed.recurringItems,
        "analyzed recurring count",
      ),
      transactions: finiteNumber(
        baseline.recordsAnalyzed.transactions,
        "analyzed transaction count",
      ),
    },
    resolvedBaseline: safeResolvedBaseline,
    activeInputs: safeProjection.inputs,
    calculationBasis: {
      employmentIncome: "net_deposited_cash_no_additional_tax",
      simplifiedTax: "gross_retirement_income_and_taxable_rrsp_rrif_withdrawals",
      contributions: "cash_funded_reduce_cash_income_withheld_do_not",
    },
    provenance: safeProvenance(
      baseline.provenance,
      context,
      safeResolvedBaseline.events,
      dataThrough,
    ),
    derivedBaseline: safeDerivedBaseline(baseline.derived, context, dataThrough),
    debtPaymentAudit: safeDebtPaymentAudit(baseline, context),
    warnings: safeWarnings(baseline.warnings),
    unmappedAccounts: baseline.unmappedAccounts.map((account) => {
      const alias = requiredRecordAlias(
        account.id,
        context.unmappedAccountsByRawId,
        "unmapped account",
      );
      return {
        id: alias.key,
        source: allowedValue(account.source, ACCOUNT_SOURCES, "unmapped account source"),
        name: alias.label,
      };
    }),
    unmappedCategories: baseline.unmappedCategories.map((category) => {
      const alias = requiredRecordAlias(
        category.id,
        context.categoriesByRawId,
        "category",
      );
      return {
        id: alias.key,
        name: alias.label,
        transactionCount: finiteNumber(category.transactionCount, "unmapped category count"),
      };
    }),
    activeOverrides: safeOverrides(activeOverrides, context),
    policyPreview: buildSavingsPolicyPreview(safeProjection.inputs),
    projection: safeProjection,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function projectionSnapshotToCsv(
  snapshot: ProjectionSnapshot,
  mode: "real" | "nominal" = "real",
): string {
  if (
    snapshot.exportMetadata.transformation !==
      "typed_allowlist_and_automatic_anonymization" ||
    !snapshot.exportMetadata.automaticSanitizationApplied ||
    snapshot.exportMetadata.rawLunchMoneyIdentifiersIncluded ||
    snapshot.exportMetadata.sourceSystemRecordIdsIncluded ||
    snapshot.exportMetadata.descriptiveFinancialTextIncluded ||
    snapshot.exportMetadata.credentialsIncluded
  ) {
    throw new Error("CSV export requires an automatically anonymized projection snapshot");
  }
  const accountAliases = snapshot.exportMetadata.accountAliases;
  const reserveAccountIds = new Set(
    snapshot.projection.surplusAllocation.policy.reserveAccountIds,
  );
  const headers = [
    "period",
    "calendarYear",
    "age",
    "phase",
    "dollarMode",
    "employmentPhase",
    "employmentNetCash",
    "cppIncome",
    "oasIncome",
    "cpp_base_monthly_at_65_today",
    "cpp_claim_age",
    "cpp_claim_factor",
    "oas_full_monthly_at_65_today",
    "oas_claim_age",
    "oas_claim_factor",
    "oas_eligibility_fraction",
    "oas_age_75_increase_rate",
    "pensionIncome",
    "otherIncome",
    "totalIncome",
    "surplus_generated",
    "surplus_reserve_refill",
    "surplus_retained_as_cash",
    "surplus_redirected",
    "surplus_reserve_target",
    "surplus_reserve_target_today",
    "surplus_reserve_indexing_rate",
    "surplus_excess_mode",
    "surplus_reserve_refill_account",
    "surplus_destination_account",
    ...accountAliases.map(
      (account) => `surplus_reserve_member_${account.key}`,
    ),
    "cashWithdrawals",
    "tfsaWithdrawals",
    "rrspRrifWithdrawals",
    "nonRegisteredWithdrawals",
    "totalWithdrawals",
    "essentialSpending",
    "discretionarySpending",
    "oneTimeOutflows",
    "liability_cash_payment",
    "liability_interest",
    "liability_principal",
    "liability_lump_sum_principal",
    "tax",
    "oasRecoveryTax",
    "cashFundedContributions",
    "incomeWithheldContributions",
    "plannedContributions",
    "allowedContributions",
    "surplusFundedContributions",
    "actualContributions",
    "redirectedContributions",
    "unallocatedContributions",
    "savings_policy_mode",
    "savings_unplanned_cash_policy",
    "operating_cash_target_today",
    "operating_cash_indexing_rate",
    "operating_cash_is_reserve_member",
    "positive_cash_available",
    "personal_plan_planned",
    "personal_plan_allowed",
    "personal_plan_unallocated",
    "reserve_plan_planned",
    "reserve_plan_funded",
    "reserve_cash_retained",
    "reserve_plan_redirected",
    "reserve_plan_unfunded",
    "workplace_plan_planned",
    "workplace_plan_allowed",
    "workplace_plan_unallocated",
    "operating_cash_target",
    "operating_cash_balance",
    "combined_reserve_target",
    "combined_reserve_balance",
    "target_funding_cash_retained",
    "unplanned_cash_retained",
    "unplanned_cash_swept",
    "operating_target_unfunded",
    "reserve_target_unfunded",
    "total_investment_deposits",
    "savings_operating_cash_account",
    "savings_taxable_account",
    "savings_taxable_origin",
    "tfsa_room_opening",
    "tfsa_room_new",
    "tfsa_room_withdrawal_restored",
    "tfsa_contribution_planned",
    "tfsa_contribution_allowed",
    "tfsa_contribution_redirected_in",
    "tfsa_contribution_redirected_out",
    "tfsa_surplus_contribution",
    "tfsa_contribution_unallocated",
    "tfsa_room_closing",
    "rrsp_room_opening",
    "rrsp_previous_year_eligible_earned_income",
    "rrsp_earned_income_rate",
    "rrsp_annual_cap",
    "rrsp_pension_adjustment",
    "rrsp_other_room_reduction",
    "rrsp_room_gross_generated",
    "rrsp_room_new",
    "rrsp_contribution_planned",
    "rrsp_contribution_allowed",
    "rrsp_contribution_redirected_in",
    "rrsp_contribution_redirected_out",
    "rrsp_surplus_contribution",
    "rrsp_contribution_unallocated",
    "rrsp_room_closing",
    "registered_room_basis",
    "unmetSpending",
    "unmetRequiredOutflow",
    "totalOutflows",
    "cashBalance",
    "tfsaBalance",
    "rrspRrifBalance",
    "nonRegisteredBalance",
    "financial_assets",
    "retirement_funding_assets",
    "residence_value",
    "other_non_financial_assets",
    "non_financial_assets",
    "total_assets",
    "mortgage_balance",
    "other_liabilities",
    "total_liabilities",
    "home_equity",
    "total_net_worth",
    ...accountAliases.map((account) => `account_${account.key}`),
    ...accountAliases.map(
      (account) => `surplus_allocation_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `unplanned_sweep_allocation_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `planned_contribution_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `actual_contribution_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `redirected_in_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `redirected_out_${account.key}`,
    ),
    ...accountAliases.map(
      (account) => `surplus_contribution_${account.key}`,
    ),
    "milestone_retirement",
    "milestone_cpp",
    "milestone_oas",
    "milestone_rrif_conversion",
  ];

  const rows = snapshot.projection.annual.map((point) => {
    const view = point[mode];
    return [
      annualPeriodLabel(snapshot.projection.inputs, point.calendarYear),
      point.calendarYear,
      point.age,
      point.phase,
      mode,
      point.employmentPhaseLabels.length === 1
        ? point.employmentPhaseLabels[0]!
        : point.employmentPhaseLabels.length === 0
          ? ""
          : "multiple_employment_phases",
      view.income.employment,
      view.income.cpp,
      view.income.oas,
      snapshot.projection.governmentBenefits.cpp.baseMonthlyAmountAt65Today,
      snapshot.projection.governmentBenefits.cpp.claimAge,
      snapshot.projection.governmentBenefits.cpp.claimFactor,
      snapshot.projection.governmentBenefits.oas
        .fullBaseMonthlyAmountAt65Today,
      snapshot.projection.governmentBenefits.oas.claimAge,
      snapshot.projection.governmentBenefits.oas.claimFactor,
      snapshot.projection.governmentBenefits.oas.eligibilityFraction,
      snapshot.projection.governmentBenefits.oas.age75IncreaseRate,
      view.income.pension,
      view.income.other,
      view.income.total,
      view.surplusAllocation.generated,
      view.surplusAllocation.reserveRefill,
      view.surplusAllocation.retainedAsCash,
      view.surplusAllocation.redirected,
      view.surplusAllocation.reserveTarget,
      snapshot.projection.surplusAllocation.policy
        .targetCashReserveToday,
      snapshot.projection.surplusAllocation.policy.reserveIndexingRate,
      snapshot.projection.surplusAllocation.policy.excessMode,
      snapshot.projection.surplusAllocation.policy.reserveRefillAccountId,
      snapshot.projection.surplusAllocation.policy.destinationAccountId ?? "",
      ...accountAliases.map((account) =>
        reserveAccountIds.has(account.key) ? 1 : 0,
      ),
      view.withdrawals.cash,
      view.withdrawals.tfsa,
      view.withdrawals.rrspRrif,
      view.withdrawals.nonRegistered,
      view.withdrawals.total,
      view.outflows.essential,
      view.outflows.discretionary,
      view.outflows.oneTime,
      view.outflows.liabilityCashPayment,
      view.outflows.liabilityInterest,
      view.outflows.liabilityPrincipal,
      view.outflows.liabilityLumpSumPrincipal,
      view.outflows.tax,
      view.outflows.oasRecoveryTax,
      view.outflows.contributions,
      view.contributions.incomeWithheld,
      view.contributions.planned,
      view.contributions.allowed,
      view.contributions.surplusFunded,
      view.contributions.total,
      view.contributions.redirected,
      view.contributions.unallocated,
      snapshot.projection.savingsPolicy.mode,
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy.unplannedCash
        : "",
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy.operatingCashTarget
            ?.targetToday ?? ""
        : "",
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy.operatingCashTarget
            ?.indexingRate ?? ""
        : "",
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy
            .operatingCashIsReserveMember
          ? 1
          : 0
        : "",
      view.savingsPolicy.positiveCashAvailable,
      view.savingsPolicy.personalPlanned,
      view.savingsPolicy.personalAllowed,
      view.savingsPolicy.personalUnallocated,
      view.savingsPolicy.reservePlanned,
      view.savingsPolicy.reserveFunded,
      view.savingsPolicy.reserveRetainedAsCash,
      view.savingsPolicy.reserveRedirected,
      view.savingsPolicy.reserveUnfunded,
      view.savingsPolicy.workplacePlanned,
      view.savingsPolicy.workplaceAllowed,
      view.savingsPolicy.workplaceUnallocated,
      view.savingsPolicy.operatingCashTarget,
      view.savingsPolicy.operatingCashBalance,
      view.savingsPolicy.combinedReserveTarget,
      view.savingsPolicy.combinedReserveBalance,
      view.savingsPolicy.targetFundingRetained,
      view.savingsPolicy.unplannedCashRetained,
      view.savingsPolicy.unplannedCashSwept,
      view.savingsPolicy.operatingTargetUnfunded,
      view.savingsPolicy.reserveTargetUnfunded,
      view.savingsPolicy.totalInvestmentDeposits,
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy
            .operatingCashAccountId
        : "",
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy.taxableAccountId
        : "",
      snapshot.projection.savingsPolicy.policy.mode === "simple"
        ? snapshot.projection.savingsPolicy.policy
            .taxableAccountOrigin
        : "",
      view.registeredAccountRoom.tfsa.openingRoom,
      view.registeredAccountRoom.tfsa.annualNewRoom,
      view.registeredAccountRoom.tfsa.withdrawalRoomRestored,
      view.registeredAccountRoom.tfsa.plannedContributions,
      view.registeredAccountRoom.tfsa.allowedContributions,
      view.registeredAccountRoom.tfsa.redirectedIn,
      view.registeredAccountRoom.tfsa.redirectedOut,
      view.registeredAccountRoom.tfsa.surplusFundedContributions,
      view.registeredAccountRoom.tfsa.unallocatedContributions,
      view.registeredAccountRoom.tfsa.closingRoom,
      view.registeredAccountRoom.rrsp.openingRoom,
      view.registeredAccountRoom.rrsp.previousYearEligibleEarnedIncome,
      view.registeredAccountRoom.rrsp.earnedIncomeRate,
      view.registeredAccountRoom.rrsp.annualCap,
      view.registeredAccountRoom.rrsp.pensionAdjustment,
      view.registeredAccountRoom.rrsp.otherRoomReduction,
      view.registeredAccountRoom.rrsp.grossGeneratedRoom,
      view.registeredAccountRoom.rrsp.annualNewRoom,
      view.registeredAccountRoom.rrsp.plannedContributions,
      view.registeredAccountRoom.rrsp.allowedContributions,
      view.registeredAccountRoom.rrsp.redirectedIn,
      view.registeredAccountRoom.rrsp.redirectedOut,
      view.registeredAccountRoom.rrsp.surplusFundedContributions,
      view.registeredAccountRoom.rrsp.unallocatedContributions,
      view.registeredAccountRoom.rrsp.closingRoom,
      snapshot.projection.registeredAccountRoom.denomination,
      view.outflows.unmetSpending,
      view.outflows.unmetRequiredOutflow,
      view.outflows.total,
      view.balances.cash,
      view.balances.tfsa,
      view.balances.rrspRrif,
      view.balances.nonRegistered,
      view.balances.financialAssets,
      view.balances.retirementFundingAssets,
      view.balances.residenceValue,
      view.balances.otherNonFinancialAssets,
      view.balances.totalNonFinancialAssets,
      view.balances.totalAssets,
      view.balances.mortgageBalance,
      view.balances.otherLiabilities,
      view.balances.totalLiabilities,
      view.balances.homeEquity,
      view.balances.totalNetWorth,
      ...accountAliases.map((account) => view.accountBalances[account.key] ?? 0),
      ...accountAliases.map(
        (account) => view.accountSurplusAllocations[account.key] ?? 0,
      ),
      ...accountAliases.map(
        (account) => view.accountSweepAllocations[account.key] ?? 0,
      ),
      ...accountAliases.map(
        (account) =>
          view.accountContributionDetails[account.key]
            ?.plannedFromAccount ?? 0,
      ),
      ...accountAliases.map(
        (account) =>
          view.accountContributionDetails[account.key]
            ?.depositedIntoAccount ?? 0,
      ),
      ...accountAliases.map(
        (account) =>
          view.accountContributionDetails[account.key]?.redirectedIn ?? 0,
      ),
      ...accountAliases.map(
        (account) =>
          view.accountContributionDetails[account.key]?.redirectedOut ?? 0,
      ),
      ...accountAliases.map(
        (account) =>
          view.accountContributionDetails[account.key]
            ?.surplusFundedDeposit ?? 0,
      ),
      point.milestones.includes("Retirement") ? 1 : 0,
      point.milestones.includes("CPP begins") ? 1 : 0,
      point.milestones.includes("OAS begins") ? 1 : 0,
      point.milestones.includes("RRIF conversion age") ? 1 : 0,
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
