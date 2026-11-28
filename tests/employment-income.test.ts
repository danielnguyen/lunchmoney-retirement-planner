import { describe, expect, it, vi } from "vitest";
import { calculateEmploymentIncome, materializeIncomeCandidate, parseEmploymentIncomeRequest, solveIncomeBoundary, type EmploymentIncomeRequest } from "@/src/domain/projection/employment-income";
import { evaluateCareerFunding } from "@/src/domain/projection/fire-milestones";
import { calculateProjection, evaluateMilestoneFunding, type ComparisonProjectionOptions } from "@/src/domain/projection/calculate";
import { careerPreset } from "@/src/domain/scenario/career";
import { estimateOntarioEmployment } from "@/src/domain/scenario/payroll";
import { fireInputs } from "./fixtures/fire-milestones";

function request(p = fireInputs()): EmploymentIncomeRequest {
  const career = careerPreset(p, "reduced_income").careerTransition!;
  career.phases[0].employment = { mode: "gross_estimate", annualGrossToday: 0 };
  return { retirementAge: 42, stepMonths: 12, maxAnnualGrossToday: 100000, resolutionAnnualGrossToday: 100, career };
}

describe("bounded income boundary", () => {
  it("verifies analytical rounded thresholds and adjacent failure, including zero", () => {
    const calls: number[] = [];
    const r = solveIncomeBoundary(100000, 100, n => { calls.push(n); return n >= 12345.67; });
    expect(r.annualGrossToday).toBe(12400);
    expect(r.adjacentLowerFails).toBe(true);
    expect(calls.slice(-2)).toEqual([12400, 12300]);
    expect(calls.length).toBeLessThan(40);
    expect(solveIncomeBoundary(100, 1, () => true).annualGrossToday).toBe(0);
  });
  it("rejects observed reversals and distinguishes sampled failure from impossibility", () => {
    expect(solveIncomeBoundary(16000, 1, n => n >= 4000 && n < 8000).reason).toMatch(/nonmonotonic/);
    const no = solveIncomeBoundary(16000, 1, () => false);
    expect(no.status).toBe("not_found");
    expect(no.reason).toMatch(/does not prove impossibility/);
    expect(solveIncomeBoundary(16000, 1, () => { throw new Error("unbounded fixture"); }).status).toBe("unavailable");
  });
  it("does not certify a global minimum across an unsampled feasible island", () => {
    const r = solveIncomeBoundary(16000, 1, n => (n >= 201 && n <= 299) || n >= 10000);
    expect(r.annualGrossToday).toBe(10000);
    expect(r.reason).toMatch(/not a certified global minimum/);
  });
});

