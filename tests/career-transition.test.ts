import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { careerPreset } from "@/src/domain/scenario/career";
import { calculateComparison, materializeComparisonInputs } from "@/src/domain/scenario/comparison";
import { estimateOntarioEmployment } from "@/src/domain/scenario/payroll";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { calculateAnnualCanadianTax, ZERO_CANADIAN_TAX_INCOME } from "@/src/domain/projection/canadian-tax";
import { parseComparisonScenarios } from "@/src/config/scenario-comparison";
import { loadPlannerConfig, validatePlannerConfig } from "@/src/config/loader";
import { validateProjectionInputs } from "@/src/domain/projection/types";
import { projectionFixture } from "./fixtures/projection";

export function careerInputs() {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-01";
  input.person.retirementAge = 42;
  input.endAge = 44;
  input.person.employmentIncomePhases[0].endAge = 42;
  input.person.employmentIncomePhases[0].annualGrowth = 0;
  input.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 100000;
  input.spendingPhases[0].endAge = 44;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 1000;
  input.monthlyDiscretionarySpendingToday = 0;
  input.events = [];
  input.surplusAllocation.reserveIndexingRate = 0;
  input.accounts[0].openingBalance = 20000;
  input.accounts[0].withdrawalPriority = 2;
  input.accounts[1].openingBalance = 500000;
  input.accounts[1].withdrawalPriority = 1;
  input.accounts[1].contributionPhases[0].endAge = 42;
  for (const a of input.accounts) a.annualReturn = 0;
  return input;
}
function plan(kind: Parameters<typeof careerPreset>[1] = "coast") {
  return careerPreset(careerInputs(), kind);
}
function net(scenario: ReturnType<typeof plan>, annual: number) {
  for (const p of scenario.careerTransition!.phases) {
    p.employment = { mode: "net_override", annualNetCashToday: annual, annualTaxableEmploymentIncomeToday: annual * 1.2, annualEligibleEarnedIncomeToday: annual * 1.2 };
  }
  return scenario;
}
function run(scenario = plan(), input = careerInputs()) {
  const result = calculateComparison(input, [scenario])[0];
  expect(result.status, result.warnings.join("\n")).not.toBe("unavailable");
  for (const row of result.annual) expect(Math.abs(row.reconciliationDifference)).toBeLessThanOrEqual(.01);
  return result;
}

