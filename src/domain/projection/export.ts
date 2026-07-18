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
import { annualPeriodLabel } from "./presentation";
import {
  validateProjectionInputs,
  type AccountType,
  type AssetAllocation,
  type ContributionFunding,
  type FinancialAccountInput,
  type FinancialAssetsBridge,
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

export type ShareSafeProvenanceData =
  | string
  | number
  | boolean
  | null
  | AssetAllocation
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
    plannerType: AccountType;
    balance: number;
    balanceAsOf: string;
    monthlyContribution: number;
    contributionSource: "lunchmoney_derived" | "local_configuration";
    contributionFunding: ContributionFunding | undefined;
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
};

export type ProjectionSnapshot = {
  schemaVersion: "6.0";
  generatedAt: string;
  exportMetadata: {
    transformation: "typed_allowlist_and_automatic_anonymization";
    automaticSanitizationApplied: true;
    rawLunchMoneyIdentifiersIncluded: false;
    sourceSystemRecordIdsIncluded: false;
    descriptiveFinancialTextIncluded: false;
    credentialsIncluded: false;
    accountAliases: ShareSafeAccountAlias[];
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
  projection: ProjectionResult;
};

type AccountAlias = ShareSafeAccountAlias & {
  rawId: string;
};

type RecordAlias = {
  key: string;
  label: string;
};

type ShareSafeContext = {
  accounts: AccountAlias[];
  accountByRawId: Map<string, AccountAlias>;
  accountByNumericId: Map<string, RecordAlias>;
  employmentPhaseByRawId: Map<string, RecordAlias>;
  employmentPhaseByRawLabel: Map<string, RecordAlias>;
  contributionPhaseByAccountAndRawId: Map<string, RecordAlias>;
  contributionPhaseByAccountAndRawLabel: Map<string, RecordAlias>;
  eventsByRawId: Map<string, RecordAlias>;
  recurringByRawId: Map<string, RecordAlias>;
  unmappedAccountsByRawId: Map<string, RecordAlias>;
  categoriesByRawId: Map<string, RecordAlias>;
};

type ProvenanceField = {
  reference: string;
  account?: AccountAlias;
  accountReference?: AccountAlias;
  accountField?: string;
  employmentPhase?: RecordAlias;
  contributionPhase?: RecordAlias;
  finalField?: string;
};

const ACCOUNT_ALIAS_BASE: Record<AccountType, string> = {
  cash: "cash",
  tfsa: "tfsa",
  rrsp_rrif: "rrsp",
  non_registered: "non_registered",
  debt: "debt",
};

const ACCOUNT_ALIAS_LABEL: Record<AccountType, string> = {
  cash: "Cash account",
  tfsa: "TFSA account",
  rrsp_rrif: "RRSP/RRIF account",
  non_registered: "Non-registered account",
  debt: "Debt account",
};

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "cash",
  "tfsa",
  "rrsp_rrif",
  "non_registered",
  "debt",
];

