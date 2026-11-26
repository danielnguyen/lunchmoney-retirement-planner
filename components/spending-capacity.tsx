"use client";

import { useEffect, useState } from "react";
import type { DeterministicInflationPath, DeterministicReturnPath } from "@/src/domain/projection/return-path";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import type { SpendingCapacityResult } from "@/src/domain/projection/spending-capacity";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
function PathRates({ path }: { path: DeterministicInflationPath | DeterministicReturnPath }) {
  return <p>Explicit {path.mode} path: {path.entries.map((entry) => {
    const period = "calendarYear" in entry ? entry.calendarYear : entry.calendarMonth;
    const rate = "annualReturn" in entry ? entry.annualReturn : "monthlyReturn" in entry ? entry.monthlyReturn : "annualInflation" in entry ? entry.annualInflation : entry.monthlyInflation;
    return `${period}: ${(rate * 100).toFixed(2)}%`;
  }).join("; ")}. Unlisted periods use the fallback.</p>;
}
export function SpendingCapacity({ inputs }: { inputs: ProjectionInputs }) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [response, setResponse] = useState<{ key: string; result?: SpendingCapacityResult; error?: string } | null>(null);
  const eligible = inputs.spendingPhases.filter((p) => p.source === "explicit_configuration" && p.startAge >= inputs.person.retirementAge && p.endAge <= inputs.endAge);
  const phaseIds = selected.filter((id) => eligible.some((p) => p.id === id));
  const key = JSON.stringify({ inputs, spendingCapacity: { phaseIds } });
  const requested = enabled && phaseIds.length > 0;
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    void fetch("/api/v1/projections", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: key, signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error("Capacity analysis unavailable for these inputs.");
      setResponse({ key, result: await res.json() });
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setResponse({ key, error: "Capacity analysis unavailable for these inputs." });
    });
    return () => controller.abort();
  }, [key, requested]);
  const current = requested && response?.key === key ? response : null;
  const result = current?.result;
  return <section className="comparison-panel" aria-labelledby="capacity-heading">
    <h2 id="capacity-heading">Retirement spending capacity</h2>
    <p>Optional deterministic scenario in today’s dollars, not a guaranteed safe withdrawal rate. Essentials stay fixed. Selected discretionary spending phases retain their relative shape.</p>
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
      {requested && !current && <p role="status">Calculating deterministic capacity…</p>}
      {current?.error && <p role="status">{current.error}</p>}
      {result && <div aria-live="polite">
        <p>Status: {result.status.replaceAll("_", " ")}. {result.reason}</p>
        {result.status === "available" && <table>
          <caption>Inflation-adjusted monthly retirement lifestyle capacity</caption>
          <thead><tr><th>Phase ages</th><th>Essential</th><th>Discretionary capacity</th><th>Total lifestyle</th><th>Difference from configured</th></tr></thead>
          <tbody>{result.phases.map((phase) => <tr key={phase.phaseId}>
            <th>{phase.startAge}–{phase.endAge}</th><td>{money.format(phase.monthlyEssentialToday)}</td>
            <td>{money.format(phase.monthlyDiscretionaryCapacityToday!)}</td><td>{money.format(phase.monthlyLifestyleCapacityToday!)}</td><td>{money.format(phase.monthlyDifferenceToday!)}</td>
          </tr>)}</tbody>
        </table>}
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
        <ul>{result.limitations.map((text) => <li key={text}>{text}</li>)}</ul>
      </div>}
    </>}
  </section>;
}
