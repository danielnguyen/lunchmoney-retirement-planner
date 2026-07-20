import type { BaselineValue } from "@/src/domain/defaults/types";
import type {
  ContributionFunding,
  ProjectionInputs,
} from "@/src/domain/projection/types";

export type ConnectionStatus = {
  status: "connected";
  checkedAt: string;
  message: string;
};

export const baselineWarningCodes = [
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
  "cpp_canadian_reference_in_use",
  "oas_canadian_reference_in_use",
  "legacy_zero_cpp_amount",
  "legacy_zero_oas_amount",
  "contribution_waterfall_compatibility",
  "liability_payment_mismatch",
] as const;

export type BaselineWarningCode = (typeof baselineWarningCodes)[number];

export type BaselineWarning = {
  code: BaselineWarningCode;
  severity: "warning" | "error";
  message: string;
  identifier?: string;
  name?: string;
};

export type UnmappedAccount = {
  id: string;
  lunchMoneyId: number | null;
  source: "manual" | "plaid" | "cash";
  name: string;
  status: string;
};

export type UnmappedCategory = {
  id: string;
  lunchMoneyId: number | null;
  name: string;
  transactionCount: number;
};

export type AccountBaseline = {
  id: string;
  lunchMoneyId: number | null;
  source: "manual" | "plaid" | "cash";
  name: string;
  plannerType: ProjectionInputs["accounts"][number]["type"] | "debt";
  balance: number;
  balanceAsOf: string;
  monthlyContribution: number;
  contributionSource: "lunchmoney_derived" | "local_configuration";
  contributionFunding: ContributionFunding | undefined;
};

export type DerivedMetric = {
  trailingTotal: number;
  monthlyAverage: number;
  transactionCount: number;
};

export type TransactionAuditBreakdown = {
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  transactionCount: number;
  trailingTotal: number;
  monthlyAverage: number;
};

export type TransactionMetricAudit = DerivedMetric & {
  breakdown: TransactionAuditBreakdown[];
};

export type ContributionAccountAudit = {
  accountId: string;
  accountName: string;
  monthlyAverage: number;
  funding: "cash" | "income_withheld";
  source: "lunchmoney_derived" | "local_configuration";
};

export type CashFlowAudit = {
  income: TransactionMetricAudit;
  essentialSpending: TransactionMetricAudit;
  discretionarySpending: TransactionMetricAudit;
  investmentContributions: DerivedMetric & {
    accounts: ContributionAccountAudit[];
  };
  debtPayments: TransactionMetricAudit & {
    liabilities: Array<{
      liabilityId: string;
      liabilityRole: "primary_mortgage" | null;
      monthlyAverage: number;
      scheduleReplaced: boolean;
    }>;
  };
  recurringExpenses: {
    monthlyTotal: number;
    count: number;
    items: Array<{
      description: string;
      classification: "essential" | "discretionary";
      monthlyAmount: number;
      accountName: string;
      categoryName: string;
    }>;
  };
};

export type RecurringExpense = {
  id: number;
  description: string;
  classification: "essential" | "discretionary";
  monthlyAmount: number;
  accountId: string;
  categoryId: string;
};

export type DerivedBaseline = {
  accountBalances: AccountBaseline[];
  monthlyIncome: DerivedMetric & { basis: "net_deposited_cash" };
  essentialSpending: DerivedMetric;
  discretionarySpending: DerivedMetric;
  investmentContributions: DerivedMetric & {
    accounts: Array<{
      accountId: string;
      monthlyAverage: number;
      source: "lunchmoney_derived" | "local_configuration";
      funding: ContributionFunding;
    }>;
  };
  debtPayments: DerivedMetric;
  recurringExpenses: {
    monthlyTotal: number;
    count: number;
    items: RecurringExpense[];
  };
};

export type CurrentBaseline = {
  schemaVersion: "1.6";
  connection: ConnectionStatus;
  projectionInputs: ProjectionInputs;
  provenance: Record<string, BaselineValue<unknown>>;
  derived: DerivedBaseline;
  cashFlowAudit: CashFlowAudit;
  dataThrough: string;
  transactionWindow: {
    startDate: string;
    endDate: string;
    trailingMonths: number;
    transactionCount: number;
  };
  recordsAnalyzed: {
    accounts: number;
    categories: number;
    recurringItems: number;
    transactions: number;
  };
  warnings: BaselineWarning[];
  unmappedAccounts: UnmappedAccount[];
  unmappedCategories: UnmappedCategory[];
};

export type BaselineExportContext = Pick<
  CurrentBaseline,
  | "connection"
  | "projectionInputs"
  | "provenance"
  | "derived"
  | "cashFlowAudit"
  | "dataThrough"
  | "transactionWindow"
  | "recordsAnalyzed"
  | "warnings"
  | "unmappedAccounts"
  | "unmappedCategories"
>;