describe("career strategies through the existing engine", () => {
  it("preserves an unchanged baseline, and materializes independent editable starters", () => {
    const baseline = careerInputs();
    const before = structuredClone(baseline);
    const unchanged = { id: "baseline", label: "Baseline", spending: [], personalContributions: [], contributionPolicy: "configured_fixed_plan" as const };
    expect(materializeComparisonInputs(baseline, unchanged)).toEqual(validateProjectionInputs(structuredClone(baseline)));
    expect(calculateComparison(baseline, [unchanged])[0].summary).toEqual(calculateProjection(structuredClone(baseline)).summary);
    for (const kind of ["reduced_income", "coast", "barista", "coast_to_barista"] as const) {
      const result = run(careerPreset(baseline, kind), baseline);
      expect(result.trajectory.at(-1)?.age).toBe(44);
      expect(result.annual.reduce((n, r) => n + r.months, 0)).toBe(48);
      expect(result.retirementRequirement).not.toBeNull();
    }
    expect(baseline).toEqual(before);
  });
  it("verifies zero-saving Coast and rejects automatic surplus investing or required withholding", () => {
    const scenario = plan();
    expect(run(scenario).coastVerified).toBe(true);
    const input = careerInputs();
    input.accounts[1].type = "non_registered";
    input.surplusAllocation.excess = { mode: "allocate_to_account", destinationAccountId: "manual:2" };
    expect(run(scenario, input).coastVerified).toBe(true); // explicitly retained
    scenario.careerTransition!.phases[0].surplusInvesting = "configured";
    expect(run(scenario, input).coastVerified).toBe(false);
    scenario.careerTransition!.phases[0].surplusInvesting = "retain_as_cash";
    scenario.careerTransition!.phases[0].contributions = [{ accountId: "manual:2", monthlyAmountToday: 50, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic mandatory term" }];
    expect(run(scenario).coastVerified).toBe(false);
  });
  it("allows Barista spending withdrawals only inside its selected interval", () => {
    const barista = net(plan("barista"), 6000);
    const allowed = run(barista);
    expect(allowed.workingLifeFeasible).toBe(true);
    expect(allowed.lifetimeViable).toBe(true);
    expect(allowed.annual[0].withdrawals).toBeGreaterThan(0);
    expect(run(net(plan("coast"), 6000)).coastVerified).toBe(false);
    const combined = net(plan("coast_to_barista"), 6000);
    combined.careerTransition!.phases[0].employment = { mode: "net_override", annualNetCashToday: 12000, annualTaxableEmploymentIncomeToday: 15000, annualEligibleEarnedIncomeToday: 15000 };
    expect(run(combined).coastVerified).toBe(true);
    combined.careerTransition!.phases[0].employment.annualNetCashToday = 6000;
    expect(run(combined).workingLifeFeasible).toBe(false);
  });
  it("rejects withdrawal-funded investments, reserve breaches, funding failures and terminal-floor misses", () => {
    const scenario = net(plan("barista"), 6000);
    scenario.contributionPolicy = "configured_fixed_plan";
    scenario.careerTransition!.phases[0].contributions = [{ accountId: "manual:2", monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "cash", requirement: "optional", sourceDescription: "Synthetic saving" }];
    expect(run(scenario).workingLifeFeasible).toBe(false);
    const reserve = careerInputs();
    reserve.accounts[0].openingBalance = 0;
    expect(run(net(plan("barista"), 6000), reserve).workingLifeFeasible).toBe(false);
    const empty = careerInputs();
    empty.accounts.forEach(a => { a.openingBalance = 0; });
    expect(run(net(plan("barista"), 0), empty).lifetimeViable).toBe(false);
    const floor = careerInputs();
    floor.retirementRequirement.minimumEndingFinancialAssetsToday = 1000000;
    const failed = run(plan(), floor);
    expect(failed.workingLifeFeasible).toBe(true);
    expect(failed.lifetimeViable).toBe(false);
    expect(failed.coastVerified).toBe(false);
  });
  it("uses phase-local growth and actual inflation up to each phase boundary", () => {
    const input = careerInputs();
    input.annualInflation = .12;
    const scenario = net(plan("coast_to_barista"), 12000);
    scenario.careerTransition!.phases[1].annualGrowth = 0;
    const active = materializeComparisonInputs(input, scenario);
    const cash: number[] = [];
    calculateProjection(active, { onMonth: m => { cash.push(m.flow.income.employment); } });
    expect(cash[12]).toBeCloseTo(1120, 2);
    expect(cash[23]).toBeCloseTo(1120, 2);
    expect(cash[24]).toBe(0);
  });
  it("changes full retirement, preserves baseline phases before transition and supports adverse returns", () => {
    const input = careerInputs();
    const scenario = plan();
    scenario.careerTransition!.transitionAge = 41;
    scenario.careerTransition!.retirementAge = 43;
    scenario.careerTransition!.phases[0].startAge = 41;
    scenario.careerTransition!.phases[0].endAge = 43;
    const active = materializeComparisonInputs(input, scenario);
    expect(active.person.employmentIncomePhases[0].endAge).toBe(41);
    expect(run(scenario).retirementAge).toBe(43);
    input.accounts[1].annualReturn = -.2;
    expect(run(scenario, input).summary!.endingFinancialAssetsToday).toBeLessThan(run(scenario).summary!.endingFinancialAssetsToday!);
  });
  it("rejects gaps, overlaps, reversed boundaries, non-month dates and unsupported savings destinations", async () => {
    const scenario = plan("coast_to_barista");
    scenario.careerTransition!.phases[0].endAge += 1 / 12;
    expect(() => parseComparisonScenarios([scenario])).toThrow(/contiguous/);
    const dates = plan();
    dates.careerTransition!.transitionAge = dates.careerTransition!.phases[0].startAge = 40.01;
    expect(() => materializeComparisonInputs(careerInputs(), dates)).toThrow(/months/);
    const config = await loadPlannerConfig("config/planner.example.yaml");
    dates.careerTransition!.retirementAge = dates.careerTransition!.phases[0].endAge = config.projectionEndAge + 1;
    expect(() => validatePlannerConfig({ ...config, scenarioComparison: [dates] })).toThrow(/horizon/);
  });
});

describe("explicit Ontario employment estimates", () => {
  it.each([0, 3500, 30000, 74600, 85000, 150000])("reconciles estimated gross %s and uses the existing annual tax calculation", gross => {
    const pay = estimateOntarioEmployment(gross);
    const tax = calculateAnnualCanadianTax({ calendarYear: 2026, province: "ON", ageAtYearEnd: 40, incomeBySource: { ...ZERO_CANADIAN_TAX_INCOME, employment: gross }, eligiblePensionIncome: 0, futureIndexingRate: 0 });
    expect(pay.tax).toBe(tax.totals.totalTax);
    expect(pay.annualNetCashToday + pay.tax + pay.cpp + pay.cpp2 + pay.ei).toBeCloseTo(gross, 2);
  });
  it.each([[30000, 25088.61], [60000, 46453.14], [85000, 62460.87]])("matches the documented annual approximation for gross %s", (gross, expectedNet) => {
    expect(estimateOntarioEmployment(gross).annualNetCashToday).toBe(expectedNet);
  });
  it("applies the dated CPP, CPP2 and EI caps", () => {
    expect(estimateOntarioEmployment(85000)).toMatchObject({ cpp: 4230.45, cpp2: 416, ei: 1123.07 });
    expect(estimateOntarioEmployment(3500)).toMatchObject({ cpp: 0, cpp2: 0, ei: 57.05 });
    expect(estimateOntarioEmployment(30000)).toMatchObject({ cpp: 1576.75, cpp2: 0, ei: 489 });
  });
  it("keeps net, taxable and eligible overrides independent and supports explicit illustrative match", () => {
    const scenario = plan("reduced_income");
    const p = scenario.careerTransition!.phases[0];
    p.employment = { mode: "net_override", annualNetCashToday: 12000, annualTaxableEmploymentIncomeToday: 20000, annualEligibleEarnedIncomeToday: 18000 };
    p.annualPensionAdjustmentToday = 100;
    p.contributions = [{ accountId: "manual:2", monthlyAmountToday: 20, employerMonthlyAmountToday: 20, funding: "income_withheld", requirement: "optional", sourceDescription: "Illustrative dollar-for-dollar match, not a market average" }];
    const active = materializeComparisonInputs(careerInputs(), scenario);
    expect(active.person.employmentIncomePhases[0]).toMatchObject({ annualNetCashToday: 12000, annualTaxableEmploymentIncomeToday: 20000, rrspRoomGeneration: { annualEligibleEarnedIncomeToday: 18000, annualPensionAdjustmentToday: 100 } });
    expect(run(scenario).annual[0].withheld).toBe(480);
  });
  it("does not charge payroll tax or employee withholding twice, including a partial year", () => {
    const input = careerInputs();
    input.startDate = "2026-07-01";
    input.tax = { ...input.tax, limitations: ["full_tax_return_deductions_and_refundable_credits_not_modelled"], mode: "canadian_annual", source: "explicit_configuration", province: "ON", referenceYear: 2026, futureIndexingRate: 0,
      openingTaxYearBeforeProjectionMonth: { source: "explicit_configuration", calendarYear: 2026, throughMonth: 6, income: { ...ZERO_CANADIAN_TAX_INCOME } } };
    const scenario = plan("reduced_income");
    const p = scenario.careerTransition!.phases[0];
    p.employment = { mode: "gross_estimate", annualGrossToday: 30000 };
    p.contributions = [{ accountId: "manual:2", monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "income_withheld", requirement: "optional", sourceDescription: "Synthetic withheld savings" }];
    const pay = estimateOntarioEmployment(30000);
    const result = run(scenario, input);
    expect(result.annual[0].months).toBe(6);
    expect(result.annual[0].takeHome).toBeCloseTo(pay.annualNetCashToday / 2 - 600, 2);
    expect(result.annual[0].withheld).toBe(600);
    expect(result.annual[0].tax).toBe(0);
    p.contributions[0].employerMonthlyAmountToday = 100;
    expect(() => materializeComparisonInputs(input, scenario)).toThrow(/unavailable/);
  });
});

it("retains simple-mode surplus without claiming continuing workplace savings as Coast", () => {
  const input = simpleCareerInputs();
  const workplace = input.accounts.find(a => a.id === "synthetic-workplace")!;
  const scenario = net(plan(), 12000);
  expect(run(scenario, input).coastVerified).toBe(true);
  scenario.careerTransition!.phases[0].contributions.push({ accountId: workplace.id, monthlyAmountToday: 100, employerMonthlyAmountToday: 100, funding: "income_withheld", requirement: "required", sourceDescription: "Synthetic match" });
  const failed = run(scenario, input);
  expect(failed.coastVerified).toBe(false);
  expect(failed.annual[0].withheld).toBe(2400);
  input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount = 0;
  expect(run(scenario, input).workingLifeFeasible).toBe(false);
});

it("keeps full lifetime benefit and tax paths and does not certify unserved debt", () => {
  const input = structuredClone(projectionFixture);
  const scenario = careerPreset(input, "coast_to_barista");
  const result = calculateComparison(input, [scenario])[0];
  expect(result.status).not.toBe("unavailable");
  expect(result.trajectory.at(-1)!.age).toBe(95);
  expect(result.annual.at(-1)!.year).toBeGreaterThan(2080);
  const debt = careerInputs();
  debt.liabilities = [{ id: "synthetic-debt", label: "Synthetic debt", origin: "lunchmoney", openingBalance: 100000, balanceAsOf: "2026-01-01", role: null, historicalPaymentHandling: "already_excluded_or_transfer", historicalMonthlyAverage: 0,
    treatment: { mode: "amortizing", annualInterestRate: .2, interestRateConvention: "effective_annual",
      regularPayment: { amount: 2000, frequency: "monthly", monthlyEquivalent: 2000 }, scheduleStartDate: "2026-01-01", lumpSumPayments: [] } }];
  debt.accounts.forEach(a => { a.openingBalance = 0; });
  const failed = calculateComparison(debt, [net(plan(), 0)])[0];
  expect(failed.status).toBe("unavailable");
  expect(failed.warnings.join(" ")).toContain("Required liability payment could not be funded");
  expect(failed.lifetimeViable).toBe(false);
});

it("distinguishes skipped optional saving from unserved required contributions", () => {
  const scenario = net(plan(), 12000);
  scenario.careerTransition!.phases[0].contributions = [{ accountId: "manual:2", monthlyAmountToday: 100, employerMonthlyAmountToday: 0, funding: "cash", requirement: "optional", sourceDescription: "Synthetic optional saving" }];
  const optional = run(scenario);
  expect(optional.annual[0].actualPersonal).toBe(0);
  expect(optional.annual[0].unallocatedPersonal).toBe(1200);
  expect(optional.coastVerified).toBe(true);
  scenario.careerTransition!.phases[0].contributions[0].requirement = "required";
  expect(run(scenario).coastVerified).toBe(false);
});

it("never certifies Coast that relies on retained cash saving", () => {
  const input = careerInputs();
  input.accounts[1].openingBalance = 0;
  const result = run(net(plan(), 60000), input);
  expect(result.workingLifeFeasible).toBe(true);
  expect(result.lifetimeViable).toBe(true); // actual retained cash pays for retirement
  expect(result.coastVerified).toBe(false); // without that saving the floor fails
  expect(result.coastFundingWithoutSurplusToday).toBeLessThan(0);
  expect(result.status).toBe("infeasible");
});

it("validates the complete commented career example through Planner Config", async () => {
  const text = await readFile("config/planner.example.yaml", "utf8");
  const block = text.slice(text.indexOf("# scenarioComparison:")).split("\n").map(line => line.replace(/^# ?/, "")).join("\n");
  const config = await loadPlannerConfig("config/planner.example.yaml");
  const parsed = validatePlannerConfig({ ...config, ...parse(block) });
  expect(parsed.scenarioComparison).toHaveLength(2);
  expect(parsed.scenarioComparison![1].careerTransition!.phases.map(p => p.kind)).toEqual(["coast", "barista"]);
});

it("retains deterministic shock-path support in career comparisons", () => {
  const input = careerInputs();
  Object.assign(input, { returnScenario: { label: "Synthetic adverse path", source: "explicit_configuration" } });
  Object.assign(input.accounts[1], { returnPath: { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2026, annualReturn: -.35 }] } });
  const stressed = run(plan("barista"), input);
  expect(stressed.summary!.endingFinancialAssetsToday).toBeLessThan(run(plan("barista")).summary!.endingFinancialAssetsToday!);
});

it("keeps CPP owner-controlled and applies an explicit lower-benefit sensitivity", () => {
  const input = structuredClone(projectionFixture);
  const scenario = careerPreset(input, "barista");
  const original = calculateComparison(input, [scenario])[0];
  scenario.careerTransition!.cppBenefitMultiplier = .5;
  const lower = calculateComparison(input, [scenario])[0];
  expect(lower.status).not.toBe("unavailable");
  expect(lower.annual.reduce((n, row) => n + row.takeHome, 0)).toBeLessThan(original.annual.reduce((n, row) => n + row.takeHome, 0));
  expect(input.person.cpp.monthlyAmountAt65Today).toBe(1200);
});

function simpleCareerInputs() {
  const input = careerInputs();
  const tfsa = { ...structuredClone(input.accounts[1]), id: "synthetic-tfsa", type: "tfsa" as const, contributionPhases: [] };
  const taxable = { ...structuredClone(tfsa), id: "synthetic-taxable", type: "non_registered" as const };
  const workplace = { ...structuredClone(tfsa), id: "synthetic-workplace", type: "rrsp_rrif" as const };
  input.accounts[1].contributionPhases = [];
  input.accounts.push(tfsa, taxable, workplace);
  input.contributionWaterfall = { mode: "simple_policy", routes: [
    { sourceAccountId: workplace.id, destinationAccountIds: [workplace.id] },
    { sourceAccountId: tfsa.id, destinationAccountIds: [tfsa.id, input.accounts[1].id, taxable.id] },
  ], surplusDestinationAccountIds: [tfsa.id, input.accounts[1].id, taxable.id] };
  input.surplusAllocation.excess = { mode: "allocate_through_contribution_waterfall" };
  input.savingsPolicy = { mode: "simple", operatingCashAccountId: input.accounts[0].id, reserveAccountIds: [input.accounts[0].id], reserveRefillAccountId: input.accounts[0].id, personalTfsaAccountId: tfsa.id, personalRrspAccountId: input.accounts[1].id, workplaceRrspAccountId: workplace.id, taxableAccountId: taxable.id, taxableAccountOrigin: taxable.origin, reserveBuildingPhases: [], operatingCashTarget: { targetToday: 20000, indexingRate: 0 }, unplannedCash: "sweep_above_targets", personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"], workplaceRoomPriority: "first", workplaceOverflow: "unallocated", reserveAfterTarget: "personal_investing" };
  return input;
}

it.each(["sweep_above_targets", "retain_in_operating_cash"] as const)("funds separate protected reserves before career retention with %s", (unplannedCash) => {
  const input = simpleCareerInputs();
  if (input.savingsPolicy.mode !== "simple") throw new Error("Expected simple policy");
  input.accounts.push({ ...structuredClone(input.accounts[0]), id: "synthetic-reserve", openingBalance: 0 });
  input.savingsPolicy.reserveAccountIds = ["synthetic-reserve"];
  input.savingsPolicy.reserveRefillAccountId = "synthetic-reserve";
  input.savingsPolicy.unplannedCash = unplannedCash;
  input.surplusAllocation.reserveAccountIds = ["synthetic-reserve"];
  input.surplusAllocation.reserveRefillAccountId = "synthetic-reserve";
  input.surplusAllocation.targetCashReserveToday = 1000;
  const scenario = net(plan(), 42000);
  const result = run(scenario, input);
  expect(result.workingLifeFeasible).toBe(true);
  expect(result.coastVerified).toBe(true);
  expect(result.annual[0].personalDeposits).toBe(0);
  expect(result.annual[0].retained).toBe(30000);
  const active = materializeComparisonInputs(input, scenario);
  for (const counterfactual of [false, true]) {
    calculateProjection(active, {
      retainSurplusAtAge: age => age < 42,
      consumeUncommittedSurplusAtAge: age => counterfactual && age < 42,
      onMonth: ({ age, flow, reserveShortfall }) => {
        if (age !== 40) return;
        expect(reserveShortfall).toBe(0);
        expect(flow.accountSurplusAllocations["synthetic-reserve"]).toBe(1000);
        expect(flow.surplusAllocation.reserveRefill).toBe(1000);
        expect(flow.savingsPolicy.targetFundingRetained).toBe(1000);
        expect(flow.surplusAllocation.retainedAsCash).toBe(counterfactual ? 1000 : 2500);
        expect(flow.savingsPolicy.unplannedCashSwept).toBe(0);
      },
    });
  }
});

it.each([false, true])("keeps baseline assessment invariant with a career alternative (unallocated withholding: %s)", (withholding) => {
  const input = careerInputs();
  input.accounts[0].openingBalance = withholding ? 20000 : 0;
  input.person.employmentIncomePhases[0].annualNetCashToday = 12000;
  input.accounts[1].contributionPhases = [];
  if (withholding) {
    input.accounts[1].contributionPhases = [{ id: "withheld", label: "Synthetic withholding", startAge: 40, endAge: 42, monthlyAmountToday: 100, indexingRate: 0, funding: "income_withheld" }];
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount = 0;
    input.person.employmentIncomePhases[0].rrspRoomGeneration!.annualEligibleEarnedIncomeToday = 0;
  }
  const baseline = { id: "baseline", label: "Baseline", spending: [], personalContributions: [], contributionPolicy: "configured_fixed_plan" as const };
  const alone = calculateComparison(input, [baseline])[0];
  const paired = calculateComparison(input, [baseline, net(plan("barista"), 12000)])[0];
  expect(alone.status).toBe("calculated");
  expect(alone.workingLifeFeasible).toBe(true);
  expect(alone.lifetimeViable).toBe(true);
  expect(alone.firstFundingShortfallAge).toBeNull();
  for (const key of ["status", "workingLifeFeasible", "lifetimeViable", "firstFundingShortfallAge", "summary", "warnings"] as const) expect(paired[key]).toEqual(alone[key]);
  expect(alone.allocationHorizon).toBe("working_life");
  expect(paired.allocationHorizon).toBe("full_horizon");
});
