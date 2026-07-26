export function monetaryCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

export function monetaryValue(cents: number): number {
  return cents / 100;
}

export function sumMonetaryCents(values: number[]): number {
  return values.reduce(
    (total, value) => total + monetaryCents(value),
    0,
  );
}

/**
 * Reconcile one monetary equation at aggregate precision.
 *
 * Rounding every component before summing can manufacture a multi-cent
 * difference when several sub-cent values offset one another. The projection
 * bridge tracks raw accumulated values, so it must total each side first and
 * round only the final difference to cents.
 */
export function centDifference(
  left: number[],
  right: number[],
): number {
  const leftTotal = left.reduce((total, value) => total + value, 0);
  const rightTotal = right.reduce((total, value) => total + value, 0);
  return monetaryCents(leftTotal - rightTotal);
}
