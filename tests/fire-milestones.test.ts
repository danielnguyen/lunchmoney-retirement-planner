import { describe, expect, it } from "vitest";
import { calculateFireMilestones, evaluateFireCandidate, materializeFireCandidate, parseFireMilestoneRequest, searchFireCandidates } from "@/src/domain/projection/fire-milestones";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { fireInputs, fireRequest } from "./fixtures/fire-milestones";
import { projectionFixture } from "./fixtures/projection";


describe("conditional FIRE candidate simulation", () => {
  it("recognizes modeled-start Full FIRE without employment or an extra accumulation month", () => {
    const p = fireInputs();
    const before = structuredClone(p);
    const r = fireRequest(p);
    const result = calculateFireMilestones(p, r);
    expect(result.results.map(r => r.status)).toEqual(["met_at_start", "met_at_start", "met_at_start"]);
    const candidate = materializeFireCandidate(p, r, "full", 40);
    const projection = calculateProjection(candidate);
    expect(projection.annual.every(y => y.real.income.employment === 0)).toBe(true);
    expect(projection.retirementSnapshot.flowPeriod.kind).toBe("projection_start");
    expect(projection.retirementSnapshot.real.balances.financialAssets).toBe(120000);
    expect(evaluateFireCandidate(p, r, "full", 40).terminalFinancialAssetsToday).toBe(projection.summary.endingFinancialAssetsToday);
    expect(p).toEqual(before);
  });
  it("finds the first passing month and independently verifies every earlier monthly candidate", () => {
    const p = fireInputs();
    p.accounts[1].openingBalance = 0;
    p.accounts[0].openingBalance = 12000;
    const r = { ...fireRequest(p), stepMonths: 1 };
    const result = calculateFireMilestones(p, r).results.find(x => x.kind === "full")!;
    expect(result.status, result.reason).toBe("future");
    expect(result.candidate!.date).not.toBe("2026-01");
    for (let month = 0; month < Math.round((result.candidate!.age - 40) * 12); month++) {
      const projection = calculateProjection(materializeFireCandidate(p, r, "full", 40 + month / 12));
      expect(projection.annual.some(y => y.real.outflows.unmetSpending > .005) || (projection.summary.endingFinancialAssetsToday ?? 0) < p.retirementRequirement.minimumEndingFinancialAssetsToday).toBe(true);
    }
    const pass = calculateProjection(materializeFireCandidate(p, r, "full", result.candidate!.age));
    expect(pass.annual.every(y => y.real.outflows.unmetSpending <= .005)).toBe(true);
    expect(result.tested.slice(0, -1).every(c => !c.passes)).toBe(true);
  });
  it("handles infeasible, unavailable and later-than-Full Coast without imposing milestone order", () => {
    const p = fireInputs();
    const r = fireRequest(p);
    r.coast!.phases[0].employment = { mode: "net_override", annualNetCashToday: 0, annualTaxableEmploymentIncomeToday: 0, annualEligibleEarnedIncomeToday: 0 };
    const result = calculateFireMilestones(p, r);
    expect(result.results[0].candidate!.age).toBe(42);
    expect(result.results[2].candidate!.age).toBe(40);
    p.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
    expect(calculateFireMilestones(p, r).results.every(x => x.status === "not_found")).toBe(true);
    r.barista = null;
    expect(calculateFireMilestones(p, r).results[1].status).toBe("unavailable");
  });
  it("does not skip a feasible island when feasibility is non-monotonic", () => {
    const states = [false, true, false, true];
    const result = searchFireCandidates([0, 1, 2, 3], age => ({ age, date: String(age), passes: states[age], reason: null, terminalFinancialAssetsToday: 0, provisionalTax: false }));
    expect(result.candidate!.age).toBe(1);
    expect(result.tested.map(x => x.age)).toEqual([0, 1]);
  });
  it("preserves accumulation and separates explicit return stress from constant baseline", () => {
    const p = fireInputs();
    p.accounts[1].returnPath = { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2026, annualReturn: -.9 }] };
    const r = fireRequest(p);
    const result = calculateFireMilestones(p, r);
    expect(result.stressConfigured).toBe(true);
    expect(result.results).toHaveLength(6);
    expect(result.results[2].candidate!.age).toBe(40);
    expect(result.results[5].status).not.toBe("met_at_start");
    const candidate = materializeFireCandidate(p, r, "barista", 41);
    expect(candidate.person.employmentIncomePhases[0]).toEqual({ ...p.person.employmentIncomePhases[0], endAge: 41 });
    expect(candidate.accounts[1].contributionPhases[0]).toEqual({ ...p.accounts[1].contributionPhases[0], endAge: 41 });
  });
  it("checks reserve, terminal floor, CPP sensitivity, tax composition and debt through the engine", () => {
    const p = fireInputs();
    const r = fireRequest(p);
    const original = evaluateFireCandidate(p, r, "full", 40);
    p.surplusAllocation.targetCashReserveToday = 200000;
    expect(evaluateFireCandidate(p, r, "full", 40).reason).toMatch(/reserve/);
    p.surplusAllocation.targetCashReserveToday = 0;
    p.person.cpp.startAge = 60;
    p.person.currentAge = 60;
    p.person.retirementAge = 62;
    p.endAge = 64;
    p.person.employmentIncomePhases[0].startAge = 60;
    p.person.employmentIncomePhases[0].endAge = 62;
    p.spendingPhases[0].startAge = 60;
    p.spendingPhases[0].endAge = 64;
    p.accounts[1].contributionPhases[0].startAge = 60;
    p.accounts[1].contributionPhases[0].endAge = 62;
    r.retirementAge = 62;
    const withCpp = evaluateFireCandidate(p, r, "full", 60);
    r.fullCppBenefitMultiplier = 0;
    expect(evaluateFireCandidate(p, r, "full", 60).terminalFinancialAssetsToday).toBeLessThan(withCpp.terminalFinancialAssetsToday!);
    const taxed = fireInputs();
    taxed.accounts[1].type = "rrsp_rrif";
    expect(evaluateFireCandidate(taxed, fireRequest(taxed), "full", 40).terminalFinancialAssetsToday).toBeLessThan(original.terminalFinancialAssetsToday!);
    const debt = fireInputs();
    debt.liabilities = [{ id: "synthetic-debt", label: "Synthetic debt", openingBalance: 200000, origin: "lunchmoney", balanceAsOf: "2026-01-01", role: null, historicalPaymentHandling: "not_applicable", historicalMonthlyAverage: 0, treatment: { mode: "payoff_at_projection_start" } }];
    expect(evaluateFireCandidate(debt, fireRequest(debt), "full", 40).passes).toBe(false);
  });
  it("rejects invalid configuration and bounds search cost", () => {
    expect(() => parseFireMilestoneRequest({ ...fireRequest(), stepMonths: 0 })).toThrow(/spacing/);
    expect(() => parseFireMilestoneRequest({ ...fireRequest(), fullCppBenefitMultiplier: 2 })).toThrow(/multiplier/);
    expect(() => calculateFireMilestones(fireInputs(), { ...fireRequest(), retirementAge: 41.01 })).toThrow(/align/);
    const p = structuredClone(projectionFixture);
    p.person.currentAge = 18;
    p.person.retirementAge = 100;
    expect(() => calculateFireMilestones(p, { ...fireRequest(), retirementAge: 95, stepMonths: 1 })).toThrow(/601/);
  });
});

