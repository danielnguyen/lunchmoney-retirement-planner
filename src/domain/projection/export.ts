import type { BaselineValue } from "@/src/domain/defaults/types";
import type {
  BaselineExportContext,
  BaselineWarning,
  DerivedBaseline,
} from "@/src/domain/baseline/types";
import { validateProjectionInputs, type ProjectionInputs, type ProjectionResult } from "./types";

export type ProjectionExportRequest = {
  inputs: ProjectionInputs;
  baseline: BaselineExportContext;
  overrides: Record<string, number>;
};

export type ProjectionSnapshot = {
  schemaVersion: "3.0";
  generatedAt: string;
  connection: BaselineExportContext["connection"];
  dataThrough: string;
  transactionWindow: BaselineExportContext["transactionWindow"];
  recordsAnalyzed: BaselineExportContext["recordsAnalyzed"];
  resolvedBaseline: ProjectionInputs;
  activeInputs: ProjectionInputs;
  calculationBasis: {
    employmentIncome: "net_deposited_cash_no_additional_tax";
    simplifiedTax: "gross_retirement_income_and_taxable_rrsp_rrif_withdrawals";
    contributions: "cash_funded_reduce_cash_income_withheld_do_not";
  };
  provenance: Record<string, BaselineValue<unknown>>;
  derivedBaseline: DerivedBaseline;
  warnings: BaselineWarning[];
  unmappedAccounts: BaselineExportContext["unmappedAccounts"];
  unmappedCategories: BaselineExportContext["unmappedCategories"];
  activeOverrides: Record<string, number>;
  projection: ProjectionResult;
};

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function redactSecrets(value: unknown): unknown {
  const configuredToken = process.env.LUNCHMONEY_API_TOKEN;
  if (typeof value === "string") {
    return configuredToken ? value.replaceAll(configuredToken, "[redacted]") : value;
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /(token|authorization|api[_-]?key|secret)/i.test(key) ? "[redacted]" : redactSecrets(entry),
    ]),
  );
}

export function validateProjectionExportRequest(value: unknown): ProjectionExportRequest {
  const payload = record(value, "Export payload");
  const baseline = record(payload.baseline, "baseline");
  const overrides = record(payload.overrides ?? {}, "overrides");
  const numericOverrides = Object.fromEntries(
    Object.entries(overrides).map(([key, entry]) => {
      if (typeof entry !== "number" || !Number.isFinite(entry)) {
        throw new Error(`Override ${key} must be a finite number`);
      }
      return [key, entry];
    }),
  );
  if (typeof baseline.dataThrough !== "string") throw new Error("baseline.dataThrough is required");
  if (!Array.isArray(baseline.warnings)) throw new Error("baseline.warnings must be an array");
  record(baseline.provenance, "baseline.provenance");
  record(baseline.derived, "baseline.derived");
  record(baseline.transactionWindow, "baseline.transactionWindow");
  record(baseline.recordsAnalyzed, "baseline.recordsAnalyzed");
  return {
    inputs: validateProjectionInputs(payload.inputs),
    baseline: {
      connection: record(baseline.connection, "baseline.connection") as BaselineExportContext["connection"],
      projectionInputs: validateProjectionInputs(baseline.projectionInputs),
      provenance: baseline.provenance as BaselineExportContext["provenance"],
      derived: baseline.derived as DerivedBaseline,
      dataThrough: baseline.dataThrough,
      transactionWindow:
        baseline.transactionWindow as BaselineExportContext["transactionWindow"],
      recordsAnalyzed: baseline.recordsAnalyzed as BaselineExportContext["recordsAnalyzed"],
      warnings: baseline.warnings as BaselineWarning[],
      unmappedAccounts: Array.isArray(baseline.unmappedAccounts)
        ? (baseline.unmappedAccounts as BaselineExportContext["unmappedAccounts"])
        : [],
      unmappedCategories: Array.isArray(baseline.unmappedCategories)
        ? (baseline.unmappedCategories as BaselineExportContext["unmappedCategories"])
        : [],
    },
    overrides: numericOverrides,
  };
}

