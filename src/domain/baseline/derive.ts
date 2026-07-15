import type {
  Category,
  ChildCategory,
  ManualAccount,
  PlaidAccount,
  RecurringItem,
  Transaction,
} from "@lunch-money/lunch-money-js-v2";
import type { AccountMapping, CategoryMapping, PlannerConfig } from "@/src/config/types";
import type { BaselineValue } from "@/src/domain/defaults/types";
import { validateProjectionInputs, type AccountType, type ProjectionInputs } from "@/src/domain/projection/types";
import type { LunchMoneyData } from "@/src/integrations/lunchmoney/read-service";
import { PlannerRuntimeError } from "@/src/runtime/errors";
import type {
  AccountBaseline,
  BaselineWarning,
  CurrentBaseline,
  RecurringExpense,
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

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
    if (details.classification === "essential") {
      essentialTotal += amount;
      essentialCount += 1;
    } else if (details.classification === "discretionary") {
      discretionaryTotal += amount;
      discretionaryCount += 1;
    } else if (details.classification === "income") {
      incomeTotal -= amount;
      incomeCount += 1;
    } else if (details.classification === "investment_contribution") {
      const target = resolveContributionTarget(details, sourceAccount, categoryId);
      const contribution = details.contributionDirection === "credit" ? -amount : amount;
      contributionTransactionTotal += contribution;
      contributionTransactionCount += 1;
      if (target) contributionTotals.set(target, (contributionTotals.get(target) ?? 0) + contribution);
    }
  }

  const recurringExpenses: RecurringExpense[] = [];
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
    });
    projectionAccounts.push({
      id: account.canonicalId,
      label: account.name,
      type,
      openingBalance: balance,
      annualReturn,
      monthlyContributionToday: monthlyContribution,
      contributionIndexingRate: config.assumptions.contributionIndexing,
      withdrawalPriority: mapping.withdrawalPriority ?? 999,
      allocation,
    });
    provenance[`accounts.${account.canonicalId}.openingBalance`] = derivedValue(
      balance,
      `Lunch Money ${account.source} account balance for ${account.name}`,
      account.balanceAsOf,
    );
    provenance[`accounts.${account.canonicalId}.annualReturn`] = localValue(
      annualReturn,
      `Return assumption for ${account.canonicalId}`,
      window.endDate,
    );
    provenance[`accounts.${account.canonicalId}.monthlyContributionToday`] =
      contributionSource === "local_configuration"
        ? localValue(monthlyContribution, `Manual monthly contribution for ${account.canonicalId}`, window.endDate)
        : derivedValue(
            monthlyContribution,
            `Trailing ${window.trailingMonths}-month average contribution for ${account.canonicalId}`,
            window.endDate,
          );
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
    provenance[`accounts.${account.canonicalId}.contributionIndexingRate`] = localValue(
      config.assumptions.contributionIndexing,
      `Contribution indexing assumption for ${account.canonicalId}`,
      window.endDate,
    );
  }

  const blocking =
    unmappedAccounts.length > 0 ||
    unmappedCategories.length > 0 ||
    warnings.some((warning) => warning.severity === "error");
  const dataThrough = transactions.reduce(
    (latest, transaction) => (transaction.date > latest ? transaction.date : latest),
    "",
  ) || window.endDate;
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
      "Lunch Money connected, but planner.local.json needs additional mappings or assumptions before a projection can run.",
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

  const monthlyIncome = round(incomeTotal / window.trailingMonths);
  const monthlyEssential = round(essentialTotal / window.trailingMonths);
  const monthlyDiscretionary = round(discretionaryTotal / window.trailingMonths);
  const contributionAccounts = accountBaselines
    .filter((account) => ["tfsa", "rrsp_rrif", "non_registered"].includes(account.plannerType))
    .map((account) => ({
      accountId: account.id,
      monthlyAverage: account.monthlyContribution,
      source: account.contributionSource,
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
  provenance.annualEmploymentIncomeToday = derivedValue(
    round(monthlyIncome * 12),
    `Annualized trailing ${window.trailingMonths}-month average of income transactions`,
    dataThrough,
  );

  const localFields: Record<string, number> = {
    currentAge: config.currentAge,
    retirementAge: config.retirementAge,
    endAge: config.projectionEndAge,
    cppStartAge: config.cppStartAge,
    oasStartAge: config.oasStartAge,
    cppMonthlyAmountAt65: config.cppMonthlyAmountAt65,
    oasMonthlyAmountAt65: config.oasMonthlyAmountAt65,
    retirementGoalToday: config.retirementGoal,
    annualInflation: config.assumptions.inflation,
    effectiveTaxRate: config.assumptions.effectiveTaxRate,
    oasRecoveryThresholdToday: config.assumptions.oasRecoveryThreshold,
    oasRecoveryRate: config.assumptions.oasRecoveryRate,
    "person.currentAge": config.currentAge,
    "person.retirementAge": config.retirementAge,
    "person.annualIncomeGrowth": config.assumptions.incomeGrowth,
    "person.annualPensionToday": config.assumptions.pensionAnnualIncome,
    "person.pensionStartAge": config.assumptions.pensionStartAge,
    "person.pensionIndexingRate": config.assumptions.pensionIndexing,
    "person.cpp.startAge": config.cppStartAge,
    "person.cpp.monthlyAmountAt65Today": config.cppMonthlyAmountAt65,
    "person.cpp.indexingRate": config.assumptions.cppIndexing,
    "person.oas.startAge": config.oasStartAge,
    "person.oas.monthlyAmountAt65Today": config.oasMonthlyAmountAt65,
    "person.oas.indexingRate": config.assumptions.oasIndexing,
    "person.rrifConversionAge": config.assumptions.rrifConversionAge,
    "tax.effectiveTaxRate": config.assumptions.effectiveTaxRate,
    "tax.oasRecoveryThresholdToday": config.assumptions.oasRecoveryThreshold,
    "tax.oasRecoveryRate": config.assumptions.oasRecoveryRate,
    transactionTrailingMonths: config.transactionTrailingMonths,
  };
  for (const [field, value] of Object.entries(localFields)) {
    provenance[field] = localValue(value, `${field} from private planner configuration`, window.endDate);
  }
  provenance.startYear = derivedValue(
    Number(window.endDate.slice(0, 4)),
    "Calendar year containing the Lunch Money data-through date",
    dataThrough,
  );
  provenance.events = localValue(
    config.futureEvents,
    "Optional future events from private planner configuration",
    window.endDate,
  );

  const projectionInputs = validateProjectionInputs({
    startYear: Number(window.endDate.slice(0, 4)),
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
      annualEmploymentIncomeToday: round(monthlyIncome * 12),
      annualIncomeGrowth: config.assumptions.incomeGrowth,
      annualPensionToday: config.assumptions.pensionAnnualIncome,
      pensionStartAge: config.assumptions.pensionStartAge,
      pensionIndexingRate: config.assumptions.pensionIndexing,
      cpp: {
        startAge: config.cppStartAge,
        monthlyAmountAt65Today: config.cppMonthlyAmountAt65,
        indexingRate: config.assumptions.cppIndexing,
      },
      oas: {
        startAge: config.oasStartAge,
        monthlyAmountAt65Today: config.oasMonthlyAmountAt65,
        indexingRate: config.assumptions.oasIndexing,
      },
      rrifConversionAge: config.assumptions.rrifConversionAge,
    },
    accounts: projectionAccounts,
    events: config.futureEvents,
  });

  return {
    schemaVersion: "1.0",
    connection,
    projectionInputs,
    provenance,
    derived: {
      accountBalances: accountBaselines,
      monthlyIncome: {
        trailingTotal: round(incomeTotal),
        monthlyAverage: monthlyIncome,
        transactionCount: incomeCount,
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
    dataThrough,
    transactionWindow: { ...window, transactionCount: transactions.length },
    recordsAnalyzed,
    warnings,
    unmappedAccounts,
    unmappedCategories,
  };
}
