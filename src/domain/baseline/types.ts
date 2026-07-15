import type { BaselineValue } from "@/src/domain/defaults/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";

export type ConnectionStatus = {
  status: "connected";
  checkedAt: string;
  message: string;
};

export type BaselineWarning = {
  code: string;
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
  plannerType: ProjectionInputs["accounts"][number]["type"];
  balance: number;
  balanceAsOf: string;
  monthlyContribution: number;
  contributionSource: "lunchmoney_derived" | "local_configuration";
};

export type DerivedMetric = {
  trailingTotal: number;
  monthlyAverage: number;
  transactionCount: number;
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
  monthlyIncome: DerivedMetric;
  essentialSpending: DerivedMetric;
  discretionarySpending: DerivedMetric;
  investmentContributions: DerivedMetric & {
    accounts: Array<{
      accountId: string;
      monthlyAverage: number;
      source: "lunchmoney_derived" | "local_configuration";
    }>;
  };
  recurringExpenses: {
    monthlyTotal: number;
    count: number;
    items: RecurringExpense[];
  };
};

export type CurrentBaseline = {
  schemaVersion: "1.0";
  connection: ConnectionStatus;
  projectionInputs: ProjectionInputs;
  provenance: Record<string, BaselineValue<unknown>>;
  derived: DerivedBaseline;
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
  | "dataThrough"
  | "transactionWindow"
  | "recordsAnalyzed"
  | "warnings"
  | "unmappedAccounts"
  | "unmappedCategories"
>;
