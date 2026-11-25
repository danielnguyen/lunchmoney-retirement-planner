"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import type { ComparisonResult } from "@/src/domain/scenario/comparison";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const exactMoney = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tooltipMoney = (value: unknown) => typeof value === "number" ? exactMoney.format(value) : String(value ?? "");
const colors = ["#176b87", "#9b4618", "#674ea7", "#26734d", "#a12c64"];

export function ScenarioComparison({ inputs, definitions }: { inputs: ProjectionInputs; definitions: ComparisonScenarioConfig[] }) {
  const [scenarios, setScenarios] = useState(() => structuredClone(definitions));
  const [response, setResponse] = useState<{ key: string; results?: ComparisonResult[]; error?: string } | null>(null);
  const key = JSON.stringify({ inputs, scenarioComparison: scenarios });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/projections", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message ?? "Comparison failed");
        setResponse({ key, results: body });
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResponse({ key, error: error instanceof Error ? error.message : "Comparison failed" });
      });
    return () => controller.abort();
  }, [key]);
  const current = response?.key === key ? response : null;
  const results = current?.results;
  function edit(id: string, change: (draft: ComparisonScenarioConfig) => void) {
    setScenarios((previous) => previous.map((scenario) => {
      if (scenario.id !== id) return scenario;
      const draft = structuredClone(scenario);
      change(draft);
      return draft;
    }));
  }
  function numeric(label: string, value: number, change: (value: number) => void) {
    return <label>{label}<input type="number" min="0" step="any" value={value} onChange={(event) => {
      const value = event.target.valueAsNumber;
      if (Number.isFinite(value) && value >= 0) change(value);
    }} /></label>;
  }
  return <section className="comparison-panel" aria-labelledby="comparison-heading">
    <h2 id="comparison-heading">Scenario Comparison</h2>
    <p>Deterministic scenarios share the refreshed baseline and active temporary controls. These edits are temporary; use Edit YAML and Save config to persist definitions. All chart amounts are in today’s dollars.</p>
    <details><summary>Active comparison inputs and temporary edits</summary>
      <p>Retirement age: {inputs.person.retirementAge}; terminal age: {inputs.endAge}. Phase boundaries, liabilities, returns, inflation and tax assumptions come from the active plan.</p>
      <div className="comparison-cards">{scenarios.map((scenario) => <fieldset key={scenario.id}>
        <legend>{scenario.label}</legend>
        <p>Configured ID: {scenario.id}</p>
        <label>Scenario name<input value={scenario.label} onChange={(event) => edit(scenario.id, (draft) => { draft.label = event.target.value; })} /></label>
        <label>Personal contribution policy<select value={scenario.contributionPolicy} onChange={(event) => edit(scenario.id, (draft) => { draft.contributionPolicy = event.target.value as ComparisonScenarioConfig["contributionPolicy"]; })}>
          <option value="configured_fixed_plan">Configured fixed plan; expose infeasibility</option><option value="cash_constrained">Cash constrained; protect configured reserves</option>
        </select></label>
        {scenario.spending.map((entry) => <div key={entry.phaseId}>
          <p>Spending phase: {entry.phaseId}</p>
          {entry.adjustment.mode === "annual_lifestyle_budget" ? numeric("Annual lifestyle budget (today’s dollars; essentials protected)", entry.adjustment.annualAmountToday, (value) => edit(scenario.id, (draft) => {
            const adjustment = draft.spending.find((item) => item.phaseId === entry.phaseId)!.adjustment;
            if (adjustment.mode === "annual_lifestyle_budget") adjustment.annualAmountToday = value;
          })) : <>
            {numeric("Essential multiplier", entry.adjustment.essentialMultiplier, (value) => edit(scenario.id, (draft) => { const adjustment = draft.spending.find((item) => item.phaseId === entry.phaseId)!.adjustment; if (adjustment.mode === "multipliers") adjustment.essentialMultiplier = value; }))}
            {numeric("Discretionary multiplier", entry.adjustment.discretionaryMultiplier, (value) => edit(scenario.id, (draft) => { const adjustment = draft.spending.find((item) => item.phaseId === entry.phaseId)!.adjustment; if (adjustment.mode === "multipliers") adjustment.discretionaryMultiplier = value; }))}
          </>}
        </div>)}
        {scenario.personalContributions.map((entry) => <div key={`${entry.target.mode === "account" ? entry.target.accountId : "personal_investing"}/${entry.phaseId}`}>{numeric(`Monthly personal contribution: ${entry.phaseId}`, entry.monthlyAmountToday, (value) => edit(scenario.id, (draft) => { const selected = draft.personalContributions.find((candidate) => candidate.phaseId === entry.phaseId && candidate.target.mode === entry.target.mode && (candidate.target.mode !== "account" || (entry.target.mode === "account" && candidate.target.accountId === entry.target.accountId)))!; selected.monthlyAmountToday = value; }))}</div>)}
      </fieldset>)}</div>
      <button type="button" onClick={() => setScenarios(structuredClone(definitions))}>Reset comparison edits</button>
    </details>
    {!current && <p role="status">Calculating scenarios…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {results && <>
      <div className="comparison-table" tabIndex={0} role="region" aria-label="Side-by-side scenario scorecard"><table>
        <caption>Calculated scenario outcomes in today’s dollars</caption>
        <thead><tr><th scope="col">Metric</th>{results.map((result) => <th scope="col" key={result.id}>{result.label}</th>)}</tr></thead>
        <tbody>
          {([
            ["Status", (r: ComparisonResult) => r.status],
            ["Portfolio at retirement", (r: ComparisonResult) => r.summary ? money.format(r.summary.financialAssetsAtRetirementToday) : "Unavailable"],
            ["Mortgage payoff age", (r: ComparisonResult) => r.summary?.mortgagePayoffAge ?? "No projected payoff"],
            ["First funding shortfall age", (r: ComparisonResult) => r.firstFundingShortfallAge ?? (r.summary ? "None calculated" : "Unavailable")],
            ["Asset depletion age", (r: ComparisonResult) => r.summary?.financialAssetsDepletionAge ?? (r.summary ? "None calculated" : "Unavailable")],
            ["Assets at terminal age", (r: ComparisonResult) => r.summary?.endingFinancialAssetsToday != null ? money.format(r.summary.endingFinancialAssetsToday) : "Unavailable"],
            ["Maximum sustainable spending", () => "Not calculated"],
          ] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th>{results.map((result) => <td key={result.id}>{value(result)}</td>)}</tr>)}
        </tbody>
      </table></div>
      <div className="comparison-cards">{results.map((result) => <article key={result.id} aria-label={`${result.label} calculation details`}>
        <h3>{result.label}</h3>{result.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        {result.activeInputs && <details><summary>Resolved inputs and sources</summary>
          <p>Baseline effective date: {result.activeInputs.effectiveDate}. Scenario definition: {JSON.stringify(result.definition) === JSON.stringify(definitions.find((entry) => entry.id === result.id)) ? "YAML configuration" : "Temporary browser edits"}.</p>
          <p>Protected combined reserve: {money.format(result.activeInputs.reserveTargetToday)} today; annual indexing {new Intl.NumberFormat("en-CA", { style: "percent" }).format(result.activeInputs.reserveIndexingRate)}. Operating target: {result.activeInputs.operatingCashTargetToday === null ? "Not configured" : money.format(result.activeInputs.operatingCashTargetToday)}.</p>
          <ul>{result.activeInputs.spending.map((phase) => <li key={phase.phaseId}>{phase.label} ({phase.phaseId}), ages {phase.startAge}–{phase.endAge}: essential {exactMoney.format(phase.annualEssentialToday)}, discretionary {exactMoney.format(phase.annualDiscretionaryToday)} annually; {phase.source}.</li>)}</ul>
          <ul>{result.activeInputs.personalContributions.map((phase) => <li key={`${phase.accountId}/${phase.phaseId}`}>{phase.label} ({phase.phaseId}), ages {phase.startAge}–{phase.endAge}: {exactMoney.format(phase.monthlyAmountToday)} monthly; active baseline {exactMoney.format(phase.baselineMonthlyAmountToday)}.</li>)}</ul>
        </details>}
        <h4>Annual working-life cash allocation</h4>
        <div role="img" aria-label={`${result.label}: annual take-home and other inflows, lifestyle, debt and investment deposits`}>
          <ResponsiveContainer width="100%" height={240}><BarChart data={result.annual}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="year" /><YAxis /><Tooltip formatter={tooltipMoney} /><Legend />
            <Bar dataKey="takeHome" name="Take-home and other inflows" fill={colors[0]} /><Bar dataKey="lifestyle" name="Lifestyle" fill={colors[1]} /><Bar dataKey="liabilityPayments" name="Regular debt payments" fill={colors[2]} /><Bar dataKey="extraDebtPayments" name="Extra debt payments" fill={colors[4]} /><Bar dataKey="actualPersonal" name="Personal investing from current cash" fill={colors[3]} />
          </BarChart></ResponsiveContainer>
        </div>
        <details><summary>Accessible annual cash-flow ledger</summary><div className="comparison-table"><table><caption>{result.label}: working months only, today’s dollars</caption><thead><tr><th>Year / months</th><th>Take-home and other inflows</th><th>Lifestyle</th><th>Regular debt</th><th>Extra debt</th><th>Planned personal</th><th>Personal investing from current cash</th><th>Gross personal deposits</th><th>Deposits financed by withdrawals</th><th>Withheld workplace</th><th>Asset withdrawals</th><th>Tax</th><th>Other outflows</th><th>Cash retained</th><th>Targeted deposits</th><th>Unfunded outflows</th><th>Unallocated personal</th><th>Reconciliation difference</th></tr></thead><tbody>{result.annual.map((row) => <tr key={row.year}><th scope="row">{row.year} / {row.months}</th>{(["takeHome", "lifestyle", "liabilityPayments", "extraDebtPayments", "plannedPersonal", "actualPersonal", "personalDeposits", "withdrawalFundedPersonal", "withheld", "withdrawals", "tax", "otherOutflows", "retained", "targetedDeposits", "unfunded", "unallocatedPersonal", "reconciliationDifference"] as const).map((field) => <td key={field}>{exactMoney.format(row[field])}</td>)}</tr>)}</tbody></table></div></details>
      </article>)}</div>
      <h3>Financial assets across ages</h3>
      <div role="img" aria-label="Shared comparison of real-dollar financial asset balances across ages"><ResponsiveContainer width="100%" height={300}><LineChart><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} allowDuplicatedCategory={false} /><YAxis /><Tooltip formatter={tooltipMoney} /><Legend />{results.map((result, index) => <Line key={result.id} data={result.trajectory} dataKey="financialAssetsToday" name={result.label} stroke={colors[index % colors.length]} strokeDasharray={`${index + 1} 2`} dot={false} />)}</LineChart></ResponsiveContainer></div>
      <details><summary>Accessible asset trajectory data</summary>{results.map((result) => <table key={result.id}><caption>{result.label}: financial assets in today’s dollars</caption><thead><tr><th>Age</th><th>Financial assets</th></tr></thead><tbody>{result.trajectory.map((row) => <tr key={row.age}><th scope="row">{row.age}</th><td>{money.format(row.financialAssetsToday)}</td></tr>)}</tbody></table>)}</details>
    </>}
  </section>;
}
