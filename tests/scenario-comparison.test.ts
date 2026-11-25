import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { loadPlannerConfig, validatePlannerConfig } from "@/src/config/loader";
import { parseComparisonScenarios } from "@/src/config/scenario-comparison";
import { calculateComparison, materializeComparisonInputs } from "@/src/domain/scenario/comparison";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import { projectionFixture } from "./fixtures/projection";

function scenario(): ComparisonScenarioConfig {
  return { id: "synthetic-a", label: "Synthetic alternative", spending: [], personalContributions: [], contributionPolicy: "cash_constrained" };
}
function inputs() {
  const input = structuredClone(projectionFixture);
  input.endAge = 66;
  input.spendingPhases = [
    { id: "working", label: "Synthetic working", startAge: 40, endAge: 65, essentialMultiplier: 1, discretionaryMultiplier: 1, source: "explicit_configuration" },
    { id: "retired", label: "Synthetic retirement", startAge: 65, endAge: 66, essentialMultiplier: 1, discretionaryMultiplier: 1, source: "explicit_configuration" },
  ];
  return input;
}

describe("configured scenario comparison", () => {
  it("preserves omission and validates empty and variable scenario counts", async () => {
    const config = await loadPlannerConfig("config/planner.example.yaml");
    expect(config.scenarioComparison).toBeUndefined();
    expect(validatePlannerConfig({ ...config, scenarioComparison: [] }).scenarioComparison).toEqual([]);
    const scenarios = [scenario(), { ...scenario(), id: "synthetic-b", label: "Synthetic second" }];
    expect(validatePlannerConfig({ ...config, scenarioComparison: scenarios }).scenarioComparison).toEqual(scenarios);
  });
  it("rejects duplicate IDs, missing sections, blank names and invalid amounts", () => {
    expect(() => parseComparisonScenarios([scenario(), scenario()])).toThrow(/duplicate/);
    expect(() => parseComparisonScenarios([{ ...scenario(), label: " " }])).toThrow(/nonblank/);
    expect(() => parseComparisonScenarios([{ ...scenario(), spending: undefined }])).toThrow(/arrays/);
    for (const amount of [-1, Infinity, NaN, Number.MAX_VALUE]) {
      expect(() => parseComparisonScenarios([{ ...scenario(), spending: [{ phaseId: "working", adjustment: { mode: "annual_lifestyle_budget", annualAmountToday: amount } }] }])).toThrow(/non-negative/);
    }
  });
  it("rejects unknown phase references at config validation", async () => {
    const config = await loadPlannerConfig("config/planner.example.yaml");
    expect(() => validatePlannerConfig({ ...config, scenarioComparison: [{ ...scenario(), spending: [{ phaseId: "missing", adjustment: { mode: "annual_lifestyle_budget", annualAmountToday: 60000 } }] }] })).toThrow(/existing phase/);
  });
  it("preserves source inputs and essential spending while scaling a named phase", () => {
    const baseline = inputs();
    const before = structuredClone(baseline);
    const definition = scenario();
    definition.spending = [{ phaseId: "working", adjustment: { mode: "annual_lifestyle_budget", annualAmountToday: 54000 } }];
    const active = materializeComparisonInputs(baseline, definition);
    expect(active.spendingPhases[0].essentialMultiplier).toBe(1);
    expect(active.spendingPhases[0].discretionaryMultiplier).toBe(1.625);
    expect(baseline).toEqual(before);
    definition.spending[0].adjustment = { mode: "annual_lifestyle_budget", annualAmountToday: 1 };
    expect(() => materializeComparisonInputs(baseline, definition)).toThrow(/protected essential/);
  });
  it("calculates multiple deterministic alternatives and reconciles monthly cash", () => {
    const baseline = inputs();
    const second = { ...scenario(), id: "synthetic-b", label: "Synthetic second", spending: [{ phaseId: "working", adjustment: { mode: "multipliers" as const, essentialMultiplier: 1, discretionaryMultiplier: 2 } }] };
    const results = calculateComparison(baseline, [scenario(), second]);
    expect(results.map((result) => result.status)).not.toContain("unavailable");
    expect(results[0].warnings.join(" ")).not.toContain("reconcile");
    expect(results[0].annual.length).toBeGreaterThan(0);
    expect(results[0].summary).not.toEqual(results[1].summary);
    for (const result of results) for (const year of result.annual) expect(Math.abs(year.reconciliationDifference)).toBeLessThanOrEqual(.01);
    expect(calculateComparison(baseline, [])).toEqual([]);
  });
  it("surfaces invalid scenarios rather than hiding them", () => {
    const definition = scenario();
    definition.personalContributions = [{ target: { mode: "account", accountId: "missing" }, phaseId: "missing", monthlyAmountToday: 5 }];
    const [result] = calculateComparison(inputs(), [definition]);
    expect(result.status).toBe("unavailable");
    expect(result.summary).toBeNull();
    expect(result.trajectory).toEqual([]);
  });
});

