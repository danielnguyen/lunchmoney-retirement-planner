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

export function centDifference(
  left: number[],
  right: number[],
): number {
  return sumMonetaryCents(left) - sumMonetaryCents(right);
}