export function createProjectionSnapshot(
  projection: ProjectionResult,
  baseline: BaselineExportContext,
  activeOverrides: Record<string, number>,
  generatedAt = new Date().toISOString(),
): ProjectionSnapshot {
  const snapshot: ProjectionSnapshot = {
    schemaVersion: "3.0",
    generatedAt,
    connection: baseline.connection,
    dataThrough: baseline.dataThrough,
    transactionWindow: baseline.transactionWindow,
    recordsAnalyzed: baseline.recordsAnalyzed,
    resolvedBaseline: baseline.projectionInputs,
    activeInputs: projection.inputs,
    calculationBasis: {
      employmentIncome: "net_deposited_cash_no_additional_tax",
      simplifiedTax: "gross_retirement_income_and_taxable_rrsp_rrif_withdrawals",
      contributions: "cash_funded_reduce_cash_income_withheld_do_not",
    },
    provenance: baseline.provenance,
    derivedBaseline: baseline.derived,
    warnings: baseline.warnings,
    unmappedAccounts: baseline.unmappedAccounts,
    unmappedCategories: baseline.unmappedCategories,
    activeOverrides,
    projection,
  };
  return redactSecrets(snapshot) as ProjectionSnapshot;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function projectionToCsv(
  projection: ProjectionResult,
  mode: "real" | "nominal" = "real",
): string {
  const accountIds = projection.inputs.accounts.map((account) => account.id);
  const headers = [
    "calendarYear",
    "age",
    "phase",
    "employmentNetCash",
    "cppIncome",
    "oasIncome",
    "pensionIncome",
    "otherIncome",
    "cashWithdrawals",
    "tfsaWithdrawals",
    "rrspRrifWithdrawals",
    "nonRegisteredWithdrawals",
    "essentialSpending",
    "discretionarySpending",
    "oneTimeOutflows",
    "tax",
    "cashFundedContributions",
    "unmetSpending",
    "cashBalance",
    "tfsaBalance",
    "rrspRrifBalance",
    "nonRegisteredBalance",
    "debts",
    "financialAssets",
    "netWorth",
    ...accountIds.map((id) => `account:${id}`),
    "milestones",
  ];

  const rows = projection.annual.map((point) => {
    const view = point[mode];
    return [
      point.calendarYear,
      point.age,
      point.phase,
      view.income.employment,
      view.income.cpp,
      view.income.oas,
      view.income.pension,
      view.income.other,
      view.withdrawals.cash,
      view.withdrawals.tfsa,
      view.withdrawals.rrspRrif,
      view.withdrawals.nonRegistered,
      view.outflows.essential,
      view.outflows.discretionary,
      view.outflows.oneTime,
      view.outflows.tax,
      view.outflows.contributions,
      view.outflows.unmetSpending,
      view.balances.cash,
      view.balances.tfsa,
      view.balances.rrspRrif,
      view.balances.nonRegistered,
      view.balances.debts,
      view.balances.financialAssets,
      view.balances.netWorth,
      ...accountIds.map((id) => view.accountBalances[id] ?? 0),
      point.milestones.join("; "),
    ]
      .map(csvCell)
      .join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function projectionSnapshotToCsv(
  snapshot: ProjectionSnapshot,
  mode: "real" | "nominal" = "real",
): string {
  const metadata: string[][] = [
    ["metadata", "schemaVersion", snapshot.schemaVersion],
    ["metadata", "generatedAt", snapshot.generatedAt],
    ["metadata", "dataThrough", snapshot.dataThrough],
    ["metadata", "connection", JSON.stringify(snapshot.connection)],
    ["metadata", "displayMode", mode],
    ["metadata", "transactionWindow", JSON.stringify(snapshot.transactionWindow)],
    ["metadata", "recordsAnalyzed", JSON.stringify(snapshot.recordsAnalyzed)],
    ["metadata", "calculationBasis", JSON.stringify(snapshot.calculationBasis)],
    ["resolvedBaseline", "projectionInputs", JSON.stringify(snapshot.resolvedBaseline)],
    ["derivedBaseline", "values", JSON.stringify(snapshot.derivedBaseline)],
    ["warnings", "all", JSON.stringify(snapshot.warnings)],
    ["unmappedAccounts", "all", JSON.stringify(snapshot.unmappedAccounts)],
    ["unmappedCategories", "all", JSON.stringify(snapshot.unmappedCategories)],
    ["activeOverrides", "all", JSON.stringify(snapshot.activeOverrides)],
    ...Object.entries(snapshot.provenance).map(([key, value]) => [
      "provenance",
      key,
      JSON.stringify(value),
    ]),
    ...snapshot.warnings.map((warning, index) => ["warning", String(index), JSON.stringify(warning)]),
    ...Object.entries(snapshot.activeOverrides).map(([key, value]) => [
      "override",
      key,
      String(value),
    ]),
  ];
  return [
    "section,key,value",
    ...metadata.map((row) => row.map(csvCell).join(",")),
    "",
    `projection_${mode}`,
    projectionToCsv(snapshot.projection, mode),
  ].join("\n");
}
