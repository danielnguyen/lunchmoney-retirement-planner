"use client";

import { useEffect, useState } from "react";
import type { DeterministicInflationPath, DeterministicReturnPath } from "@/src/domain/projection/return-path";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import type { SpendingCapacityResult } from "@/src/domain/projection/spending-capacity";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
export function PathRates({ path }: { path: DeterministicInflationPath | DeterministicReturnPath }) {
  return <p>Explicit {path.mode} path: {path.entries.map((entry) => {
    const period = "calendarYear" in entry ? entry.calendarYear : entry.calendarMonth;
    const rate = "annualReturn" in entry ? entry.annualReturn : "monthlyReturn" in entry ? entry.monthlyReturn : "annualInflation" in entry ? entry.annualInflation : entry.monthlyInflation;
    return `${period}: ${(rate * 100).toFixed(2)}%`;
  }).join("; ")}. Unlisted periods use the fallback.</p>;
}
export function useSpendingCapacity({ inputs }: { inputs: ProjectionInputs }) {
  const [enabled, setEnabled] = useState(false);
  const [submission, setSubmission] = useState<{ key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [response, setResponse] = useState<{ key: string; result?: SpendingCapacityResult; error?: string } | null>(null);
  const eligible = inputs.spendingPhases.filter((p) => p.source === "explicit_configuration" && p.startAge >= inputs.person.retirementAge && p.endAge <= inputs.endAge);
  const phaseIds = selected.filter((id) => eligible.some((p) => p.id === id));
  const key = JSON.stringify({ inputs, spendingCapacity: { phaseIds } });
  const requested = enabled && phaseIds.length > 0;
  useEffect(() => {
    if (!submission) return;
    const submittedKey = submission.key;
    const controller = new AbortController();
    void fetch("/api/v1/projections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: submittedKey, signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error("Capacity analysis unavailable for these inputs.");
      const result = await res.json();
      if (!controller.signal.aborted) setResponse({ key: submittedKey, result });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setResponse({ key: submittedKey, error: "Capacity analysis unavailable for these inputs." });
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [submission]);
  const current = requested && response?.key === key ? response : null;
  const result = current?.result;
  return { busy, setBusy, setSubmission, key, enabled, setEnabled, selected, setSelected, eligible, phaseIds, requested, current, result };
}
export function SpendingCapacity(props: { inputs: ProjectionInputs }) {
  return <SpendingCapacityView state={useSpendingCapacity(props)} />;
}
export function SpendingCapacityView({ state }: { state: ReturnType<typeof useSpendingCapacity> }) {
  const { busy, setBusy, setSubmission, key, enabled, setEnabled, setSelected, eligible, phaseIds, requested, current, result } = state;
  return <section className="comparison-panel capacity-panel" aria-labelledby="capacity-heading">
    <h2 id="capacity-heading" tabIndex={-1}>Spending capacity</h2>
    <p>How much could I spend each month in retirement?</p>
    <div className="analysis-summary" aria-label="Spending capacity summary">
      <p>Monthly Canadian dollars, adjusted for inflation. Essentials stay fixed; this is not a safety guarantee.</p>
      {result && <div aria-live="polite">
        <p>Status: {result.status.replaceAll("_", " ")}. {result.reason}</p>
        {result.status === "available" && <>
          <div className="comparison-cards">{result.phases.map(phase => <article key={phase.phaseId}>
            <h3>{eligible.find(p => p.id === phase.phaseId)?.label ?? "Retirement spending"}: ages {phase.startAge}–{phase.endAge}</h3>
            <p><strong>{money.format(phase.monthlyLifestyleCapacityToday!)} / month</strong></p>
            <p>{money.format(phase.monthlyEssentialToday)} essentials + {money.format(phase.monthlyDiscretionaryCapacityToday!)} discretionary.</p>
            <p>{money.format(phase.monthlyDifferenceToday!)} difference from configured spending.</p>
          </article>)}</div>
          <details><summary>Monthly spending table</summary><div className="income-table"><table>
          <caption>Inflation-adjusted monthly retirement lifestyle capacity</caption>
          <thead><tr><th>Phase ages</th><th>Essential</th><th>Discretionary capacity</th><th>Total lifestyle</th><th>Difference from configured</th></tr></thead>
          <tbody>{result.phases.map((phase) => <tr key={phase.phaseId}>
            <th>{phase.startAge}–{phase.endAge}</th><td>{money.format(phase.monthlyEssentialToday)}</td>
            <td>{money.format(phase.monthlyDiscretionaryCapacityToday!)}</td><td>{money.format(phase.monthlyLifestyleCapacityToday!)}</td><td>{money.format(phase.monthlyDifferenceToday!)}</td>
          </tr>)}</tbody>
        </table></div></details></>}
      </div>}
      {!result && <p>{busy ? "Calculating deterministic capacity…" : "Select retirement spending phases and calculate to see supported monthly amounts."}</p>}
      {result && <p>{result.effectiveInputs.inflationPath || result.effectiveInputs.accounts.some(account => account.returnPath) ? "Configured stress: explicit return or inflation paths; not necessarily adverse." : "Baseline: configured constant returns and inflation."}</p>}
    </div>
    <label><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Calculate spending capacity</label>
    {enabled && <>
      <fieldset><legend>Select retirement spending phases</legend>
        {eligible.map((phase) => <label key={phase.id}>
          <input type="checkbox" checked={phaseIds.includes(phase.id)} onChange={(event) => setSelected((prior) => event.target.checked ? [...prior, phase.id] : prior.filter((id) => id !== phase.id))} />
          {phase.label} (ages {phase.startAge}–{phase.endAge})
        </label>)}
      </fieldset>
      {!eligible.length && <p>Unavailable: configure explicit spending phases entirely within retirement.</p>}
      {!!eligible.length && !phaseIds.length && <p>Select at least one retirement phase.</p>}
      <button type="button" disabled={busy || !requested} onClick={() => { setBusy(true); setSubmission({ key }); }}>Calculate spending capacity</button>
      {requested && !current && <p role="status">{busy ? "Calculating deterministic capacity…" : "Assumptions changed or not calculated. Calculate to update capacity."}</p>}
      {current?.error && <p role="status">{current.error}</p>}
      {result && <div>
        <details><summary>Funding evidence and assumptions</summary>
        <p>Terminal financial assets: {result.terminalFinancialAssetsToday === null ? "Unavailable" : money.format(result.terminalFinancialAssetsToday)}.
          {result.status !== "unavailable" && <> First funding shortfall age: {result.firstShortfallAge ?? "None"}. Depletion age: {result.depletionAge ?? "None"}.</>}</p>
        <p>Effective {result.effectiveInputs.effectiveDate}; retirement age {result.effectiveInputs.retirementAge}; terminal age {result.effectiveInputs.terminalAge}; minimum ending assets {money.format(result.effectiveInputs.minimumEndingFinancialAssetsToday)} ({result.effectiveInputs.terminalFloorSource}). Projected retirement assets {money.format(result.effectiveInputs.projectedRetirementAssetsToday)}.</p>
        <p>Source: active resolved plan and temporary scenario overrides. {result.effectiveInputs.returnPath}. Tax mode: {result.effectiveInputs.taxMode}. Withdrawal strategy: configured static priority.</p>
        <details><summary>Effective return and inflation assumptions</summary>
          <p>Fallback annual inflation: {result.effectiveInputs.annualInflation * 100}%.</p>
          {result.effectiveInputs.inflationPath && <PathRates path={result.effectiveInputs.inflationPath} />}
          <ul>{result.effectiveInputs.accounts.map((account, index) => <li key={index}>
            {account.accountType}: withdrawal priority {account.withdrawalPriority}, fallback annual return {account.annualReturn * 100}%.
            {account.returnPath && <PathRates path={account.returnPath} />}
          </li>)}</ul>
        </details>
        <ul>{result.limitations.map((text) => <li key={text}>{text}</li>)}</ul></details>
      </div>}
    </>}
  </section>;
}