describe("same-engine career income", () => {
  it("matches an analytical living-cost threshold and full engine, with no baseline mutation", () => {
    const p = fireInputs(), r = request(p), before = structuredClone(p);
    const result = calculateEmploymentIncome(p, r);
    const point = result.points[0];
    let expected = 0;
    while (estimateOntarioEmployment(expected).annualNetCashToday < 12000) expected += 100;
    expect(point.required.annualGrossToday).toBe(expected);
    expect(point.livingCosts.annualGrossToday).toBe(expected);
    const candidate = materializeIncomeCandidate(p, r, 40, expected);
    const forward = calculateProjection(candidate);
    expect(point.terminalFinancialAssetsToday).toBeCloseTo(forward.summary.endingFinancialAssetsToday!, 2);
    expect(point.required.annualNetCashToday).toBe(estimateOntarioEmployment(expected).annualNetCashToday);
    expect(evaluateCareerFunding(materializeIncomeCandidate(p, r, 40, expected - 100), 40, 42, "accumulation", r.career!.phases[0]).passes).toBe(false);
    expect(p).toEqual(before);
  });
  it("allows zero only when withdrawals are explicitly authorized; saving can exceed living costs", () => {
    const p = fireInputs(), r = request(p);
    r.career!.phases[0].kind = "barista";
    const barista = calculateEmploymentIncome(p, r).points[0];
    expect(barista.required.annualGrossToday).toBe(0);
    expect(barista.livingCosts.annualGrossToday).toBeGreaterThan(0);
    r.career!.phases[0].kind = "accumulation";
    p.accounts[0].openingBalance = 0;
    p.accounts[1].openingBalance = 0;
    r.career!.phases[0].surplusInvesting = "retain_as_cash";
    const saving = calculateEmploymentIncome(p, r).points[0];
    expect(saving.required.status, saving.required.reason).toBe("available");
    expect(saving.required.annualGrossToday).toBeGreaterThan(saving.livingCosts.annualGrossToday!);
    expect(saving.terminalFinancialAssetsToday).toBeGreaterThanOrEqual(0);
  });
  it("preserves every pre-transition monthly flow and changes the chosen retirement boundary", () => {
    const p = fireInputs(), r = request(p);
    type Month = Parameters<NonNullable<ComparisonProjectionOptions["onMonth"]>>[0];
    const prefix = (input: typeof p) => { const months: Month[] = []; evaluateMilestoneFunding(structuredClone(input), { onMonth: m => { if (m.age < 41 - 1e-8) months.push(m); } }); return months; };
    const candidate = materializeIncomeCandidate(p, r, 41, 30000);
    expect(prefix(candidate)).toEqual(prefix(p));
    r.retirementAge = 43;
    expect(materializeIncomeCandidate(p, r, 41, 30000).person.retirementAge).toBe(43);
    expect(calculateEmploymentIncome(p, r).points.at(-1)!.age).toBe(42);
    r.retirementAge = 41;
    expect(calculateEmploymentIncome(p, r).points.at(-1)!.age).toBeCloseTo(41 - 1 / 12);
  });
  it.each([0, 3500, 68900, 74600, 85000, 85001])("keeps net, taxable and eligible salary consistent at %s", gross => {
    const p = fireInputs(), r = request(p);
    const phase = materializeIncomeCandidate(p, r, 40, gross).person.employmentIncomePhases[0];
    expect(phase.annualNetCashToday).toBe(estimateOntarioEmployment(gross).annualNetCashToday);
    expect(phase.annualTaxableEmploymentIncomeToday).toBe(gross);
    expect(phase.rrspRoomGeneration!.annualEligibleEarnedIncomeToday).toBe(gross);
    const netThreshold = estimateOntarioEmployment(gross).annualNetCashToday;
    const boundary = solveIncomeBoundary(100000, 1, n => estimateOntarioEmployment(n).annualNetCashToday >= netThreshold);
    expect(boundary.annualGrossToday).toBe(gross);
  });
  it("preserves dated real-dollar semantics and explicit stress paths", () => {
    const p = fireInputs(), r = request(p);
    p.annualInflation = .02;
    p.accounts[0].openingBalance = 0;
    p.returnScenario = { label: "Synthetic adverse path", source: "explicit_configuration" };
    r.career!.phases[0].annualGrowth = .02;
    p.accounts[1].returnPath = { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2026, annualReturn: -.9 }] };
    const result = calculateEmploymentIncome(p, r);
    expect(result.stressConfigured).toBe(true);
    expect(result.points.some(x => x.path === "stress")).toBe(true);
    expect(result.points.filter(x => x.path === "baseline").every(x => x.required.status === "available")).toBe(true);
    expect(result.points.find(x => x.path === "stress")!.required.annualGrossToday).toBeGreaterThan(result.points[0].required.annualGrossToday!);
    const active = materializeIncomeCandidate(p, r, 41, 30000);
    const months: number[] = [];
    evaluateMilestoneFunding(active, { onMonth: m => { if (m.age >= 41 && m.age < 42) months.push(m.flow.income.employment); } });
    expect(months[0]).toBeCloseTo(estimateOntarioEmployment(30000).annualNetCashToday / 12 * Math.pow(1.02, 13 / 12), 2);
  });
  it("rejects unsupported terms, missing inputs and capped infeasibility transparently", () => {
    const p = fireInputs(), r = request(p);
    expect(calculateEmploymentIncome(p, { ...r, career: null }).points[0].required.reason).toMatch(/explicit future/);
    r.career!.phases[0].employment = { mode: "net_override", annualNetCashToday: 10000, annualTaxableEmploymentIncomeToday: 20000, annualEligibleEarnedIncomeToday: 20000 };
    expect(calculateEmploymentIncome(p, r).points[0].required.reason).toMatch(/reliable salary relation/);
    r.career!.phases[0].employment = { mode: "gross_estimate", annualGrossToday: 0 };
    r.career!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 100, employerMonthlyAmountToday: 100, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic match" }];
    expect(calculateEmploymentIncome(p, r).points[0].required.reason).toMatch(/employer match/);
    r.career!.phases[0].contributions = [];
    p.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
    expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("not_found");
    expect(() => parseEmploymentIncomeRequest({ ...r, resolutionAnnualGrossToday: .001 })).toThrow(/Resolution/);
    expect(() => calculateEmploymentIncome(p, { ...r, retirementAge: 40 })).toThrow(/after the starting age/);
  });
  it("deducts withholding once and refuses required contributions without room", () => {
    const p = fireInputs(), r = request(p);
    r.career!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic employee term" }];
    const candidate = materializeIncomeCandidate(p, r, 40, 30000);
    expect(candidate.person.employmentIncomePhases[0].annualNetCashToday).toBe(estimateOntarioEmployment(30000).annualNetCashToday - 1200);
    const point = calculateEmploymentIncome(p, r).points[0];
    expect(point.required.status, point.required.reason).toBe("available");
    expect(point.required.annualNetCashToday).toBe(estimateOntarioEmployment(point.required.annualGrossToday!).annualNetCashToday - 1200);
    p.registeredAccountRoom!.tfsa.startingAvailableRoom = { source: "configured_amount", amount: 0, sourceDescription: "Synthetic exhausted room", effectiveDate: "2026-01-01" };
    expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("not_found");
  });
  it("returns unavailable for remaining points when runtime budget is exhausted", () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(30001);
    try { expect(calculateEmploymentIncome(fireInputs(), request()).points.every(p => p.required.reason.includes("budget"))).toBe(true); }
    finally { now.mockRestore(); }
  });
});

