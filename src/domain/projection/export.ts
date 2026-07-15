import type { BaselineValue } from "@/src/domain/defaults/types";
import type {
  BaselineExportContext,
  BaselineWarning,
  DerivedBaseline,
} from "@/src/domain/baseline/types";
import { annualPeriodLabel } from "./presentation";
import {
  validateProjectionInputs,
  type AccountType,
  type ProjectionInputs,
  type ProjectionResult,
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

export type ProjectionSnapshot = {
  schemaVersion: "3.0";
  generatedAt: string;
  exportMetadata: {
    shareSafe: true;
    anonymized: true;
    rawLunchMoneyIdentifiersIncluded: false;
    credentialsIncluded: false;
    accountAliases: ShareSafeAccountAlias[];
  };
  connection: BaselineExportContext["connection"];
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
  provenance: Record<string, BaselineValue<unknown>>;
  derivedBaseline: DerivedBaseline;
  warnings: BaselineWarning[];
  unmappedAccounts: BaselineExportContext["unmappedAccounts"];
  unmappedCategories: BaselineExportContext["unmappedCategories"];
  activeOverrides: Record<string, number>;
  projection: ProjectionResult;
};

type AccountAlias = ShareSafeAccountAlias & {
  rawId: string;
  rawLabel: string;
};

type TextReplacement = {
  raw: string;
  safe: string;
};

type AnonymizationContext = {
  accounts: AccountAlias[];
  accountByRawId: Map<string, AccountAlias>;
  unmappedAccountIds: Map<string, string>;
  eventIds: Map<string, string>;
  categoryIds: Map<string, string>;
  numericAccountIds: Map<string, string>;
  exactIdentifiers: Map<string, string>;
  textReplacements: TextReplacement[];
};

const ACCOUNT_ALIAS_BASE: Record<AccountType, { key: string; label: string }> = {
  cash: { key: "cash", label: "Cash" },
  tfsa: { key: "tfsa", label: "TFSA" },
  rrsp_rrif: { key: "rrsp", label: "RRSP" },
  non_registered: { key: "non_registered", label: "Non-registered" },
  debt: { key: "debt", label: "Debt" },
};

const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "cash",
  "tfsa",
  "rrsp_rrif",
  "non_registered",
  "debt",
];

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function redactSecrets(value: unknown): unknown {
  const configuredToken = process.env.LUNCHMONEY_API_TOKEN;
  if (typeof value === "string") {
    return configuredToken ? value.replaceAll(configuredToken, "[redacted]") : value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /(token|authorization|api[_-]?key|secret|password|credential)/i.test(key)
        ? "[redacted]"
        : redactSecrets(entry),
    ]),
  );
}

function addTextReplacement(
  replacements: TextReplacement[],
  raw: string | null | undefined,
  safe: string,
): void {
  if (!raw || raw === safe || replacements.some((replacement) => replacement.raw === raw)) return;
  replacements.push({ raw, safe });
}

