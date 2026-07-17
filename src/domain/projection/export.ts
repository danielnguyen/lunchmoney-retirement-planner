import type {
  BaselineExportContext,
  BaselineWarning,
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

export type ShareSafeProvenanceValue = {
  fieldReference: string;
  value: unknown;
  sourceType: BaselineSourceType;
  sourceDescription: string;
  effectiveDate: string;
  referenceKind?: CanadianReferenceKind;
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
  schemaVersion: "4.0";
  generatedAt: string;
  exportMetadata: {
    transformation: "typed_allowlist";
    rawLunchMoneyIdentifiersIncluded: false;
    sourceSystemRecordIdsIncluded: false;
    descriptiveFinancialTextIncluded: true;
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
  eventsByRawId: Map<string, RecordAlias>;
  recurringByRawId: Map<string, RecordAlias>;
  unmappedAccountsByRawId: Map<string, RecordAlias>;
  categoriesByRawId: Map<string, RecordAlias>;
  warningIdentifiers: Map<string, string>;
  sourceIdentifiers: string[];
};

type ProvenanceField = {
  reference: string;
  account?: AccountAlias;
  accountField?: string;
};

const ACCOUNT_ALIAS_BASE: Record<AccountType, string> = {
  cash: "cash",
  tfsa: "tfsa",
  rrsp_rrif: "rrsp",
  non_registered: "non_registered",
  debt: "debt",
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
  "person.cpp.indexingRate",
  "person.oas.startAge",
  "person.oas.monthlyAmountAt65Today",
  "person.oas.indexingRate",
  "person.rrifConversionAge",
  "tax.effectiveTaxRate",
  "tax.oasRecoveryThresholdToday",
  "tax.oasRecoveryRate",
  "transactionTrailingMonths",
  "startDate",
  "events",
]);

const SIMPLE_OVERRIDE_KEYS = new Set([
  "retirementAge",
  "cppStartAge",
  "oasStartAge",
  "monthlyEssentialSpendingToday",
  "monthlyDiscretionarySpendingToday",
  "annualInflation",
  "endAge",
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
const BASELINE_WARNING_CODES = new Set([
  "transactions_skipped",
  "no_transactions",
  "unused_account_mapping",
  "contribution_target_required",
  "suggested_recurring_ignored",
  "negative_derived_total",
  "cash_account_required",
  "invalid_manual_contribution",
  "withdrawal_priority_required",
  "negative_asset_balance",
  "long_live_baseline_income",
]);

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

function createShareSafeContext(
  projection: ProjectionResult,
  baseline: BaselineExportContext,
): ShareSafeContext {
  const descriptors = new Map<string, { id: string; type: AccountType; label: string }>();
  for (const account of [...baseline.projectionInputs.accounts, ...projection.inputs.accounts]) {
    descriptors.set(account.id, { id: account.id, type: account.type, label: account.label });
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
  const accounts = [...descriptors.values()]
    .sort(
      (left, right) =>
        ACCOUNT_TYPE_ORDER.indexOf(left.type) - ACCOUNT_TYPE_ORDER.indexOf(right.type) ||
        left.id.localeCompare(right.id),
    )
    .map((account): AccountAlias => {
      const sequence = (counters[account.type] += 1);
      const base = ACCOUNT_ALIAS_BASE[account.type];
      return {
        rawId: account.id,
        key: `${base}_${sequence}`,
        label: account.label,
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

  const unmappedAccountsByRawId = new Map<string, RecordAlias>();
  [...baseline.unmappedAccounts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((account, index) => {
      const alias = {
        key: `unmapped_account_${index + 1}`,
        label: account.name,
      };
      unmappedAccountsByRawId.set(account.id, alias);
      if (account.lunchMoneyId !== null && !accountByNumericId.has(String(account.lunchMoneyId))) {
        accountByNumericId.set(String(account.lunchMoneyId), alias);
      }
    });

  const eventDescriptions = new Map<string, string>();
  for (const event of [...baseline.projectionInputs.events, ...projection.inputs.events]) {
    eventDescriptions.set(event.id, event.label);
  }
  const eventsByRawId = new Map<string, RecordAlias>();
  [...eventDescriptions]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([id, label], index) => {
      eventsByRawId.set(id, {
        key: `event_${index + 1}`,
        label,
      });
    });

  const recurringDescriptions = new Map(
    baseline.derived.recurringExpenses.items.map((item) => [String(item.id), item.description]),
  );
  const recurringByRawId = new Map<string, RecordAlias>();
  [...recurringDescriptions]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([id, label], index) => {
      recurringByRawId.set(id, {
        key: `recurring_expense_${index + 1}`,
        label,
      });
    });

  const categoryDescriptions = new Map<string, string>();
  for (const category of baseline.unmappedCategories) {
    categoryDescriptions.set(category.id, category.name);
  }
  for (const item of baseline.derived.recurringExpenses.items) {
    if (!categoryDescriptions.has(item.categoryId)) {
      categoryDescriptions.set(item.categoryId, "Mapped category");
    }
  }
  const categoriesByRawId = new Map<string, RecordAlias>();
  [...categoryDescriptions]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([id, label], index) => {
      categoriesByRawId.set(id, {
        key: `category_${index + 1}`,
        label,
      });
    });

  const knownWarningIdentifier = (identifier: string): boolean =>
    accountByRawId.has(identifier) ||
    accountByNumericId.has(identifier) ||
    unmappedAccountsByRawId.has(identifier) ||
    categoriesByRawId.has(identifier);
  const warningIdentifiers = new Map<string, string>();
  [...new Set(
    baseline.warnings
      .map((warning) => warning.identifier)
      .filter((identifier): identifier is string => Boolean(identifier)),
  )]
    .filter((identifier) => !knownWarningIdentifier(identifier))
    .sort((left, right) => left.localeCompare(right))
    .forEach((identifier, index) => {
      warningIdentifiers.set(identifier, `warning_identifier_${index + 1}`);
    });

  const sourceIdentifiers = [...new Set([
    ...accounts.map((account) => account.rawId),
    ...accountByNumericId.keys(),
    ...eventsByRawId.keys(),
    ...recurringByRawId.keys(),
    ...unmappedAccountsByRawId.keys(),
    ...categoriesByRawId.keys(),
    ...warningIdentifiers.keys(),
  ])]
    .filter((identifier) => identifier !== "cash" && identifier !== "uncategorized")
    .sort((left, right) => right.length - left.length || left.localeCompare(right));

  return {
    accounts,
    accountByRawId,
    accountByNumericId,
    eventsByRawId,
    recurringByRawId,
    unmappedAccountsByRawId,
    categoriesByRawId,
    warningIdentifiers,
    sourceIdentifiers,
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDescriptiveText(value: string, context: ShareSafeContext): string {
  let result = value;
  for (const identifier of context.sourceIdentifiers) {
    if (!identifier) continue;
    result = /^\d+$/.test(identifier)
      ? result.replace(
          new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(identifier)}(?![A-Za-z0-9])`, "g"),
          "[source ID removed]",
        )
      : result.replaceAll(identifier, "[source ID removed]");
  }

  result = result
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [credential removed]")
    .replace(
      /\b(authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^,;\n]+)/gi,
      "$1$2[credential removed]",
    )
    .replace(
      /\b(api[-_ ]?key|token|password|credential|secret)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1$2[credential removed]",
    );
  const configuredToken = process.env.LUNCHMONEY_API_TOKEN;
  if (configuredToken) result = result.replaceAll(configuredToken, "[credential removed]");
  return result;
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
    label: safeDescriptiveText(alias.label, context),
    type: account.type,
    openingBalance: account.openingBalance,
    annualReturn: account.annualReturn,
    contributionPhases: account.contributionPhases.map((phase) => ({
      id: safeDescriptiveText(phase.id, context),
      label: safeDescriptiveText(phase.label, context),
      startAge: phase.startAge,
      endAge: phase.endAge,
      monthlyAmountToday: phase.monthlyAmountToday,
      funding: phase.funding,
      indexingRate: phase.indexingRate,
    })),
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
    label: safeDescriptiveText(alias.label, context),
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
      employmentIncomePhases: inputs.person.employmentIncomePhases.map((phase) => ({
        id: safeDescriptiveText(phase.id, context),
        label: safeDescriptiveText(phase.label, context),
        startAge: phase.startAge,
        endAge: phase.endAge,
        annualNetCashToday: phase.annualNetCashToday,
        annualGrowth: phase.annualGrowth,
      })),
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
        monthlyAmountAt65Today: inputs.person.oas.monthlyAmountAt65Today,
        indexingRate: inputs.person.oas.indexingRate,
      },
      rrifConversionAge: inputs.person.rrifConversionAge,
    },
    accounts: inputs.accounts.map((account) => safeAccountInput(account, context)),
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
    allocation: safeAllocation(view.allocation),
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
    schemaVersion: "4.0",
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
      nominal: safeProjectionView(projection.retirementSnapshot.nominal, context),
      real: safeProjectionView(projection.retirementSnapshot.real, context),
    },
    financialAssetsBridge: {
      nominal: safeFinancialAssetsBridge(projection.financialAssetsBridge.nominal),
      real: safeFinancialAssetsBridge(projection.financialAssetsBridge.real),
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
        safeDescriptiveText(label, context),
      ),
      contributionPhaseLabels: Object.fromEntries(
        Object.entries(point.contributionPhaseLabels).map(([rawAccountId, labels]) => [
          requiredAccountAlias(rawAccountId, context).key,
          labels.map((label) => safeDescriptiveText(label, context)),
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
        name: safeDescriptiveText(alias.label, context),
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
          description: safeDescriptiveText(alias.label, context),
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

function safeWarningIdentifier(
  identifier: string,
  context: ShareSafeContext,
): string {
  return context.accountByRawId.get(identifier)?.key ??
    context.accountByNumericId.get(identifier)?.key ??
    context.unmappedAccountsByRawId.get(identifier)?.key ??
    context.categoriesByRawId.get(identifier)?.key ??
    context.warningIdentifiers.get(identifier) ??
    "warning_identifier";
}

function safeWarnings(
  warnings: BaselineWarning[],
  context: ShareSafeContext,
): ProjectionSnapshot["warnings"] {
  return warnings.map((warning, index) => {
    return {
      code: BASELINE_WARNING_CODES.has(warning.code) ? warning.code : `warning_code_${index + 1}`,
      severity: allowedValue(warning.severity, WARNING_SEVERITIES, "warning severity"),
      ...(warning.identifier
        ? { identifier: safeWarningIdentifier(warning.identifier, context) }
        : {}),
      name: safeDescriptiveText(warning.name ?? `Warning ${index + 1}`, context),
      message: safeDescriptiveText(warning.message, context),
    };
  });
}

function provenanceField(
  rawField: string,
  context: ShareSafeContext,
): ProvenanceField | undefined {
  if (SAFE_PROVENANCE_FIELDS.has(rawField)) return { reference: rawField };
  const employmentPrefix = "person.employmentIncomePhases.";
  if (rawField.startsWith(employmentPrefix)) {
    const field = rawField.slice(employmentPrefix.length);
    const finalField = field.slice(field.lastIndexOf(".") + 1);
    if (EMPLOYMENT_PHASE_PROVENANCE_FIELDS.has(finalField)) {
      return { reference: safeDescriptiveText(rawField, context) };
    }
  }
  for (const account of context.accounts) {
    const prefix = `accounts.${account.rawId}.`;
    if (!rawField.startsWith(prefix)) continue;
    const accountField = rawField.slice(prefix.length);
    const contributionPhaseField = accountField.startsWith("contributionPhases.")
      ? accountField.slice(accountField.lastIndexOf(".") + 1)
      : undefined;
    if (
      !ACCOUNT_PROVENANCE_FIELDS.has(accountField) &&
      (!contributionPhaseField ||
        !CONTRIBUTION_PHASE_PROVENANCE_FIELDS.has(contributionPhaseField))
    ) {
      return undefined;
    }
    return {
      reference: `accounts.${account.key}.${safeDescriptiveText(accountField, context)}`,
      account,
      accountField,
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

function safeProvenanceValue(
  value: unknown,
  field: ProvenanceField,
  safeEvents: ProjectionEventInput[],
  context: ShareSafeContext,
): unknown {
  if (field.reference === "events") return safeEvents;
  if (field.accountField === "label" && field.account) {
    return safeDescriptiveText(field.account.label, context);
  }
  if (typeof value === "number") return finiteNumber(value, `provenance ${field.reference}`);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "string") return safeDescriptiveText(value, context);
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

function safeProvenance(
  provenance: BaselineExportContext["provenance"],
  context: ShareSafeContext,
  safeEvents: ProjectionEventInput[],
  dataThrough: string,
): ProjectionSnapshot["provenance"] {
  const result: ProjectionSnapshot["provenance"] = {};
  let unknownIndex = 0;
  for (const [rawField, source] of Object.entries(provenance).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const field = provenanceField(rawField, context) ?? {
      reference: `field_${(unknownIndex += 1)}`,
    };
    const sourceType = safeSourceType(source.sourceType);
    const referenceKind = safeReferenceKind(source.referenceKind);
    result[field.reference] = {
      fieldReference: field.reference,
      value: safeProvenanceValue(source.value, field, safeEvents, context),
      sourceType,
      sourceDescription: safeDescriptiveText(source.sourceDescription, context),
      effectiveDate: safeDateLike(source.effectiveDate, dataThrough),
      ...(referenceKind ? { referenceKind } : {}),
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
    const field = rawKey.slice(rawKey.lastIndexOf(".") + 1);
    return field === "annualNetCashToday" || field === "annualGrowth"
      ? safeDescriptiveText(rawKey, context)
      : undefined;
  }
  if (rawKey.startsWith("contributionPhase.")) {
    for (const account of context.accounts) {
      const prefix = `contributionPhase.${account.rawId}.`;
      if (!rawKey.startsWith(prefix)) continue;
      const remainder = rawKey.slice(prefix.length);
      const field = remainder.slice(remainder.lastIndexOf(".") + 1);
      return field === "monthlyAmountToday" || field === "indexingRate"
        ? `contributionPhase.${account.key}.${safeDescriptiveText(remainder, context)}`
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
    schemaVersion: "4.0",
    generatedAt: safeGeneratedAt,
    exportMetadata: {
      transformation: "typed_allowlist",
      rawLunchMoneyIdentifiersIncluded: false,
      sourceSystemRecordIdsIncluded: false,
      descriptiveFinancialTextIncluded: true,
      credentialsIncluded: false,
      accountAliases: context.accounts.map(({ key, label, plannerType }) => ({
        key,
        label: safeDescriptiveText(label, context),
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
    warnings: safeWarnings(baseline.warnings, context),
    unmappedAccounts: baseline.unmappedAccounts.map((account) => {
      const alias = requiredRecordAlias(
        account.id,
        context.unmappedAccountsByRawId,
        "unmapped account",
      );
      return {
        id: alias.key,
        source: allowedValue(account.source, ACCOUNT_SOURCES, "unmapped account source"),
        name: safeDescriptiveText(alias.label, context),
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
        name: safeDescriptiveText(alias.label, context),
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
    snapshot.exportMetadata.transformation !== "typed_allowlist" ||
    snapshot.exportMetadata.rawLunchMoneyIdentifiersIncluded ||
    snapshot.exportMetadata.sourceSystemRecordIdsIncluded ||
    snapshot.exportMetadata.credentialsIncluded
  ) {
    throw new Error("CSV export requires an identifier-scrubbed projection snapshot");
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
    "pensionIncome",
    "otherIncome",
    "totalIncome",
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
      view.income.pension,
      view.income.other,
      view.income.total,
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
      point.milestones.join("; "),
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
