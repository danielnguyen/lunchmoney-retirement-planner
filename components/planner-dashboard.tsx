"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CurrentBaseline } from "@/src/domain/baseline/types";
import {
  annualPeriodLabel,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import type {
  AccountType,
  ProjectionInputs,
  ProjectionResult,
} from "@/src/domain/projection/types";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

const accountColors = ["#d8bd65", "#d99269", "#8072d7", "#4eb5d2", "#70d6b2", "#a9cf6c"];

type DisplayMode = "real" | "nominal";
type Overrides = Record<string, number>;

type BlockingError = {
  error: string;
  message: string;
  connection?: { status: string; message: string };
  dataThrough?: string;
  transactionWindow?: CurrentBaseline["transactionWindow"];
  recordsAnalyzed?: CurrentBaseline["recordsAnalyzed"];
  warnings?: CurrentBaseline["warnings"];
  unmappedAccounts?: CurrentBaseline["unmappedAccounts"];
  unmappedCategories?: CurrentBaseline["unmappedCategories"];
};

type ControlDefinition = {
  key: string;
  sourceKey: string;
  label: string;
  min: (inputs: ProjectionInputs) => number;
  max: (inputs: ProjectionInputs) => number;
  step: number;
  format: (value: number) => string;
  get: (inputs: ProjectionInputs) => number;
  set: (inputs: ProjectionInputs, value: number) => void;
};

function fixed(value: number): (inputs: ProjectionInputs) => number {
  return () => value;
}

function buildControls(baseline: ProjectionInputs): ControlDefinition[] {
  const controls: ControlDefinition[] = [
    {
      key: "retirementAge",
      sourceKey: "retirementAge",
      label: "Retirement age",
      min: (inputs) => inputs.person.currentAge + 1,
      max: (inputs) => inputs.endAge,
      step: 1,
      format: String,
      get: (inputs) => inputs.person.retirementAge,
      set: (inputs, value) => {
        inputs.person.retirementAge = value;
      },
    },
    {
      key: "cppStartAge",
      sourceKey: "cppStartAge",
      label: "CPP start age",
      min: fixed(60),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.cpp.startAge,
      set: (inputs, value) => {
        inputs.person.cpp.startAge = value;
      },
    },
    {
      key: "oasStartAge",
      sourceKey: "oasStartAge",
      label: "OAS start age",
      min: fixed(65),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.oas.startAge,
      set: (inputs, value) => {
        inputs.person.oas.startAge = value;
      },
    },
    {
      key: "monthlyEssentialSpendingToday",
      sourceKey: "monthlyEssentialSpendingToday",
      label: "Essential monthly spending",
      min: fixed(0),
      max: fixed(Math.max(20000, baseline.monthlyEssentialSpendingToday * 3)),
      step: 50,
      format: currency.format,
      get: (inputs) => inputs.monthlyEssentialSpendingToday,
      set: (inputs, value) => {
        inputs.monthlyEssentialSpendingToday = value;
      },
    },
    {
      key: "monthlyDiscretionarySpendingToday",
      sourceKey: "monthlyDiscretionarySpendingToday",
      label: "Discretionary monthly spending",
      min: fixed(0),
      max: fixed(Math.max(10000, baseline.monthlyDiscretionarySpendingToday * 3)),
      step: 50,
      format: currency.format,
      get: (inputs) => inputs.monthlyDiscretionarySpendingToday,
      set: (inputs, value) => {
        inputs.monthlyDiscretionarySpendingToday = value;
      },
    },
    {
      key: "annualInflation",
      sourceKey: "annualInflation",
      label: "Inflation",
      min: fixed(0),
      max: fixed(0.1),
      step: 0.001,
      format: percent.format,
      get: (inputs) => inputs.annualInflation,
      set: (inputs, value) => {
        inputs.annualInflation = value;
      },
    },
    {
      key: "endAge",
      sourceKey: "endAge",
      label: "Projection end age",
      min: (inputs) => inputs.person.retirementAge,
      max: fixed(120),
      step: 1,
      format: String,
      get: (inputs) => inputs.endAge,
      set: (inputs, value) => {
        inputs.endAge = value;
      },
    },
  ];

  for (const account of baseline.accounts) {
    if (!["tfsa", "rrsp_rrif", "non_registered"].includes(account.type)) continue;
    controls.push({
      key: `contribution.${account.id}`,
      sourceKey: `accounts.${account.id}.monthlyContributionToday`,
      label: `${account.label} monthly contribution (${account.contributionFunding === "income_withheld" ? "income-withheld" : "cash-funded"})`,
      min: fixed(0),
      max: fixed(Math.max(5000, account.monthlyContributionToday * 3)),
      step: 25,
      format: currency.format,
      get: (inputs) => inputs.accounts.find((item) => item.id === account.id)!.monthlyContributionToday,
      set: (inputs, value) => {
        inputs.accounts.find((item) => item.id === account.id)!.monthlyContributionToday = value;
      },
    });
  }

  const typeLabels: Record<AccountType, string> = {
    cash: "Cash return",
    tfsa: "TFSA return",
    rrsp_rrif: "RRSP / RRIF return",
    non_registered: "Non-registered return",
    debt: "Debt balance change",
  };
  const seenTypes = new Set<AccountType>();
  for (const account of baseline.accounts) {
    if (seenTypes.has(account.type)) continue;
    seenTypes.add(account.type);
    controls.push({
      key: `return.${account.type}`,
      sourceKey: `accounts.${account.id}.annualReturn`,
      label: typeLabels[account.type],
      min: fixed(-0.5),
      max: fixed(0.5),
      step: 0.001,
      format: percent.format,
      get: (inputs) => inputs.accounts.find((item) => item.type === account.type)!.annualReturn,
      set: (inputs, value) => {
        for (const item of inputs.accounts) {
          if (item.type === account.type) item.annualReturn = value;
        }
      },
    });
  }
  return controls;
}

function materializeInputs(
  baseline: ProjectionInputs,
  controls: ControlDefinition[],
  overrides: Overrides,
): ProjectionInputs {
  const inputs = structuredClone(baseline);
  for (const control of controls) {
    const override = overrides[control.key];
    if (override !== undefined) control.set(inputs, override);
  }
  return inputs;
}

function compactCurrency(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function sourceLabel(baseline: CurrentBaseline, key: string): string {
  return baseline.provenance[key]?.sourceType.replaceAll("_", " ") ?? "live baseline";
}

function BlockingState({ error, onRefresh }: { error: BlockingError; onRefresh: () => void }) {
  const connected = error.connection?.status === "connected";
  return (
    <main>
      <header className="hero compact-hero">
        <div>
          <span className="eyebrow">Retirement lifecycle report</span>
          <h1>Live baseline required.</h1>
          <p>The planner will not render projections until Lunch Money and the private mappings are valid.</p>
        </div>
        <button className="button no-print" onClick={onRefresh}>Try again</button>
      </header>
      <section className="blocking-card" role="alert">
        <span className={`connection-badge ${connected ? "connected" : "failed"}`}>
          {connected ? "Lunch Money connected" : "Connection blocked"}
        </span>
        <h2>{error.message}</h2>
        <p className="error-code">{error.error}</p>
        {error.recordsAnalyzed ? (
          <p className="panel-copy">
            Analysed {error.recordsAnalyzed.accounts} accounts, {error.recordsAnalyzed.categories} categories,
            {" "}{error.recordsAnalyzed.recurringItems} recurring items, and {error.recordsAnalyzed.transactions} transactions.
          </p>
        ) : null}
        {(error.unmappedAccounts?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Unmapped accounts</h3>
            {error.unmappedAccounts!.map((account) => (
              <code key={account.id}>{account.id} · {account.name} · {account.status}</code>
            ))}
          </div>
        ) : null}
        {(error.unmappedCategories?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Unmapped categories</h3>
            {error.unmappedCategories!.map((category) => (
              <code key={category.id}>{category.id} · {category.name} · {category.transactionCount} records</code>
            ))}
          </div>
        ) : null}
        {(error.warnings?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Configuration details</h3>
            {error.warnings!.map((warning, index) => (
              <p key={`${warning.code}-${index}`}>{warning.message}</p>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function PlannerDashboard() {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [baselineResult, setBaselineResult] = useState<{
    generation: number;
    baseline?: CurrentBaseline;
    error?: BlockingError;
  } | null>(null);
  const [projectionResult, setProjectionResult] = useState<{
    key: string;
    projection?: ProjectionResult;
    error?: string;
  } | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [mode, setMode] = useState<DisplayMode>("real");
  const [allocationYear, setAllocationYear] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState("");

  const refresh = useCallback(() => {
    setRefreshGeneration((current) => current + 1);
    setOverrides({});
    setExportStatus("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/baseline/current", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as CurrentBaseline | BlockingError;
        if (!response.ok) {
          setBaselineResult({ generation: refreshGeneration, error: body as BlockingError });
          return;
        }
        const current = body as CurrentBaseline;
        setBaselineResult({ generation: refreshGeneration, baseline: current });
        setAllocationYear(Number(current.projectionInputs.startDate.slice(0, 4)) + 20);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBaselineResult({
          generation: refreshGeneration,
          error: { error: "baseline_load_failed", message: "The live baseline could not be loaded." },
        });
      });
    return () => controller.abort();
  }, [refreshGeneration]);

  const currentBaselineResult =
    baselineResult?.generation === refreshGeneration ? baselineResult : null;
  const baseline = currentBaselineResult?.baseline ?? null;
  const loadError = currentBaselineResult?.error ?? null;
  const loading = currentBaselineResult === null;

  const controls = useMemo(
    () => (baseline ? buildControls(baseline.projectionInputs) : []),
    [baseline],
  );
  const inputs = useMemo(
    () => (baseline ? materializeInputs(baseline.projectionInputs, controls, overrides) : null),
    [baseline, controls, overrides],
  );
  const inputsKey = useMemo(() => (inputs ? JSON.stringify(inputs) : ""), [inputs]);

  useEffect(() => {
    if (!inputs) return;
    const controller = new AbortController();
    void fetch("/api/v1/projections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ProjectionResult | { message?: string };
        if (!response.ok) throw new Error("message" in body ? body.message : "Projection failed");
        setProjectionResult({ key: inputsKey, projection: body as ProjectionResult });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProjectionResult({
          key: inputsKey,
          error: error instanceof Error ? error.message : "Projection failed",
        });
      });
    return () => controller.abort();
  }, [inputs, inputsKey]);

  const currentProjectionResult = projectionResult?.key === inputsKey ? projectionResult : null;
  const projection = currentProjectionResult?.projection ?? null;
  const projectionError = currentProjectionResult?.error ?? "";
  const projecting = Boolean(inputs) && currentProjectionResult === null;

  async function download(endpoint: string, filename: string) {
    if (!baseline || !inputs) return;
    setExportStatus("Preparing export…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline, inputs, overrides }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportStatus("Export ready");
    } catch {
      setExportStatus("Export failed");
    }
  }

  if (loading) {
    return (
      <main>
        <section className="blocking-card loading-card" aria-live="polite">
          <span className="connection-badge">Connecting read-only</span>
          <h1>Loading the current Lunch Money baseline…</h1>
          <p>No projection will be shown until live data and private mappings pass validation.</p>
        </section>
      </main>
    );
  }
  if (loadError) return <BlockingState error={loadError} onRefresh={() => void refresh()} />;
  if (!baseline || !inputs) return null;

  const chartData = projection?.annual.map((point) => {
    const view = point[mode];
    return {
      year: point.calendarYear,
      periodLabel: annualPeriodLabel(inputs, point.calendarYear),
      age: point.age,
      essential: view.outflows.essential,
      discretionary: view.outflows.discretionary,
      oneTime: view.outflows.oneTime,
      tax: view.outflows.tax,
      contributions: view.outflows.contributions,
      employmentNetCash: view.income.employment,
      cpp: view.income.cpp,
      oas: view.income.oas,
      pension: view.income.pension,
      otherIncome: view.income.other,
      cashWithdrawal: view.withdrawals.cash,
      tfsaWithdrawal: view.withdrawals.tfsa,
      rrspWithdrawal: view.withdrawals.rrspRrif,
      nonRegisteredWithdrawal: view.withdrawals.nonRegistered,
      financialAssets: view.balances.financialAssets,
      goal:
        mode === "real"
          ? inputs.retirementGoalToday
          : inputs.retirementGoalToday *
            Math.pow(1 + inputs.annualInflation, point.age - inputs.person.currentAge),
      milestones: point.milestones.join(" · "),
      ...Object.fromEntries(
        Object.entries(view.accountBalances).map(([id, value]) => [`account:${id}`, value]),
      ),
    };
  }) ?? [];
  const milestonePoints = projection?.annual.filter((point) => point.milestones.length > 0) ?? [];
  const selectedAllocationPoint = projection && allocationYear !== null
    ? projection.annual.reduce((closest, point) =>
        Math.abs(point.calendarYear - allocationYear) < Math.abs(closest.calendarYear - allocationYear)
          ? point
          : closest,
      )
    : null;
  const selectedAllocationView = selectedAllocationPoint?.[mode];
  const allocationData = selectedAllocationView
    ? [
        { name: "Cash", value: selectedAllocationView.allocation.cash },
        { name: "Fixed income", value: selectedAllocationView.allocation.fixedIncome },
        { name: "Equity", value: selectedAllocationView.allocation.equity },
      ].filter((item) => item.value > 0)
    : [];
  const financialAccounts = inputs.accounts.filter((account) => account.type !== "debt");
  const importedStartingFinancialAssets = startingFinancialAssets(
    baseline.projectionInputs.accounts,
  );

  return (
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">Retirement lifecycle report</span>
          <h1>Your live financial baseline, projected forward.</h1>
          <p>
            Lunch Money transactions and balances drive every chart. Private assumptions and temporary overrides remain explicit.
          </p>
        </div>
        <div className="hero-actions no-print">
          <button className="button secondary" onClick={() => window.print()}>Print</button>
          <button
            className="button"
            onClick={() => void download(
              "/api/v1/exports/projection",
              `retirement-projection-${new Date().toISOString().slice(0, 10)}.json`,
            )}
          >
            Export JSON
          </button>
        </div>
      </header>

      <section className="connection-panel">
        <div>
          <span className="connection-badge connected">Lunch Money connected · read-only</span>
          <strong>Data through {baseline.dataThrough}</strong>
          <small>
            {baseline.transactionWindow.startDate}–{baseline.transactionWindow.endDate} · {baseline.transactionWindow.trailingMonths} months
          </small>
        </div>
        <dl className="connection-stats">
          <div><dt>Transactions</dt><dd>{baseline.recordsAnalyzed.transactions}</dd></div>
          <div><dt>Accounts</dt><dd>{baseline.recordsAnalyzed.accounts}</dd></div>
          <div><dt>Recurring</dt><dd>{baseline.recordsAnalyzed.recurringItems}</dd></div>
          <div><dt>Unmapped accounts</dt><dd>{baseline.unmappedAccounts.length}</dd></div>
          <div><dt>Unmapped categories</dt><dd>{baseline.unmappedCategories.length}</dd></div>
        </dl>
        <button className="button secondary no-print" onClick={() => void refresh()}>Refresh Lunch Money</button>
      </section>

      {baseline.warnings.length > 0 ? (
        <section className="warning-panel" aria-label="Baseline warnings">
          {baseline.warnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{warning.message}</p>
          ))}
        </section>
      ) : null}

      <section className="toolbar no-print" aria-label="Report controls">
        <div className="segmented">
          <button className={mode === "real" ? "active" : ""} onClick={() => setMode("real")}>
            Today&apos;s dollars
          </button>
          <button className={mode === "nominal" ? "active" : ""} onClick={() => setMode("nominal")}>
            Future dollars
          </button>
        </div>
        <span className="status">
          {projectionError || exportStatus || (projecting ? "Recalculating…" : "Live baseline active")}
        </span>
      </section>

      {projectionError ? (
        <section className="blocking-card" role="alert">
          <h2>Projection blocked</h2>
          <p>{projectionError}</p>
        </section>
      ) : null}

      {projection ? (
        <>
          <section className="summary-grid" aria-label="Projection summary">
            <article className="metric-card">
              <span>Starting financial assets</span>
              <strong>{currency.format(importedStartingFinancialAssets)}</strong>
              <small>Imported balances as of {baseline.dataThrough} · debt excluded</small>
            </article>
            <article className="metric-card">
              <span>Assets at retirement</span>
              <strong>{currency.format(projection.summary.financialAssetsAtRetirementToday)}</strong>
              <small>{projection.summary.retirementYear} · financial assets only</small>
            </article>
            <article className="metric-card">
              <span>Goal</span>
              <strong>{currency.format(projection.summary.retirementGoalToday)}</strong>
              <small>Financial-asset target</small>
            </article>
            <article className="metric-card">
              <span>Goal gap</span>
              <strong>{currency.format(projection.summary.goalGapToday)}</strong>
              <small>{projection.summary.goalGapToday >= 0 ? "Above goal" : "Below goal"}</small>
            </article>
            <article className="metric-card">
              <span>Financial assets</span>
              <strong>
                {projection.summary.financialAssetsDepletionAge === null
                  ? `Past age ${inputs.endAge}`
                  : `To age ${projection.summary.financialAssetsDepletionAge}`}
              </strong>
              <small>Cash and investment accounts</small>
            </article>
          </section>

          <section className="report-layout">
            <div className="report-column">
              <article className="report-card wide-chart">
                <div className="section-heading">
                  <div><span className="section-kicker">Expenses</span><h2>Annual spending projection</h2></div>
                  <span className="pill">{mode === "real" ? "Today’s dollars" : "Future dollars"}</span>
                </div>
                <div className="chart-shell medium">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="essential" name="Essential" stackId="expenses" fill="#55b8d8" />
                      <Bar dataKey="discretionary" name="Discretionary" stackId="expenses" fill="#8c78dd" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="report-card wide-chart">
                <div className="section-heading">
                  <div><span className="section-kicker">Cash inflow</span><h2>How each year is funded</h2></div>
                </div>
                <div className="chart-shell tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="employmentNetCash" name="Employment (net deposited cash)" stackId="inflow" fill="#3f78c5" />
                      <Bar dataKey="cpp" name="CPP" stackId="inflow" fill="#4eb5d2" />
                      <Bar dataKey="oas" name="OAS" stackId="inflow" fill="#77d2b2" />
                      <Bar dataKey="pension" name="Pension" stackId="inflow" fill="#a9cf6c" />
                      <Bar dataKey="cashWithdrawal" name="Cash" stackId="inflow" fill="#d8bd65" />
                      <Bar dataKey="nonRegisteredWithdrawal" name="Non-registered" stackId="inflow" fill="#d99269" />
                      <Bar dataKey="rrspWithdrawal" name="RRSP / RRIF" stackId="inflow" fill="#b978b8" />
                      <Bar dataKey="tfsaWithdrawal" name="TFSA" stackId="inflow" fill="#8072d7" />
                      <Line dataKey="tax" name="Simplified retirement tax" stroke="#ef7d86" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="report-card wide-chart">
                <div className="section-heading">
                  <div><span className="section-kicker">Cash outflow</span><h2>Spending, taxes, and contributions</h2></div>
                </div>
                <div className="chart-shell medium">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="essential" name="Essential" stackId="outflow" fill="#55b8d8" />
                      <Bar dataKey="discretionary" name="Discretionary" stackId="outflow" fill="#8c78dd" />
                      <Bar dataKey="oneTime" name="One-time events" stackId="outflow" fill="#d99269" />
                      <Bar dataKey="tax" name="Simplified retirement tax" stackId="outflow" fill="#ef7d86" />
                      <Bar dataKey="contributions" name="Cash-funded contributions" stackId="outflow" fill="#70d6b2" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="report-card wide-chart">
                <div className="section-heading">
                  <div><span className="section-kicker">Financial assets</span><h2>Account-level burndown</h2></div>
                </div>
                <div className="chart-shell tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      {financialAccounts.map((account, index) => (
                        <Area
                          key={account.id}
                          dataKey={`account:${account.id}`}
                          name={account.label}
                          stackId="balances"
                          fill={accountColors[index % accountColors.length]}
                          stroke={accountColors[index % accountColors.length]}
                        />
                      ))}
                      <Line dataKey="financialAssets" name="Financial assets" stroke="#f6f8fb" strokeWidth={3} dot={false} />
                      <Line dataKey="goal" name="Goal" stroke="#f2bd63" strokeWidth={2} strokeDasharray="7 6" dot={false} />
                      {milestonePoints.slice(0, 10).map((point) => (
                        <ReferenceLine key={`${point.calendarYear}-${point.milestones.join("-")}`} x={point.calendarYear} stroke="#9eb0c4" strokeDasharray="4 4" />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="milestone-list">
                  {milestonePoints.map((point) => (
                    <span className="milestone" key={`${point.calendarYear}-${point.milestones.join("-")}`}>
                      {point.calendarYear}: {point.milestones.join(" · ")}
                    </span>
                  ))}
                </div>
              </article>

              <div className="two-column">
                <article className="report-card">
                  <div className="section-heading">
                    <div><span className="section-kicker">Allocation</span><h2>Asset mix in {selectedAllocationPoint?.calendarYear}</h2></div>
                  </div>
                  <div className="chart-shell compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2} label={({ name, percent: share }) => `${name} ${Math.round((share ?? 0) * 100)}%`}>
                          {allocationData.map((item, index) => <Cell key={item.name} fill={accountColors[index % accountColors.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => currency.format(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {allocationYear !== null ? (
                    <label className="allocation-slider no-print">
                      Year {allocationYear}
                      <input type="range" min={projection.annual[0]!.calendarYear} max={projection.annual.at(-1)!.calendarYear} value={allocationYear} onChange={(event) => setAllocationYear(Number(event.target.value))} />
                    </label>
                  ) : null}
                </article>

                <article className="report-card">
                  <div className="section-heading">
                    <div><span className="section-kicker">Observations</span><h2>Deterministic report notes</h2></div>
                  </div>
                  <div className="observation-list">
                    {projection.observations.map((observation) => (
                      <div className="observation" key={observation.code}>
                        <span>{observation.age ? `Age ${observation.age}` : "Projection"}</span>
                        <p>{observation.message}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="report-card">
                <div className="section-heading">
                  <div><span className="section-kicker">Annual details</span><h2>Inspectable projection ledger</h2></div>
                  <button className="button secondary no-print" onClick={() => void download(`/api/v1/exports/projection-csv?mode=${mode}`, `retirement-projection-${mode}-${new Date().toISOString().slice(0, 10)}.csv`)}>Export CSV</button>
                </div>
                <div className="table-shell">
                  <table>
                    <thead><tr><th>Year</th><th>Age</th><th>Income</th><th>Withdrawals</th><th>Tax</th><th>Spending</th><th>Financial assets</th><th>Milestones</th></tr></thead>
                    <tbody>
                      {projection.annual.map((point) => {
                        const view = point[mode];
                        return (
                          <tr key={point.calendarYear}>
                            <td>{annualPeriodLabel(inputs, point.calendarYear)}</td><td>{point.age}</td><td>{currency.format(view.income.total)}</td><td>{currency.format(view.withdrawals.total)}</td><td>{currency.format(view.outflows.tax)}</td>
                            <td>{currency.format(view.outflows.essential + view.outflows.discretionary + view.outflows.oneTime)}</td><td>{currency.format(view.balances.financialAssets)}</td><td>{point.milestones.join(" · ") || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <aside className="controls-panel no-print">
              <div className="section-heading">
                <div><span className="section-kicker">Scenario</span><h2>Calculator controls</h2></div>
                <button className="text-button" onClick={() => setOverrides({})}>Reset all</button>
              </div>
              <p className="panel-copy">Reset restores this refreshed live baseline. Refresh clears every temporary override.</p>
              <div className="control-list">
                {controls.map((control) => {
                  const baselineValue = control.get(baseline.projectionInputs);
                  const currentValue = control.get(inputs);
                  const overridden = overrides[control.key] !== undefined;
                  return (
                    <div className={`control ${overridden ? "is-overridden" : ""}`} key={control.key}>
                      <div className="control-head"><label htmlFor={control.key}>{control.label}</label><output>{control.format(currentValue)}</output></div>
                      <input id={control.key} type="range" min={control.min(inputs)} max={control.max(inputs)} step={control.step} value={currentValue} onChange={(event) => setOverrides((current) => ({ ...current, [control.key]: Number(event.target.value) }))} />
                      <div className="control-meta">
                        <span>{sourceLabel(baseline, control.sourceKey)}</span>
                        <button className="text-button" disabled={!overridden} onClick={() => setOverrides((current) => { const next = { ...current }; delete next[control.key]; return next; })}>Reset to {control.format(baselineValue)}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>
          </section>

          <section className="report-card assumptions">
            <div className="section-heading"><div><span className="section-kicker">Live baseline</span><h2>Resolved inputs and provenance</h2></div></div>
            <div className="assumption-grid">
              <div>
                <h3>Cash flow</h3>
                <dl>
                  <div><dt>Monthly employment income (net deposited cash)</dt><dd>{currency.format(baseline.derived.monthlyIncome.monthlyAverage)}</dd></div>
                  <div><dt>Essential spending</dt><dd>{currency.format(baseline.derived.essentialSpending.monthlyAverage)}</dd></div>
                  <div><dt>Discretionary spending</dt><dd>{currency.format(baseline.derived.discretionarySpending.monthlyAverage)}</dd></div>
                  <div><dt>Investment contributions (balance additions)</dt><dd>{currency.format(baseline.derived.investmentContributions.monthlyAverage)}</dd></div>
                  <div><dt>Recurring expenses</dt><dd>{currency.format(baseline.derived.recurringExpenses.monthlyTotal)}</dd></div>
                </dl>
              </div>
              <div>
                <h3>Personal settings</h3>
                <dl>
                  <div><dt>Current age</dt><dd>{inputs.person.currentAge}</dd></div>
                  <div><dt>Retirement age</dt><dd>{inputs.person.retirementAge}</dd></div>
                  <div><dt>CPP start age</dt><dd>{inputs.person.cpp.startAge}</dd></div>
                  <div><dt>OAS start age</dt><dd>{inputs.person.oas.startAge}</dd></div>
                  <div><dt>RRIF conversion age</dt><dd>{inputs.person.rrifConversionAge}</dd></div>
                </dl>
              </div>
              <div>
                <h3>Assumptions</h3>
                <dl>
                  <div><dt>Projection period</dt><dd>{inputs.startDate}–{projection.annual.at(-1)?.calendarYear}</dd></div>
                  <div><dt>Inflation</dt><dd>{percent.format(inputs.annualInflation)}</dd></div>
                  <div><dt>Simplified retirement tax rate</dt><dd>{percent.format(inputs.tax.effectiveTaxRate)}</dd></div>
                  <div><dt>Employment tax basis</dt><dd>Net cash; no second tax</dd></div>
                  <div><dt>Data through</dt><dd>{baseline.dataThrough}</dd></div>
                </dl>
              </div>
              <div>
                <h3>Lunch Money accounts</h3>
                <dl>
                  {baseline.derived.accountBalances.map((account) => (
                    <div key={account.id}>
                      <dt>{account.name} · {account.plannerType.replaceAll("_", " ")}</dt>
                      <dd>{currency.format(account.balance)} · {account.balanceAsOf.slice(0, 10)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
