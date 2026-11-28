import { describe, expect, it, vi } from "vitest";
import { calculateFireMilestones, evaluateFireCandidate, materializeFireCandidate, parseFireMilestoneRequest, searchFireCandidates } from "@/src/domain/projection/fire-milestones";
import { calculateProjection, evaluateMilestoneFunding, type ComparisonProjectionOptions } from "@/src/domain/projection/calculate";
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
  it.each(["full", "coast", "barista"] as const)("rejects retroactive CPP changes for %s and preserves supported accumulation", kind => {
    const p = fireInputs();
    p.person.currentAge = 60;
    p.person.retirementAge = 62;
    p.endAge = 64;
    p.person.cpp.startAge = 60;
    p.person.cpp.monthlyAmountAt65Today = 1000;
    p.person.employmentIncomePhases.forEach(phase => { phase.startAge += 20; phase.endAge += 20; });
    p.spendingPhases.forEach(phase => { phase.startAge += 20; phase.endAge += 20; });
    p.accounts.forEach(account => account.contributionPhases.forEach(phase => { phase.startAge += 20; phase.endAge += 20; }));
    const r = { ...fireRequest(p), retirementAge: 62 };
    const before = structuredClone(p);
    type Month = Parameters<NonNullable<ComparisonProjectionOptions["onMonth"]>>[0];
    const prefix = (inputs: typeof p) => {
      const months: Month[] = [];
      evaluateMilestoneFunding(structuredClone(inputs), { onMonth: month => { if (month.age < 61 - 1e-8) months.push(month); } });
      return months;
    };
    const expected = prefix(p);
    expect(expected).toHaveLength(12);
    expect(expected.reduce((total, month) => total + month.flow.income.cpp, 0)).toBeGreaterThan(0);
    expect(prefix(materializeFireCandidate(p, r, kind, 61))).toEqual(expected);
    if (kind === "full") r.fullCppBenefitMultiplier = .5;
    else r[kind]!.cppBenefitMultiplier = .5;
    expect(() => materializeFireCandidate(p, r, kind, 61)).toThrow(/CPP adjustment unavailable/);
    // The opening candidate has no accumulation prefix to alter.
    expect(() => materializeFireCandidate(p, r, kind, 60)).not.toThrow();
    p.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
    const result = calculateFireMilestones(p, r).results.find(result => result.kind === kind)!;
    expect(result.status).toBe("unavailable");
    expect(result.candidate).toBeNull();
    expect(result.reason).toMatch(/CPP is payable before this transition/);
    expect(result.tested.map(candidate => candidate.age)).toEqual([60]);
    expect(result.tested[0].passes).toBe(false);
    p.retirementRequirement = before.retirementRequirement;
    expect(p).toEqual(before);
    // Month-end benefit timing also reaches the claim age at the boundary.
    p.person.cpp.startAge = 61;
    expect(() => materializeFireCandidate(p, r, kind, 61)).toThrow(/CPP adjustment unavailable/);
    p.person.cpp.startAge = 62;
    expect(() => materializeFireCandidate(p, r, kind, 61)).not.toThrow();
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

describe("shared funding acceptance corrections", () => {
  it.each(["room", "cash", "reserve"] as const)("preserves ordinary %s-constrained flows and retirement boundary parity", async mode => {
    const { constrainedSavingInputs } = await import("./fixtures/fire-milestones");
    const p = constrainedSavingInputs(mode), before = structuredClone(p), r = fireRequest(p);
    const forward = calculateProjection(structuredClone(p));
    const boundary = evaluateFireCandidate(p, r, "full", 42);
    expect(boundary.passes, boundary.reason ?? "").toBe(true);
    expect(boundary.terminalFinancialAssetsToday).toBeCloseTo(forward.summary.endingFinancialAssetsToday!, 2);
    expect(boundary.terminalFinancialAssetsToday).toBe(mode === "cash" ? 270000 : mode === "reserve" ? 220000 : 240000);
    type Month = Parameters<NonNullable<ComparisonProjectionOptions["onMonth"]>>[0];
    const months = (inputs: typeof p) => {
      const collected: Month[] = [];
      evaluateMilestoneFunding(structuredClone(inputs), { onMonth: m => collected.push(m) });
      return collected;
    };
    const ordinary = months(p);
    expect(months(materializeFireCandidate(p, r, "full", 42))).toEqual(ordinary);
    expect(ordinary.every(m => m.flow.outflows.unmetSpending <= .005 && m.flow.outflows.unmetRequiredOutflow <= .005)).toBe(true);
    if (mode === "reserve") {
      expect(ordinary[0].reserveShortfall).toBe(4000);
      expect(ordinary.slice(1).every(m => m.reserveShortfall === 0)).toBe(true);
      expect(evaluateFireCandidate(p, r, "full", 40).passes).toBe(false);
      expect(evaluateFireCandidate(p, r, "full", 40 + 1 / 12).failure).toMatchObject({ date: "2026-02", category: "reserve", shortfallToday: 4000 });
      // Recovery permits retirement cash drawdown; the terminal floor still binds.
      expect(evaluateFireCandidate(p, r, "full", 40 + 2 / 12).failure).toMatchObject({ date: "2029-12", category: "terminal_floor", shortfallToday: 24000 });
      expect(evaluateFireCandidate(p, r, "full", 41).passes).toBe(true);
    } else {
      if (mode === "room") {
        const withoutOptionalPlan = structuredClone(p);
        withoutOptionalPlan.accounts[1].contributionPhases[0].monthlyAmountToday = 0;
        expect(calculateProjection(withoutOptionalPlan).summary.endingFinancialAssetsToday).toBe(forward.summary.endingFinancialAssetsToday);
      }
      expect(ordinary[0].flow.contributions.unallocatedCashFunded).toBe(mode === "cash" ? 2000 : 1000);
      expect(ordinary[0].flow.withdrawals.total).toBe(0);
    }
    expect(calculateFireMilestones(p, r).results.every(result => result.candidate !== null)).toBe(true);
    expect(p).toEqual(before);
  });

  it("retains mandatory baseline withholding, actual outflow and transition reserve failures", async () => {
    const { constrainedSavingInputs } = await import("./fixtures/fire-milestones");
    const p = constrainedSavingInputs("room"), r = fireRequest(p);
    p.accounts[1].contributionPhases[0].funding = "income_withheld";
    expect(evaluateFireCandidate(p, r, "full", 42).failure).toMatchObject({ date: "2026-01", category: "required_savings", shortfallToday: 1000 });
    p.accounts[1].contributionPhases[0].monthlyAmountToday = 0;
    p.monthlyEssentialSpendingToday = 1000000;
    expect(evaluateFireCandidate(p, r, "full", 42).failure).toMatchObject({ date: "2026-01", category: "required_outflow" });
    const reserve = constrainedSavingInputs("reserve");
    reserve.surplusAllocation.targetCashReserveToday = 1000000;
    expect(evaluateFireCandidate(reserve, fireRequest(reserve), "full", 42).failure).toMatchObject({ category: "reserve", date: "2028-01" });
    reserve.surplusAllocation.targetCashReserveToday = 10000;
    reserve.accounts[1].openingBalance = 0;
    reserve.events = [{ id: "synthetic-late-expense", label: "Synthetic expense", calendarYear: 2028, month: 2, amountToday: 130000, direction: "outflow" }];
    expect(evaluateFireCandidate(reserve, fireRequest(reserve), "full", 42).passes).toBe(false);
  });
});

it("requires reserves before immediate FIRE, even when first-month salary fills the gap", () => {
  const p = fireInputs(), r = fireRequest(p);
  p.accounts[0].openingBalance = 0;
  p.surplusAllocation.targetCashReserveToday = 1000;
  p.surplusAllocation.reserveIndexingRate = 0;
  r.barista!.phases[0].employment = { mode: "gross_estimate", annualGrossToday: 100000 };
  const candidate = materializeFireCandidate(p, r, "barista", 40);
  let firstMonthReserve: number | undefined;
  evaluateMilestoneFunding(candidate, { onMonth: m => { firstMonthReserve ??= m.reserveShortfall; } });
  expect(firstMonthReserve).toBe(0); // The salary cures the deficit too late.
  for (const kind of ["full", "coast", "barista"] as const) {
    expect(evaluateFireCandidate(p, r, kind, 40).failure).toMatchObject({ date: "2026-01", category: "reserve", shortfallToday: 1000 });
  }
  expect(calculateFireMilestones(p, r).results.find(x => x.kind === "barista")!.status).toBe("future");
  p.accounts[0].openingBalance = 1000;
  expect(evaluateFireCandidate(p, r, "barista", 40).passes).toBe(true);
});

it.each([true, false])("uses the same opening operating-cash protection when reserve membership is %s", async shared => {
  const { constrainedSavingInputs } = await import("./fixtures/fire-milestones");
  const { openingReserveShortfall } = await import("@/src/domain/projection/calculate");
  const p = constrainedSavingInputs("cash");
  if (p.savingsPolicy.mode !== "simple") throw new Error("Expected simple fixture");
  p.accounts[0].openingBalance = 0;
  p.savingsPolicy.operatingCashTarget = { targetToday: 2000, indexingRate: .03 };
  p.surplusAllocation.targetCashReserveToday = 1000;
  if (!shared) {
    const reserve = { ...structuredClone(p.accounts[0]), id: "synthetic:reserve" };
    p.accounts.push(reserve);
    p.savingsPolicy.reserveAccountIds = p.surplusAllocation.reserveAccountIds = [reserve.id];
    p.savingsPolicy.reserveRefillAccountId = p.surplusAllocation.reserveRefillAccountId = reserve.id;
  }
  const expected = shared ? 2000 : 3000;
  expect(openingReserveShortfall(p)).toBe(expected);
  expect(evaluateFireCandidate(p, fireRequest(p), "barista", 40).failure).toMatchObject({ category: "reserve", shortfallToday: expected });
});

it("permits ordinary retirement reserve drawdown and spend-down, but retains outflow and floor failures", async () => {
  const { evaluateCareerFunding } = await import("@/src/domain/projection/fire-milestones");
  const p = fireInputs(), r = fireRequest(p);
  p.surplusAllocation.targetCashReserveToday = 20000;
  p.surplusAllocation.reserveIndexingRate = 0;
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 90000;
  r.barista!.phases[0].employment = { mode: "net_override", annualNetCashToday: 12000, annualTaxableEmploymentIncomeToday: 12000, annualEligibleEarnedIncomeToday: 12000 };
  const active = materializeFireCandidate(p, r, "barista", 40);
  expect(evaluateFireCandidate(p, r, "barista", 40)).toMatchObject({ passes: true, terminalFinancialAssetsToday: 96000 });
  expect(calculateProjection(active).summary.endingFinancialAssetsToday).toBe(96000);
  expect(evaluateCareerFunding(active, 40, 42, "barista", r.barista!.phases[0]).passes).toBe(true);
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 0;
  p.accounts[1].openingBalance = 4000;
  expect(evaluateFireCandidate(p, r, "barista", 40)).toMatchObject({ passes: true, terminalFinancialAssetsToday: 0 });
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 100;
  expect(evaluateFireCandidate(p, r, "barista", 40).failure).toMatchObject({ category: "terminal_floor", shortfallToday: 100 });
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 0;
  p.accounts[1].openingBalance = 3000;
  expect(evaluateFireCandidate(p, r, "barista", 40).failure).toMatchObject({ category: "required_outflow" });
  p.accounts[1].openingBalance = 100000;
  r.barista!.phases[0].employment.annualNetCashToday = 0;
  expect(evaluateFireCandidate(p, r, "barista", 40).failure).toMatchObject({ category: "reserve", date: "2026-01" });
  // Immediate Full FIRE still needs its opening reserve, then may spend it.
  p.accounts[1].openingBalance = 28000;
  expect(evaluateFireCandidate(p, r, "full", 40)).toMatchObject({ passes: true, terminalFinancialAssetsToday: 0 });
});


it("reports budget-limited FIRE searches as unfinished, never financially infeasible", () => {
  const now = vi.spyOn(Date, "now").mockReturnValueOnce(0).mockReturnValue(30001);
  try {
    const result = calculateFireMilestones(fireInputs(), fireRequest());
    expect(result.results.every(r => r.status === "unavailable" && r.reason.includes("not computed") && r.tested.length === 0)).toBe(true);
  } finally { now.mockRestore(); }
});
