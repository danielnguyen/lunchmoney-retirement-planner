"use client";

import { useMemo, useState } from "react";
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
import { demoInputs, demoSources } from "@/src/demo/baseline";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type {
  AnnualProjection,
  ProjectionInputs,
  ProjectionView,
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

type DisplayMode = "real" | "nominal";
type Scope = "combined" | string;
type Overrides = Record<string, number>;

type ControlDefinition = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  get: (inputs: ProjectionInputs) => number;
  set: (inputs: ProjectionInputs, value: number) => void;
};

function memberControl(
  memberIndex: number,
  field: "retirementAge" | "cppStartAge" | "oasStartAge",
  label: string,
): ControlDefinition {
  const key = `${demoInputs.members[memberIndex]?.id}.${field}`;
  return {
    key,
    label,
    min: field === "retirementAge" ? 45 : field === "cppStartAge" ? 60 : 65,
    max: field === "retirementAge" ? 75 : 70,
    step: 1,
    format: String,
    get: (inputs) => {
      const member = inputs.members[memberIndex]!;
      if (field === "retirementAge") return member.retirementAge;
      if (field === "cppStartAge") return member.cpp.startAge;
      return member.oas.startAge;
    },
    set: (inputs, value) => {
      const member = inputs.members[memberIndex]!;
      if (field === "retirementAge") member.retirementAge = value;
      if (field === "cppStartAge") member.cpp.startAge = value;
      if (field === "oasStartAge") member.oas.startAge = value;
    },
  };
}

const controls: ControlDefinition[] = [
  {
    key: "monthlyEssentialSpendingToday",
    label: "Essential monthly spending",
    min: 1000,
    max: 15000,
    step: 100,
    format: (value) => currency.format(value),
    get: (inputs) => inputs.monthlyEssentialSpendingToday,
    set: (inputs, value) => {
      inputs.monthlyEssentialSpendingToday = value;
    },
  },
  {
    key: "monthlyDiscretionarySpendingToday",
    label: "Discretionary monthly spending",
    min: 0,
    max: 10000,
    step: 100,
    format: (value) => currency.format(value),
    get: (inputs) => inputs.monthlyDiscretionarySpendingToday,
    set: (inputs, value) => {
      inputs.monthlyDiscretionarySpendingToday = value;
    },
  },
  {
    key: "retirementGoalToday",
    label: "Retirement net-worth goal",
    min: 0,
    max: 5000000,
    step: 25000,
    format: (value) => currency.format(value),
    get: (inputs) => inputs.retirementGoalToday,
    set: (inputs, value) => {
      inputs.retirementGoalToday = value;
    },
  },
  {
    key: "annualInflation",
    label: "Inflation",
    min: 0,
    max: 0.08,
    step: 0.001,
    format: (value) => percent.format(value),
    get: (inputs) => inputs.annualInflation,
    set: (inputs, value) => {
      inputs.annualInflation = value;
    },
  },
  {
    key: "effectiveTaxRate",
    label: "Effective tax rate",
    min: 0,
    max: 0.5,
    step: 0.005,
    format: (value) => percent.format(value),
    get: (inputs) => inputs.tax.effectiveTaxRate,
    set: (inputs, value) => {
      inputs.tax.effectiveTaxRate = value;
    },
  },
  ...demoInputs.members.flatMap((member, index) => [
    memberControl(index, "retirementAge", `${member.label} retirement age`),
    memberControl(index, "cppStartAge", `${member.label} CPP start age`),
    memberControl(index, "oasStartAge", `${member.label} OAS start age`),
  ]),
];

function materializeInputs(overrides: Overrides): ProjectionInputs {
  const inputs = structuredClone(demoInputs);
  for (const control of controls) {
    const override = overrides[control.key];
    if (override !== undefined) control.set(inputs, override);
  }
  return inputs;
}

function selectView(point: AnnualProjection, scope: Scope, mode: DisplayMode): ProjectionView {
  if (scope === "combined") return point[mode];
  return point.members[scope]?.[mode] ?? point[mode];
}

function compactCurrency(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (absolute >= 1000) return `$${Math.round(value / 1000)}k`;
  return `$${Math.round(value)}`;
}

function sourceLabel(key: string): string {
  return demoSources[key]?.sourceType.replaceAll("_", " ") ?? "application fallback";
}