it("retains annual tax context in partial years and protects CPP accumulation", async () => {
  const { ZERO_CANADIAN_TAX_INCOME } = await import("@/src/domain/projection/canadian-tax");
  const p = fireInputs(), r = request(p);
  p.startDate = "2026-07-01";
  p.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 100000;
  p.tax = { ...p.tax, limitations: ["full_tax_return_deductions_and_refundable_credits_not_modelled"], mode: "canadian_annual", source: "explicit_configuration", province: "ON", referenceYear: 2026, futureIndexingRate: 0,
    openingTaxYearBeforeProjectionMonth: { source: "explicit_configuration", calendarYear: 2026, throughMonth: 6, income: { ...ZERO_CANADIAN_TAX_INCOME, employment: 50000 } } };
  const point = calculateEmploymentIncome(p, r).points[0];
  expect(point.required.status, point.required.reason).toBe("available");
  const candidate = materializeIncomeCandidate(p, r, 40, point.required.annualGrossToday!);
  expect(candidate.tax).toEqual(p.tax);
  expect(calculateProjection(candidate).summary.endingFinancialAssetsToday).toBeCloseTo(point.terminalFinancialAssetsToday!, 2);
  // Benefits may begin only at valid CPP ages; move the entire synthetic horizon.
  p.person.currentAge += 20; p.person.retirementAge += 20; p.endAge += 20;
  p.person.employmentIncomePhases.forEach(x => { x.startAge += 20; x.endAge += 20; });
  p.spendingPhases.forEach(x => { x.startAge += 20; x.endAge += 20; });
  p.accounts.forEach(a => a.contributionPhases.forEach(x => { x.startAge += 20; x.endAge += 20; }));
  p.person.cpp.startAge = 60;
  const later = request(p); later.retirementAge = 62; later.career!.cppBenefitMultiplier = .5;
  expect(() => materializeIncomeCandidate(p, later, 61, 30000)).toThrow(/CPP adjustment unavailable/);
  later.career!.cppBenefitMultiplier = 1;
  expect(() => materializeIncomeCandidate(p, later, 61, 30000)).not.toThrow();
});

it("fails unfunded opening debt, protected reserves and terminal floors without consuming home equity", () => {
  const p = fireInputs(), r = request(p);
  p.accounts.forEach(a => { a.openingBalance = 0; });
  p.liabilities = [{ id: "synthetic-debt", label: "Synthetic debt", origin: "lunchmoney", openingBalance: 1000000, balanceAsOf: "2026-01-01", role: null, historicalPaymentHandling: "not_applicable", historicalMonthlyAverage: 0, treatment: { mode: "payoff_at_projection_start" } }];
  expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("not_found");
  expect(calculateEmploymentIncome(p, r).points[0].livingCosts.status).toBe("not_found");
  p.liabilities = [];
  p.surplusAllocation.targetCashReserveToday = 1000000;
  expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("not_found");
  p.surplusAllocation.targetCashReserveToday = 0;
  p.nonFinancialAssets = [{ id: "synthetic-home", label: "Synthetic home", origin: "projection_configuration", type: "primary_residence", openingValue: 10000000, annualAppreciation: 0, valueAsOf: "2026-01-01", availableForWithdrawals: false }];
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 1000000;
  expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("not_found");
});