it("agrees with career comparison on Coast and Barista and checks required workplace saving", async () => {
  const { calculateComparison } = await import("@/src/domain/scenario/comparison");
  const p = fireInputs();
  const r = fireRequest(p);
  for (const kind of ["coast", "barista"] as const) {
    const career = r[kind]!;
    const comparison = calculateComparison(p, [{ id: kind, label: kind, spending: [], personalContributions: [], contributionPolicy: "cash_constrained", careerTransition: career }])[0];
    expect(evaluateFireCandidate(p, r, kind, 40).passes).toBe(kind === "coast" ? comparison.coastVerified : comparison.lifetimeViable);
  }
  r.coast!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic workplace term" }];
  expect(evaluateFireCandidate(p, r, "coast", 40).passes).toBe(false);
  r.barista!.phases[0].contributions = [{ accountId: p.accounts[1].id, monthlyAmountToday: 10000000, employerMonthlyAmountToday: 0, funding: "cash", requirement: "required", sourceDescription: "Synthetic unaffordable term" }];
  expect(evaluateFireCandidate(p, r, "barista", 40).reason).toMatch(/Required employment savings/);
});

it("handles an unfunded debt at opening in the shared ordinary projection", () => {
  const p = fireInputs();
  p.liabilities = [{ id: "synthetic-debt", label: "Synthetic debt", openingBalance: 200000, origin: "lunchmoney", balanceAsOf: "2026-01-01", role: null, historicalPaymentHandling: "not_applicable", historicalMonthlyAverage: 0, treatment: { mode: "payoff_at_projection_start" } }];
  const projected = calculateProjection(materializeFireCandidate(p, fireRequest(p), "full", 40));
  expect(projected.projectionCompletion.status).toBe("stopped_unfunded_liability");
  expect(projected.projectionCompletion.completedThroughAge).toBe(40);
  expect(projected.annual).toHaveLength(0);
  const searched = calculateFireMilestones(p, fireRequest(p));
  expect(searched.results.every(r => r.status === "not_found")).toBe(true);
  expect(searched.results.every(r => r.tested.length === 3)).toBe(true);
});

