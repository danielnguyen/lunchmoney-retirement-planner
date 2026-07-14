"use client";

import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { demoBaseline } from "@/src/demo/baseline";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

type NumericKey = keyof ProjectionInputs;
type Overrides = Partial<Record<NumericKey, number>>;

type ControlDefinition = {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
};

const controls: ControlDefinition[] = [
  { key: "retirementAge", label: "Retirement age", min: 45, max: 75, step: 1, format: String },
  {
    key: "currentSavings",
    label: "Current savings",
    min: 0,
    max: 2500000,
    step: 10000,
    format: (value) => currency.format(value),
  },
  {
    key: "monthlyContribution",
    label: "Monthly contribution",
    min: 0,
    max: 15000,
    step: 100,
    format: (value) => currency.format(value),
  },
  {
    key: "monthlyRetirementSpendingToday",
    label: "Monthly retirement spending",
    min: 1000,
    max: 20000,
    step: 100,
    format: (value) => currency.format(value),
  },
  {
    key: "annualReturnBeforeRetirement",
    label: "Return before retirement",
    min: 0,
    max: 0.12,
    step: 0.001,
    format: (value) => percent.format(value),
  },
  {
    key: "annualReturnAfterRetirement",
    label: "Return after retirement",
    min: 0,
    max: 0.1,
    step: 0.001,
    format: (value) => percent.format(value),
  },
  {
    key: "annualInflation",
    label: "Inflation",
    min: 0,
    max: 0.08,
    step: 0.001,
    format: (value) => percent.format(value),
  },
  {
    key: "monthlyGovernmentBenefitsToday",
    label: "Monthly public benefits",
    min: 0,
    max: 6000,
    step: 50,
    format: (value) => currency.format(value),
  },
  {
    key: "retirementGoalToday",
    label: "Retirement goal",
    min: 0,
    max: 5000000,
    step: 25000,
    format: (value) => currency.format(value),
  },
];

export function PlannerDashboard() {
  const [overrides, setOverrides] = useState<Overrides>({});

  const inputs = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(demoBaseline).map(([key, baseline]) => [
          key,
          overrides[key as NumericKey] ?? baseline.value,
        ]),
      ) as ProjectionInputs,
    [overrides],
  );

  const projection = useMemo(() => calculateProjection(inputs), [inputs]);

  const chartData = projection.yearly.map((point) => ({
    age: point.age,
    balance: point.realBalance,
    goal: point.realGoal,
  }));

  async function exportSnapshot() {
    const response = await fetch("/api/v1/exports/projection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });

    if (!response.ok) {
      throw new Error("Unable to export projection");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `retirement-projection-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <header className="hero">
        <div>
          <h1>Retirement projections grounded in explicit data.</h1>
          <p>
            Compare a current baseline with reversible scenario changes. All chart values are shown in today&apos;s Canadian dollars.
          </p>
        </div>
        <span className="badge">Generic demonstration data</span>
      </header>

      <section className="summary-grid" aria-label="Projection summary">
        <article className="card">
          <span>At retirement</span>
          <strong>{currency.format(projection.summary.balanceAtRetirementToday)}</strong>
          <small>Today&apos;s dollars</small>
        </article>
        <article className="card">
          <span>Goal</span>
          <strong>{currency.format(projection.summary.retirementGoalToday)}</strong>
          <small>Baseline target</small>
        </article>
        <article className="card">
          <span>Goal gap</span>
          <strong>{currency.format(projection.summary.goalGapToday)}</strong>
          <small>{projection.summary.goalGapToday >= 0 ? "Above goal" : "Below goal"}</small>
        </article>
        <article className="card">
          <span>Portfolio duration</span>
          <strong>
            {projection.summary.depletionAge === null
              ? `Past age ${inputs.endAge}`
              : `To age ${projection.summary.depletionAge}`}
          </strong>
          <small>Based on current scenario</small>
        </article>
      </section>

      <section className="workspace">
        <article className="chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Projected portfolio</h2>
              <p>Accumulation and retirement withdrawals</p>
            </div>
            <span className="badge">Retire at {inputs.retirementAge}</span>
          </div>
          <div className="chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 4, bottom: 8 }}>
                <defs>
                  <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#70d6b2" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#70d6b2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="age" stroke="#9eb0c4" tickLine={false} axisLine={false} />
                <YAxis
                  stroke="#9eb0c4"
                  tickLine={false}
                  axisLine={false}
                  width={78}
                  tickFormatter={(value) => `$${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  formatter={(value) => currency.format(Number(value))}
                  labelFormatter={(label) => `Age ${label}`}
                  contentStyle={{ background: "#0d1a2b", border: "1px solid #24364d", borderRadius: 12 }}
                />
                <Legend />
                <Area
                  name="Projected balance"
                  type="monotone"
                  dataKey="balance"
                  stroke="#70d6b2"
                  fill="url(#balanceFill)"
                  strokeWidth={3}
                />
                <Line
                  name="Retirement goal"
                  type="monotone"
                  dataKey="goal"
                  stroke="#f2bd63"
                  strokeDasharray="8 6"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </article>

        <aside className="controls-panel">
          <div className="panel-heading">
            <div>
              <h2>Scenario controls</h2>
              <p>Changes remain separate from the baseline.</p>
            </div>
          </div>

          <div className="control-list">
            {controls.map((control) => {
              const baseline = demoBaseline[control.key];
              const value = inputs[control.key];
              const overridden = overrides[control.key] !== undefined;

              return (
                <div className={`control ${overridden ? "is-overridden" : ""}`} key={control.key}>
                  <div className="control-head">
                    <label htmlFor={control.key}>{control.label}</label>
                    <output>{control.format(value)}</output>
                  </div>
                  <input
                    id={control.key}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={value}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [control.key]: Number(event.target.value),
                      }))
                    }
                  />
                  <div className="control-meta">
                    <span className="source" title={baseline.sourceDescription}>
                      {baseline.sourceType.replaceAll("_", " ")}
                    </span>
                    <button
                      className="reset-button"
                      disabled={!overridden}
                      onClick={() =>
                        setOverrides((current) => {
                          const next = { ...current };
                          delete next[control.key];
                          return next;
                        })
                      }
                    >
                      Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="action-row">
            <button className="action-button secondary" onClick={() => setOverrides({})}>
              Reset all
            </button>
            <button className="action-button" onClick={() => void exportSnapshot()}>
              Export JSON
            </button>
          </div>

          <div className="callout">
            Baseline sources are visible for every control. Lunch Money-derived values and Canadian reference datasets can replace demonstration fallbacks without changing the projection engine.
          </div>
        </aside>
      </section>
    </main>
  );
}
