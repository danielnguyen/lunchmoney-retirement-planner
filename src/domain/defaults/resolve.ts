import type { BaselineCandidateSet, BaselineValue } from "./types";

export function resolveBaselineValue<T>(
  candidates: BaselineCandidateSet<T>,
  fieldName = "baseline value",
): BaselineValue<T> {
  const resolved =
    candidates.localConfiguration ??
    candidates.lunchMoneyDerived ??
    candidates.canadianReference;
  if (!resolved) throw new Error(`${fieldName} is missing from all supported sources`);
  return resolved;
}

export function resolveBaselineRecord<T extends Record<string, unknown>>(
  candidates: { [K in keyof T]: BaselineCandidateSet<T[K]> },
): { [K in keyof T]: BaselineValue<T[K]> } {
  return Object.fromEntries(
    Object.entries(candidates).map(([key, value]) => [
      key,
      resolveBaselineValue(value as BaselineCandidateSet<T[keyof T]>, key),
    ]),
  ) as { [K in keyof T]: BaselineValue<T[K]> };
}
