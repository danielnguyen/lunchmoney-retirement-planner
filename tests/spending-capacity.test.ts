import { describe, expect, it } from "vitest";
import { calculateProjection, calculateSpendingCapacity } from "@/src/domain/projection/calculate";
import { scaleRetirementSpending, solveSpendingCapacity } from "@/src/domain/projection/spending-capacity";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { createProjectionSnapshot, projectionSnapshotToCsv } from "@/src/domain/projection/export";
import { projectionFixture, baselineContextFixture } from "./fixtures/projection";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import { POST } from "@/app/api/v1/projections/route";
function retirementFixture(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-01";
  input.person.currentAge = 64;
  input.person.retirementAge = 65;
  input.endAge = 66;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 100;
  input.monthlyDiscretionarySpendingToday = 0;
  input.spendingPhases = [
    {
      id: "synthetic-retirement-spending",
      label: "Synthetic retirement spending",
      startAge: 64,
      endAge: 66,
      essentialMultiplier: 1,
      discretionaryMultiplier: 1,
      source: "explicit_configuration",
    },
  ];
  input.retirementGoalToday = 999_999;
  input.retirementRequirement = {
    minimumEndingFinancialAssetsToday: 0,
    baselineSource: "explicit_configuration",
    activeValueSource: "explicit_configuration",
  };
  input.tax.effectiveTaxRate = 0;
  input.tax.oasRecoveryThresholdToday = 1_000_000;
  input.person.employmentIncomePhases = [
    {
      id: "synthetic-final-working-year",
      label: "Synthetic final working year",
      startAge: 64,
      endAge: 65,
      annualNetCashToday: 0,
      annualGrowth: 0,
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.pensionStartAge = 65;
  input.person.pensionIndexingRate = 0;
  input.person.cpp = {
    startAge: 65,
    monthlyAmountAt65Today: 0,
    indexingRate: 0,
  };
  input.person.oas = {
    startAge: 65,
    fullMonthlyAmountAt65Today: 0,
    eligibility: {
      mode: "none",
      qualifyingResidenceYearsAfter18: null,
      fraction: 0,
    },
    indexingRate: 0,
    age75IncreaseRate: 0.1,
  };
  input.accounts = [
    {
      id: "synthetic:cash",
      label: "Synthetic cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 10_000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
  ];
  input.nonFinancialAssets = [];
  input.liabilities = [];
  delete input.registeredAccountRoom;
  input.contributionWaterfall = {
    mode: "fixed_source_compatibility",
    routes: [],
    surplusDestinationAccountIds: [],
  };
  input.surplusAllocation = {
    reserveAccountIds: ["synthetic:cash"],
    reserveRefillAccountId: "synthetic:cash",
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  input.savingsPolicy = { mode: "advanced" };
  input.events = [];
  return input;
}

function fixture(retirementAge = 65, endAge = 66) {
  const input = retirementFixture();
  input.person.retirementAge = retirementAge;
  input.endAge = endAge;
  input.monthlyDiscretionarySpendingToday = 100;
  input.spendingPhases = [
    { ...input.spendingPhases[0], id: "working", startAge: 64, endAge: retirementAge, essentialMultiplier: 0, discretionaryMultiplier: 0 },
    { ...input.spendingPhases[0], id: "retired", startAge: retirementAge, endAge },
  ];
  input.person.employmentIncomePhases[0].endAge = retirementAge;
  return input;
}
const selection = { phaseIds: ["retired"] };
function parity(input: ProjectionInputs) {
  const result = calculateSpendingCapacity(input, selection);
  expect(result.status, result.reason ?? "").toBe("available");
  const forward = calculateProjection(scaleRetirementSpending(input, selection.phaseIds, result.scale!));
  const terminal = forward.annual.at(-1)!;
  expect(terminal.real.balances.financialAssets).toBeCloseTo(result.terminalFinancialAssetsToday!, 2);
  expect(forward.annual.every((p) => p.nominal.outflows.unmetSpending <= 0.000001 && p.nominal.outflows.unmetRequiredOutflow <= 0.000001)).toBe(true);
  expect(result.nextCentFails).toBe(true);
  return { result, forward };
}

describe("inverse retirement spending capacity", () => {
  it("finds an analytical cent boundary and fails the next cent in the canonical forward engine", () => {
    const input = fixture();
    const before = structuredClone(input);
    const { result } = parity(input);
    expect(result.referenceMonthlyDiscretionaryToday).toBe(733.33);
    expect(result.phases[0].monthlyLifestyleCapacityToday).toBeCloseTo(833.33, 8);
    expect(result.terminalFinancialAssetsToday).toBeCloseTo(0.04, 5);
    const above = calculateProjection(scaleRetirementSpending(input, selection.phaseIds, 733.34 / 100));
    expect(above.annual.at(-1)!.nominal.outflows.unmetSpending).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });
  it.each([[64.5, 66], [66, 67], [65, 68]])("honors retirement %s and terminal age %s", (retire, end) => {
    const { result } = parity(fixture(retire, end));
    const expected = Math.floor((10_000 / ((end - retire) * 12) - 100) * 100) / 100;
    expect(result.referenceMonthlyDiscretionaryToday).toBe(expected);
  });
  it("honors a nonzero terminal floor and its provenance", () => {
    const input = fixture();
    input.retirementRequirement.minimumEndingFinancialAssetsToday = 4_000;
    input.retirementRequirement.activeValueSource = "scenario_override";
    const { result } = parity(input);
    expect(result.referenceMonthlyDiscretionaryToday).toBe(400);
    expect(result.effectiveInputs.terminalFloorSource).toBe("scenario_override");
  });
  it("preserves essentials, unselected phases and relative phase shape", () => {
    const input = fixture(65, 68);
    input.spendingPhases[1].endAge = 66;
    input.spendingPhases.push({ ...input.spendingPhases[1], id: "later", startAge: 66, endAge: 67, discretionaryMultiplier: 0.5 });
    input.spendingPhases.push({ ...input.spendingPhases[1], id: "fixed", startAge: 67, endAge: 68 });
    const result = calculateSpendingCapacity(input, { phaseIds: ["retired", "later"] });
    expect(result.status).toBe("available");
    expect(result.phases[1].monthlyDiscretionaryCapacityToday).toBe(result.phases[0].monthlyDiscretionaryCapacityToday! / 2);
    const scaled = scaleRetirementSpending(input, ["retired", "later"], result.scale!);
    expect(scaled.spendingPhases.map((p) => p.essentialMultiplier)).toEqual([0, 1, 1, 1]);
    expect(scaled.spendingPhases[3]).toEqual(input.spendingPhases[3]);
  });
  it("reports zero bases, unsupported phases and insufficient assets honestly", () => {
    const input = fixture();
    input.monthlyDiscretionarySpendingToday = 0;
    expect(calculateSpendingCapacity(input, selection).status).toBe("unavailable");
    input.monthlyDiscretionarySpendingToday = 100;
    expect(calculateSpendingCapacity(input, { phaseIds: ["missing"] }).status).toBe("unavailable");
    expect(calculateSpendingCapacity(input, { phaseIds: ["working"] }).status).toBe("unavailable");
    input.accounts[0].openingBalance = 100;
    const result = calculateSpendingCapacity(input, selection);
    expect(result.status).toBe("insufficient_assets");
    expect(result.scale).toBeNull();
    expect(result.firstShortfallAge).not.toBeNull();
    expect(() => calculateSpendingCapacity(input, { phaseIds: [] })).toThrow();
  });
  it("reports nonsolvable, unbounded and observed nonmonotonic cases without a capacity", () => {
    const input = fixture();
    const context = calculateSpendingCapacity(input, selection).effectiveInputs;
    const evaluation = { passes: true, terminalFinancialAssetsToday: 0, failure: null, firstShortfallAge: null, depletionAge: null } as const;
    expect(solveSpendingCapacity(input, selection, context, () => evaluation).status).toBe("unavailable");
    expect(solveSpendingCapacity(input, selection, context, () => { throw new Error("Synthetic failure"); }).scale).toBeNull();
    expect(solveSpendingCapacity(input, selection, context, (scale) => ({ ...evaluation, terminalFinancialAssetsToday: scale })).status).toBe("unavailable");
  });
  it("accounts for mortgage payoff and retains shared forward parity", () => {
    const input = fixture(65, 67);
    input.nonFinancialAssets = [{ id: "synthetic-home", label: "Synthetic home", origin: "lunchmoney", type: "primary_residence", openingValue: 100000, valueAsOf: input.startDate, annualAppreciation: 0, availableForWithdrawals: false }];
    input.liabilities = [{
      id: "synthetic-mortgage", label: "Synthetic mortgage", origin: "lunchmoney",
      openingBalance: 1800, balanceAsOf: input.startDate, role: "primary_mortgage",
      treatment: { mode: "amortizing", annualInterestRate: 0, interestRateConvention: "effective_annual",
        regularPayment: { amount: 100, frequency: "monthly", monthlyEquivalent: 100 }, scheduleStartDate: input.startDate, lumpSumPayments: [] },
      historicalPaymentHandling: "already_excluded_or_transfer", historicalMonthlyAverage: 0,
    }];
    const { result, forward } = parity(input);
    expect(result.referenceMonthlyDiscretionaryToday).toBe(241.66);
    expect(forward.liabilityPayoffDates["synthetic-mortgage"]).not.toBeNull();
  });
  it("accounts for CPP/OAS activation and contribution cessation", () => {
    const input = fixture(65, 67);
    const plain = parity(input).result.referenceMonthlyDiscretionaryToday!;
    input.person.cpp.startAge = 66;
    input.person.cpp.monthlyAmountAt65Today = 100;
    input.person.oas.startAge = 66;
    input.person.oas.fullMonthlyAmountAt65Today = 100;
    input.person.oas.eligibility = { mode: "full", qualifyingResidenceYearsAfter18: null, fraction: 1 };
    const benefits = parity(input);
    expect(benefits.result.referenceMonthlyDiscretionaryToday).toBeGreaterThan(plain);
    expect(benefits.forward.annual.at(-1)!.nominal.income.cpp).toBeGreaterThan(0);
    expect(benefits.forward.annual.at(-1)!.nominal.income.oas).toBeGreaterThan(0);
    input.accounts.push({ ...input.accounts[0], id: "synthetic-investment", type: "non_registered", openingBalance: 0, withdrawalPriority: 2 });
    input.accounts[1].contributionPhases = [{ id: "synthetic-contribution", label: "Synthetic contribution", startAge: 64, endAge: 65, monthlyAmountToday: 100, indexingRate: 0, funding: "income_withheld" }];
    const contributed = parity(input);
    expect(contributed.result.effectiveInputs.projectedRetirementAssetsToday).toBe(11200);
    expect(contributed.forward.annual.at(-1)!.nominal.contributions.total).toBe(0);
  });
  it("uses annual Canadian taxes and statutory RRIF rules rather than a gross withdrawal cap", () => {
    const input = fixture(65, 73);
    input.accounts[0].openingBalance = 10000;
    input.accounts.push({ ...input.accounts[0], id: "synthetic-rrsp", type: "rrsp_rrif", openingBalance: 500000, withdrawalPriority: 2 });
    input.person.rrifConversionAge = 71;
    input.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 0;
    input.tax = {
      ...input.tax, source: "explicit_configuration", mode: "canadian_annual", province: "ON", referenceYear: 2026, futureIndexingRate: 0,
      openingTaxYearBeforeProjectionMonth: {
        calendarYear: 2026, throughMonth: 0, source: "january_zero",
        income: { employment: 0, cpp: 0, oas: 0, pension: 0, rrspWithdrawals: 0, rrifWithdrawals: 0, interest: 0, eligibleCanadianDividends: 0, foreignIncome: 0, capitalGains: 0, capitalLosses: 0, otherTaxableIncome: 0 },
      }, limitations: [],
    };
    input.rrifMinimumWithdrawals = { mode: "statutory", source: "explicit_configuration", ageBasis: "owner_age", settlementTiming: "december_true_up", supportedRrifClass: "all_other_rrifs" };
    input.nonRegisteredTaxation = { mode: "simplified_canadian", source: "explicit_configuration", accounts: [], limitations: [] };
    const { result, forward } = parity(input);
    expect(result.effectiveInputs.provisionalTax).toBe(false);
    expect(forward.annual.some((row) => row.nominal.outflows.tax > 0)).toBe(true);
    expect(forward.annual.some((row) => row.rrif.minimumRequired > 0)).toBe(true);
    expect(forward.annual.filter((row) => row.rrif.minimumRequired > 0).every((row) => row.rrif.remainingMinimum <= 0.01)).toBe(true);
    input.retirementRequirement.minimumEndingFinancialAssetsToday = 400000;
    const retained = parity(input);
    expect(retained.forward.annual.some((row) => row.rrif.forcedDecemberWithdrawal > 0)).toBe(true);
    const noTax = structuredClone(input);
    noTax.retirementRequirement.minimumEndingFinancialAssetsToday = 0;
    noTax.tax = { mode: "flat_compatibility", source: "explicit_configuration", effectiveTaxRate: 0, oasRecoveryThresholdToday: 1000000, oasRecoveryRate: 0 };
    noTax.nonRegisteredTaxation = { mode: "not_modelled_compatibility", source: "compatibility_default" };
    expect(calculateSpendingCapacity(noTax, selection).referenceMonthlyDiscretionaryToday).toBeGreaterThan(result.referenceMonthlyDiscretionaryToday!);
  });
  it("honors adverse returns and inflation paths with shared-engine parity", () => {
    const input: ProjectionInputsWithReturnPaths = fixture(65, 67);
    input.accounts.push({ ...input.accounts[0], id: "synthetic-investment", type: "tfsa", openingBalance: 10000, withdrawalPriority: 2 });
    const original = parity(input).result.referenceMonthlyDiscretionaryToday!;
    input.accounts[1].returnPath = { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2027, annualReturn: -0.3 }] };
    input.returnScenario = { label: "Synthetic adverse path", source: "explicit_configuration", inflationPath: { mode: "annual", source: "explicit_configuration", entries: [{ calendarYear: 2027, annualInflation: 0.08 }] } };
    const { result } = parity(input);
    expect(result.referenceMonthlyDiscretionaryToday).toBeLessThan(original);
    expect(result.limitations.join(" ")).toContain("not a probability");
  });
  it("keeps optional API analysis and configured exports separate and privacy safe", async () => {
    const input = fixture();
    const forward = calculateProjection(input);
    const snapshot = () => createProjectionSnapshot(forward, baselineContextFixture, {});
    const before = snapshot();
    const response = await POST(new Request("http://localhost/api/v1/projections", { method: "POST", body: JSON.stringify({ inputs: input, spendingCapacity: selection }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).status).toBe("available");
    const after = snapshot();
    expect(after.projection).toEqual(before.projection);
    expect(JSON.stringify(after)).not.toContain('"phaseId":"retired"');
    expect(JSON.stringify(after)).not.toContain('spendingCapacity');
    expect(projectionSnapshotToCsv(after)).not.toContain('spendingCapacity');
    expect(calculateProjection(input)).toEqual(forward);
  });
});
