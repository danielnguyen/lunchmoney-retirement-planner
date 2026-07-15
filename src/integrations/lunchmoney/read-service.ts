import {
  LunchMoneyClient,
  LunchMoneyError,
  type Category,
  type ManualAccount,
  type PlaidAccount,
  type RecurringItem,
  type Transaction,
} from "@lunch-money/lunch-money-js-v2";
import { PlannerRuntimeError } from "@/src/runtime/errors";

const TRANSACTION_PAGE_SIZE = 500;
const MAX_TRANSACTION_PAGES = 1000;

export type LunchMoneyData = {
  manualAccounts: ManualAccount[];
  plaidAccounts: PlaidAccount[];
  categories: Category[];
  recurringItems: RecurringItem[];
  transactions: Transaction[];
};

export interface LunchMoneyReader {
  getCategories(): Promise<Category[]>;
  getTransactions(startDate: string, endDate: string): Promise<Transaction[]>;
  getManualAccounts(): Promise<ManualAccount[]>;
  getPlaidAccounts(): Promise<PlaidAccount[]>;
  getRecurringItems(): Promise<RecurringItem[]>;
}

export class LunchMoneyReadService implements LunchMoneyReader {
  constructor(private readonly client: LunchMoneyClient) {}

  getCategories(): Promise<Category[]> {
    return this.client.categories.getAll();
  }

  async getTransactions(startDate: string, endDate: string): Promise<Transaction[]> {
    const transactions: Transaction[] = [];
    for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
      const result = await this.client.transactions.getAll({
        start_date: startDate,
        end_date: endDate,
        include_group_children: true,
        limit: TRANSACTION_PAGE_SIZE,
        offset: page * TRANSACTION_PAGE_SIZE,
      });
      transactions.push(...result.transactions);
      if (!result.hasMore) return transactions;
    }
    throw new PlannerRuntimeError(
      "lunchmoney_pagination_limit",
      "Lunch Money returned more transaction pages than the planner can safely analyse.",
      502,
    );
  }

  getManualAccounts(): Promise<ManualAccount[]> {
    return this.client.manualAccounts.getAll();
  }

  getPlaidAccounts(): Promise<PlaidAccount[]> {
    return this.client.plaidAccounts.getAll();
  }

  getRecurringItems(): Promise<RecurringItem[]> {
    return this.client.recurringItems.getAll();
  }
}

export function createLunchMoneyReadService(
  apiToken = process.env.LUNCHMONEY_API_TOKEN,
): LunchMoneyReadService {
  if (!apiToken) {
    throw new PlannerRuntimeError(
      "lunchmoney_token_missing",
      "LUNCHMONEY_API_TOKEN is not configured.",
      503,
    );
  }
  const client = new LunchMoneyClient({
    apiKey: apiToken,
    baseUrl: "https://api.lunchmoney.dev/v2",
  });
  return new LunchMoneyReadService(client);
}

export function sanitizeLunchMoneyError(error: unknown): PlannerRuntimeError {
  if (error instanceof PlannerRuntimeError) return error;
  if (error instanceof LunchMoneyError && error.status === 401) {
    return new PlannerRuntimeError(
      "lunchmoney_unauthorized",
      "Lunch Money rejected the configured API token.",
      401,
    );
  }
  if (error instanceof LunchMoneyError && error.status === 429) {
    return new PlannerRuntimeError(
      "lunchmoney_rate_limited",
      "Lunch Money rate-limited the request. Try refreshing later.",
      503,
    );
  }
  const status = error instanceof LunchMoneyError ? error.status : undefined;
  return new PlannerRuntimeError(
    "lunchmoney_request_failed",
    status
      ? `Lunch Money request failed with HTTP ${status}.`
      : "Lunch Money could not be reached.",
    502,
  );
}

export async function readLunchMoneyData(
  reader: LunchMoneyReader,
  startDate: string,
  endDate: string,
  prefetchedCategories?: Category[],
): Promise<LunchMoneyData> {
  try {
    const [manualAccounts, plaidAccounts, categories, recurringItems, transactions] =
      await Promise.all([
        reader.getManualAccounts(),
        reader.getPlaidAccounts(),
        prefetchedCategories ?? reader.getCategories(),
        reader.getRecurringItems(),
        reader.getTransactions(startDate, endDate),
      ]);
    return { manualAccounts, plaidAccounts, categories, recurringItems, transactions };
  } catch (error) {
    throw sanitizeLunchMoneyError(error);
  }
}
