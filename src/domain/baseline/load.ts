import { loadPlannerConfig } from "@/src/config/loader";
import type { PlannerConfig } from "@/src/config/types";
import {
  createLunchMoneyReadService,
  readLunchMoneyData,
  sanitizeLunchMoneyError,
  type LunchMoneyReader,
} from "@/src/integrations/lunchmoney/read-service";
import type { CurrentBaseline } from "./types";
import { deriveCurrentBaseline } from "./derive";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function trailingWindow(now: Date, trailingMonths: number) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const originalDay = end.getUTCDate();
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - trailingMonths);
  const lastDay = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
  ).getUTCDate();
  start.setUTCDate(Math.min(originalDay, lastDay));
  return {
    startDate: isoDate(start),
    endDate: isoDate(end),
    trailingMonths,
  };
}

export async function loadCurrentBaseline(options: {
  reader?: LunchMoneyReader;
  config?: PlannerConfig;
  now?: Date;
} = {}): Promise<CurrentBaseline> {
  const reader = options.reader ?? createLunchMoneyReadService();
  let categories: Awaited<ReturnType<LunchMoneyReader["getCategories"]>>;
  try {
    categories = await reader.getCategories();
  } catch (error) {
    throw sanitizeLunchMoneyError(error);
  }
  const config = options.config ?? (await loadPlannerConfig());
  const now = options.now ?? new Date();
  const window = trailingWindow(now, config.transactionTrailingMonths);
  const data = await readLunchMoneyData(
    reader,
    window.startDate,
    window.endDate,
    categories,
  );
  return deriveCurrentBaseline(config, data, window, now.toISOString());
}

export async function getLunchMoneyStatus(reader?: LunchMoneyReader) {
  const service = reader ?? createLunchMoneyReadService();
  try {
    const categories = await service.getCategories();
    return {
      status: "connected" as const,
      checkedAt: new Date().toISOString(),
      message: "Lunch Money accepted the configured token through a read-only request.",
      recordsVisible: categories.length,
    };
  } catch (error) {
    throw sanitizeLunchMoneyError(error);
  }
}
