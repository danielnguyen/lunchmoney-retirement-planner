import type { BaselineValue } from "@/src/domain/defaults/types";
import type { ProjectionInputs, ProjectionResult } from "./types";

export type ProjectionSnapshot = {
  schemaVersion: "2.0";
  generatedAt: string;
  dataThrough?: string;
  inputs: ProjectionInputs;
  inputSources: Record<string, BaselineValue<number>>;
  projection: ProjectionResult;
};

export function createProjectionSnapshot(
  projection: ProjectionResult,
  inputSources: Record<string, BaselineValue<number>> = {},
  generatedAt = new Date().toISOString(),
  dataThrough?: string,
): ProjectionSnapshot {
  return {
    schemaVersion: "2.0",
    generatedAt,
    dataThrough,
    inputs: projection.inputs,
    inputSources,
    projection,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function projectionToCsv(projection: ProjectionResult, mode: "real" | "nominal" = "real"): string {
  const headers = [
    "calendarYear",
    "primaryAge",
    "phase",
    "employmentIncome",
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
    "contributions",
    "unmetSpending",
    "cashBalance",
    "tfsaBalance",
    "rrspRrifBalance",
    "nonRegisteredBalance",
    "realAssets",
    "debts",
    "netWorth",
    "milestones",
  ];

  const rows = projection.annual.map((point) => {
    const view = point[mode];
    return [
      point.calendarYear,
      point.primaryAge,
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
      view.balances.realAssets,
      view.balances.debts,
      view.balances.netWorth,
      point.milestones.join("; "),
    ].map(csvCell).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
