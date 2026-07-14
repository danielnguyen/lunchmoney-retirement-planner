import type { BaselineCandidateSet, BaselineValue } from "./types";

export function resolveBaselineValue<T>(candidates: BaselineCandidateSet<T>): BaselineValue<T> {
  return (
    candidates.savedPersonalBaseline ??
    candidates.lunchMoneyDerived ??
    candidates.canadianReference ??
    candidates.applicationFallback
  );
}

export function resolveBaselineRecord<T extends Record<string, unknown>>(
  candidates: { [K in keyof T]: BaselineCandidateSet<T[K]> },
): { [K in keyof T]: BaselineValue<T[K]> } {
  return Object.fromEntries(
    Object.entries(candidates).map(([key, value]) => [
      key,
      resolveBaselineValue(value as BaselineCandidateSet<T[keyof T]>),
    ]),
  ) as { [K in keyof T]: BaselineValue<T[K]> };
}
