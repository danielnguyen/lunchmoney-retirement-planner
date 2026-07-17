import { LunchMoneyError, type LunchMoneyClient } from "@lunch-money/lunch-money-js-v2";
import { describe, expect, it, vi } from "vitest";
import {
  LunchMoneyReadService,
  createLunchMoneyReadService,
  sanitizeLunchMoneyError,
} from "@/src/integrations/lunchmoney/read-service";

describe("Lunch Money read-only boundary", () => {
  it("exposes retrieval methods only", () => {
    expect(Object.getOwnPropertyNames(LunchMoneyReadService.prototype).sort()).toEqual([
      "constructor",
      "getCategories",
      "getManualAccounts",
      "getPlaidAccounts",
      "getRecurringItems",
      "getTransactions",
    ]);
    const methodNames = Object.getOwnPropertyNames(LunchMoneyReadService.prototype).join(" ");
    expect(methodNames).not.toMatch(/create|update|delete|split|group|trigger/i);
  });

  it("blocks a missing token without returning it", () => {
    expect(() => createLunchMoneyReadService("")).toThrow("LUNCHMONEY_API_TOKEN is not configured");
  });

  it("sanitizes an invalid-token API response", () => {
    const sanitized = sanitizeLunchMoneyError(
      new LunchMoneyError("raw upstream detail", 401, { token: "must-not-escape" }),
    );
    expect(sanitized.code).toBe("lunchmoney_unauthorized");
    expect(sanitized.status).toBe(401);
    expect(sanitized.message).toBe("Lunch Money rejected the configured API token.");
    expect(JSON.stringify(sanitized)).not.toContain("must-not-escape");
  });

  it("reads every transaction page without requesting parents that would double count", async () => {
    const getAll = vi
      .fn()
      .mockResolvedValueOnce({ transactions: [{ id: 1 }], hasMore: true })
      .mockResolvedValueOnce({ transactions: [{ id: 2 }], hasMore: false });
    const client = { transactions: { getAll } } as unknown as LunchMoneyClient;
    const transactions = await new LunchMoneyReadService(client).getTransactions(
      "2025-07-14",
      "2026-07-14",
    );
    expect(transactions.map((transaction) => transaction.id)).toEqual([1, 2]);
    expect(getAll).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        start_date: "2025-07-14",
        end_date: "2026-07-14",
        include_group_children: true,
        offset: 0,
      }),
    );
    expect(getAll).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 500 }));
    expect(getAll.mock.calls[0]?.[0]).not.toHaveProperty("include_split_parents");
  });
});