function cashCase(monthlyIncome: number, reserveBalance = 20000) {
  const input = inputs();
  input.startDate = "2026-07-01";
  input.endAge = input.person.retirementAge = 40 + 1 / 12;
  input.spendingPhases = [{ ...input.spendingPhases[0], endAge: input.endAge }];
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 1000;
  input.monthlyDiscretionarySpendingToday = 200;
  input.events = [];
  input.person.employmentIncomePhases[0].annualNetCashToday = monthlyIncome * 12;
  input.person.employmentIncomePhases[0].annualGrowth = 0;
  input.person.employmentIncomePhases[0].endAge = input.endAge;
  input.accounts[0].openingBalance = reserveBalance;
  for (const account of input.accounts) {
    account.annualReturn = 0;
    for (const phase of account.contributionPhases) {
      phase.endAge = input.endAge;
      phase.indexingRate = 0;
    }
  }
  input.surplusAllocation.reserveIndexingRate = 0;
  return input;
}

describe("comparison cash integrity", () => {
  it.each([[2400, 1000], [1600, 400], [1200, 0]])("caps personal investments using income %s", (income, deposited) => {
    const [result] = calculateComparison(cashCase(income), [scenario()]);
    expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
    expect(result.annual[0].plannedPersonal).toBeCloseTo(1000, 2);
    expect(result.annual[0].actualPersonal).toBeCloseTo(deposited, 2);
    expect(result.annual[0].withdrawals).toBe(0);
    expect(result.annual[0].unallocatedPersonal).toBeCloseTo(1000 - deposited, 2);
    expect(result.annual[0].reconciliationDifference).toBeCloseTo(0, 2);
  });
  it("protects the configured reserve target before personal investment", () => {
    const [result] = calculateComparison(cashCase(2400, 19500), [scenario()]);
    expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
    expect(result.annual[0].actualPersonal).toBeCloseTo(700, 2);
    expect(result.annual[0].retained).toBeCloseTo(500, 2);
    expect(result.annual[0].withdrawals).toBe(0);
  });
  it("keeps fixed plans and flags reserve-financed infeasibility", () => {
    const input = cashCase(1200);
    const [result] = calculateComparison(input, [{ ...scenario(), contributionPolicy: "configured_fixed_plan" }]);
    expect(result.status).toBe("infeasible");
    expect(result.firstFundingShortfallAge).toBe(40);
    expect(result.annual[0].plannedPersonal).toBeCloseTo(1000, 2);
    expect(result.annual[0].withdrawals).toBeCloseTo(1000, 2);
    expect(result.annual[0].actualPersonal).toBe(0);
    expect(result.annual[0].withdrawalFundedPersonal).toBeCloseTo(1000, 2);
  });
  it("does not charge withheld contributions to take-home cash", () => {
    const input = cashCase(1600);
    const workplace = structuredClone(input.accounts[1]);
    workplace.id = "synthetic-workplace";
    workplace.contributionPhases[0].funding = "income_withheld";
    workplace.contributionPhases[0].monthlyAmountToday = 300;
    input.accounts.push(workplace);
    input.contributionWaterfall.routes.unshift({ sourceAccountId: workplace.id, destinationAccountIds: [workplace.id] });
    const [result] = calculateComparison(input, [scenario()]);
    expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
    expect(result.annual[0].withheld).toBeCloseTo(300, 2);
    expect(result.annual[0].actualPersonal).toBeCloseTo(400, 2);
    expect(result.annual[0].takeHome).toBeCloseTo(1600, 2);
  });
  it("pays scheduled mortgage and explicit extra principal before contributions", () => {
    const input = cashCase(2400);
    input.nonFinancialAssets = [{ id: "synthetic-residence", label: "Synthetic residence", origin: "projection_configuration", type: "primary_residence", openingValue: 10000, valueAsOf: input.startDate, annualAppreciation: 0, availableForWithdrawals: false }];
    input.liabilities = [{ id: "synthetic-mortgage", label: "Synthetic mortgage", origin: "lunchmoney", openingBalance: 5000, balanceAsOf: input.startDate, role: "primary_mortgage", historicalPaymentHandling: "already_excluded_or_transfer", historicalMonthlyAverage: 0, treatment: { mode: "amortizing", annualInterestRate: 0, interestRateConvention: "effective_annual", regularPayment: { amount: 200, frequency: "monthly", monthlyEquivalent: 200 }, scheduleStartDate: input.startDate, lumpSumPayments: [{ date: input.startDate, amount: 300 }] } }];
    const [result] = calculateComparison(input, [scenario()]);
    expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
    expect(result.annual[0].liabilityPayments).toBeCloseTo(200, 2);
    expect(result.annual[0].extraDebtPayments).toBeCloseTo(300, 2);
    expect(result.annual[0].actualPersonal).toBeCloseTo(700, 2);
  });
});

