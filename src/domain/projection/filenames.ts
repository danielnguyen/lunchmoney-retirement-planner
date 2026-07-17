function filenameDate(value: string): string {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Export filename date is invalid");
  return date;
}

export function projectionJsonFilename(value: string): string {
  return `retirement-projection-${filenameDate(value)}.json`;
}

export function projectionCsvFilename(value: string, mode: "real" | "nominal"): string {
  return `retirement-projection-${mode}-${filenameDate(value)}.csv`;
}