export function PlannerDashboard() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [mode, setMode] = useState<DisplayMode>("real");
  const [scope, setScope] = useState<Scope>("combined");
  const [allocationYear, setAllocationYear] = useState(demoInputs.startYear + 20);
  const [exportStatus, setExportStatus] = useState("");

  const inputs = useMemo(() => materializeInputs(overrides), [overrides]);
  const projection = useMemo(() => calculateProjection(inputs), [inputs]);
  const chartData = useMemo(
    () =>
      projection.annual.map((point) => {
        const view = selectView(point, scope, mode);
        return {
          year: point.calendarYear,
          age: point.primaryAge,
          essential: view.outflows.essential,
          discretionary: view.outflows.discretionary,
          oneTime: view.outflows.oneTime,
          tax: view.outflows.tax,
          contributions: view.outflows.contributions,
          employment: view.income.employment,
          cpp: view.income.cpp,
          oas: view.income.oas,
          pension: view.income.pension,
          otherIncome: view.income.other,
          cashWithdrawal: view.withdrawals.cash,
          tfsaWithdrawal: view.withdrawals.tfsa,
          rrspWithdrawal: view.withdrawals.rrspRrif,
          nonRegisteredWithdrawal: view.withdrawals.nonRegistered,
          cash: view.balances.cash,
          tfsa: view.balances.tfsa,
          rrspRrif: view.balances.rrspRrif,
          nonRegistered: view.balances.nonRegistered,
          realAssets: view.balances.realAssets,
          debt: -view.balances.debts,
          netWorth: view.balances.netWorth,
          goal:
            mode === "real"
              ? inputs.retirementGoalToday
              : inputs.retirementGoalToday *
                Math.pow(1 + inputs.annualInflation, point.calendarYear - inputs.startYear + 1),
          milestones: point.milestones.join(" · "),
        };
      }),
    [inputs, mode, projection, scope],
  );

  const selectedAllocationPoint = useMemo(
    () =>
      projection.annual.reduce((closest, point) =>
        Math.abs(point.calendarYear - allocationYear) < Math.abs(closest.calendarYear - allocationYear)
          ? point
          : closest,
      ),
    [allocationYear, projection],
  );
  const selectedAllocationView = selectView(selectedAllocationPoint, scope, mode);
  const allocationData = [
    { name: "Cash", value: selectedAllocationView.allocation.cash },
    { name: "Fixed income", value: selectedAllocationView.allocation.fixedIncome },
    { name: "Equity", value: selectedAllocationView.allocation.equity },
  ].filter((item) => item.value > 0);

  const milestonePoints = projection.annual.filter((point) => point.milestones.length > 0);
  const firstRetirementPoint = projection.annual.find(
    (point) => point.calendarYear === projection.summary.firstRetirementYear,
  );

  async function download(endpoint: string, filename: string) {
    setExportStatus("Preparing export…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inputs),
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

  return (
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">Retirement lifecycle report</span>
          <h1>See how income, spending, and every account change over time.</h1>
          <p>
            Explore a source-aware baseline, test reversible scenarios, and inspect the annual cash flow behind each projection.
          </p>
        </div>
        <div className="hero-actions no-print">
          <button className="button secondary" onClick={() => window.print()}>
            Print / PDF
          </button>
          <button
            className="button"
            onClick={() =>
              void download(
                "/api/v1/exports/projection",
                `retirement-projection-${new Date().toISOString().slice(0, 10)}.json`,
              )
            }
          >
            Export JSON
          </button>
        </div>
      </header>

      <section className="toolbar no-print" aria-label="Report controls">
        <div className="segmented">
          <button className={mode === "real" ? "active" : ""} onClick={() => setMode("real")}>
            Today&apos;s dollars
          </button>
          <button className={mode === "nominal" ? "active" : ""} onClick={() => setMode("nominal")}>
            Future dollars
          </button>
        </div>
        <label>
          View
          <select value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="combined">Combined household</option>
            {inputs.members.map((member) => (
              <option value={member.id} key={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </label>
        <span className="status">{exportStatus || "Generic demonstration data"}</span>
      </section>

      <section className="summary-grid" aria-label="Projection summary">
        <article className="metric-card">
          <span>At first retirement</span>
          <strong>{currency.format(projection.summary.netWorthAtFirstRetirementToday)}</strong>
          <small>{firstRetirementPoint?.calendarYear} · today&apos;s dollars</small>
        </article>
        <article className="metric-card">
          <span>Goal</span>
          <strong>{currency.format(projection.summary.retirementGoalToday)}</strong>
          <small>Net-worth target</small>
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
              <div>
                <span className="section-kicker">Expenses</span>
                <h2>Annual spending projection</h2>
              </div>
              <span className="pill">{mode === "real" ? "Today’s dollars" : "Future dollars"}</span>
            </div>
            <div className="chart-shell medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                  <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Legend />
                  <Bar dataKey="essential" name="Essential" stackId="expenses" fill="#55b8d8" />
                  <Bar dataKey="discretionary" name="Discretionary" stackId="expenses" fill="#8c78dd" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-card wide-chart">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Cash inflow</span>
                <h2>How each year is funded</h2>
              </div>
            </div>
            <div className="chart-shell tall">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                  <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Legend />
                  <Bar dataKey="employment" name="Employment" stackId="inflow" fill="#3f78c5" />
                  <Bar dataKey="cpp" name="CPP" stackId="inflow" fill="#4eb5d2" />
                  <Bar dataKey="oas" name="OAS" stackId="inflow" fill="#77d2b2" />
                  <Bar dataKey="pension" name="Pension" stackId="inflow" fill="#a9cf6c" />
                  <Bar dataKey="cashWithdrawal" name="Cash" stackId="inflow" fill="#d8bd65" />
                  <Bar dataKey="nonRegisteredWithdrawal" name="Non-registered" stackId="inflow" fill="#d99269" />
                  <Bar dataKey="rrspWithdrawal" name="RRSP / RRIF" stackId="inflow" fill="#b978b8" />
                  <Bar dataKey="tfsaWithdrawal" name="TFSA" stackId="inflow" fill="#8072d7" />
                  <Line dataKey="tax" name="Tax" stroke="#ef7d86" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-card wide-chart">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Cash outflow</span>
                <h2>Spending, taxes, and contributions</h2>
              </div>
            </div>
            <div className="chart-shell medium">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                  <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Legend />
                  <Bar dataKey="essential" name="Essential" stackId="outflow" fill="#55b8d8" />
                  <Bar dataKey="discretionary" name="Discretionary" stackId="outflow" fill="#8c78dd" />
                  <Bar dataKey="oneTime" name="One-time events" stackId="outflow" fill="#d99269" />
                  <Bar dataKey="tax" name="Tax" stackId="outflow" fill="#ef7d86" />
                  <Bar dataKey="contributions" name="Contributions" stackId="outflow" fill="#70d6b2" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-card wide-chart">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Net worth</span>
                <h2>Account-level burndown</h2>
              </div>
            </div>
            <div className="chart-shell tall">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                  <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                  <Legend />
                  <Area dataKey="cash" name="Cash" stackId="balances" fill="#d8bd65" stroke="#d8bd65" />
                  <Area dataKey="nonRegistered" name="Non-registered" stackId="balances" fill="#d99269" stroke="#d99269" />
                  <Area dataKey="tfsa" name="TFSA" stackId="balances" fill="#8072d7" stroke="#8072d7" />
                  <Area dataKey="rrspRrif" name="RRSP / RRIF" stackId="balances" fill="#4eb5d2" stroke="#4eb5d2" />
                  <Area dataKey="realAssets" name="Real assets" stackId="balances" fill="#70d6b2" stroke="#70d6b2" />
                  <Area dataKey="debt" name="Debts" stackId="balances" fill="#ef7d86" stroke="#ef7d86" />
                  <Line dataKey="netWorth" name="Net worth" stroke="#f6f8fb" strokeWidth={3} dot={false} />
                  <Line dataKey="goal" name="Goal" stroke="#f2bd63" strokeWidth={2} strokeDasharray="7 6" dot={false} />
                  {milestonePoints.slice(0, 10).map((point) => (
                    <ReferenceLine
                      key={`${point.calendarYear}-${point.milestones.join("-")}`}
                      x={point.calendarYear}
                      stroke="#9eb0c4"
                      strokeDasharray="4 4"
                    />
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
                <div>
                  <span className="section-kicker">Allocation</span>
                  <h2>Asset mix in {selectedAllocationPoint.calendarYear}</h2>
                </div>
              </div>
              <div className="chart-shell compact">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="48%"
                      outerRadius="78%"
                      paddingAngle={2}
                      label={({ name, percent: share }) => `${name} ${Math.round((share ?? 0) * 100)}%`}
                    >
                      {allocationData.map((item, index) => (
                        <Cell
                          key={item.name}
                          fill={["#d8bd65", "#4eb5d2", "#8072d7"][index % 3]}
                        />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => currency.format(Number(value))} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <label className="allocation-slider no-print">
                Year {allocationYear}
                <input
                  type="range"
                  min={projection.annual[0]!.calendarYear}
                  max={projection.annual.at(-1)!.calendarYear}
                  value={allocationYear}
                  onChange={(event) => setAllocationYear(Number(event.target.value))}
                />
              </label>
            </article>

            <article className="report-card">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">Observations</span>
                  <h2>Deterministic report notes</h2>
                </div>
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
              <div>
                <span className="section-kicker">Annual details</span>
                <h2>Inspectable projection ledger</h2>
              </div>
              <button
                className="button secondary no-print"
                onClick={() =>
                  void download(
                    `/api/v1/exports/projection-csv?mode=${mode}`,
                    `retirement-projection-${mode}-${new Date().toISOString().slice(0, 10)}.csv`,
                  )
                }
              >
                Export CSV
              </button>
            </div>
            <div className="table-shell">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Age</th>
                    <th>Income</th>
                    <th>Withdrawals</th>
                    <th>Tax</th>
                    <th>Spending</th>
                    <th>Net worth</th>
                    <th>Milestones</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.annual.map((point) => {
                    const view = selectView(point, scope, mode);
                    return (
                      <tr key={point.calendarYear}>
                        <td>{point.calendarYear}</td>
                        <td>{point.primaryAge}</td>
                        <td>{currency.format(view.income.total)}</td>
                        <td>{currency.format(view.withdrawals.total)}</td>
                        <td>{currency.format(view.outflows.tax)}</td>
                        <td>
                          {currency.format(
                            view.outflows.essential +
                              view.outflows.discretionary +
                              view.outflows.oneTime,
                          )}
                        </td>
                        <td>{currency.format(view.balances.netWorth)}</td>
                        <td>{point.milestones.join(" · ") || "—"}</td>
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
            <div>
              <span className="section-kicker">Scenario</span>
              <h2>Calculator controls</h2>
            </div>
            <button className="text-button" onClick={() => setOverrides({})}>
              Reset all
            </button>
          </div>
          <p className="panel-copy">
            Overrides remain separate from the baseline. Reset restores the resolved source value.
          </p>
          <div className="control-list">
            {controls.map((control) => {
              const baselineValue = control.get(demoInputs);
              const currentValue = control.get(inputs);
              const overridden = overrides[control.key] !== undefined;
              return (
                <div className={`control ${overridden ? "is-overridden" : ""}`} key={control.key}>
                  <div className="control-head">
                    <label htmlFor={control.key}>{control.label}</label>
                    <output>{control.format(currentValue)}</output>
                  </div>
                  <input
                    id={control.key}
                    type="range"
                    min={control.min}
                    max={control.max}
                    step={control.step}
                    value={currentValue}
                    onChange={(event) =>
                      setOverrides((current) => ({
                        ...current,
                        [control.key]: Number(event.target.value),
                      }))
                    }
                  />
                  <div className="control-meta">
                    <span>{sourceLabel(control.key)}</span>
                    <button
                      className="text-button"
                      disabled={!overridden}
                      onClick={() =>
                        setOverrides((current) => {
                          const next = { ...current };
                          delete next[control.key];
                          return next;
                        })
                      }
                    >
                      Reset to {control.format(baselineValue)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      <section className="report-card assumptions">
        <div className="section-heading">
          <div>
            <span className="section-kicker">Assumptions</span>
            <h2>Projection inputs and provenance</h2>
          </div>
        </div>
        <div className="assumption-grid">
          <div>
            <h3>General</h3>
            <dl>
              <div><dt>Projection period</dt><dd>{inputs.startYear}–{projection.annual.at(-1)?.calendarYear}</dd></div>
              <div><dt>Inflation</dt><dd>{percent.format(inputs.annualInflation)}</dd></div>
              <div><dt>Effective tax rate</dt><dd>{percent.format(inputs.tax.effectiveTaxRate)}</dd></div>
              <div><dt>Essential spending</dt><dd>{currency.format(inputs.monthlyEssentialSpendingToday)} / month</dd></div>
              <div><dt>Discretionary spending</dt><dd>{currency.format(inputs.monthlyDiscretionarySpendingToday)} / month</dd></div>
            </dl>
          </div>
          {inputs.members.map((member) => (
            <div key={member.id}>
              <h3>{member.label}</h3>
              <dl>
                <div><dt>Current age</dt><dd>{member.currentAge}</dd></div>
                <div><dt>Retirement age</dt><dd>{member.retirementAge}</dd></div>
                <div><dt>CPP start age</dt><dd>{member.cpp.startAge}</dd></div>
                <div><dt>CPP percentage</dt><dd>{percent.format(member.cpp.percentOfMaximum)}</dd></div>
                <div><dt>OAS start age</dt><dd>{member.oas.startAge}</dd></div>
                <div><dt>RRIF conversion age</dt><dd>{member.rrifConversionAge}</dd></div>
              </dl>
            </div>
          ))}
          <div>
            <h3>Accounts</h3>
            <dl>
              {inputs.accounts.map((account) => (
                <div key={account.id}>
                  <dt>{account.label} · {inputs.members.find((member) => member.id === account.ownerId)?.label}</dt>
                  <dd>{currency.format(account.openingBalance)} · {percent.format(account.annualReturn)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
