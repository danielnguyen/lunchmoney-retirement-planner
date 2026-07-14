import { LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";

export function createLunchMoneyClient(apiToken = process.env.LUNCHMONEY_API_TOKEN) {
  if (!apiToken) {
    throw new Error("LUNCHMONEY_API_TOKEN is not configured");
  }

  return new LunchMoneyClient({
    apiKey: apiToken,
    baseUrl: "https://api.lunchmoney.dev/v2",
  });
}