it("generates RRSP room from solved eligible earnings and retains pension adjustments", () => {
  const p = fireInputs(), r = request(p);
  p.accounts[1].type = "rrsp_rrif";
  r.career!.phases[0].annualPensionAdjustmentToday = 1000;
  r.career!.phases[0].annualOtherRoomReductionToday = 500;
  r.career!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic RRSP withholding" }];
  const candidate = materializeIncomeCandidate(p, r, 40, 30000);
  const annual = calculateProjection(candidate).annual.find(y => y.calendarYear === 2027)!;
  expect(annual.nominal.registeredAccountRoom!.rrsp.previousYearEligibleEarnedIncome).toBeCloseTo(30000, 2);
  expect(annual.nominal.registeredAccountRoom!.rrsp.pensionAdjustment).toBeCloseTo(1000, 2);
  expect(annual.nominal.registeredAccountRoom!.rrsp.otherRoomReduction).toBeCloseTo(500, 2);
  expect(annual.nominal.registeredAccountRoom!.rrsp.annualNewRoom).toBeCloseTo(3900, 2);
});

it("rejects excessive transition grids and unavailable payroll ages without inferring net income", () => {
  const p = fireInputs(), r = request(p);
  r.retirementAge = 66; p.endAge = 67;
  expect(calculateEmploymentIncome(p, r).points.every(p => p.required.reason.includes("18–64"))).toBe(true);
  p.person.retirementAge = 46;
  p.person.employmentIncomePhases[0].endAge = 46;
  p.spendingPhases[0].endAge = 67;
  expect(() => calculateEmploymentIncome(p, { ...r, stepMonths: 1 })).toThrow(/61 transition/);
});

it.each(["room", "cash", "reserve"] as const)("accepts later income transitions after optional %s constraints", async mode => {
  const { constrainedSavingInputs } = await import("./fixtures/fire-milestones");
  const p = constrainedSavingInputs(mode), r = request(p), before = structuredClone(p);
  const points = calculateEmploymentIncome(p, r).points;
  expect(points.slice(1).every(point => point.required.status === "available")).toBe(true);
  for (const point of points.slice(1)) {
    const active = materializeIncomeCandidate(p, r, point.age, point.required.annualGrossToday!);
    expect(calculateProjection(active).summary.endingFinancialAssetsToday).toBeCloseTo(point.terminalFinancialAssetsToday!, 2);
    expect(point.required.tested.some(t => !t.passes && t.failure?.date)).toBe(true);
  }
  expect(p).toEqual(before);
});

it("preserves quantified first failures for cap exhaustion, adjacent failure, withholding and debt", () => {
  const p = fireInputs(), r = request(p);
  p.accounts[0].openingBalance = 0;
  p.surplusAllocation.targetCashReserveToday = 1000000;
  p.surplusAllocation.reserveIndexingRate = 0;
  const later = calculateEmploymentIncome(p, r).points[1];
  expect(later.required.status).toBe("not_found");
  expect(later.required.tested.at(-1)!.failure).toMatchObject({ date: "2027-01", category: "reserve", shortfallToday: 928000 });
  expect(later.required.reason).toMatch(/does not prove impossibility/);
  expect(later.livingCosts.tested.filter(t => !t.passes).every(t => t.failure?.category === "living_costs")).toBe(true);
  p.surplusAllocation.targetCashReserveToday = 0;
  p.liabilities = [{ id: "synthetic-debt", label: "Synthetic debt", origin: "lunchmoney", openingBalance: 1000000, balanceAsOf: "2026-01-01", role: null, historicalPaymentHandling: "not_applicable", historicalMonthlyAverage: 0, treatment: { mode: "payoff_at_projection_start" } }];
  const debt = calculateEmploymentIncome(p, r).points[1].required.tested.at(-1)!.failure;
  expect(debt).toMatchObject({ date: "2026-01", category: "required_outflow" });
  expect(debt!.shortfallToday).toBeGreaterThan(0);
  p.liabilities = [];
  r.career!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic withholding" }];
  expect(calculateEmploymentIncome(p, r).points[0].required.tested[0].failure).toMatchObject({ date: "2026-01", category: "required_savings", shortfallToday: 100 });
});

it("rejects an immediate income transition before its salary replenishes the opening reserve", () => {
  const p = fireInputs(), r = request(p);
  p.accounts[0].openingBalance = 0;
  p.surplusAllocation.targetCashReserveToday = 1000;
  p.surplusAllocation.reserveIndexingRate = 0;
  const result = calculateEmploymentIncome(p, r);
  const first = result.points[0];
  expect(first.required.status).toBe("not_found");
  expect(first.required.tested.every(t => !t.passes && t.failure?.date === "2026-01" &&
    t.failure.category === "reserve" && t.failure.shortfallToday === 1000)).toBe(true);
  expect(first.livingCosts.status).toBe("available");
  expect(result.points[1].required.status).toBe("available");
  p.accounts[0].openingBalance = 1000;
  expect(calculateEmploymentIncome(p, r).points[0].required.status).toBe("available");
});