it("compares simple personal phases without changing their identity or existing policy", () => {
  const input = cashCase(2400, 19500);
  const tfsa = structuredClone(input.accounts[1]);
  tfsa.id = "synthetic-tfsa";
  tfsa.type = "tfsa";
  const taxable = structuredClone(input.accounts[1]);
  taxable.id = "synthetic-taxable";
  taxable.type = "non_registered";
  taxable.contributionPhases = [];
  input.accounts[1].contributionPhases = [];
  input.accounts.push(tfsa, taxable);
  input.contributionWaterfall = { mode: "simple_policy", routes: [{ sourceAccountId: tfsa.id, destinationAccountIds: [tfsa.id, input.accounts[1].id, taxable.id] }], surplusDestinationAccountIds: [tfsa.id, input.accounts[1].id, taxable.id] };
  input.surplusAllocation.excess = { mode: "allocate_through_contribution_waterfall" };
  input.savingsPolicy = { mode: "simple", operatingCashAccountId: input.accounts[0].id, reserveAccountIds: [input.accounts[0].id], reserveRefillAccountId: input.accounts[0].id, personalTfsaAccountId: tfsa.id, personalRrspAccountId: input.accounts[1].id, workplaceRrspAccountId: null, taxableAccountId: taxable.id, taxableAccountOrigin: taxable.origin, reserveBuildingPhases: [], operatingCashTarget: { targetToday: 20000, indexingRate: 0 }, unplannedCash: "retain_in_operating_cash", personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"], workplaceRoomPriority: "first", workplaceOverflow: "unallocated", reserveAfterTarget: "personal_investing" };
  const before = structuredClone(input);
  const definition = { ...scenario(), personalContributions: [{ target: { mode: "personal_investing" as const }, phaseId: "current-saving", monthlyAmountToday: 800 }] };
  const [result] = calculateComparison(input, [definition]);
  expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
  expect(result.annual[0].actualPersonal).toBeCloseTo(700, 2);
  expect(result.annual[0].plannedPersonal).toBeCloseTo(800, 2);
  expect(result.activeInputs?.personalContributions[0]).toMatchObject({ phaseId: "current-saving", monthlyAmountToday: 800, baselineMonthlyAmountToday: 1000 });
  expect(input).toEqual(before);
});

it("produces distinct funded saving from distinct working-life budgets", () => {
  const input = cashCase(2400);
  const before = structuredClone(input);
  const definitions: ComparisonScenarioConfig[] = [14400, 19200].map((annualAmountToday, index) => ({
    ...scenario(), id: `synthetic-budget-${index}`,
    spending: [{ phaseId: "working", adjustment: { mode: "annual_lifestyle_budget", annualAmountToday } }],
  }));
  const results = calculateComparison(input, definitions);
  expect(results[0].annual[0].actualPersonal).toBeCloseTo(1000, 2);
  expect(results[1].annual[0].actualPersonal).toBeCloseTo(800, 2);
  expect(input).toEqual(before);
  expect(definitions[0].spending[0].adjustment).toEqual({ mode: "annual_lifestyle_budget", annualAmountToday: 14400 });
});

it("validates named simple selections and rejects duplicated or unsupported selectors", async () => {
  const config = await loadPlannerConfig("config/planner.example.yaml");
  const definition: ComparisonScenarioConfig = {
    ...scenario(), spending: [{ phaseId: "current-lifestyle", adjustment: { mode: "multipliers", essentialMultiplier: 1, discretionaryMultiplier: 0.8 } }],
    personalContributions: [{ target: { mode: "personal_investing" }, phaseId: "current-personal-saving", monthlyAmountToday: 750 }],
  };
  expect(validatePlannerConfig({ ...config, scenarioComparison: [definition] }).scenarioComparison).toEqual([definition]);
  expect(() => validatePlannerConfig({ ...config, scenarioComparison: [{ ...definition, personalContributions: [...definition.personalContributions, ...definition.personalContributions] }] })).toThrow(/duplicate/);
  expect(() => validatePlannerConfig({ ...config, scenarioComparison: [{ ...definition, arbitraryPath: "not-supported" }] })).toThrow(/unsupported/);
  expect(() => validatePlannerConfig({ ...config, scenarioComparison: [{ ...definition, spending: [{ ...definition.spending[0], phaseId: "retirement-lifestyle" }] }] })).toThrow(/end by retirement/);
});

it("retains canonical fixed-plan results and source provenance", () => {
  const input = inputs();
  const before = structuredClone(input);
  const canonical = calculateProjection(structuredClone(input));
  const [comparison] = calculateComparison(input, [{ ...scenario(), contributionPolicy: "configured_fixed_plan" }]);
  expect(comparison.summary).toEqual(canonical.summary);
  expect(comparison.trajectory).toEqual(canonical.annual.map((row) => ({ age: row.age, financialAssetsToday: row.real.balances.financialAssets })));
  expect(input).toEqual(before);
});

it("reuses annual tax, statutory RRIF and deterministic paths without a second solver", () => {
  const input = inputs();
  input.startDate = "2026-07-01";
  input.endAge = 72;
  input.spendingPhases[1].endAge = 72;
  input.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 100000;
  input.tax = {
    mode: "canadian_annual", source: "explicit_configuration", effectiveTaxRate: 0.2,
    oasRecoveryThresholdToday: 90000, oasRecoveryRate: 0.15,
    province: "ON", referenceYear: 2026, futureIndexingRate: 0.02,
    openingTaxYearBeforeProjectionMonth: {
      calendarYear: 2026, throughMonth: 6, source: "explicit_configuration",
      income: { employment: 0, cpp: 0, oas: 0, pension: 0, rrspWithdrawals: 0, rrifWithdrawals: 0, interest: 0, eligibleCanadianDividends: 0, foreignIncome: 0, capitalGains: 0, capitalLosses: 0, otherTaxableIncome: 0 },
    }, limitations: [],
  };
  input.rrifMinimumWithdrawals = { mode: "statutory", source: "explicit_configuration", ageBasis: "owner_age", settlementTiming: "december_true_up", supportedRrifClass: "all_other_rrifs" };
  input.nonRegisteredTaxation = { mode: "simplified_canadian", source: "explicit_configuration", accounts: [], limitations: [] };
  const withPaths = Object.assign(input, { returnScenario: { label: "Synthetic deterministic path", source: "explicit_configuration", inflationPath: { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2027, annualInflation: 0.04 }] } } });
  const [result] = calculateComparison(withPaths, [scenario()]);
  expect(result.status, result.warnings.join(" ")).not.toBe("unavailable");
  expect(result.summary).not.toBeNull();
});

