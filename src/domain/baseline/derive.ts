import type {
  Category,
  ChildCategory,
  ManualAccount,
  PlaidAccount,
  RecurringItem,
  Transaction,
} from "@lunch-money/lunch-money-js-v2";
import type {
  AccountMapping,
  CategoryMapping,
  PlannerConfig,
  ProjectionAccountConfig,
} from "@/src/config/types";
import type { BaselineValue } from "@/src/domain/defaults/types";
import {
  canadianCppReference,
  canadianOasReference,
  cppClaimRules,
  oasClaimRules,
} from "@/src/domain/defaults/canadian-public-benefits";
import {
  RRSP_ANNUAL_LIMITS,
  RRSP_EARNED_INCOME_RATE,
  RRSP_FORMULA_REFERENCE_URL,
  SIMPLE_POLICY_RRSP_FUTURE_GROWTH_RATE,
  SIMPLE_POLICY_RRSP_ROUNDING_INCREMENT,
  SIMPLE_POLICY_TFSA_FUTURE_INDEXING_RATE,
  SIMPLE_POLICY_TFSA_ROUNDING_INCREMENT,
  TFSA_ANNUAL_LIMITS,
  TFSA_WITHDRAWAL_REFERENCE_URL,
} from "@/src/domain/defaults/canadian-registered-account-room";
import { validateProjectionInputs, type AccountType, type ProjectionInputs } from "@/src/domain/projection/types";
import type { LunchMoneyData } from "@/src/integrations/lunchmoney/read-service";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import type {
  AccountBaseline,
  BaselineWarning,
  CurrentBaseline,
  RecurringExpense,
  TransactionAuditBreakdown,
  UnmappedAccount,
  UnmappedCategory,
} from "./types";

type RawAccount = {
  canonicalId: string;
  lunchMoneyId: number | null;
  source: "manual" | "plaid" | "cash";
  name: string;
  status: string;
  balance: number;
  balanceAsOf: string;
};

type CategoryRecord = Category | ChildCategory;

type MappingDetails = {
  classification: Exclude<CategoryMapping, string>["classification"];
  contributionAccountId?: string;
  contributionDirection: "debit" | "credit";
};

type AuditAccumulator = Omit<
  TransactionAuditBreakdown,
  "transactionCount" | "trailingTotal" | "monthlyAverage"
