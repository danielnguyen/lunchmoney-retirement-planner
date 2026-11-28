"use client";
import type { CareerTransitionConfig } from "@/src/config/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { payrollProvenance } from "@/src/domain/scenario/payroll";

export function CareerTransitionEditor({ value, inputs, onChange, milestoneTemplate = false }: { milestoneTemplate?: boolean; value: CareerTransitionConfig; inputs: ProjectionInputs; onChange: (next: CareerTransitionConfig) => void }) {
  function edit(change: (draft: CareerTransitionConfig) => void) { const draft = structuredClone(value); change(draft); onChange(draft); }
  function number(label: string, amount: number, change: (next: number) => void) {
    return <label>{label}<input type="number" step="any" value={amount} onChange={e => { if (Number.isFinite(e.target.valueAsNumber)) change(e.target.valueAsNumber); }} /></label>;
  }
  // Handlers below always edit a fresh copy, never the parent's scenario.
  function field(label: string, amount: number, change: (draft: CareerTransitionConfig, next: number) => void) {
    return number(label, amount, next => { const draft = structuredClone(value); change(draft, next); onChange(draft); });
  }
  return <div className="career-editor">
    <p>Editable assumptions in today’s dollars. Intervals include their start and exclude their end. Income and savings inflate to each phase’s start, then use its local annual growth. Presets illustrate half the current income and zero match; these are not market averages or affordability recommendations. Missing baseline taxable or room-eligible earnings start at zero; replace those unknown placeholders before relying on a result.</p>
    {!milestoneTemplate && field("Career transition age", value.transitionAge, (d, n) => { d.transitionAge = n; d.phases[0].startAge = n; })}
    {!milestoneTemplate && field("Full retirement age", value.retirementAge, (d, n) => { d.retirementAge = n; d.phases[d.phases.length - 1].endAge = n; })}
    {field("CPP lower-benefit multiplier (0–1)", value.cppBenefitMultiplier, (d, n) => { d.cppBenefitMultiplier = n; })}
    <p>CPP entitlement is not calculated from future earnings. Retain your own estimate or explicitly test a lower benefit. Pension valuation and unknown insurance benefits are unavailable.</p>
    {value.phases.map((p, i) => <fieldset key={p.id}><legend>{p.label}</legend>
      <label>Phase name<input value={p.label} onChange={e => edit(d => { d.phases[i].label = e.target.value; })} /></label>
      <label>Strategy<select disabled={milestoneTemplate} value={p.kind} onChange={e => edit(d => { d.phases[i].kind = e.target.value as typeof p.kind; })}><option value="accumulation">Accumulation / lower-income work</option><option value="coast">Coast: no retirement saving or withdrawals</option><option value="barista">Barista: spending withdrawals allowed in this interval</option></select></label>
      {!milestoneTemplate && field("Phase start age", p.startAge, (d, n) => { d.phases[i].startAge = n; })}
      {!milestoneTemplate && field("Phase end age", p.endAge, (d, n) => { d.phases[i].endAge = n; })}
      {field("Phase annual growth (decimal)", p.annualGrowth, (d, n) => { d.phases[i].annualGrowth = n; })}
      <label>Employment assumption<select value={p.employment.mode} onChange={e => edit(d => { d.phases[i].employment = e.target.value === "gross_estimate" ? { mode: "gross_estimate", annualGrossToday: 0 } : { mode: "net_override", annualNetCashToday: 0, annualTaxableEmploymentIncomeToday: 0, annualEligibleEarnedIncomeToday: 0 }; })}><option value="net_override">Explicit net, taxable and room-eligible earnings</option><option value="gross_estimate">Select estimated Ontario gross-to-net (2026)</option></select></label>
      {p.employment.mode === "gross_estimate" ? field("Annual gross pay today", p.employment.annualGrossToday, (d, n) => { if (d.phases[i].employment.mode === "gross_estimate") d.phases[i].employment.annualGrossToday = n; }) : <>
        {field("Annual net cash after payroll and employee withholding", p.employment.annualNetCashToday, (d, n) => { if (d.phases[i].employment.mode === "net_override") d.phases[i].employment.annualNetCashToday = n; })}
        {field("Annual taxable employment income", p.employment.annualTaxableEmploymentIncomeToday, (d, n) => { if (d.phases[i].employment.mode === "net_override") d.phases[i].employment.annualTaxableEmploymentIncomeToday = n; })}
        {field("Annual RRSP-room eligible earnings", p.employment.annualEligibleEarnedIncomeToday, (d, n) => { if (d.phases[i].employment.mode === "net_override") d.phases[i].employment.annualEligibleEarnedIncomeToday = n; })}
      </>}
      {field("Annual pension adjustment today", p.annualPensionAdjustmentToday, (d, n) => { d.phases[i].annualPensionAdjustmentToday = n; })}
      {field("Annual other RRSP-room reduction today", p.annualOtherRoomReductionToday, (d, n) => { d.phases[i].annualOtherRoomReductionToday = n; })}
      {field("Career essential spending multiplier", p.essentialMultiplier, (d, n) => { d.phases[i].essentialMultiplier = n; })}
      {field("Career discretionary spending multiplier", p.discretionaryMultiplier, (d, n) => { d.phases[i].discretionaryMultiplier = n; })}
      <label>Surplus investing<select value={p.surplusInvesting} onChange={e => edit(d => { d.phases[i].surplusInvesting = e.target.value as typeof p.surplusInvesting; })}><option value="retain_as_cash">Retain cash; no automatic investing</option><option value="configured">Use baseline surplus investing</option></select></label>
      <p>Required and optional savings both count when verifying Coast. Net overrides already include employee withholding. Employer match defaults to zero; any entered match is an illustration, not known employer terms. Gross estimates with employer match are unavailable; use explicit tax and net overrides.</p>
      {p.contributions.map((c, j) => <fieldset key={j}><legend>Savings assumption {j + 1}</legend>
        <label>Destination<select value={c.accountId} onChange={e => edit(d => { d.phases[i].contributions[j].accountId = e.target.value; })}>{inputs.accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label>Funding<select value={c.funding} onChange={e => edit(d => { d.phases[i].contributions[j].funding = e.target.value as typeof c.funding; })}><option value="cash">Cash-funded personal saving</option><option value="income_withheld">Workplace / income withheld</option></select></label>
        <label>Requirement<select value={c.requirement} onChange={e => edit(d => { d.phases[i].contributions[j].requirement = e.target.value as typeof c.requirement; })}><option value="optional">Optional</option><option value="required">Required workplace term</option></select></label>
        {field("Monthly employee or personal savings today", c.monthlyAmountToday, (d, n) => { d.phases[i].contributions[j].monthlyAmountToday = n; })}
        {field("Monthly employer savings today (estimated)", c.employerMonthlyAmountToday, (d, n) => { d.phases[i].contributions[j].employerMonthlyAmountToday = n; })}
        <label>Assumption source<input value={c.sourceDescription} onChange={e => edit(d => { d.phases[i].contributions[j].sourceDescription = e.target.value; })} /></label>
        <button type="button" onClick={() => edit(d => { d.phases[i].contributions.splice(j, 1); })}>Remove savings assumption</button>
      </fieldset>)}
      <button type="button" onClick={() => edit(d => { d.phases[i].contributions.push({ accountId: inputs.savingsPolicy.mode === "simple" ? inputs.savingsPolicy.personalTfsaAccountId : inputs.contributionWaterfall.routes[0]?.sourceAccountId ?? inputs.accounts[0].id, monthlyAmountToday: 0, employerMonthlyAmountToday: 0, funding: "cash", requirement: "optional", sourceDescription: "User-edited estimate; no employer match assumed" }); })}>Add savings assumption</button>
      <button type="button" disabled={milestoneTemplate} onClick={() => edit(d => {
        const midpoint = p.startAge + Math.floor((p.endAge - p.startAge) * 6) / 12;
        if (midpoint <= p.startAge) return;
        d.phases[i].endAge = midpoint;
        d.phases.splice(i + 1, 0, { ...structuredClone(p), id: `${p.id}-split-${value.phases.length}`, label: `${p.label} next`, startAge: midpoint });
      })}>Split career phase</button>
    </fieldset>)}
    <details><summary>Payroll estimate provenance and limits</summary><p>{payrollProvenance.description}. Effective {payrollProvenance.effectiveDate}. {payrollProvenance.limitations}</p>{payrollProvenance.references.map((url, i) => <p key={url}><a href={url}>CRA 2026 reference {i + 1}</a></p>)}</details>
  </div>;
}