describe.each(["configured_fixed_plan", "cash_constrained"] as const)("%s surplus accounting", (contributionPolicy) => {
  it.each(["allocate_to_account", "allocate_through_contribution_waterfall", "retain_as_cash"] as const)("reconciles %s once and preserves canonical results", (mode) => {
    const input = cashCase(3400, 19500);
    const destination = { ...structuredClone(input.accounts[1]), id: "synthetic-surplus", type: "non_registered" as const, openingBalance: 0, contributionPhases: [] };
    input.accounts.push(destination);
    input.surplusAllocation.excess = mode === "allocate_to_account"
      ? { mode, destinationAccountId: destination.id }
      : { mode };
    input.contributionWaterfall.mode = "canonical";
    input.contributionWaterfall.surplusDestinationAccountIds = [destination.id];
    const before = structuredClone(input);
    const canonical = calculateProjection(structuredClone(input));
    const [result] = calculateComparison(input, [{ ...scenario(), contributionPolicy }]);
    expect(result.status, result.warnings.join(" ")).toBe("calculated");
    const allocation = result.annual[0];
    const deposits = mode === "retain_as_cash" ? 1000 : 1700;
    expect(allocation.plannedPersonal).toBeCloseTo(1000, 2);
    expect(allocation.personalDeposits).toBeCloseTo(deposits, 2);
    expect(allocation.actualPersonal).toBeCloseTo(deposits, 2);
    expect(allocation.withdrawalFundedPersonal).toBe(0);
    expect(allocation.retained).toBeCloseTo(mode === "retain_as_cash" ? 1200 : 500, 2);
    expect(allocation.takeHome).toBeCloseTo(allocation.lifestyle + allocation.personalDeposits + allocation.retained, 2);
    expect(allocation.reconciliationDifference).toBeCloseTo(0, 2);
    expect(result.summary).toEqual(canonical.summary);
    expect(result.trajectory).toEqual(canonical.annual.map((row) => ({ age: row.age, financialAssetsToday: row.real.balances.financialAssets })));
    expect(input).toEqual(before);
  });
});
