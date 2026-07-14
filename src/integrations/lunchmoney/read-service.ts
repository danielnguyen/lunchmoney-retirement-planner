import type { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";

export class LunchMoneyReadService {
  constructor(private readonly client: LunchMoneyClient) {}

  getCategories() {
    return this.client.categories.getAll();
  }

  getTransactions(startDate: string, endDate: string) {
    return this.client.transactions.getAll({
      start_date: startDate,
      end_date: endDate,
    });
  }

  getManualAccounts() {
    return this.client.manualAccounts.getAll();
  }

  getPlaidAccounts() {
    return this.client.plaidAccounts.getAll();
  }

  getRecurringItems() {
    return this.client.recurringItems.getAll();
  }
}