it("honors changed retirement spending and excludes unrealized home equity", () => {
  const p = fireInputs();
  const r = fireRequest(p);
  const initial = evaluateFireCandidate(p, r, "full", 40);
  p.spendingPhases = [{ ...p.spendingPhases[0], id: "working", endAge: 42 }, { ...p.spendingPhases[0], id: "retired", startAge: 42, essentialMultiplier: 10 }];
  expect(evaluateFireCandidate(p, r, "full", 40).passes).toBe(false);
  expect(initial.passes).toBe(true);
  p.nonFinancialAssets = [{ id: "synthetic-home", label: "Synthetic home", origin: "projection_configuration", type: "primary_residence", openingValue: 10000000, annualAppreciation: 0, valueAsOf: "2026-01-01", availableForWithdrawals: false }];
  expect(evaluateFireCandidate(p, r, "full", 40).passes).toBe(false);
});

it("uses independent taxable employment in the annual-tax Barista candidate without taxing net pay twice", async () => {
  const { ZERO_CANADIAN_TAX_INCOME } = await import("@/src/domain/projection/canadian-tax");
  const p = fireInputs();
  p.startDate = "2026-07-01";
  p.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 100000;
  p.accounts[1].type = "rrsp_rrif";
  p.accounts[0].openingBalance = 0;
  p.tax = { ...p.tax, limitations: ["full_tax_return_deductions_and_refundable_credits_not_modelled"], mode: "canadian_annual", source: "explicit_configuration", province: "ON", referenceYear: 2026, futureIndexingRate: 0,
    openingTaxYearBeforeProjectionMonth: { source: "explicit_configuration", calendarYear: 2026, throughMonth: 6, income: { ...ZERO_CANADIAN_TAX_INCOME } } };
  const r = fireRequest(p);
  r.barista!.phases[0].employment = { mode: "net_override", annualNetCashToday: 6000, annualTaxableEmploymentIncomeToday: 10000, annualEligibleEarnedIncomeToday: 10000 };
  const low = evaluateFireCandidate(p, r, "barista", 40);
  r.barista!.phases[0].employment.annualTaxableEmploymentIncomeToday = 200000;
  const high = evaluateFireCandidate(p, r, "barista", 40);
  expect(high.terminalFinancialAssetsToday).toBeLessThan(low.terminalFinancialAssetsToday!);
  const active = materializeFireCandidate(p, r, "barista", 40);
  expect(active.person.employmentIncomePhases[0].annualNetCashToday).toBe(6000);
  expect(active.person.employmentIncomePhases[0].rrspRoomGeneration!.annualEligibleEarnedIncomeToday).toBe(10000);
});
