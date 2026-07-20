export const liabilityInterestRateConventions = [
  "canadian_mortgage",
  "effective_annual",
] as const;

export type LiabilityInterestRateConvention =
  (typeof liabilityInterestRateConventions)[number];

export function monthlyLiabilityInterestRate(
  annualRate: number,
  convention: LiabilityInterestRateConvention,
): number {
  if (convention === "canadian_mortgage") {
    return Math.pow(1 + annualRate / 2, 1 / 6) - 1;
  }
  if (convention === "effective_annual") {
    return Math.pow(1 + annualRate, 1 / 12) - 1;
  }
  throw new Error(`Unsupported liability interest-rate convention: ${convention}`);
}

export function liabilityInterestRateConventionLabel(
  convention: LiabilityInterestRateConvention,
): string {
  return convention === "canadian_mortgage"
    ? "Canadian mortgage rate (nominal annual, compounded semi-annually)"
    : "Effective annual rate";
}
