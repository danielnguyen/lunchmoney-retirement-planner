"use client";

import { useEffect, useState } from "react";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import type { FireMilestoneRequest, FireMilestoneResult } from "@/src/domain/projection/fire-milestones";
import { careerPreset } from "@/src/domain/scenario/career";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import { PathRates } from "./spending-capacity";
import { CareerTransitionEditor } from "./career-transition";

export function useFireMilestones({ inputs, definitions, onResult }: {
  inputs: ProjectionInputs;
  definitions: ComparisonScenarioConfig[];
  onResult: (key: string, result: FireMilestoneResult | null) => void;
}) {
  const initial = (): FireMilestoneRequest => ({ retirementAge: inputs.person.retirementAge, stepMonths: 12,
    fullCppBenefitMultiplier: 1,
    coast: structuredClone(definitions.find(s => s.careerTransition?.phases.every(p => p.kind === "coast"))?.careerTransition ?? null),
    barista: structuredClone(definitions.find(s => s.careerTransition?.phases.every(p => p.kind === "barista"))?.careerTransition ?? null) });
  const [request, setRequest] = useState(initial);
  const [enabled, setEnabled] = useState(false);
  const [submission, setSubmission] = useState<{ key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<{ key: string; result?: FireMilestoneResult; error?: string } | null>(null);
  const activePaths = inputs as ProjectionInputsWithReturnPaths;
  const inputKey = JSON.stringify(inputs);
  const key = JSON.stringify({ inputs, fireMilestones: request });
  useEffect(() => {
    onResult(inputKey, enabled && response?.key === key ? response.result ?? null : null);
  }, [key, inputKey, enabled, response, onResult]);
  useEffect(() => {
    if (!submission) return;
    const controller = new AbortController();
    const submittedKey = submission.key;
    void fetch("/api/v1/projections", { method: "POST", headers: { "Content-Type": "application/json" }, body: submittedKey, signal: controller.signal })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Milestones unavailable.");
        if (!controller.signal.aborted) setResponse({ key: submittedKey, result: body });
      }).catch((error: unknown) => {
        if (!controller.signal.aborted) setResponse({ key: submittedKey, error: error instanceof Error ? error.message : "Milestones unavailable." });
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [submission]);
  const current = enabled && response?.key === key ? response : null;
  return { initial, request, setRequest, enabled, setEnabled, busy, setBusy, setSubmission, key, current, activePaths };
}
type FireProps = Parameters<typeof useFireMilestones>[0];
export function FireMilestones(props: FireProps) {
  return <FireMilestonesView {...props} state={useFireMilestones(props)} />;
}
export function FireMilestonesView({ inputs, definitions, state }: Omit<FireProps, "onResult"> & { state: ReturnType<typeof useFireMilestones> }) {
  const { initial, request, setRequest, enabled, setEnabled, busy, setBusy, setSubmission, key, current, activePaths } = state;
  return <section className="comparison-panel fire-panel" aria-labelledby="fire-heading">
    <h2 id="fire-heading" tabIndex={-1}>FIRE milestones</h2>
    <p>When could I stop saving for retirement, work less, or stop working?</p>
    <p>Full retirement target: age {request.retirementAge}. These milestones depend on the selected job terms and funding assumptions; they are not safety guarantees.</p>
    <div className="analysis-summary" aria-label="FIRE milestones summary">
      {current?.result ? <>        <div className="comparison-cards">{current.result.results.map(r => <article key={`${r.path}-${r.kind}`}>
          <h3>{r.kind === "full" ? "Full FIRE" : r.kind === "coast" ? "Coast FIRE" : "Barista FIRE"} — {r.path === "baseline" ? "Baseline" : "Configured stress"}</h3>
          <p>{r.status === "met_at_start" ? "Condition met at modeled start" : r.status === "future" ? "Conditional future milestone" : r.status === "not_found" ? "No milestone in tested range" : "Unavailable"}{r.candidate ? `: ${r.candidate.date}, age ${r.candidate.age.toFixed(2)}` : ""}.</p>
          <p>{r.kind === "coast" ? "Stop retirement saving; employment still covers living costs." : r.kind === "barista" ? "Work with the selected income and use permitted withdrawals for spending." : "Stop employment and retirement saving."}</p>
          <p>{r.reason}</p>
          {r.tested.some(c => c.provisionalTax) && <p>Tax modelling is provisional under the active compatibility assumptions.</p>}
          <details><summary>Candidate evidence ({r.tested.length} tested)</summary><ul>{r.tested.map(c => <li key={c.date}>{c.date}: {c.passes ? "Pass" : c.reason}{c.failure && <> Shortfall / disallowed funding: {c.failure.shortfallToday?.toFixed(2) ?? "unavailable"} today ({c.failure.category}).</>}; terminal financial assets today {c.terminalFinancialAssetsToday?.toFixed(2) ?? "unavailable"}.</li>)}</ul></details>
        </article>)}</div>
</> : <p>{busy ? "Calculating candidate months…" : "Choose employment terms and calculate to see your conditional milestones."}</p>}
    </div>
    <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Calculate conditional FIRE milestones</label>
    {enabled && <>
      <div className="career-editor">
        <label>Milestone full retirement age<input type="number" step="any" value={request.retirementAge} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) setRequest({ ...request, retirementAge: e.target.valueAsNumber }); }} /></label>
      </div><details><summary>Search and benefit settings</summary><div className="career-editor"><label>Candidate spacing<select value={request.stepMonths} onChange={e => setRequest({ ...request, stepMonths: Number(e.target.value) })}><option value={12}>12 months</option><option value={3}>3 months</option><option value={1}>1 month</option></select></label>
        <label>Full FIRE CPP multiplier<input type="number" min="0" max="1" step="0.05" value={request.fullCppBenefitMultiplier} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) setRequest({ ...request, fullCppBenefitMultiplier: e.target.valueAsNumber }); }} /></label>
      </div>
      </details><details><summary>How milestones are tested</summary><p>Search starts in the baseline month and ends at the earlier of baseline retirement and chosen full retirement. Spacing is explicit; no dates between tested points are certified. CPP entitlement is not recomputed from earnings. Baseline uses constant fallback returns/inflation; stress uses only your explicitly configured dated paths, which need not be adverse.</p></details>
      <div className="career-editor">{(["coast", "barista"] as const).map(kind => <div key={kind}>
        <button type="button" disabled={!inputs.person.employmentIncomePhases.length} onClick={() => setRequest({ ...request, [kind]: careerPreset(inputs, kind).careerTransition! })}>Use illustrative {kind} terms</button>
        {request[kind]?.phases.map((phase, index) => <label key={phase.id}>{kind} annual {phase.employment.mode === "gross_estimate" ? "gross" : "net"} salary · ages {phase.startAge}–{phase.endAge}
          <input type="number" min="0" step="any" value={phase.employment.mode === "gross_estimate" ? phase.employment.annualGrossToday : phase.employment.annualNetCashToday} onChange={e => {
            if (!Number.isFinite(e.target.valueAsNumber)) return;
            const career = structuredClone(request[kind]!);
            const employment = career.phases[index].employment;
            if (employment.mode === "gross_estimate") employment.annualGrossToday = e.target.valueAsNumber;
            else employment.annualNetCashToday = e.target.valueAsNumber;
            setRequest({ ...request, [kind]: career });
          }} />
        </label>)}
      </div>)}</div>
      <p>Illustrative job terms are editable placeholders. Select them explicitly or choose configured terms below.</p>
      {(["coast", "barista"] as const).map(kind => <details key={kind}><summary>{kind === "coast" ? "Coast" : "Barista"} employment assumptions and sources</summary>
        <p>Source: {JSON.stringify(request[kind]) === JSON.stringify(initial()[kind]) && request[kind] ? "Configured scenarioComparison template" : "Temporary explicit selection or edits"}. Selected intervals supply dated job and spending terms. Internal phase ages stay fixed; edge terms extend when the candidate or full retirement age moves.</p>
        <label>{kind} configured template<select value="" onChange={e => { const selected = definitions.find(s => s.id === e.target.value); if (selected?.careerTransition) setRequest({ ...request, [kind]: structuredClone(selected.careerTransition) }); }}><option value="">Select configured terms</option>{definitions.filter(s => s.careerTransition?.phases.every(p => p.kind === kind)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <p>Illustrations use half the first configured income and no employer match. They are editable placeholders, not known future job terms. Coast must fund living costs without withdrawals or retirement saving, including surplus saving. Barista may withdraw for spending but must meet required contributions and liquidity.</p>
        {request[kind] && <CareerTransitionEditor milestoneTemplate value={request[kind]} inputs={inputs} onChange={value => setRequest({ ...request, [kind]: value })} />}
      </details>)}
      <button type="button" onClick={() => setRequest(initial())}>Reset milestone assumptions</button>
      <button type="button" disabled={busy} onClick={() => { setBusy(true); setSubmission({ key }); }}>Calculate FIRE milestones</button>
      {!current && <p role="status">{busy ? "Calculating candidate months…" : "Assumptions changed or not calculated. Calculate to update milestones."}</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {current?.result && <div aria-live="polite">
        <details><summary>Result scope and limitations</summary><p>Effective {current.result.effectiveDate}; {request.stepMonths}-month grid through age {current.result.lastCandidateAge}. Horizon {inputs.endAge}; terminal financial asset floor {inputs.retirementRequirement.minimumEndingFinancialAssetsToday} today ({inputs.retirementRequirement.activeValueSource}). Home equity is excluded. Tax model: {inputs.tax.mode}; existing tax coverage limitations apply.</p></details>
        {!current.result.stressConfigured && <p>Stress unavailable: no explicit return or inflation path configured. No stress assumptions were invented.</p>}
        <details><summary>Exact active assumptions</summary>
          <p>Source: active resolved baseline plus temporary controls, effective {inputs.startDate}. Employment, savings and CPP overrides are shown in the editable assumptions above. Full FIRE uses retirement spending from its candidate month; Coast and Barista use template spending until full retirement.</p>
          <p>Monthly spending today before multipliers: essential {inputs.monthlyEssentialSpendingToday}, discretionary {inputs.monthlyDiscretionarySpendingToday}. Reserve target today: {inputs.surplusAllocation.targetCashReserveToday}; annual reserve indexing {inputs.surplusAllocation.reserveIndexingRate * 100}%. Inflation fallback: {inputs.annualInflation * 100}%.</p>
          <ul>{inputs.spendingPhases.map(p => <li key={p.id}>{p.label}, ages {p.startAge}–{p.endAge}: essential multiplier {p.essentialMultiplier}, discretionary multiplier {p.discretionaryMultiplier}; {p.source.replaceAll("_", " ")}.</li>)}</ul>
          <p>CPP at 65 today: {inputs.person.cpp.monthlyAmountAt65Today}/month before the selected multiplier; starts at {inputs.person.cpp.startAge}. OAS full amount today: {inputs.person.oas.fullMonthlyAmountAt65Today}/month; starts at {inputs.person.oas.startAge}. Pension today: {inputs.person.annualPensionToday}/year; starts at {inputs.person.pensionStartAge}. Eligibility and indexing remain as configured.</p>
          {activePaths.returnScenario?.inflationPath && <PathRates path={activePaths.returnScenario.inflationPath} />}
          <ul>{activePaths.accounts.map(a => <li key={a.id}>{a.label} ({a.type}): opening balance {a.openingBalance}; annual return fallback {a.annualReturn * 100}%; withdrawal priority {a.withdrawalPriority}.{a.returnPath && <PathRates path={a.returnPath} />}</li>)}</ul>
          <p>Configured liabilities, dated events, tax/room assumptions and retirement drawdown policy remain active; their full schedules and sources are in Planner Config and the existing report explanations. Home equity remains unavailable for withdrawals.</p>
        </details>
        <details><summary>Export limitations</summary><p>Results are deterministic and temporary. They do not claim safety or achievement today for a future date. Exports continue to describe the configured forward projection and exclude this analysis.</p></details>
      </div>}
    </>}
  </section>;
}