const ACCOUNT_PROVENANCE_FIELDS = new Set([
  "openingBalance",
  "annualReturn",
  "label",
  "origin",
  "type",
  "allocation",
  "withdrawalPriority",
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
};

const REFERENCE_KINDS = new Set<CanadianReferenceKind>([
  "population_median",
  "population_average",
  "statutory_program_default",
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
    if (!descriptors.has(account.id)) {
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
  const accountByNumericId = new Map<string, RecordAlias>();
  for (const account of baseline.derived.accountBalances) {
    const alias = accountByRawId.get(account.id);
    if (alias && account.lunchMoneyId !== null) {
      accountByNumericId.set(String(account.lunchMoneyId), alias);
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
    accountByNumericId,
    employmentPhaseByRawId,
    employmentPhaseByRawLabel,
    contributionPhaseByAccountAndRawId,
    contributionPhaseByAccountAndRawLabel,
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
    surplusAllocation: {
      reserveAccountId: requiredAccountAlias(
        inputs.surplusAllocation.reserveAccountId,
        context,
      ).key,
      targetCashReserveToday:
        inputs.surplusAllocation.targetCashReserveToday,
      reserveIndexingRate: inputs.surplusAllocation.reserveIndexingRate,
      excess:
        inputs.surplusAllocation.excess.mode === "retain_as_cash"
          ? { mode: "retain_as_cash" }
          : {
              mode: "allocate_to_account",
              destinationAccountId: requiredAccountAlias(
                inputs.surplusAllocation.excess.destinationAccountId,
                context,
              ).key,
            },
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
      unmetSpending: view.outflows.unmetSpending,
      total: view.outflows.total,
    },
    contributions: {
      cashFunded: view.contributions.cashFunded,
      incomeWithheld: view.contributions.incomeWithheld,
      total: view.contributions.total,
    },
    balances: {
      cash: view.balances.cash,
      tfsa: view.balances.tfsa,
      rrspRrif: view.balances.rrspRrif,
      nonRegistered: view.balances.nonRegistered,
      debts: view.balances.debts,
      financialAssets: view.balances.financialAssets,
      netWorth: view.balances.netWorth,
    },
    accountBalances,
    accountContributions,
    surplusAllocation: {
      generated: view.surplusAllocation.generated,
      reserveRefill: view.surplusAllocation.reserveRefill,
      retainedAsCash: view.surplusAllocation.retainedAsCash,
      redirected: view.surplusAllocation.redirected,
      reserveTarget: view.surplusAllocation.reserveTarget,
    },
    accountSurplusAllocations,
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
    oneTimeOutflows: bridge.oneTimeOutflows,
    taxes: bridge.taxes,
    endingFinancialAssets: bridge.endingFinancialAssets,
  };
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
    schemaVersion: "6.0",
    inputs: safeProjectionInputs(projection.inputs, context),
    summary: {
      retirementYear: projection.summary.retirementYear,
      retirementDate: projection.summary.retirementDate,
      financialAssetsAtRetirementToday: projection.summary.financialAssetsAtRetirementToday,
      retirementGoalToday: projection.summary.retirementGoalToday,
      goalGapToday: projection.summary.goalGapToday,
      financialAssetsDepletionAge: projection.summary.financialAssetsDepletionAge,
      endingFinancialAssetsToday: projection.summary.endingFinancialAssetsToday,
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
        reserveAccountId: requiredAccountAlias(
          projection.surplusAllocation.policy.reserveAccountId,
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
      reserveAccountBalanceAtRetirement: {
        ...projection.surplusAllocation.reserveAccountBalanceAtRetirement,
      },
      destinationAccountBalanceAtRetirement:
        projection.surplusAllocation.destinationAccountBalanceAtRetirement
          ? {
              ...projection.surplusAllocation
                .destinationAccountBalanceAtRetirement,
            }
          : null,
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
      const alias = requiredAccountAlias(account.id, context);
      return {
        id: alias.key,
        source: allowedValue(account.source, ACCOUNT_SOURCES, "account source"),
        name: alias.label,
        plannerType: allowedValue(account.plannerType, ACCOUNT_TYPE_ORDER, "planner account type"),
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
    rawField === "surplusAllocation.reserveAccountId" ||
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
  if (SAFE_PROVENANCE_FIELDS.has(rawField)) {
    return {
      reference: rawField,
      finalField: rawField.slice(rawField.lastIndexOf(".") + 1),
    };
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
  if (typeof value === "number") return finiteNumber(value, `provenance ${field.reference}`);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "string") {
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
      ["retain_as_cash", "allocate_to_account"].includes(value)
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
  if (rawKey.startsWith("employmentPhase.")) {
    const remainder = rawKey.slice("employmentPhase.".length);
    const separator = remainder.lastIndexOf(".");
    if (separator < 0) return undefined;
    const rawPhaseId = remainder.slice(0, separator);
    const field = remainder.slice(separator + 1);
    const phase = context.employmentPhaseByRawId.get(rawPhaseId);
    return phase && (field === "annualNetCashToday" || field === "annualGrowth")
      ? `employmentPhase.${phase.key}.${field}`
      : undefined;
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
  record(baseline.transactionWindow, "baseline.transactionWindow");
  record(baseline.recordsAnalyzed, "baseline.recordsAnalyzed");
  return {
    inputs: validateProjectionInputs(payload.inputs),
    baseline: {
      connection: record(baseline.connection, "baseline.connection") as BaselineExportContext["connection"],
      projectionInputs: validateProjectionInputs(baseline.projectionInputs),
      provenance: baseline.provenance as BaselineExportContext["provenance"],
      derived: baseline.derived as DerivedBaseline,
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
    schemaVersion: "6.0",
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
    "surplus_reserve_account",
    "surplus_destination_account",
    "cashWithdrawals",
    "tfsaWithdrawals",
    "rrspRrifWithdrawals",
    "nonRegisteredWithdrawals",
    "totalWithdrawals",
    "essentialSpending",
    "discretionarySpending",
    "oneTimeOutflows",
    "tax",
    "oasRecoveryTax",
    "cashFundedContributions",
    "incomeWithheldContributions",
    "unmetSpending",
    "totalOutflows",
    "cashBalance",
    "tfsaBalance",
    "rrspRrifBalance",
    "nonRegisteredBalance",
    "debts",
    "financialAssets",
    "netWorth",
    ...accountAliases.map((account) => `account_${account.key}`),
    ...accountAliases.map(
      (account) => `surplus_allocation_${account.key}`,
    ),
    "milestones",
  ];

  const rows = snapshot.projection.annual.map((point) => {
    const view = point[mode];
    return [
      annualPeriodLabel(snapshot.projection.inputs, point.calendarYear),
      point.calendarYear,
      point.age,
      point.phase,
      mode,
      point.employmentPhaseLabels.join(" → "),
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
      snapshot.projection.surplusAllocation.policy.reserveAccountId,
      snapshot.projection.surplusAllocation.policy.destinationAccountId ?? "",
      view.withdrawals.cash,
      view.withdrawals.tfsa,
      view.withdrawals.rrspRrif,
      view.withdrawals.nonRegistered,
      view.withdrawals.total,
      view.outflows.essential,
      view.outflows.discretionary,
      view.outflows.oneTime,
      view.outflows.tax,
      view.outflows.oasRecoveryTax,
      view.outflows.contributions,
      view.contributions.incomeWithheld,
      view.outflows.unmetSpending,
      view.outflows.total,
      view.balances.cash,
      view.balances.tfsa,
      view.balances.rrspRrif,
      view.balances.nonRegistered,
      view.balances.debts,
      view.balances.financialAssets,
      view.balances.netWorth,
      ...accountAliases.map((account) => view.accountBalances[account.key] ?? 0),
      ...accountAliases.map(
        (account) => view.accountSurplusAllocations[account.key] ?? 0,
      ),
      point.milestones.join("; "),
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