function createAnonymizationContext(
  projection: ProjectionResult,
  baseline: BaselineExportContext,
): AnonymizationContext {
  const descriptors = new Map<string, { id: string; label: string; type: AccountType }>();
  for (const account of [...baseline.projectionInputs.accounts, ...projection.inputs.accounts]) {
    descriptors.set(account.id, { id: account.id, label: account.label, type: account.type });
  }
  for (const account of baseline.derived.accountBalances) {
    if (!descriptors.has(account.id)) {
      descriptors.set(account.id, {
        id: account.id,
        label: account.name,
        type: account.plannerType,
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
        rawLabel: account.label,
        key: `${base.key}_${sequence}`,
        label: `${base.label} ${sequence}`,
        plannerType: account.type,
      };
    });
  const accountByRawId = new Map(accounts.map((account) => [account.rawId, account]));
  const textReplacements: TextReplacement[] = [];
  const exactIdentifiers = new Map<string, string>();
  const numericAccountIds = new Map<string, string>();
  for (const account of accounts) {
    if (account.rawId.includes(":")) addTextReplacement(textReplacements, account.rawId, account.key);
    addTextReplacement(textReplacements, account.rawLabel, account.label);
    exactIdentifiers.set(account.rawId, account.key);
  }
  for (const account of baseline.derived.accountBalances) {
    const alias = accountByRawId.get(account.id);
    if (!alias) continue;
    if (account.lunchMoneyId !== null) {
      numericAccountIds.set(String(account.lunchMoneyId), alias.key);
      exactIdentifiers.set(String(account.lunchMoneyId), alias.key);
    }
    addTextReplacement(textReplacements, account.name, alias.label);
  }

  const unmappedAccountIds = new Map<string, string>();
  [...baseline.unmappedAccounts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((account, index) => {
      const key = `unmapped_account_${index + 1}`;
      const label = `Unmapped account ${index + 1}`;
      unmappedAccountIds.set(account.id, key);
      exactIdentifiers.set(account.id, key);
      if (account.lunchMoneyId !== null) {
        numericAccountIds.set(String(account.lunchMoneyId), key);
        exactIdentifiers.set(String(account.lunchMoneyId), key);
      }
      addTextReplacement(textReplacements, account.id, key);
      addTextReplacement(textReplacements, account.name, label);
    });

  const eventIds = new Map<string, string>();
  const rawEventIds = new Set([
    ...baseline.projectionInputs.events.map((event) => event.id),
    ...projection.inputs.events.map((event) => event.id),
  ]);
  [...rawEventIds]
    .sort((left, right) => left.localeCompare(right))
    .forEach((id, index) => {
      const key = `event_${index + 1}`;
      eventIds.set(id, key);
      if (!exactIdentifiers.has(id)) exactIdentifiers.set(id, key);
      addTextReplacement(textReplacements, id, key);
    });

  const categoryDescriptors = new Map<string, string>();
  for (const category of baseline.unmappedCategories) {
    categoryDescriptors.set(category.id, category.name);
  }
  for (const item of baseline.derived.recurringExpenses.items) {
    if (!categoryDescriptors.has(item.categoryId)) {
      categoryDescriptors.set(item.categoryId, `Category ${item.categoryId}`);
    }
  }
  const categoryIds = new Map<string, string>();
  [...categoryDescriptors.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([id, name], index) => {
      const key = `category_${index + 1}`;
      categoryIds.set(id, key);
      if (!exactIdentifiers.has(id)) exactIdentifiers.set(id, key);
      addTextReplacement(textReplacements, name, `Category ${index + 1}`);
    });

  [...baseline.warnings]
    .sort((left, right) =>
      `${left.identifier ?? ""}\u0000${left.name ?? ""}`.localeCompare(
        `${right.identifier ?? ""}\u0000${right.name ?? ""}`,
      ),
    )
    .forEach((warning, index) => {
      const key = `warning_identifier_${index + 1}`;
      if (warning.identifier && !exactIdentifiers.has(warning.identifier)) {
        exactIdentifiers.set(warning.identifier, key);
        addTextReplacement(textReplacements, warning.identifier, key);
      }
      addTextReplacement(textReplacements, warning.name, `Warning record ${index + 1}`);
    });

  textReplacements.sort((left, right) => right.raw.length - left.raw.length);
  return {
    accounts,
    accountByRawId,
    unmappedAccountIds,
    eventIds,
    categoryIds,
    numericAccountIds,
    exactIdentifiers,
    textReplacements,
  };
}

function replaceTextAliases(value: string, context: AnonymizationContext): string {
  let result = value;
  const placeholders: Array<{ placeholder: string; safe: string }> = [];
  context.textReplacements.forEach((replacement, index) => {
    const placeholder = `\uE000${index}\uE001`;
    const escaped = replacement.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startsWithWord = /^[a-z0-9]/i.test(replacement.raw);
    const endsWithWord = /[a-z0-9]$/i.test(replacement.raw);
    const matcher = new RegExp(
      `${startsWithWord ? "(?<![a-z0-9_])" : ""}${escaped}${endsWithWord ? "(?![a-z0-9_])" : ""}`,
      "g",
    );
    if (!matcher.test(result)) return;
    result = result.replace(matcher, placeholder);
    placeholders.push({ placeholder, safe: replacement.safe });
  });
  for (const { placeholder, safe } of placeholders) result = result.replaceAll(placeholder, safe);

  for (const [raw, safe] of context.numericAccountIds) {
    result = result.replace(
      new RegExp(`\\b(account)(?:\\s+id)?\\s*[:#-]?\\s*${raw}\\b`, "gi"),
      `$1 ${safe}`,
    );
  }
  for (const [raw, safe] of context.categoryIds) {
    if (!/^\d+$/.test(raw)) continue;
    result = result.replace(
      new RegExp(`\\b(category)(?:\\s+id)?\\s*[:#-]?\\s*${raw}\\b`, "gi"),
      `$1 ${safe}`,
    );
  }
  for (const account of context.accounts) {
    if (account.rawId.includes(":") || /^\d+$/.test(account.rawId)) continue;
    const escaped = account.rawId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result
      .replace(
        new RegExp(
          `\\b((?:account|asset|mapping|contribution|funding|priority|assumption|target|for)(?:\\s+(?:account|id))?\\s*[:#-]?\\s*)${escaped}(?![a-z0-9_])`,
          "gi",
        ),
        `$1${account.key}`,
      )
      .replace(new RegExp(`\\b${escaped}(\\s+account\\b)`, "gi"), `${account.key}$1`);
  }

  return result
    .replace(/\b(?:plaid|manual):\d+\b/gi, "account_identifier_anonymized")
    .replace(
      /\b(?:account|acct|a\/c)(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*(?=[a-z0-9-]*\d)[a-z0-9-]{4,}\b/gi,
      "[account number redacted]",
    )
    .replace(
      /\b(?:ending in|last four|last 4)\s*(?:digits?)?\s*[:#-]?\s*\d{4}\b/gi,
      "[account suffix redacted]",
    )
    .replace(/\b\d{8,}\b/g, "[number redacted]");
}

function replaceSpecificAccountText(value: string, account: AccountAlias): string {
  return [
    { raw: account.rawId, safe: account.key },
    { raw: account.rawLabel, safe: account.label },
  ].reduce((result, replacement) => {
    const escaped = replacement.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const startsWithWord = /^[a-z0-9]/i.test(replacement.raw);
    const endsWithWord = /[a-z0-9]$/i.test(replacement.raw);
    return result.replace(
      new RegExp(
        `${startsWithWord ? "(?<![a-z0-9_])" : ""}${escaped}${endsWithWord ? "(?![a-z0-9_])" : ""}`,
        "g",
      ),
      replacement.safe,
    );
  }, value);
}

function anonymizeStringField(
  value: string,
  field: string | undefined,
  context: AnonymizationContext,
  account?: AccountAlias,
): string {
  if (field === "accountId" || field === "targetAccountId") {
    return context.accountByRawId.get(value)?.key ??
      context.unmappedAccountIds.get(value) ??
      replaceTextAliases(value, context);
  }
  if (field === "categoryId") {
    return context.categoryIds.get(value) ?? `category_anonymized`;
  }
  if (field === "identifier") {
    return context.accountByRawId.get(value)?.key ??
      context.unmappedAccountIds.get(value) ??
      context.categoryIds.get(value) ??
      context.exactIdentifiers.get(value) ??
      "identifier_anonymized";
  }
  if (field === "id") {
    return context.accountByRawId.get(value)?.key ??
      context.unmappedAccountIds.get(value) ??
      context.eventIds.get(value) ??
      context.categoryIds.get(value) ??
      replaceTextAliases(value, context);
  }
  if (account && (field === "label" || field === "name" || field === "message" || field === "sourceDescription")) {
    return replaceTextAliases(replaceSpecificAccountText(value, account), context);
  }
  if (account && field === "value" && value === account.rawLabel) return account.label;
  return replaceTextAliases(value, context);
}

function accountAliasInKey(key: string, context: AnonymizationContext): AccountAlias | undefined {
  return context.accounts.find((account) => {
    const escaped = account.rawId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[._:-])${escaped}(?=$|[._:-])`).test(key);
  });
}

function anonymizeObjectKey(
  key: string,
  parentField: string | undefined,
  context: AnonymizationContext,
): string {
  if (parentField === "accountBalances") {
    return context.accountByRawId.get(key)?.key ?? `account_anonymized`;
  }
  let result = replaceTextAliases(key, context);
  for (const account of context.accounts) {
    const escaped = account.rawId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(
        `(^|(?:accounts?|contributions?|targets?|balances?)[._:-]+)${escaped}(?=$|[._:-])`,
        "gi",
      ),
      `$1${account.key}`,
    );
  }
  for (const [raw, safe] of context.exactIdentifiers) {
    if (!/^\d+$/.test(raw)) continue;
    result = result.replace(
      new RegExp(
        `(^|(?:accounts?|contributions?|targets?|balances?)[._:-]+)${raw}(?=$|[._:-])`,
        "gi",
      ),
      `$1${safe}`,
    );
  }
  return result.replace(
    /((?:accounts?|contributions?|targets?|balances?)[._:-]+)\d+(?=$|[._:-])/gi,
    "$1identifier_anonymized",
  );
}

function anonymizeValue(
  value: unknown,
  context: AnonymizationContext,
  field?: string,
  forcedAccount?: AccountAlias,
): unknown {
  if (field === "lunchMoneyId") return null;
  if (typeof value === "string") return anonymizeStringField(value, field, context, forcedAccount);
  if (Array.isArray(value)) {
    return value.map((entry) => anonymizeValue(entry, context, undefined, forcedAccount));
  }
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const referencedAccountId = [object.id, object.accountId, object.identifier, object.targetAccountId]
    .find((candidate): candidate is string =>
      typeof candidate === "string" && context.accountByRawId.has(candidate),
    );
  const objectAccount = referencedAccountId
    ? context.accountByRawId.get(referencedAccountId)
    : forcedAccount;
  return Object.fromEntries(
    Object.entries(object).map(([key, entry]) => {
      const entryAccount =
        field === "provenance" ? accountAliasInKey(key, context) ?? objectAccount : objectAccount;
      return [
        anonymizeObjectKey(key, field, context),
        anonymizeValue(entry, context, key, entryAccount),
      ];
    }),
  );
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
  const context = createAnonymizationContext(projection, baseline);
  const rawSnapshot = {
    schemaVersion: "3.0" as const,
    generatedAt,
    connection: baseline.connection,
    dataThrough: baseline.dataThrough,
    transactionWindow: baseline.transactionWindow,
    recordsAnalyzed: baseline.recordsAnalyzed,
    resolvedBaseline: baseline.projectionInputs,
    activeInputs: projection.inputs,
    calculationBasis: {
      employmentIncome: "net_deposited_cash_no_additional_tax" as const,
      simplifiedTax: "gross_retirement_income_and_taxable_rrsp_rrif_withdrawals" as const,
      contributions: "cash_funded_reduce_cash_income_withheld_do_not" as const,
    },
    provenance: baseline.provenance,
    derivedBaseline: baseline.derived,
    warnings: baseline.warnings,
    unmappedAccounts: baseline.unmappedAccounts,
    unmappedCategories: baseline.unmappedCategories,
    activeOverrides,
    projection,
  };
  const anonymized = anonymizeValue(rawSnapshot, context) as Omit<
    ProjectionSnapshot,
    "exportMetadata"
  >;
  const redacted = redactSecrets(anonymized) as Omit<ProjectionSnapshot, "exportMetadata">;
  const snapshot: ProjectionSnapshot = {
    ...redacted,
    exportMetadata: {
      shareSafe: true,
      anonymized: true,
      rawLunchMoneyIdentifiersIncluded: false,
      credentialsIncluded: false,
      accountAliases: context.accounts.map(({ key, label, plannerType }) => ({
        key,
        label,
        plannerType,
      })),
    },
  };
  return snapshot;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function projectionSnapshotToCsv(
  snapshot: ProjectionSnapshot,
  mode: "real" | "nominal" = "real",
): string {
  if (!snapshot.exportMetadata.shareSafe || !snapshot.exportMetadata.anonymized) {
    throw new Error("CSV export requires a share-safe anonymized projection snapshot");
  }
  const accountAliases = snapshot.exportMetadata.accountAliases;
  const headers = [
    "period",
    "calendarYear",
    "age",
    "phase",
    "dollarMode",
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