> & {
  transactionCount: number;
  trailingTotal: number;
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addAuditValue(
  audit: Map<string, AuditAccumulator>,
  details: Omit<AuditAccumulator, "transactionCount" | "trailingTotal">,
  amount: number,
): void {
  const key = `${details.categoryId}\u0000${details.accountId}`;
  const current = audit.get(key);
  if (current) {
    current.transactionCount += 1;
    current.trailingTotal += amount;
    return;
  }
  audit.set(key, {
    ...details,
    transactionCount: 1,
    trailingTotal: amount,
  });
}

function auditBreakdown(
  audit: Map<string, AuditAccumulator>,
  trailingMonths: number,
  expectedMonthlyAverage: number,
): TransactionAuditBreakdown[] {
  const rows = [...audit.values()]
    .sort(
      (left, right) =>
        left.categoryName.localeCompare(right.categoryName) ||
        left.accountName.localeCompare(right.accountName) ||
        left.categoryId.localeCompare(right.categoryId) ||
        left.accountId.localeCompare(right.accountId),
    )
    .map((item) => ({
      ...item,
      trailingTotal: round(item.trailingTotal),
      monthlyAverage: round(item.trailingTotal / trailingMonths),
    }));

  const last = rows.at(-1);
  if (last) {
    const precedingTotal = round(
      rows.slice(0, -1).reduce((total, item) => total + item.monthlyAverage, 0),
    );
    last.monthlyAverage = round(expectedMonthlyAverage - precedingTotal);
  }
  return rows;
}

function localValue<T>(value: T, description: string, date: string): BaselineValue<T> {
  return {
    value,
    sourceType: "local_configuration",
    sourceDescription: description,
    effectiveDate: date,
  };
}

function derivedValue<T>(value: T, description: string, date: string): BaselineValue<T> {
  return {
    value,
    sourceType: "lunchmoney_derived",
    sourceDescription: description,
    effectiveDate: date,
  };
}

function canadianValue<T>(
  value: T,
  description: string,
  effectiveDate: string,
  referenceKind: BaselineValue<T>["referenceKind"],
  referenceUrl: string,
): BaselineValue<T> {
  return {
    value,
    sourceType: "canadian_reference",
    sourceDescription: description,
    effectiveDate,
    referenceKind,
    referenceUrl,
  };
}

function rawAccounts(data: LunchMoneyData, endDate: string, includeCash: boolean): RawAccount[] {
  const manual = data.manualAccounts.map((account: ManualAccount): RawAccount => ({
    canonicalId: `manual:${account.id}`,
    lunchMoneyId: account.id,
    source: "manual",
    name: account.display_name || account.name,
    status: account.status,
    balance: account.to_base,
    balanceAsOf: account.balance_as_of,
  }));
  const plaid = data.plaidAccounts.map((account: PlaidAccount): RawAccount => ({
    canonicalId: `plaid:${account.id}`,
    lunchMoneyId: account.id,
    source: "plaid",
    name: account.display_name || account.name,
    status: account.status,
    balance: account.to_base,
    balanceAsOf: account.balance_last_update || account.last_fetch || endDate,
  }));
  return [
    ...manual,
    ...plaid,
    ...(includeCash
      ? [
          {
            canonicalId: "cash",
            lunchMoneyId: null,
            source: "cash" as const,
            name: "Cash transactions",
            status: "active",
            balance: 0,
            balanceAsOf: endDate,
          },
        ]
      : []),
  ];
}

function flattenCategories(categories: Category[]): Map<number, CategoryRecord> {
  const result = new Map<number, CategoryRecord>();
  for (const category of categories) {
    result.set(category.id, category);
    for (const child of category.children ?? []) result.set(child.id, child);
  }
  return result;
}

function transactionAccountId(transaction: Transaction): string {
  if (transaction.manual_account_id !== null) return `manual:${transaction.manual_account_id}`;
  if (transaction.plaid_account_id !== null) return `plaid:${transaction.plaid_account_id}`;
  return "cash";
}

function recurringAccountId(item: RecurringItem): string {
  if (item.transaction_criteria.manual_account_id !== null) {
    return `manual:${item.transaction_criteria.manual_account_id}`;
  }
  if (item.transaction_criteria.plaid_account_id !== null) {
    return `plaid:${item.transaction_criteria.plaid_account_id}`;
  }
  return "cash";
}

function mappingDetails(mapping: CategoryMapping): MappingDetails {
  if (typeof mapping === "string") {
    return { classification: mapping, contributionDirection: "debit" };
  }
  return {
    classification: mapping.classification,
    contributionAccountId: mapping.contributionAccountId,
    contributionDirection: mapping.contributionDirection ?? "debit",
  };
}

function accountType(mapping: AccountMapping): AccountType {
  if (mapping.type === "rrsp") return "rrsp_rrif";
  if (mapping.type === "exclude") {
    throw new Error("Excluded mappings cannot be converted to projection accounts");
  }
  return mapping.type;
}

function monthlyRecurringAmount(item: RecurringItem): number {
  const { granularity, quantity, to_base } = item.transaction_criteria;
  if (quantity <= 0) return 0;
  if (granularity === "day") return to_base * (365.25 / 12 / quantity);
  if (granularity === "week") return to_base * (52 / 12 / quantity);
  if (granularity === "month") return to_base / quantity;
  return to_base / (12 * quantity);
}

function projectionReturn(config: PlannerConfig, mapping: AccountMapping): number {
  if (mapping.annualReturn !== undefined) return mapping.annualReturn;
  if (mapping.type === "cash") return config.assumptions.cashReturn;
  if (mapping.type === "tfsa") return config.assumptions.tfsaReturn;
  if (mapping.type === "rrsp") return config.assumptions.rrspReturn;
  if (mapping.type === "non_registered") return config.assumptions.nonRegisteredReturn;
  return config.assumptions.debtReturn;
}

function projectionAllocation(config: PlannerConfig, mapping: AccountMapping) {
  if (mapping.allocation) return mapping.allocation;
  if (mapping.type === "exclude") throw new Error("Excluded accounts have no allocation");
  return config.assumptions.allocations[mapping.type];
}

function uniqueTransactions(transactions: Transaction[]): Transaction[] {
  const byId = new Map<number, Transaction>();
  for (const transaction of transactions) byId.set(transaction.id, transaction);
  return [...byId.values()].filter(
    (transaction) =>
      !transaction.is_group_parent &&
      !transaction.is_pending &&
      transaction.status !== "delete_pending",
  );
}

export function deriveCurrentBaseline(
  config: PlannerConfig,
  data: LunchMoneyData,
  window: { startDate: string; endDate: string; trailingMonths: number },
  checkedAt: string,
): CurrentBaseline {
  const warnings: BaselineWarning[] = [];
  const transactions = uniqueTransactions(data.transactions);
  const skippedTransactions = data.transactions.length - transactions.length;
  if (skippedTransactions > 0) {
    warnings.push({
      code: "transactions_skipped",
      severity: "warning",
      message: `${skippedTransactions} pending, duplicate, grouped-parent, or deletion-pending transaction records were excluded.`,
    });
  }
  if (transactions.length === 0) {
    warnings.push({
      code: "no_transactions",
      severity: "warning",
      message: "Lunch Money returned no posted transactions in the configured trailing window.",
    });
  }

  const usesCash =
    transactions.some((transaction) => transactionAccountId(transaction) === "cash") ||
    data.recurringItems.some((item) => recurringAccountId(item) === "cash");
  const accounts = rawAccounts(data, window.endDate, usesCash);
  const idCounts = new Map<number, number>();
  for (const account of accounts) {
    if (account.lunchMoneyId !== null) {
      idCounts.set(account.lunchMoneyId, (idCounts.get(account.lunchMoneyId) ?? 0) + 1);
    }
  }

  const accountById = new Map(accounts.map((account) => [account.canonicalId, account]));
  const resolvedMapping = new Map<string, AccountMapping>();
  const recognizedMappingKeys = new Set<string>();
  const unmappedAccounts: UnmappedAccount[] = [];
  for (const account of accounts) {
    const canonical = config.accountMappings[account.canonicalId];
    const rawId = account.lunchMoneyId === null ? undefined : String(account.lunchMoneyId);
    const raw = rawId && idCounts.get(account.lunchMoneyId!) === 1 ? config.accountMappings[rawId] : undefined;
    const mapping = canonical ?? raw;
    if (!mapping) {
      unmappedAccounts.push({
        id: account.canonicalId,
        lunchMoneyId: account.lunchMoneyId,
        source: account.source,
        name: account.name,
        status: account.status,
      });
      continue;
    }
    resolvedMapping.set(account.canonicalId, mapping);
    recognizedMappingKeys.add(canonical ? account.canonicalId : rawId!);
  }

  for (const configuredId of Object.keys(config.accountMappings)) {
    if (!recognizedMappingKeys.has(configuredId)) {
      warnings.push({
        code: "unused_account_mapping",
        severity: "warning",
        identifier: configuredId,
        message: `Account mapping ${configuredId} did not match a Lunch Money account in this refresh.`,
      });
    }
  }

  const categories = flattenCategories(data.categories);
  const unmappedCategoryCounts = new Map<string, number>();
  const contributionTotals = new Map<string, number>();
  let incomeTotal = 0;
  let incomeCount = 0;
  let essentialTotal = 0;
  let essentialCount = 0;
  let discretionaryTotal = 0;
  let discretionaryCount = 0;
  let contributionTransactionTotal = 0;
  let contributionTransactionCount = 0;
  const incomeAudit = new Map<string, AuditAccumulator>();
  const essentialAudit = new Map<string, AuditAccumulator>();
  const discretionaryAudit = new Map<string, AuditAccumulator>();
  function noteUnmappedCategory(categoryId: string): void {
    unmappedCategoryCounts.set(categoryId, (unmappedCategoryCounts.get(categoryId) ?? 0) + 1);
  }

  function resolveContributionTarget(
    details: MappingDetails,
    transactionAccount: string,
    categoryId: string,
  ): string | undefined {
    let target = details.contributionAccountId;
    if (!target) {
      const transactionMapping = resolvedMapping.get(transactionAccount);
      if (
        transactionMapping &&
        ["tfsa", "rrsp", "non_registered"].includes(transactionMapping.type)
      ) {
        target = transactionAccount;
      }
    }
    if (target && !accountById.has(target) && /^\d+$/.test(target)) {
      const matching = accounts.filter((account) => account.lunchMoneyId === Number(target));
      if (matching.length === 1) target = matching[0]!.canonicalId;
    }
    const targetMapping = target ? resolvedMapping.get(target) : undefined;
    if (
      !target ||
      !targetMapping ||
      !targetMapping.include ||
      !["tfsa", "rrsp", "non_registered"].includes(targetMapping.type)
    ) {
      warnings.push({
        code: "contribution_target_required",
        severity: "error",
        identifier: categoryId,
        message: `Investment contribution category ${categoryId} needs a contributionAccountId that identifies an included investment account.`,
      });
      return undefined;
    }
    return target;
  }

  for (const transaction of transactions) {
    const sourceAccount = transactionAccountId(transaction);
    const accountMapping = resolvedMapping.get(sourceAccount);
    if (!accountMapping || !accountMapping.include) continue;

    const categoryId = transaction.category_id === null ? "uncategorized" : String(transaction.category_id);
    const category = transaction.category_id === null ? undefined : categories.get(transaction.category_id);
    if (category?.exclude_from_totals) continue;
    const configuredCategory = config.categoryMappings[categoryId];
    if (!configuredCategory) {
      noteUnmappedCategory(categoryId);
      continue;
    }

    const details = mappingDetails(configuredCategory);
    const amount = transaction.to_base;
    const auditDetails = {
      categoryId,
      categoryName: category?.name ?? "Uncategorized",
      accountId: sourceAccount,
      accountName: accountById.get(sourceAccount)?.name ?? "Cash transactions",
    };
    if (details.classification === "essential") {
      essentialTotal += amount;
      essentialCount += 1;
      addAuditValue(essentialAudit, auditDetails, amount);
    } else if (details.classification === "discretionary") {
      discretionaryTotal += amount;
      discretionaryCount += 1;
      addAuditValue(discretionaryAudit, auditDetails, amount);
    } else if (details.classification === "income") {
      incomeTotal -= amount;
      incomeCount += 1;
      addAuditValue(incomeAudit, auditDetails, -amount);
    } else if (details.classification === "investment_contribution") {
      const target = resolveContributionTarget(details, sourceAccount, categoryId);
      const contribution = details.contributionDirection === "credit" ? -amount : amount;
      contributionTransactionTotal += contribution;
      contributionTransactionCount += 1;
      if (target) contributionTotals.set(target, (contributionTotals.get(target) ?? 0) + contribution);
    }
  }

  const recurringExpenses: RecurringExpense[] = [];
  const recurringAuditItems: CurrentBaseline["cashFlowAudit"]["recurringExpenses"]["items"] = [];
  let suggestedRecurringCount = 0;
  for (const item of data.recurringItems) {
    if (item.status !== "reviewed") {
      suggestedRecurringCount += 1;
      continue;
    }
    if (
      (item.transaction_criteria.start_date && item.transaction_criteria.start_date > window.endDate) ||
      (item.transaction_criteria.end_date && item.transaction_criteria.end_date < window.endDate)
    ) {
      continue;
    }
    const sourceAccount = recurringAccountId(item);
    const accountMapping = resolvedMapping.get(sourceAccount);
    if (!accountMapping || !accountMapping.include) continue;
    const categoryId =
      item.overrides.category_id === undefined ? "uncategorized" : String(item.overrides.category_id);
    const category =
      item.overrides.category_id === undefined ? undefined : categories.get(item.overrides.category_id);
    if (category?.exclude_from_totals) continue;
    const configuredCategory = config.categoryMappings[categoryId];
    if (!configuredCategory) {
      noteUnmappedCategory(categoryId);
      continue;
    }
    const details = mappingDetails(configuredCategory);
    if (details.classification !== "essential" && details.classification !== "discretionary") continue;
    const monthlyAmount = monthlyRecurringAmount(item);
    if (monthlyAmount <= 0) continue;
    recurringExpenses.push({
      id: item.id,
      description: item.description || item.transaction_criteria.payee || `Recurring item ${item.id}`,
      classification: details.classification,
      monthlyAmount: round(monthlyAmount),
      accountId: sourceAccount,
      categoryId,
    });
    recurringAuditItems.push({
      description: item.description || item.transaction_criteria.payee || `Recurring item ${item.id}`,
      classification: details.classification,
      monthlyAmount: round(monthlyAmount),
      accountName: accountById.get(sourceAccount)?.name ?? "Cash transactions",
      categoryName: category?.name ?? "Uncategorized",
    });
  }
  if (suggestedRecurringCount > 0) {
    warnings.push({
      code: "suggested_recurring_ignored",
      severity: "warning",
      message: `${suggestedRecurringCount} unreviewed suggested recurring items were not treated as confirmed expenses.`,
    });
  }

  const unmappedCategories: UnmappedCategory[] = [...unmappedCategoryCounts.entries()]
    .map(([id, transactionCount]) => {
      const numericId = /^\d+$/.test(id) ? Number(id) : null;
      return {
        id,
        lunchMoneyId: numericId,
        name: numericId === null ? "Uncategorized" : categories.get(numericId)?.name ?? `Category ${id}`,
        transactionCount,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  if (essentialTotal < 0 || discretionaryTotal < 0 || incomeTotal < 0 || contributionTransactionTotal < 0) {
    warnings.push({
      code: "negative_derived_total",
      severity: "error",
      message: "A mapped trailing total is negative. Check category classifications and contribution directions.",
    });
  }

  const includedAccountRecords = accounts.filter((account) => resolvedMapping.get(account.canonicalId)?.include);
  const includedCash = includedAccountRecords.some(
    (account) => resolvedMapping.get(account.canonicalId)?.type === "cash",
  );
  if (!includedCash) {
    warnings.push({
      code: "cash_account_required",
      severity: "error",
      message: "At least one Lunch Money account must be explicitly included as cash for cash-flow projection.",
    });
  }

  const accountBaselines: AccountBaseline[] = [];
  const projectionAccounts: ProjectionInputs["accounts"] = [];
  const provenance: Record<string, BaselineValue<unknown>> = {};
  const dataThrough =
    transactions.reduce(
      (latest, transaction) => (transaction.date > latest ? transaction.date : latest),
      "",
    ) || window.endDate;
  const monthlyIncome = round(incomeTotal / window.trailingMonths);
  const annualEmploymentNetCashToday = round(monthlyIncome * 12);
  for (const account of includedAccountRecords) {
    const mapping = resolvedMapping.get(account.canonicalId)!;
    if (mapping.type === "exclude") continue;
    const type = accountType(mapping);
    if (mapping.monthlyContribution !== undefined && !["tfsa", "rrsp_rrif", "non_registered"].includes(type)) {
      warnings.push({
        code: "invalid_manual_contribution",
        severity: "error",
        identifier: account.canonicalId,
        message: `Manual contributions may only be configured for investment account ${account.canonicalId}.`,
      });
    }
    if (type !== "debt" && mapping.withdrawalPriority === undefined) {
      warnings.push({
        code: "withdrawal_priority_required",
        severity: "error",
        identifier: account.canonicalId,
        message: `Included financial account ${account.canonicalId} needs an explicit withdrawalPriority.`,
      });
    }
    const rawBalance = type === "debt" ? Math.abs(account.balance) : account.balance;
    if (rawBalance < 0) {
      warnings.push({
        code: "negative_asset_balance",
        severity: "error",
        identifier: account.canonicalId,
        name: account.name,
        message: `Included asset ${account.canonicalId} has a negative Lunch Money balance and must be mapped as debt or excluded.`,
      });
    }
    const contributionFromConfig = mapping.monthlyContribution;
    const contributionFromTransactions = (contributionTotals.get(account.canonicalId) ?? 0) / window.trailingMonths;
    const monthlyContribution = round(contributionFromConfig ?? contributionFromTransactions);
    const contributionSource =
      contributionFromConfig === undefined ? "lunchmoney_derived" : "local_configuration";
    const isInvestmentAccount = ["tfsa", "rrsp_rrif", "non_registered"].includes(type);
    const contributionFunding = isInvestmentAccount
      ? mapping.contributionFunding ?? (contributionFromConfig === undefined ? "cash" : undefined)
      : undefined;
    const simpleConfiguredPhases =
      config.configurationMode === "simple" &&
      mapping.roles?.includes("personal_tfsa")
        ? config.savingsPolicy!.personalInvesting.phases.map((phase) => ({
            ...phase,
            funding: "cash" as const,
          }))
        : config.configurationMode === "simple" &&
            mapping.roles?.includes("workplace_rrsp")
          ? config.savingsPolicy!.workplaceRrsp!.phases.map((phase) => ({
              ...phase,
              funding: "income_withheld" as const,
            }))
          : undefined;
    const configuredContributionPhases =
      simpleConfiguredPhases ?? mapping.contributionPhases;
    const contributionPhases: ProjectionInputs["accounts"][number]["contributionPhases"] =
      configuredContributionPhases?.map((phase) => ({
        id: phase.id,
        label: phase.label,
        startAge: phase.startAge,
        endAge: phase.endAge,
        monthlyAmountToday:
          phase.monthlyAmountToday === "live_baseline"
            ? monthlyContribution
            : phase.monthlyAmountToday,
        funding: phase.funding,
        indexingRate: phase.indexingRate,
      })) ??
      (monthlyContribution > 0 && contributionFunding
        ? [
            {
              id: "legacy-current-contribution",
              label: "Current contribution",
              startAge: config.currentAge,
              endAge: config.retirementAge,
              monthlyAmountToday: monthlyContribution,
              funding: contributionFunding,
              indexingRate: config.assumptions.contributionIndexing,
            },
          ]
        : []);
    const balance = round(Math.max(0, rawBalance));
    const annualReturn = projectionReturn(config, mapping);
    const allocation = projectionAllocation(config, mapping);

    accountBaselines.push({
      id: account.canonicalId,
      lunchMoneyId: account.lunchMoneyId,
      source: account.source,
      name: account.name,
      plannerType: type,
      balance,
      balanceAsOf: account.balanceAsOf,
      monthlyContribution,
      contributionSource,
      contributionFunding,
    });
    projectionAccounts.push({
      id: account.canonicalId,
      label: account.name,
      origin: "lunchmoney",
      type,
      openingBalance: balance,
      annualReturn,
      contributionPhases,
      withdrawalPriority: mapping.withdrawalPriority ?? 999,
      allocation,
    });
    provenance[`accounts.${account.canonicalId}.openingBalance`] = derivedValue(
      balance,
      `Lunch Money ${account.source} account balance for ${account.name}`,
      account.balanceAsOf,
    );
    provenance[`accounts.${account.canonicalId}.origin`] = derivedValue(
      "lunchmoney",
      `Account was imported from Lunch Money as ${account.canonicalId}`,
      account.balanceAsOf,
    );
    provenance[`accounts.${account.canonicalId}.annualReturn`] = localValue(
      annualReturn,
      `Return assumption for ${account.canonicalId}`,
      window.endDate,
    );
    for (const phase of contributionPhases) {
      const prefix = `accounts.${account.canonicalId}.contributionPhases.${phase.id}`;
      const configuredPhase = configuredContributionPhases?.find(
        (item) => item.id === phase.id,
      );
      const fallbackDescription =
        "Legacy account-level contribution was normalized into a resolved contribution phase";
      provenance[`${prefix}.label`] = localValue(
        phase.label,
        configuredPhase
          ? `Contribution phase label for ${account.canonicalId}`
          : `${fallbackDescription} for ${account.canonicalId}`,
        window.endDate,
      );
      provenance[`${prefix}.startAge`] = localValue(
        phase.startAge,
        configuredPhase
          ? `Contribution phase start age for ${account.canonicalId}`
          : `${fallbackDescription}; start age uses currentAge`,
        window.endDate,
      );
      provenance[`${prefix}.endAge`] = localValue(
        phase.endAge,
        configuredPhase
          ? `Contribution phase end age for ${account.canonicalId}`
          : `${fallbackDescription}; end age uses retirementAge`,
        window.endDate,
      );
      provenance[`${prefix}.monthlyAmountToday`] =
        configuredPhase?.monthlyAmountToday === "live_baseline" ||
        (!configuredPhase && contributionSource === "lunchmoney_derived")
          ? derivedValue(
              phase.monthlyAmountToday,
              configuredPhase
                ? `Live trailing ${window.trailingMonths}-month contribution average resolved for ${account.canonicalId}`
                : `${fallbackDescription} from the trailing ${window.trailingMonths}-month contribution average`,
              dataThrough || window.endDate,
            )
          : localValue(
              phase.monthlyAmountToday,
              configuredPhase
                ? `Configured contribution amount for ${account.canonicalId}`
                : `${fallbackDescription} from the configured monthly contribution`,
              window.endDate,
            );
      provenance[`${prefix}.funding`] = localValue(
        phase.funding,
        configuredPhase
          ? `Contribution phase funding for ${account.canonicalId}`
          : `${fallbackDescription}; funding preserves the legacy setting`,
        window.endDate,
      );
      provenance[`${prefix}.indexingRate`] = localValue(
        phase.indexingRate,
        configuredPhase
          ? `Contribution phase indexing for ${account.canonicalId}`
          : `${fallbackDescription}; indexing preserves the legacy global assumption`,
        window.endDate,
      );
    }
    provenance[`accounts.${account.canonicalId}.label`] = derivedValue(
      account.name,
      `Lunch Money display name for ${account.canonicalId}`,
      account.balanceAsOf,
    );
    provenance[`accounts.${account.canonicalId}.type`] = localValue(
      type,
      `Planner account type mapping for ${account.canonicalId}`,
      window.endDate,
    );
    provenance[`accounts.${account.canonicalId}.allocation`] = localValue(
      allocation,
      `Asset allocation assumption for ${account.canonicalId}`,
      window.endDate,
    );
    provenance[`accounts.${account.canonicalId}.withdrawalPriority`] = localValue(
      mapping.withdrawalPriority ?? 999,
      `Withdrawal priority for ${account.canonicalId}`,
      window.endDate,
    );
  }

  const importedAccountForRole = (role: NonNullable<AccountMapping["roles"]>[number]) => {
    const matches = projectionAccounts.filter(
      (account) =>
        account.origin === "lunchmoney" &&
        resolvedMapping.get(account.id)?.roles?.includes(role),
    );
    if (matches.length !== 1) {
      throw new PlannerRuntimeError(
        "configuration_required",
        `The ${role} role must resolve to exactly one included imported account; found ${matches.length}.`,
        422,
      );
    }
    return matches[0]!;
  };

  const resolvedProjectionAccountConfigs: Record<
    string,
    ProjectionAccountConfig
  > = { ...(config.projectionAccounts ?? {}) };
  const automaticallyCreatedProjectionAccountIds = new Set<string>();
  if (config.configurationMode === "simple") {
    const importedTaxable = projectionAccounts.find(
      (account) =>
        account.origin === "lunchmoney" &&
        resolvedMapping
          .get(account.id)
          ?.roles?.includes("personal_taxable"),
    );
    if (!importedTaxable) {
      const accountId = "projection:future-taxable";
      const nextWithdrawalPriority =
        Math.max(
          0,
          ...projectionAccounts
            .filter((account) => account.type !== "debt")
            .map((account) => account.withdrawalPriority),
        ) + 1;
      resolvedProjectionAccountConfigs[accountId] = {
        label: "Future taxable investment account",
        type: "non_registered",
        annualReturn: config.assumptions.nonRegisteredReturn,
        withdrawalPriority: nextWithdrawalPriority,
        allocation: config.assumptions.allocations.non_registered,
        contributionPhases: [],
      };
      automaticallyCreatedProjectionAccountIds.add(accountId);
    }
  }

  for (const [accountId, configured] of Object.entries(
    resolvedProjectionAccountConfigs,
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (projectionAccounts.some((account) => account.id === accountId)) {
      throw new PlannerRuntimeError(
        "configuration_required",
        `Projection-only account ${accountId} collides with an imported account id.`,
        422,
      );
    }
    const type = configured.type === "rrsp" ? "rrsp_rrif" : configured.type;
    const account: ProjectionInputs["accounts"][number] = {
      id: accountId,
      label: configured.label,
      origin: "projection_configuration",
      type,
      openingBalance: 0,
      annualReturn: configured.annualReturn,
      contributionPhases: configured.contributionPhases.map((phase) => ({
        id: phase.id,
        label: phase.label,
        startAge: phase.startAge,
        endAge: phase.endAge,
        monthlyAmountToday: phase.monthlyAmountToday as number,
        funding: phase.funding,
        indexingRate: phase.indexingRate,
      })),
      withdrawalPriority: configured.withdrawalPriority,
      allocation: configured.allocation,
    };
    projectionAccounts.push(account);
    const prefix = `accounts.${accountId}`;
    provenance[`${prefix}.label`] = localValue(
      account.label,
      automaticallyCreatedProjectionAccountIds.has(accountId)
        ? "Automatic future taxable account label compiled from the simple savings policy"
        : "Projection-only account label from private planner configuration",
      window.endDate,
    );
    provenance[`${prefix}.origin`] = localValue(
      account.origin,
      automaticallyCreatedProjectionAccountIds.has(accountId)
        ? "Projection-only account created automatically because no imported personal taxable role was selected; it is not an imported Lunch Money balance"
        : "Projection-only account created through planner configuration; it is not an imported Lunch Money balance",
      window.endDate,
    );
    provenance[`${prefix}.openingBalance`] = localValue(
      0,
      automaticallyCreatedProjectionAccountIds.has(accountId)
        ? "Automatically created future taxable account opening balance is fixed at zero and is not an imported balance"
        : "Projection-only opening balance is fixed at zero through projection configuration and is not an imported balance",
      window.endDate,
    );
    provenance[`${prefix}.type`] = localValue(
      account.type,
      "Projection-only planner account type",
      window.endDate,
    );
    provenance[`${prefix}.annualReturn`] = localValue(
      account.annualReturn,
      "Projection-only annual return assumption",
      window.endDate,
    );
    provenance[`${prefix}.withdrawalPriority`] = localValue(
      account.withdrawalPriority,
      "Projection-only withdrawal priority",
      window.endDate,
    );
    provenance[`${prefix}.allocation`] = localValue(
      account.allocation,
      "Projection-only asset allocation assumption",
      window.endDate,
    );
    for (const phase of account.contributionPhases) {
      const phasePrefix = `${prefix}.contributionPhases.${phase.id}`;
      provenance[`${phasePrefix}.label`] = localValue(
        phase.label,
        "Projection-only contribution phase label",
        window.endDate,
      );
      provenance[`${phasePrefix}.startAge`] = localValue(
        phase.startAge,
        "Projection-only contribution phase start age",
        window.endDate,
      );
      provenance[`${phasePrefix}.endAge`] = localValue(
        phase.endAge,
        "Projection-only contribution phase end age",
        window.endDate,
      );
      provenance[`${phasePrefix}.monthlyAmountToday`] = localValue(
        phase.monthlyAmountToday,
        "Projection-only contribution phase amount",
        window.endDate,
      );
      provenance[`${phasePrefix}.funding`] = localValue(
        phase.funding,
        "Projection-only contribution phase funding",
        window.endDate,
      );
      provenance[`${phasePrefix}.indexingRate`] = localValue(
        phase.indexingRate,
        "Projection-only contribution phase indexing",
        window.endDate,
      );
    }
  }

  const simpleRoleAccount = (
    role: NonNullable<AccountMapping["roles"]>[number],
  ) => importedAccountForRole(role);
  const simpleReserveAccounts =
    config.configurationMode === "simple"
      ? projectionAccounts.filter(
          (account) =>
            account.origin === "lunchmoney" &&
            resolvedMapping
              .get(account.id)
              ?.roles?.includes("reserve_member"),
        )
      : [];
  const simpleOperatingAccount =
    config.configurationMode === "simple"
      ? simpleRoleAccount("operating_cash")
      : null;
  const simpleReserveRefillAccount =
    config.configurationMode === "simple"
      ? simpleRoleAccount("reserve_refill")
      : null;
  const simplePersonalTfsaAccount =
    config.configurationMode === "simple"
      ? simpleRoleAccount("personal_tfsa")
      : null;
  const simplePersonalRrspAccount =
    config.configurationMode === "simple"
      ? simpleRoleAccount("personal_rrsp")
      : null;
  const simpleWorkplaceRrspAccount =
    config.configurationMode === "simple" &&
    config.savingsPolicy!.workplaceRrsp
      ? simpleRoleAccount("workplace_rrsp")
      : null;
  const simpleImportedTaxableAccount =
    config.configurationMode === "simple"
      ? projectionAccounts.find(
          (account) =>
            account.origin === "lunchmoney" &&
            resolvedMapping
              .get(account.id)
              ?.roles?.includes("personal_taxable"),
        ) ?? null
      : null;
  const simpleTaxableAccount =
    config.configurationMode === "simple"
      ? simpleImportedTaxableAccount ??
        projectionAccounts.find(
          (account) => account.id === "projection:future-taxable",
        )!
      : null;

  if (
    config.configurationMode === "simple" &&
    simpleReserveAccounts.length === 0
  ) {
    throw new PlannerRuntimeError(
      "configuration_required",
      "No reserve_member role resolved to an included imported cash account.",
      422,
    );
  }

  const projectionStartYear = Number(dataThrough.slice(0, 4));
  const projectionStartMonth = Number(dataThrough.slice(5, 7));
  const beforeProjectionStart =
    config.configurationMode === "simple"
      ? config.registeredRoom!.rrsp.beforeProjectionStart
      : undefined;
  if (
    config.configurationMode === "simple" &&
    projectionStartMonth !== 1 &&
    !beforeProjectionStart
  ) {
    throw new PlannerRuntimeError(
      "configuration_required",
      "registeredRoom.rrsp.beforeProjectionStart is required when the live projection starts from February through December.",
      422,
    );
  }

  const registeredAccountRoom: ProjectionInputs["registeredAccountRoom"] =
    config.configurationMode === "simple"
      ? {
          tfsa: {
            startingAvailableRoom: {
              source: "configured_amount",
              amount: config.registeredRoom!.tfsa.availableAtStart,
              sourceDescription:
                "Owner-supplied TFSA room available at projection start",
              effectiveDate: config.registeredRoom!.tfsa.asOf,
            },
            annualNewRoom: {
              source: "canadian_reference",
              futureIndexingRate:
                SIMPLE_POLICY_TFSA_FUTURE_INDEXING_RATE,
              roundingIncrement:
                SIMPLE_POLICY_TFSA_ROUNDING_INCREMENT,
            },
            carryForwardUnusedRoom: true,
            withdrawalRoomRecredit: "next_calendar_year",
          },
          rrsp: {
            startingAvailableDeductionRoom: {
              source: "configured_amount",
              amount: config.registeredRoom!.rrsp.availableAtStart,
              sourceDescription:
                "Owner-supplied RRSP deduction room available at projection start",
              effectiveDate: config.registeredRoom!.rrsp.asOf,
            },
            carryForwardUnusedRoom: true,
            newRoom: {
              source: "earned_income",
              annualCap: {
                source: "canadian_reference",
                futureGrowthRate:
                  SIMPLE_POLICY_RRSP_FUTURE_GROWTH_RATE,
                futureRoundingIncrement:
                  SIMPLE_POLICY_RRSP_ROUNDING_INCREMENT,
              },
              startYearBeforeProjectionMonth: {
                calendarYear: projectionStartYear,
                eligibleEarnedIncome:
                  beforeProjectionStart?.eligibleEarnedIncome ?? 0,
                pensionAdjustment:
                  beforeProjectionStart?.pensionAdjustment ?? 0,
                otherRoomReduction:
                  beforeProjectionStart?.otherReduction ?? 0,
              },
            },
          },
        }
      : config.registeredAccountRoom;

  const contributionWaterfall: ProjectionInputs["contributionWaterfall"] =
    config.configurationMode === "simple"
      ? {
          mode: "simple_policy",
          routes: [
            ...(simpleWorkplaceRrspAccount &&
            simpleWorkplaceRrspAccount.contributionPhases.length > 0
              ? [
                  {
                    sourceAccountId: simpleWorkplaceRrspAccount.id,
                    destinationAccountIds: [
                      simpleWorkplaceRrspAccount.id,
                    ],
                  },
                ]
              : []),
            ...(simplePersonalTfsaAccount!.contributionPhases.length > 0
              ? [
                  {
                    sourceAccountId: simplePersonalTfsaAccount!.id,
                    destinationAccountIds: [
                      simplePersonalTfsaAccount!.id,
                      simplePersonalRrspAccount!.id,
                      simpleTaxableAccount!.id,
                    ],
                  },
                ]
              : []),
          ],
          surplusDestinationAccountIds: [
            simplePersonalTfsaAccount!.id,
            simplePersonalRrspAccount!.id,
            simpleTaxableAccount!.id,
          ],
        }
      : config.contributionWaterfall
        ? {
            mode: "canonical",
            routes: config.contributionWaterfall.routes,
            surplusDestinationAccountIds:
              config.contributionWaterfall.surplusDestinationAccountIds,
          }
        : {
            mode: "fixed_source_compatibility",
            routes: projectionAccounts
              .filter((account) => account.contributionPhases.length > 0)
              .map((account) => ({
                sourceAccountId: account.id,
                destinationAccountIds: [account.id],
              })),
            surplusDestinationAccountIds: [],
          };

  const surplusAllocation: ProjectionInputs["surplusAllocation"] =
    config.configurationMode === "simple"
      ? {
          reserveAccountIds: simpleReserveAccounts.map(
            (account) => account.id,
          ),
          reserveRefillAccountId: simpleReserveRefillAccount!.id,
          targetCashReserveToday:
            config.savingsPolicy!.reserveBuilding.targetToday,
          reserveIndexingRate:
            config.savingsPolicy!.reserveBuilding.indexingRate,
          excess: {
            mode: "allocate_through_contribution_waterfall",
          },
        }
      : config.surplusAllocation!;

  const savingsPolicy: ProjectionInputs["savingsPolicy"] =
    config.configurationMode === "simple"
      ? {
          mode: "simple",
          operatingCashAccountId: simpleOperatingAccount!.id,
          reserveAccountIds: simpleReserveAccounts.map(
            (account) => account.id,
          ),
          reserveRefillAccountId: simpleReserveRefillAccount!.id,
          personalTfsaAccountId: simplePersonalTfsaAccount!.id,
          personalRrspAccountId: simplePersonalRrspAccount!.id,
          workplaceRrspAccountId:
            simpleWorkplaceRrspAccount?.id ?? null,
          taxableAccountId: simpleTaxableAccount!.id,
          taxableAccountOrigin: simpleTaxableAccount!.origin,
          reserveBuildingPhases:
            config.savingsPolicy!.reserveBuilding.phases.map((phase) => ({
              ...phase,
            })),
          unplannedCash: "retain_in_operating_cash",
          personalOrder: [
            "personal_tfsa",
            "personal_rrsp",
            "taxable",
          ],
          workplaceRoomPriority: "first",
          workplaceOverflow: "unallocated",
          reserveAfterTarget: "personal_investing",
        }
      : { mode: "advanced" };

  const reserveAccounts = surplusAllocation.reserveAccountIds.map(
    (reserveAccountId) => {
      const reserveAccount = projectionAccounts.find(
        (account) => account.id === reserveAccountId,
      );
      if (!reserveAccount) {
        throw new PlannerRuntimeError(
          "configuration_required",
          `Unknown surplusAllocation reserve account ${reserveAccountId}.`,
          422,
        );
      }
      if (reserveAccount.type !== "cash") {
        throw new PlannerRuntimeError(
          "configuration_required",
          `Surplus allocation reserve account ${reserveAccount.id} must be a cash account.`,
          422,
        );
      }
      return reserveAccount;
    },
  );
  const reserveRefillAccount = reserveAccounts.find(
    (account) =>
      account.id === surplusAllocation.reserveRefillAccountId,
  );
  if (!reserveRefillAccount) {
    throw new PlannerRuntimeError(
      "configuration_required",
      "surplusAllocation.reserveRefillAccountId must be included in reserveAccountIds.",
      422,
    );
  }
  if (surplusAllocation.excess.mode === "allocate_to_account") {
    const destinationAccountId =
      surplusAllocation.excess.destinationAccountId;
    const destinationAccount = projectionAccounts.find(
      (account) => account.id === destinationAccountId,
    );
    if (!destinationAccount) {
      throw new PlannerRuntimeError(
        "configuration_required",
        `Unknown surplusAllocation excess destination account ${destinationAccountId}.`,
        422,
      );
    }
    if (
      surplusAllocation.reserveAccountIds.includes(
        destinationAccount.id,
      )
    ) {
      throw new PlannerRuntimeError(
        "configuration_required",
        "Surplus allocation reserve and destination accounts must be different.",
        422,
      );
    }
    if (destinationAccount.type !== "non_registered") {
      throw new PlannerRuntimeError(
        "configuration_required",
        `Surplus allocation destination ${destinationAccount.id} must be a non-registered account; automatic TFSA, RRSP/RRIF, cash, and debt routing is unavailable.`,
        422,
      );
    }
  }

  const employmentIncomePhases: ProjectionInputs["person"]["employmentIncomePhases"] =
    config.employmentIncomePhases?.map((phase) => ({
      id: phase.id,
      label: phase.label,
      startAge: phase.startAge,
      endAge: phase.endAge,
      annualNetCashToday:
        phase.annualNetCashToday === "live_baseline"
          ? annualEmploymentNetCashToday
          : phase.annualNetCashToday,
      annualGrowth: phase.annualGrowth,
      ...(phase.rrspRoomGeneration
        ? { rrspRoomGeneration: { ...phase.rrspRoomGeneration } }
        : phase.rrspRoom
          ? {
              rrspRoomGeneration: {
                annualEligibleEarnedIncomeToday:
                  phase.rrspRoom.eligibleEarnedIncomeToday,
                annualPensionAdjustmentToday:
                  phase.rrspRoom.pensionAdjustmentToday,
                annualOtherRoomReductionToday:
                  phase.rrspRoom.otherReductionToday,
                annualGrowth: phase.rrspRoom.annualGrowth,
              },
            }
        : {}),
    })) ?? [
      {
        id: "legacy-current-income",
        label: "Current employment income",
        startAge: config.currentAge,
        endAge: config.retirementAge,
        annualNetCashToday: annualEmploymentNetCashToday,
        annualGrowth: config.assumptions.incomeGrowth,
      },
    ];
  for (const phase of employmentIncomePhases) {
    const prefix = `person.employmentIncomePhases.${phase.id}`;
    const configuredPhase = config.employmentIncomePhases?.find((item) => item.id === phase.id);
    const fallbackDescription =
      "Legacy scalar employment income was normalized into a resolved employment phase";
    provenance[`${prefix}.label`] = localValue(
      phase.label,
      configuredPhase ? "Employment income phase label" : fallbackDescription,
      window.endDate,
    );
    provenance[`${prefix}.startAge`] = localValue(
      phase.startAge,
      configuredPhase ? "Employment income phase start age" : `${fallbackDescription}; start age uses currentAge`,
      window.endDate,
    );
    provenance[`${prefix}.endAge`] = localValue(
      phase.endAge,
      configuredPhase ? "Employment income phase end age" : `${fallbackDescription}; end age uses retirementAge`,
      window.endDate,
    );
    provenance[`${prefix}.annualNetCashToday`] =
      configuredPhase?.annualNetCashToday === "live_baseline" || !configuredPhase
        ? derivedValue(
            phase.annualNetCashToday,
            configuredPhase
              ? `Live annualized net deposited employment income from the trailing ${window.trailingMonths}-month transaction window`
              : `${fallbackDescription} from annualized trailing Lunch Money income`,
            dataThrough || window.endDate,
          )
        : localValue(
            phase.annualNetCashToday,
            "Configured employment income for this phase",
            window.endDate,
          );
    provenance[`${prefix}.annualGrowth`] = localValue(
      phase.annualGrowth,
      configuredPhase
        ? "Employment income growth configured for this phase"
        : `${fallbackDescription}; growth preserves assumptions.incomeGrowth`,
      window.endDate,
    );
    if (phase.rrspRoomGeneration) {
      for (const [field, value] of Object.entries(
        phase.rrspRoomGeneration,
      )) {
        provenance[`${prefix}.rrspRoomGeneration.${field}`] = localValue(
          value,
          "Explicit RRSP room-generation assumption for this employment phase",
          window.endDate,
        );
      }
      if (configuredPhase?.rrspRoom) {
        const simpleRoomFields: Array<[string, unknown]> = [
          [
            "eligibleEarnedIncomeToday",
            configuredPhase.rrspRoom.eligibleEarnedIncomeToday,
          ],
          [
            "pensionAdjustmentToday",
            configuredPhase.rrspRoom.pensionAdjustmentToday,
          ],
          [
            "otherReductionToday",
            configuredPhase.rrspRoom.otherReductionToday,
          ],
          ["annualGrowth", configuredPhase.rrspRoom.annualGrowth],
        ];
        for (const [field, value] of simpleRoomFields) {
          provenance[`${prefix}.rrspRoom.${field}`] = localValue(
            value,
            "Explicit simple-policy RRSP room-generation assumption for this employment phase",
            window.endDate,
          );
        }
      }
    }
  }
  const longLiveBaselinePhase = employmentIncomePhases.find((phase) => {
    const configured = config.employmentIncomePhases?.find((item) => item.id === phase.id);
    return (
      phase.endAge - phase.startAge > 5 &&
      (!configured || configured.annualNetCashToday === "live_baseline")
    );
  });
  if (longLiveBaselinePhase) {
    const years = round(longLiveBaselinePhase.endAge - longLiveBaselinePhase.startAge);
    warnings.push({
      code: "long_live_baseline_income",
      severity: "warning",
      message: `Current Lunch Money employment income is assumed to continue for ${years} years. Consider configuring future employment-income phases.`,
    });
  }

  const blocking =
    unmappedAccounts.length > 0 ||
    unmappedCategories.length > 0 ||
    warnings.some((warning) => warning.severity === "error");
  const connection = {
    status: "connected" as const,
    checkedAt,
    message: "Lunch Money read-only data loaded successfully.",
  };
  const recordsAnalyzed = {
    accounts: data.manualAccounts.length + data.plaidAccounts.length,
    categories: categories.size,
    recurringItems: data.recurringItems.length,
    transactions: transactions.length,
  };

  if (blocking) {
    throw new PlannerRuntimeError(
      "configuration_required",
      "Lunch Money connected, but the planner configuration needs additional mappings or assumptions before a projection can run.",
      422,
      {
        connection,
        dataThrough,
        transactionWindow: { ...window, transactionCount: transactions.length },
        recordsAnalyzed,
        warnings,
        unmappedAccounts,
        unmappedCategories,
      },
    );
  }

  const monthlyEssential = round(essentialTotal / window.trailingMonths);
  const monthlyDiscretionary = round(discretionaryTotal / window.trailingMonths);
  const contributionAccounts = accountBaselines
    .filter((account) => ["tfsa", "rrsp_rrif", "non_registered"].includes(account.plannerType))
    .map((account) => ({
      accountId: account.id,
      monthlyAverage: account.monthlyContribution,
      source: account.contributionSource,
      funding: account.contributionFunding ?? "cash",
    }));
  const contributionAuditAccounts = contributionAccounts.map((account) => ({
    ...account,
    accountName:
      accountBaselines.find((baselineAccount) => baselineAccount.id === account.accountId)?.name ??
      "Unknown account",
  }));
  const resolvedMonthlyContributions = round(
    contributionAccounts.reduce((total, account) => total + account.monthlyAverage, 0),
  );

  provenance.monthlyEssentialSpendingToday = derivedValue(
    monthlyEssential,
    `Trailing ${window.trailingMonths}-month average of essential transactions`,
    dataThrough,
  );
  provenance.monthlyDiscretionarySpendingToday = derivedValue(
    monthlyDiscretionary,
    `Trailing ${window.trailingMonths}-month average of discretionary transactions`,
    dataThrough,
  );
  const localFields: Record<string, number> = {
    currentAge: config.currentAge,
    retirementAge: config.retirementAge,
    endAge: config.projectionEndAge,
    retirementGoalToday: config.retirementGoal,
    annualInflation: config.assumptions.inflation,
    effectiveTaxRate: config.assumptions.effectiveTaxRate,
    oasRecoveryThresholdToday: config.assumptions.oasRecoveryThreshold,
    oasRecoveryRate: config.assumptions.oasRecoveryRate,
    "person.currentAge": config.currentAge,
    "person.retirementAge": config.retirementAge,
    "person.annualPensionToday": config.assumptions.pensionAnnualIncome,
    "person.pensionStartAge": config.assumptions.pensionStartAge,
    "person.pensionIndexingRate": config.assumptions.pensionIndexing,
    "person.rrifConversionAge": config.assumptions.rrifConversionAge,
    "tax.effectiveTaxRate": config.assumptions.effectiveTaxRate,
    "tax.oasRecoveryThresholdToday": config.assumptions.oasRecoveryThreshold,
    "tax.oasRecoveryRate": config.assumptions.oasRecoveryRate,
    transactionTrailingMonths: config.transactionTrailingMonths,
  };
  for (const [field, value] of Object.entries(localFields)) {
    provenance[field] = localValue(value, `${field} from private planner configuration`, window.endDate);
  }

  const canonicalBenefits = config.governmentBenefits;
  const cppStartAge = canonicalBenefits?.cpp.startAge ?? config.cppStartAge!;
  const cppIndexingRate =
    canonicalBenefits?.cpp.indexingRate ?? config.assumptions.cppIndexing!;
  const oasStartAge = canonicalBenefits?.oas.startAge ?? config.oasStartAge!;
  const oasIndexingRate =
    canonicalBenefits?.oas.indexingRate ?? config.assumptions.oasIndexing!;

  let cppMonthlyAmountAt65Today: number;
  let cppAmountProvenance: BaselineValue<number>;
  let cppSourceMode: string;
  if (canonicalBenefits?.cpp.amountAt65.source === "canadian_reference") {
    cppMonthlyAmountAt65Today = canadianCppReference.monthlyAmountAt65Today;
    cppSourceMode = "canadian_reference";
    cppAmountProvenance = canadianValue(
      cppMonthlyAmountAt65Today,
      canadianCppReference.description,
      canadianCppReference.effectiveDate,
      canadianCppReference.referenceKind,
      canadianCppReference.referenceUrl,
    );
    warnings.push({
      code: "cpp_canadian_reference_in_use",
      severity: "warning",
      message:
        "CPP uses a generic published Canadian average for new beneficiaries at age 65. It is not a personal estimate or entitlement.",
    });
  } else if (canonicalBenefits?.cpp.amountAt65.source === "explicit_zero") {
    cppMonthlyAmountAt65Today = 0;
    cppSourceMode = "explicit_zero";
    cppAmountProvenance = localValue(
      0,
      "CPP is intentionally configured as zero",
      window.endDate,
    );
  } else if (canonicalBenefits) {
    const amount = canonicalBenefits.cpp.amountAt65;
    if (
      amount.source !== "official_estimate" &&
      amount.source !== "configured_amount"
    ) {
      throw new Error("Canonical CPP amount source was not resolved");
    }
    cppMonthlyAmountAt65Today = amount.monthlyAmountToday;
    cppSourceMode = amount.source;
    cppAmountProvenance = localValue(
      amount.monthlyAmountToday,
      amount.source === "official_estimate"
        ? "Amount entered from an official CPP estimate in private configuration"
        : "Explicit CPP planning assumption from private configuration; not an official entitlement",
      amount.effectiveDate,
    );
  } else {
    cppMonthlyAmountAt65Today = config.cppMonthlyAmountAt65!;
    cppSourceMode = "legacy_configured_amount";
    cppAmountProvenance = localValue(
      cppMonthlyAmountAt65Today,
      "Legacy CPP scalar amount normalized into the concrete CPP model through compatibility behaviour",
      window.endDate,
    );
    if (cppMonthlyAmountAt65Today === 0) {
      warnings.push({
        code: "legacy_zero_cpp_amount",
        severity: "warning",
        message:
          "Legacy CPP amount is zero and remains zero for compatibility. Canonical configuration must use amountAt65.source: explicit_zero to make that intent explicit.",
      });
    }
  }

  let oasFullMonthlyAmountAt65Today: number;
  let oasAmountProvenance: BaselineValue<number>;
  let oasSourceMode: string;
  if (canonicalBenefits?.oas.fullAmountAt65.source === "canadian_reference") {
    oasFullMonthlyAmountAt65Today =
      canadianOasReference.fullMonthlyAmountAt65Today;
    oasSourceMode = "canadian_reference";
    oasAmountProvenance = canadianValue(
      oasFullMonthlyAmountAt65Today,
      canadianOasReference.description,
      canadianOasReference.effectiveDate,
      canadianOasReference.referenceKind,
      canadianOasReference.referenceUrl,
    );
    warnings.push({
      code: "oas_canadian_reference_in_use",
      severity: "warning",
      message:
        "OAS uses the generic published full amount for ages 65–74. It is not a personal entitlement, and eligibility is configured separately.",
    });
  } else if (canonicalBenefits) {
    const amount = canonicalBenefits.oas.fullAmountAt65;
    oasFullMonthlyAmountAt65Today = amount.monthlyAmountToday;
    oasSourceMode = "configured_amount";
    oasAmountProvenance = localValue(
      amount.monthlyAmountToday,
      "Configured full OAS planning amount from private configuration; eligibility is resolved separately and this is not a personal entitlement",
      amount.effectiveDate,
    );
  } else {
    oasFullMonthlyAmountAt65Today = config.oasMonthlyAmountAt65!;
    oasSourceMode = "legacy_configured_amount";
    oasAmountProvenance = localValue(
      oasFullMonthlyAmountAt65Today,
      "Legacy OAS scalar amount normalized into the concrete OAS model through compatibility behaviour",
      window.endDate,
    );
    if (oasFullMonthlyAmountAt65Today === 0) {
      warnings.push({
        code: "legacy_zero_oas_amount",
        severity: "warning",
        message:
          "Legacy OAS amount is zero and remains zero for compatibility. Canonical configuration must use eligibility.mode: none to make a zero OAS assumption explicit.",
      });
    }
  }

  const oasEligibility = canonicalBenefits
    ? canonicalBenefits.oas.eligibility.mode === "partial"
      ? {
          mode: "partial" as const,
          qualifyingResidenceYearsAfter18:
            canonicalBenefits.oas.eligibility
              .qualifyingResidenceYearsAfter18,
          fraction:
            canonicalBenefits.oas.eligibility
              .qualifyingResidenceYearsAfter18 / 40,
        }
      : {
          mode: canonicalBenefits.oas.eligibility.mode,
          qualifyingResidenceYearsAfter18: null,
          fraction:
            canonicalBenefits.oas.eligibility.mode === "full" ? 1 : 0,
        }
    : {
        mode: "full" as const,
        qualifyingResidenceYearsAfter18: null,
        fraction: 1,
      };

  const benefitProvenance: Record<string, BaselineValue<unknown>> = {
    "person.cpp.amountSourceMode": localValue(
      cppSourceMode,
      canonicalBenefits
        ? "Configured CPP amount source mode"
        : "Legacy CPP scalar normalized as a configured amount through compatibility behaviour",
      window.endDate,
    ),
    "person.cpp.monthlyAmountAt65Today": cppAmountProvenance,
    "person.cpp.effectiveDate": {
      ...cppAmountProvenance,
      value: cppAmountProvenance.effectiveDate,
    },
    "person.cpp.startAge": localValue(
      cppStartAge,
      canonicalBenefits
        ? "Configured CPP claim age"
        : "Legacy CPP start age normalized through compatibility behaviour",
      window.endDate,
    ),
    "person.cpp.indexingRate": localValue(
      cppIndexingRate,
      canonicalBenefits
        ? "Configured CPP indexing assumption"
        : "Legacy assumptions.cppIndexing normalized through compatibility behaviour",
      window.endDate,
    ),
    "person.cpp.claimAdjustmentRule": canadianValue(
      "0.6% reduction per month before 65; 0.7% increase per month after 65",
      "Statutory CPP claim-age adjustment rule",
      cppClaimRules.effectiveDate,
      "statutory_program_default",
      cppClaimRules.referenceUrl,
    ),
    "person.oas.fullAmountSourceMode": localValue(
      oasSourceMode,
      canonicalBenefits
        ? "Configured OAS full-amount source mode"
        : "Legacy OAS scalar normalized as a configured full amount through compatibility behaviour",
      window.endDate,
    ),
    "person.oas.fullMonthlyAmountAt65Today": oasAmountProvenance,
    "person.oas.effectiveDate": {
      ...oasAmountProvenance,
      value: oasAmountProvenance.effectiveDate,
    },
    "person.oas.eligibility.mode": localValue(
      oasEligibility.mode,
      canonicalBenefits
        ? "Explicit OAS eligibility mode"
        : "Legacy OAS amount normalized with full eligibility through compatibility behaviour",
      window.endDate,
    ),
    "person.oas.eligibility.qualifyingResidenceYearsAfter18": localValue(
      oasEligibility.qualifyingResidenceYearsAfter18,
      "Explicit qualifying residence years for partial OAS eligibility, when applicable",
      window.endDate,
    ),
    "person.oas.eligibility.fraction": localValue(
      oasEligibility.fraction,
      oasEligibility.mode === "partial"
        ? "Configured qualifying residence years divided by 40"
        : "Resolved from the explicit OAS eligibility mode",
      window.endDate,
    ),
    "person.oas.startAge": localValue(
      oasStartAge,
      canonicalBenefits
        ? "Configured OAS claim age"
        : "Legacy OAS start age normalized through compatibility behaviour",
      window.endDate,
    ),
    "person.oas.indexingRate": localValue(
      oasIndexingRate,
      canonicalBenefits
        ? "Configured OAS indexing assumption"
        : "Legacy assumptions.oasIndexing normalized through compatibility behaviour",
      window.endDate,
    ),
    "person.oas.delayedClaimRule": canadianValue(
      "0.6% increase per month after age 65, to a maximum 36% at age 70",
      "Statutory OAS delayed-claim adjustment rule",
      oasClaimRules.effectiveDate,
      "statutory_program_default",
      oasClaimRules.delayedClaimReferenceUrl,
    ),
    "person.oas.age75IncreaseRule": canadianValue(
      "Permanent 10% increase beginning in the first modelled month after the age-75 boundary",
      "Statutory OAS age-75 increase rule",
      oasClaimRules.effectiveDate,
      "statutory_program_default",
      oasClaimRules.age75IncreaseReferenceUrl,
    ),
    "person.oas.age75IncreaseRate": canadianValue(
      oasClaimRules.age75IncreaseRate,
      "Statutory OAS age-75 increase rate",
      oasClaimRules.effectiveDate,
      "statutory_program_default",
      oasClaimRules.age75IncreaseReferenceUrl,
    ),
  };
  Object.assign(provenance, benefitProvenance);
  provenance.startDate = derivedValue(
    dataThrough,
    "Lunch Money data-through date used as the projection calendar anchor",
    dataThrough,
  );
  provenance.events = localValue(
    config.futureEvents,
    "Optional future events from private planner configuration",
    window.endDate,
  );
  provenance["surplusAllocation.reserveAccountIds"] = localValue(
    surplusAllocation.reserveAccountIds,
    config.configurationMode === "simple"
      ? "Reserve-member roles compiled into the resolved surplus reserve account set"
      : "Explicit cash accounts counted toward the surplus reserve from private planner configuration",
    window.endDate,
  );
  provenance["surplusAllocation.reserveRefillAccountId"] = localValue(
    surplusAllocation.reserveRefillAccountId,
    config.configurationMode === "simple"
      ? "Reserve-refill role compiled into the resolved reserve refill account"
      : "Explicit cash account receiving reserve refills and retained excess from private planner configuration",
    window.endDate,
  );
  provenance["surplusAllocation.targetCashReserveToday"] = localValue(
    surplusAllocation.targetCashReserveToday,
    config.configurationMode === "simple"
      ? "Reserve-building target compiled from the simple savings policy"
      : "Target cash reserve in today's dollars from private planner configuration",
    window.endDate,
  );
  provenance["surplusAllocation.reserveIndexingRate"] = localValue(
    surplusAllocation.reserveIndexingRate,
    config.configurationMode === "simple"
      ? "Reserve-building indexing compiled from the simple savings policy"
      : "Surplus reserve indexing rate from private planner configuration",
    window.endDate,
  );
  provenance["surplusAllocation.excess.mode"] = localValue(
    surplusAllocation.excess.mode,
    config.configurationMode === "simple"
      ? "Internal route used only for reserve-building savings above the reserve target"
      : "Surplus excess strategy from private planner configuration",
    window.endDate,
  );
  if (surplusAllocation.excess.mode === "allocate_to_account") {
    provenance["surplusAllocation.excess.destinationAccountId"] = localValue(
      surplusAllocation.excess.destinationAccountId,
      "Explicit non-registered surplus destination from private planner configuration",
      window.endDate,
    );
  }
  if (registeredAccountRoom) {
    const room = registeredAccountRoom;
    const roomProvenance: Array<[string, unknown, string, string]> = [
      ["registeredAccountRoom.tfsa.startingAvailableRoom.source", room.tfsa.startingAvailableRoom.source, "Configured personal TFSA starting-room source", room.tfsa.startingAvailableRoom.effectiveDate],
      ["registeredAccountRoom.tfsa.startingAvailableRoom.amount", room.tfsa.startingAvailableRoom.amount, "Configured personal TFSA room available at projection start", room.tfsa.startingAvailableRoom.effectiveDate],
      ["registeredAccountRoom.tfsa.startingAvailableRoom.effectiveDate", room.tfsa.startingAvailableRoom.effectiveDate, "Effective date of configured personal TFSA room", room.tfsa.startingAvailableRoom.effectiveDate],
      ["registeredAccountRoom.tfsa.annualNewRoom.futureIndexingRate", room.tfsa.annualNewRoom.futureIndexingRate, "Configured TFSA future-limit indexing", window.endDate],
      ["registeredAccountRoom.tfsa.annualNewRoom.roundingIncrement", room.tfsa.annualNewRoom.roundingIncrement, "Configured TFSA future-limit rounding increment", window.endDate],
      ["registeredAccountRoom.tfsa.carryForwardUnusedRoom", room.tfsa.carryForwardUnusedRoom, "Configured TFSA unused-room carry-forward assumption", window.endDate],
      ["registeredAccountRoom.rrsp.startingAvailableDeductionRoom.source", room.rrsp.startingAvailableDeductionRoom.source, "Configured personal RRSP starting-room source", room.rrsp.startingAvailableDeductionRoom.effectiveDate],
      ["registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount", room.rrsp.startingAvailableDeductionRoom.amount, "Configured personal RRSP deduction room available at projection start", room.rrsp.startingAvailableDeductionRoom.effectiveDate],
      ["registeredAccountRoom.rrsp.startingAvailableDeductionRoom.effectiveDate", room.rrsp.startingAvailableDeductionRoom.effectiveDate, "Effective date of configured personal RRSP room", room.rrsp.startingAvailableDeductionRoom.effectiveDate],
      ["registeredAccountRoom.rrsp.newRoom.annualCap.futureGrowthRate", room.rrsp.newRoom.annualCap.futureGrowthRate, "Configured future RRSP cap growth", window.endDate],
      ["registeredAccountRoom.rrsp.newRoom.annualCap.futureRoundingIncrement", room.rrsp.newRoom.annualCap.futureRoundingIncrement, "Configured future RRSP cap rounding increment", window.endDate],
      ["registeredAccountRoom.rrsp.carryForwardUnusedRoom", room.rrsp.carryForwardUnusedRoom, "Configured RRSP unused-room carry-forward assumption", window.endDate],
      ["registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.calendarYear", room.rrsp.newRoom.startYearBeforeProjectionMonth.calendarYear, "Explicit pre-projection RRSP room-generation calendar year", window.endDate],
      ["registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.eligibleEarnedIncome", room.rrsp.newRoom.startYearBeforeProjectionMonth.eligibleEarnedIncome, "Explicit pre-projection eligible earned income", window.endDate],
      ["registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.pensionAdjustment", room.rrsp.newRoom.startYearBeforeProjectionMonth.pensionAdjustment, "Explicit pre-projection pension adjustment", window.endDate],
      ["registeredAccountRoom.rrsp.newRoom.startYearBeforeProjectionMonth.otherRoomReduction", room.rrsp.newRoom.startYearBeforeProjectionMonth.otherRoomReduction, "Explicit pre-projection other room reduction", window.endDate],
    ];
    for (const [field, value, description, date] of roomProvenance) {
      provenance[field] = localValue(value, description, date);
    }
    const tfsaLimit = TFSA_ANNUAL_LIMITS[0]!;
    provenance[`registeredAccountRoom.tfsa.annualNewRoom.${tfsaLimit.calendarYear}`] =
      canadianValue(tfsaLimit.amount, "Published TFSA annual dollar limit", tfsaLimit.effectiveDate, "statutory_annual_limit", tfsaLimit.referenceUrl);
    provenance["registeredAccountRoom.tfsa.withdrawalRoomRecredit"] =
      canadianValue("next_calendar_year", "TFSA withdrawal room is restored in the next calendar year", "2026-01-01", "statutory_program_default", TFSA_WITHDRAWAL_REFERENCE_URL);
    provenance["registeredAccountRoom.rrsp.newRoom.earnedIncomeRate"] =
      canadianValue(RRSP_EARNED_INCOME_RATE, "Statutory RRSP earned-income rate", "2026-01-01", "statutory_program_default", RRSP_FORMULA_REFERENCE_URL);
    for (const cap of RRSP_ANNUAL_LIMITS) {
      provenance[`registeredAccountRoom.rrsp.newRoom.annualCap.${cap.calendarYear}`] =
        canadianValue(cap.amount, "Published RRSP annual dollar limit", cap.effectiveDate, "statutory_annual_limit", cap.referenceUrl);
    }
  }

  if (
    contributionWaterfall.mode === "fixed_source_compatibility" &&
    contributionWaterfall.routes.length > 0
  ) {
    warnings.push({
      code: "contribution_waterfall_compatibility",
      severity: "warning",
      message:
        "Contribution waterfall configuration is omitted; each planned contribution uses a fixed source-only route and room-constrained overflow remains unallocated.",
    });
  }
  provenance["contributionWaterfall.mode"] = localValue(
    contributionWaterfall.mode,
    contributionWaterfall.mode === "simple_policy"
      ? "Simple savings intent compiled into deterministic workplace-first and personal contribution routes"
      : contributionWaterfall.mode === "canonical"
        ? "Explicit contribution waterfall from private planner configuration"
        : "Contribution sources normalized to fixed source-only compatibility routes",
    window.endDate,
  );
  for (const [index, route] of contributionWaterfall.routes.entries()) {
    provenance[`contributionWaterfall.routes.${index}.sourceAccountId`] =
      localValue(route.sourceAccountId, "Contribution waterfall route source", window.endDate);
    provenance[`contributionWaterfall.routes.${index}.destinationAccountIds`] =
      localValue(route.destinationAccountIds, "Ordered contribution waterfall destinations", window.endDate);
  }
  provenance["contributionWaterfall.surplusDestinationAccountIds"] =
    localValue(
      contributionWaterfall.surplusDestinationAccountIds,
      "Ordered surplus contribution waterfall destinations",
      window.endDate,
    );
  provenance["savingsPolicy.mode"] = localValue(
    savingsPolicy.mode,
    savingsPolicy.mode === "simple"
      ? "Owner-facing savings intent compiled into resolved projection inputs"
      : "Advanced routing configuration remains authoritative",
    window.endDate,
  );
  if (savingsPolicy.mode === "simple") {
    for (const account of projectionAccounts.filter(
      (item) => item.origin === "lunchmoney",
    )) {
      const roles = resolvedMapping.get(account.id)?.roles;
      if (roles && roles.length > 0) {
        provenance[`accounts.${account.id}.roles`] = localValue(
          roles,
          "Owner-facing account roles from simple planner configuration",
          window.endDate,
        );
      }
    }
    const accountReferences: Array<[string, unknown, string]> = [
      [
        "savingsPolicy.operatingCashAccountId",
        savingsPolicy.operatingCashAccountId,
        "Operating-cash role compiled to the account retaining unplanned cash",
      ],
      [
        "savingsPolicy.reserveAccountIds",
        savingsPolicy.reserveAccountIds,
        "Reserve-member roles compiled to the combined reserve account set",
      ],
      [
        "savingsPolicy.reserveRefillAccountId",
        savingsPolicy.reserveRefillAccountId,
        "Reserve-refill role compiled to the reserve deposit account",
      ],
      [
        "savingsPolicy.personalTfsaAccountId",
        savingsPolicy.personalTfsaAccountId,
        "Personal-TFSA role compiled to the first personal destination",
      ],
      [
        "savingsPolicy.personalRrspAccountId",
        savingsPolicy.personalRrspAccountId,
        "Personal-RRSP role compiled to the second personal destination",
      ],
      [
        "savingsPolicy.workplaceRrspAccountId",
        savingsPolicy.workplaceRrspAccountId,
        "Workplace-RRSP role compiled to the income-withheld workplace destination",
      ],
      [
        "savingsPolicy.taxableAccountId",
        savingsPolicy.taxableAccountId,
        savingsPolicy.taxableAccountOrigin === "lunchmoney"
          ? "Personal-taxable role compiled to the imported taxable destination"
          : "Automatic zero-balance future taxable destination compiled because no imported personal-taxable role was selected",
      ],
    ];
    for (const [field, value, description] of accountReferences) {
      provenance[field] = localValue(value, description, window.endDate);
    }
    provenance["savingsPolicy.taxableAccountOrigin"] = localValue(
      savingsPolicy.taxableAccountOrigin,
      "Resolved origin of the personal taxable destination",
      window.endDate,
    );
    provenance["savingsPolicy.unplannedCash"] = localValue(
      savingsPolicy.unplannedCash,
      "Unplanned positive cash is retained in operating cash",
      window.endDate,
    );
    provenance["savingsPolicy.personalOrder"] = localValue(
      savingsPolicy.personalOrder,
      "Personal investment order compiled from simple savings policy",
      window.endDate,
    );
    provenance["savingsPolicy.workplaceRoomPriority"] = localValue(
      savingsPolicy.workplaceRoomPriority,
      "Workplace RRSP receives first claim on the global RRSP room pool",
      window.endDate,
    );
    provenance["savingsPolicy.workplaceOverflow"] = localValue(
      savingsPolicy.workplaceOverflow,
      "Workplace RRSP overflow remains visibly unallocated",
      window.endDate,
    );
    provenance["savingsPolicy.reserveAfterTarget"] = localValue(
      savingsPolicy.reserveAfterTarget,
      "Reserve-building savings above the reserve target use the personal investment order",
      window.endDate,
    );
    provenance["savingsPolicy.reserveBuilding.targetToday"] = localValue(
      surplusAllocation.targetCashReserveToday,
      "Owner-facing reserve-building target in today's dollars",
      window.endDate,
    );
    provenance["savingsPolicy.reserveBuilding.indexingRate"] = localValue(
      surplusAllocation.reserveIndexingRate,
      "Owner-facing reserve-building target indexing rate",
      window.endDate,
    );
    for (const phase of savingsPolicy.reserveBuildingPhases) {
      const prefix = `savingsPolicy.reserveBuilding.phases.${phase.id}`;
      for (const [field, value] of Object.entries(phase)) {
        provenance[`${prefix}.${field}`] = localValue(
          value,
          "Reserve-building savings phase from simple planner configuration",
          window.endDate,
        );
      }
    }
    const simpleRoom = config.registeredRoom!;
    const simpleRoomProvenance: Array<[string, unknown, string]> = [
      [
        "registeredRoom.tfsa.availableAtStart",
        simpleRoom.tfsa.availableAtStart,
        "Owner-supplied TFSA room available at projection start",
      ],
      [
        "registeredRoom.tfsa.asOf",
        simpleRoom.tfsa.asOf,
        "Effective date of owner-supplied TFSA starting room",
      ],
      [
        "registeredRoom.rrsp.availableAtStart",
        simpleRoom.rrsp.availableAtStart,
        "Owner-supplied RRSP deduction room available at projection start",
      ],
      [
        "registeredRoom.rrsp.asOf",
        simpleRoom.rrsp.asOf,
        "Effective date of owner-supplied RRSP starting room",
      ],
      [
        "registeredRoom.rrsp.beforeProjectionStart.eligibleEarnedIncome",
        beforeProjectionStart?.eligibleEarnedIncome ?? 0,
        "Explicit eligible earned income before the projection-start month",
      ],
      [
        "registeredRoom.rrsp.beforeProjectionStart.pensionAdjustment",
        beforeProjectionStart?.pensionAdjustment ?? 0,
        "Explicit pension adjustment before the projection-start month",
      ],
      [
        "registeredRoom.rrsp.beforeProjectionStart.otherReduction",
        beforeProjectionStart?.otherReduction ?? 0,
        "Explicit other room reduction before the projection-start month",
      ],
    ];
    for (const [field, value, description] of simpleRoomProvenance) {
      provenance[field] = localValue(value, description, window.endDate);
    }
  }

  const projectionInputs = validateProjectionInputs({
    startDate: dataThrough,
    endAge: config.projectionEndAge,
    annualInflation: config.assumptions.inflation,
    monthlyEssentialSpendingToday: monthlyEssential,
    monthlyDiscretionarySpendingToday: monthlyDiscretionary,
    retirementGoalToday: config.retirementGoal,
    tax: {
      effectiveTaxRate: config.assumptions.effectiveTaxRate,
      oasRecoveryThresholdToday: config.assumptions.oasRecoveryThreshold,
      oasRecoveryRate: config.assumptions.oasRecoveryRate,
    },
    person: {
      currentAge: config.currentAge,
      retirementAge: config.retirementAge,
      employmentIncomePhases,
      annualPensionToday: config.assumptions.pensionAnnualIncome,
      pensionStartAge: config.assumptions.pensionStartAge,
      pensionIndexingRate: config.assumptions.pensionIndexing,
      cpp: {
        startAge: cppStartAge,
        monthlyAmountAt65Today: cppMonthlyAmountAt65Today,
        indexingRate: cppIndexingRate,
      },
      oas: {
        startAge: oasStartAge,
        fullMonthlyAmountAt65Today: oasFullMonthlyAmountAt65Today,
        eligibility: oasEligibility,
        indexingRate: oasIndexingRate,
        age75IncreaseRate: oasClaimRules.age75IncreaseRate,
      },
      rrifConversionAge: config.assumptions.rrifConversionAge,
    },
    accounts: projectionAccounts,
    ...(registeredAccountRoom
      ? { registeredAccountRoom }
      : {}),
    contributionWaterfall,
    surplusAllocation,
    savingsPolicy,
    events: config.futureEvents,
  });

  return {
    schemaVersion: "1.5",
    connection,
    projectionInputs,
    provenance,
    derived: {
      accountBalances: accountBaselines,
      monthlyIncome: {
        trailingTotal: round(incomeTotal),
        monthlyAverage: monthlyIncome,
        transactionCount: incomeCount,
        basis: "net_deposited_cash",
      },
      essentialSpending: {
        trailingTotal: round(essentialTotal),
        monthlyAverage: monthlyEssential,
        transactionCount: essentialCount,
      },
      discretionarySpending: {
        trailingTotal: round(discretionaryTotal),
        monthlyAverage: monthlyDiscretionary,
        transactionCount: discretionaryCount,
      },
      investmentContributions: {
        trailingTotal: round(resolvedMonthlyContributions * window.trailingMonths),
        monthlyAverage: resolvedMonthlyContributions,
        transactionCount: contributionTransactionCount,
        accounts: contributionAccounts,
      },
      recurringExpenses: {
        monthlyTotal: round(recurringExpenses.reduce((total, item) => total + item.monthlyAmount, 0)),
        count: recurringExpenses.length,
        items: recurringExpenses,
      },
    },
    cashFlowAudit: {
      income: {
        trailingTotal: round(incomeTotal),
        monthlyAverage: monthlyIncome,
        transactionCount: incomeCount,
        breakdown: auditBreakdown(incomeAudit, window.trailingMonths, monthlyIncome),
      },
      essentialSpending: {
        trailingTotal: round(essentialTotal),
        monthlyAverage: monthlyEssential,
        transactionCount: essentialCount,
        breakdown: auditBreakdown(essentialAudit, window.trailingMonths, monthlyEssential),
      },
      discretionarySpending: {
        trailingTotal: round(discretionaryTotal),
        monthlyAverage: monthlyDiscretionary,
        transactionCount: discretionaryCount,
        breakdown: auditBreakdown(
          discretionaryAudit,
          window.trailingMonths,
          monthlyDiscretionary,
        ),
      },
      investmentContributions: {
        trailingTotal: round(resolvedMonthlyContributions * window.trailingMonths),
        monthlyAverage: resolvedMonthlyContributions,
        transactionCount: contributionTransactionCount,
        accounts: contributionAuditAccounts,
      },
      recurringExpenses: {
        monthlyTotal: round(recurringExpenses.reduce((total, item) => total + item.monthlyAmount, 0)),
        count: recurringExpenses.length,
        items: recurringAuditItems,
      },
    },
    dataThrough,
    transactionWindow: { ...window, transactionCount: transactions.length },
    recordsAnalyzed,
    warnings,
    unmappedAccounts,
    unmappedCategories,
  };
}
