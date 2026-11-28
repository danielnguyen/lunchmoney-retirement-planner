"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import type { EmploymentIncomeRequest, EmploymentIncomeResult, IncomeBoundary } from "@/src/domain/projection/employment-income";
import { careerPreset } from "@/src/domain/scenario/career";
import { CareerTransitionEditor } from "./career-transition";
import { PathRates } from "./spending-capacity";

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });
const amount = (n: number | null) => n === null ? "Unavailable" : money.format(n);
export function useEmploymentIncome({ inputs }: { inputs: ProjectionInputsWithReturnPaths; definitions: ComparisonScenarioConfig[] }) {
  const initial = (): EmploymentIncomeRequest => ({ retirementAge: inputs.person.retirementAge, stepMonths: 12,
    maxAnnualGrossToday: 200000, resolutionAnnualGrossToday: 100, career: null });
  const [request, setRequest] = useState(initial);
  const [assumptionSource, setAssumptionSource] = useState("No job terms selected");
  const [enabled, setEnabled] = useState(false);
  const [submission, setSubmission] = useState<{ key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<{ key: string; result?: EmploymentIncomeResult; error?: string } | null>(null);
  const key = JSON.stringify({ inputs, employmentIncome: request });
  useEffect(() => {
    if (!submission) return;
    const controller = new AbortController();
    const submittedKey = submission.key;
    void fetch("/api/v1/projections", { method: "POST", headers: { "Content-Type": "application/json" }, body: submittedKey, signal: controller.signal })
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.message ?? "Income curve unavailable.");
        if (!controller.signal.aborted) setResponse({ key: submittedKey, result: body });
      }).catch((error: unknown) => { if (!controller.signal.aborted) setResponse({ key: submittedKey, error: error instanceof Error ? error.message : "Income curve unavailable." }); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [submission]);
  const current = enabled && response?.key === key ? response : null;
  const [selectedDate, setSelectedDate] = useState("");
  return { initial, request, setRequest, assumptionSource, setAssumptionSource, enabled, setEnabled, busy, setBusy, setSubmission, key, current, selectedDate, setSelectedDate };
}
export function EmploymentIncome(props: { inputs: ProjectionInputsWithReturnPaths; definitions: ComparisonScenarioConfig[] }) {
  return <EmploymentIncomeView {...props} state={useEmploymentIncome(props)} />;
}
export function EmploymentIncomeView({ inputs, definitions, state }: { inputs: ProjectionInputsWithReturnPaths; definitions: ComparisonScenarioConfig[]; state: ReturnType<typeof useEmploymentIncome> }) {
  const { initial, request, setRequest, assumptionSource, setAssumptionSource, enabled, setEnabled, busy, setBusy, setSubmission, key, current, selectedDate, setSelectedDate } = state;
  const field = (label: string, name: "retirementAge" | "maxAnnualGrossToday") => <label>{label}<input type="number" step="any" value={request[name]} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) setRequest({ ...request, [name]: e.target.valueAsNumber }); }} /></label>;
  const evidence = (boundary: IncomeBoundary) => {
    const failure = boundary.status === "not_found" ? boundary.tested.at(-1)?.failure : null;
    return <>
      {failure && <p>{failure.date}: {failure.message} {failure.action}</p>}
      <details><summary>{boundary.status === "available" ? "Tested boundary" : boundary.status === "not_found" ? "No passing sampled income" : "Unavailable"}</summary>
        <p>{boundary.reason}</p><p>{boundary.testedCount} distinct salaries sampled; showing range endpoints and boundary evidence.</p><p>{boundary.adjacentLowerFails ? "Adjacent lower salary fails at the selected resolution." : "No adjacent lower boundary certified."}</p>
        <ul>{boundary.tested.map(t => <li key={t.annualGrossToday}>{amount(t.annualGrossToday)} gross: {t.passes ? "Pass" : "Fail"}
          {t.failure && <span> — {t.failure.date}: {t.failure.message} Category: {t.failure.category}; shortfall / disallowed funding: {amount(t.failure.shortfallToday)} today. {t.failure.action}</span>}
        </li>)}</ul>
      </details>
    </>;
  };
  return <section className="comparison-panel fire-panel income-panel" aria-labelledby="income-heading">
    <h2 id="income-heading" tabIndex={-1}>Career independence</h2>
    <p>How much would I need to earn if I changed jobs before retiring?</p>
    <div className="analysis-summary" aria-label="Career independence summary">
      <p>Current age {inputs.person.currentAge}. Full retirement target: age {request.retirementAge}.</p>
      {!current?.result && <p>{busy ? "Calculating income boundaries…" : "Choose job terms and calculate to see the income needed at each tested transition age."}</p>}
      {current?.result && <>
        <label>Tested transition age<select value={current.result.points.find(p => p.date === selectedDate)?.date ?? current.result.points[0]?.date ?? ""} onChange={e => setSelectedDate(e.target.value)}>
          {current.result.points.filter(p => p.path === "baseline").map(p => <option key={p.date} value={p.date}>{p.age.toFixed(2)} ({p.date})</option>)}
        </select></label>
        <div className="comparison-cards">{(["baseline", "stress"] as const).filter(path => path === "baseline" || current.result!.stressConfigured).map(path => {
          const date = current.result!.points.find(p => p.date === selectedDate)?.date ?? current.result!.points[0]?.date;
          const point = current.result!.points.find(p => p.path === path && p.date === date);
          return <article key={path}><h3>{path === "baseline" ? "Baseline" : "Configured stress"}</h3>
            {point ? <><p>Change jobs at age {point.age.toFixed(2)}; retire fully at {current.result!.request.retirementAge}.</p>
              {[{ label: "Income needed for the whole plan", boundary: point.required }, { label: "Income for living costs only", boundary: point.livingCosts }].map(({ label, boundary }) => <div key={label}>
                <h4>{label}</h4>{boundary.status === "available" ? <p><strong>{amount(boundary.annualGrossToday)} gross / year</strong><br />{amount(boundary.annualNetCashToday)} estimated net / year</p> : <p>{boundary.status === "not_found" ? "No passing income found within the search cap." : "Result unavailable."} {boundary.reason}</p>}
                {boundary.status === "not_found" && boundary.tested.at(-1)?.failure && <p>{boundary.tested.at(-1)!.failure!.date}: {boundary.tested.at(-1)!.failure!.message} {boundary.tested.at(-1)!.failure!.action}</p>}
              </div>)}
            </> : <p>No result returned for this transition age.</p>}
          </article>;
        })}</div>
        <p>Annual amounts in today’s Canadian dollars. Living costs exclude saving, reserve building and retirement funding.</p>
      </>}
      <p>Search cap: {amount(request.maxAnnualGrossToday)} gross / year. This calculation limit is not a salary forecast.</p>
    </div>
    <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Calculate income by transition age</label>
    {enabled && <>
      <div className="career-editor">
        {field("Income curve full retirement age", "retirementAge")}
        <label>Income curve employment template<select value="" onChange={e => { const selected = definitions.find(s => s.id === e.target.value); if (selected?.careerTransition) { setAssumptionSource(`Configured scenarioComparison: ${selected.label}; temporary selection`); setRequest({ ...request, career: structuredClone(selected.careerTransition) }); } }}><option value="">Select configured job terms</option>{definitions.filter(s => s.careerTransition?.phases.every(p => p.kind !== "coast" && p.kind === s.careerTransition!.phases[0].kind)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
      </div>
      <button type="button" disabled={!inputs.person.employmentIncomePhases.length} onClick={() => {
        const career = careerPreset(inputs, "reduced_income").careerTransition!;
        career.phases.forEach(p => { p.employment = { mode: "gross_estimate", annualGrossToday: 0 }; });
        setAssumptionSource("Explicitly selected Ontario illustration; no actual employer terms asserted");
        setRequest({ ...request, career });
      }}>Use illustrative Ontario terms (no match)</button>
      <button type="button" onClick={() => { setRequest(initial()); setAssumptionSource("No job terms selected"); }}>Reset income assumptions</button>
      <details><summary>Income curve search limits</summary><div className="career-editor">
        {field("Maximum annual gross income today", "maxAnnualGrossToday")}
        <label>Income curve transition spacing<select value={request.stepMonths} onChange={e => setRequest({ ...request, stepMonths: Number(e.target.value) })}><option value={12}>12 months</option><option value={3}>3 months</option><option value={1}>1 month</option></select></label>
        <label>Annual gross income resolution<select value={request.resolutionAnnualGrossToday} onChange={e => setRequest({ ...request, resolutionAnnualGrossToday: Number(e.target.value) })}>{[1, 10, 100, 1000].map(n => <option key={n} value={n}>{n} today</option>)}</select></label>
      </div><p>Search cap and resolution are computational limits, not salary forecasts. Up to 61 dates, 2 million simulated months and 30 seconds per request; uncomputed points are unavailable.</p></details>
      <details><summary>Income sources and interpretation</summary><p>Source: {assumptionSource}. Effective baseline date: {inputs.startDate}. Edits below are temporary overrides. The solver replaces salary and the outer interval dates. Internal phase ages stay fixed; edge terms extend when retirement moves. Illustrations preserve configured working spending and surplus routing, and optional personal saving. Workplace saving and employer match require explicit terms. All amounts on this curve remain annual today’s dollars, regardless of the main report’s dollar mode. Income inflates to transition, then follows the selected local growth.</p></details>
      {request.career && <details><summary>Income curve job terms and payroll sources</summary>
        <p>The salary field is replaced by the search. All other terms remain fixed. Only the dated Ontario gross estimate defines a supported salary relation; independent net overrides and employer match return unavailable. Accumulation prohibits working-life withdrawals; Barista permits spending withdrawals during the selected interval.</p>
        <CareerTransitionEditor milestoneTemplate value={request.career} inputs={inputs} onChange={career => setRequest({ ...request, career })} />
      </details>}

      <button type="button" disabled={busy} onClick={() => { setBusy(true); setSubmission({ key }); }}>Calculate income curve</button>
      {!current && <p role="status">{busy ? "Calculating income boundaries…" : "Assumptions changed or not calculated. Calculate to update the curve."}</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {current?.result && <div aria-live="polite">
        {!current.result.stressConfigured && <p>Stress unavailable: no explicit return or inflation path configured.</p>}
        {(["baseline", "stress"] as const).filter(path => path === "baseline" || current.result!.stressConfigured).map(path => {
          const points = current.result!.points.filter(p => p.path === path);
          return <article key={path}>
            <h3>{path === "baseline" ? "Baseline income curve" : "Configured stress income curve"}</h3>
            <p>{path === "baseline" ? "Constant fallback returns and inflation." : "Explicit dated paths; configured stress is not necessarily adverse."} Gaps mean unavailable or no passing sampled income; see the table.</p>
            <details><summary>Chart and tested income details</summary><div className="income-curve" role="img" aria-label={`${path} annual gross income by transition age; exact values in table`}>
              <ResponsiveContainer width="100%" height={300}><LineChart data={points.map(p => ({ age: p.age, required: p.required.annualGrossToday, living: p.livingCosts.annualGrossToday }))} margin={{ left: 15, right: 15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="age" type="number" domain={["dataMin", "dataMax"]} tickFormatter={n => Number(n).toFixed(1)} label={{ value: "Transition age", position: "bottom" }} /><YAxis width={75} /><Tooltip /><Legend verticalAlign="top" />
                <Line dataKey="required" name="Required annual gross today" stroke="#15803d" connectNulls={false} isAnimationActive={false} />
                <Line dataKey="living" name="Living-cost annual gross today" stroke="#2563eb" strokeDasharray="5 5" connectNulls={false} isAnimationActive={false} />
              </LineChart></ResponsiveContainer>
            </div>
            <div className="income-table"><table><caption>{path} tested income boundaries, annual today’s dollars</caption><thead><tr><th>Transition</th><th>Required gross / estimated net cash at transition</th><th>Living-cost gross / estimated net cash at transition</th><th>Terminal assets today</th></tr></thead><tbody>{points.map(p => <tr key={p.date}><th>{p.date}, age {p.age.toFixed(2)}</th><td>{amount(p.required.annualGrossToday)} / {amount(p.required.annualNetCashToday)}{evidence(p.required)}</td><td>{amount(p.livingCosts.annualGrossToday)} / {amount(p.livingCosts.annualNetCashToday)}{evidence(p.livingCosts)}</td><td>{amount(p.terminalFinancialAssetsToday)}{p.provisionalTax && <p>Provisional tax assumptions</p>}</td></tr>)}</tbody></table></div></details>
          </article>;
        })}
        <details><summary>Income curve active funding assumptions</summary>
        <p>Effective {current.result.effectiveDate}; horizon age {inputs.endAge}; terminal financial asset floor {amount(inputs.retirementRequirement.minimumEndingFinancialAssetsToday)} today ({inputs.retirementRequirement.activeValueSource}). Tax mode: {inputs.tax.mode}. Home equity cannot fund withdrawals.</p>
        <p>The required-income curve checks spending, taxes, debt, reserves, required savings and the terminal floor through the shared monthly engine. The living-cost comparator funds every career month’s essential/discretionary costs, debt, events and incremental tax from current income, after payroll/employee withholding and other income offsets. It excludes additional saving, reserve building and retirement funding; it uses the same actual candidate flows, not a second budget calculator.</p>
        <p>Positive results are passing tested boundaries with an adjacent lower failure, conditional on monotone feasibility. Full-range sampling detects observed reversals but cannot exclude unsampled feasible islands. No global minimum or probability of success is claimed. Zero is the non-negative lower bound.</p>
          <p>Baseline flows remain unchanged before transition. Optional personal savings capped by cash or contribution room do not alone fail funding. Historical reserve buildup may recover before transition; the reserve must be funded at transition and through the remaining working life. From full retirement, cash reserves may fund ordinary withdrawals; required outflows and the terminal floor still apply. Required outflows and employment savings remain protected.</p>
          <p>Active resolved baseline plus temporary report overrides. Monthly essential {amount(inputs.monthlyEssentialSpendingToday)}, discretionary {amount(inputs.monthlyDiscretionarySpendingToday)} before phase multipliers. Protected reserve {amount(inputs.surplusAllocation.targetCashReserveToday)} today, indexing {inputs.surplusAllocation.reserveIndexingRate * 100}%. Inflation fallback {inputs.annualInflation * 100}%.</p>
          <ul>{inputs.spendingPhases.map(p => <li key={p.id}>Ages {p.startAge}–{p.endAge}: essential ×{p.essentialMultiplier}, discretionary ×{p.discretionaryMultiplier}; {p.source}.</li>)}</ul>
          <p>CPP {amount(inputs.person.cpp.monthlyAmountAt65Today)}/month at 65 before selected multiplier, claim age {inputs.person.cpp.startAge}. CPP entitlement is not recalculated from salary; retroactive benefit changes are unavailable. OAS {amount(inputs.person.oas.fullMonthlyAmountAt65Today)}/month before configured eligibility, claim age {inputs.person.oas.startAge}; pension {amount(inputs.person.annualPensionToday)}/year from {inputs.person.pensionStartAge}. Existing benefit indexing, room, liabilities, events and drawdown policies remain active; see Planner Config and report explanations for their schedules.</p>
          {inputs.returnScenario?.inflationPath && <PathRates path={inputs.returnScenario.inflationPath} />}
          <ul>{inputs.accounts.map(a => <li key={a.id}>{a.label}: {a.type}, opening {amount(a.openingBalance)}, fallback return {a.annualReturn * 100}%, withdrawal priority {a.withdrawalPriority}.{a.returnPath && <PathRates path={a.returnPath} />}</li>)}</ul>
        </details>
        <details><summary>Payroll and export limitations</summary><p>Estimated net is deposited cash after dated approximate payroll and employee withholding, before the engine’s incremental taxes on other income. The payroll model’s partial-year, benefit and tax-credit limitations apply. These temporary curves and job descriptions are excluded from JSON/CSV exports.</p></details>
      </div>}
    </>}
  </section>;
}
