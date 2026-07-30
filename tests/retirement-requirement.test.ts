import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { allocateRetirementCandidate } from "@/src/domain/projection/retirement-requirement";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { projectionFixture } from "./fixtures/projection";

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
    source: "explicit_configuration",
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
    surplusDestinationAccountIds: ["synthetic:cash"],
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

describe("retirement funding requirement", () => {
  it("finds the exact cumulative cash need at the lowest passing cent", () => {
    const result = calculateProjection(retirementFixture());

    expect(result.retirementRequirement.status).toBe("available");
    expect(
      result.retirementRequirement.requiredFinancialAssetsToday,
    ).toBe(1200);
    expect(result.retirementRequirement.solver.acceptedCandidateCents).toBe(
      120_000,
    );
    expect(result.retirementRequirement.solver.acceptedCandidatePassed).toBe(
      true,
    );
    expect(result.retirementRequirement.solver.oneCentBelowFailed).toBe(true);
    expect(result.retirementRequirement.bindingConstraint).toBe(
      "retirement_cash_flow",
    );
  });

  it("adds a configured minimum terminal balance without using the owner goal", () => {
    const input = retirementFixture();
    input.retirementRequirement.minimumEndingFinancialAssetsToday = 250.25;
    const first = calculateProjection(input);
    input.retirementGoalToday = 12_345_678;
    const changedGoal = calculateProjection(input);

    expect(
      first.retirementRequirement.requiredFinancialAssetsToday,
    ).toBe(1450.25);
    expect(first.retirementRequirement.bindingConstraint).toBe(
      "terminal_balance",
    );
    expect(
      changedGoal.retirementRequirement.requiredFinancialAssetsToday,
    ).toBe(first.retirementRequirement.requiredFinancialAssetsToday);
    expect(
      changedGoal.retirementRequirement.ownerGoalDifferenceToday,
    ).not.toBe(first.retirementRequirement.ownerGoalDifferenceToday);
  });

  it("funds one-time retirement outflows through the ordinary event engine", () => {
    const input = retirementFixture();
    input.events = [
      {
        id: "synthetic-retirement-outflow",
        label: "Synthetic retirement outflow",
        calendarYear: 2027,
        month: 6,
        amountToday: 123.45,
        direction: "outflow",
      },
    ];

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1323.45,
    );
  });

  it("returns zero for a self-funding scenario with a valid projected composition", () => {
    const input = retirementFixture();
    input.person.cpp.monthlyAmountAt65Today = 200;

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(0);
    expect(result.retirementRequirement.bindingConstraint).toBe("self_funding");
    expect(result.retirementRequirement.solver.zeroCandidatePassed).toBe(true);
  });

  it("uses account composition so taxable RRSP assets are not interchangeable with TFSA assets", () => {
    const tfsa = retirementFixture();
    tfsa.tax.effectiveTaxRate = 0.2;
    tfsa.accounts.push({
      ...tfsa.accounts[0]!,
      id: "synthetic:tfsa",
      label: "Synthetic TFSA",
      type: "tfsa",
      openingBalance: 10_000,
      withdrawalPriority: 1,
      allocation: { cash: 0, fixedIncome: 0, equity: 1 },
    });
    tfsa.accounts[0]!.openingBalance = 0;
    tfsa.accounts[0]!.withdrawalPriority = 2;
    const rrsp = structuredClone(tfsa);
    rrsp.accounts[1]!.id = "synthetic:rrsp";
    rrsp.accounts[1]!.label = "Synthetic RRSP";
    rrsp.accounts[1]!.type = "rrsp_rrif";

    const tfsaResult = calculateProjection(tfsa);
    const rrspResult = calculateProjection(rrsp);

    expect(tfsaResult.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1200,
    );
    expect(rrspResult.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1500,
    );
  });

  it("preserves account returns when scaling the retirement composition", () => {
    const zeroReturn = retirementFixture();
    zeroReturn.endAge = 70;
    zeroReturn.spendingPhases[0]!.endAge = 70;
    zeroReturn.accounts.push({
      ...zeroReturn.accounts[0]!,
      id: "synthetic:return-tfsa",
      label: "Synthetic return TFSA",
      type: "tfsa",
      openingBalance: 10_000,
      withdrawalPriority: 1,
      allocation: { cash: 0, fixedIncome: 0, equity: 1 },
    });
    zeroReturn.accounts[0]!.openingBalance = 0;
    zeroReturn.accounts[0]!.withdrawalPriority = 2;
    const higherReturn = structuredClone(zeroReturn);
    higherReturn.accounts[1]!.annualReturn = 0.08;

    const zeroReturnResult = calculateProjection(zeroReturn);
    const higherReturnResult = calculateProjection(higherReturn);

    expect(
      higherReturnResult.retirementRequirement.requiredFinancialAssetsToday,
    ).toBeLessThan(
      zeroReturnResult.retirementRequirement.requiredFinancialAssetsToday!,
    );
  });

  it("distributes candidate cents by projected weights with a deterministic residual", () => {
    const allocation = allocateRetirementCandidate(10_001, [
      {
        accountId: "synthetic:a",
        accountType: "cash",
        projectedBalanceToday: 1,
      },
      {
        accountId: "synthetic:b",
        accountType: "tfsa",
        projectedBalanceToday: 1,
      },
      {
        accountId: "synthetic:c",
        accountType: "non_registered",
        projectedBalanceToday: 1,
      },
    ]);

    expect(allocation).not.toBeNull();
    expect(
      [...allocation!.balancesToday.values()].reduce(
        (sum, amount) => sum + amount,
        0,
      ),
    ).toBe(100.01);
    expect(allocation!.balancesToday.get("synthetic:a")).toBe(33.34);
    expect(allocation!.balancesToday.get("synthetic:b")).toBe(33.34);
    expect(allocation!.balancesToday.get("synthetic:c")).toBe(33.33);
  });

  it("returns unavailable instead of inventing a zero-balance composition", () => {
    const input = retirementFixture();
    input.accounts[0]!.openingBalance = 0;

    const result = calculateProjection(input);

    expect(result.retirementRequirement.status).toBe("unavailable");
    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBeNull();
    expect(result.retirementRequirement.bindingConstraint).toBe(
      "unavailable_composition",
    );
  });

  it("excludes residence equity from the requirement", () => {
    const input = retirementFixture();
    const withoutResidence = calculateProjection(input);
    input.nonFinancialAssets = [
      {
        id: "synthetic:home",
        label: "Synthetic residence",
        origin: "lunchmoney",
        type: "primary_residence",
        openingValue: 2_000_000,
        valueAsOf: input.startDate,
        annualAppreciation: 0.2,
        availableForWithdrawals: false,
      },
    ];
    const withResidence = calculateProjection(input);

    expect(
      withResidence.retirementRequirement.requiredFinancialAssetsToday,
    ).toBe(
      withoutResidence.retirementRequirement.requiredFinancialAssetsToday,
    );
  });

  it("uses the shared liability schedule for retirement overlap", () => {
    const input = retirementFixture();
    input.monthlyEssentialSpendingToday = 0;
    input.nonFinancialAssets = [
      {
        id: "synthetic:liability-home",
        label: "Synthetic mortgaged residence",
        origin: "lunchmoney",
        type: "primary_residence",
        openingValue: 500_000,
        valueAsOf: input.startDate,
        annualAppreciation: 0,
        availableForWithdrawals: false,
      },
    ];
    input.liabilities = [
      {
        id: "synthetic:mortgage",
        label: "Synthetic mortgage",
        origin: "lunchmoney",
        openingBalance: 2400,
        balanceAsOf: input.startDate,
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0,
          interestRateConvention: "effective_annual",
          regularPayment: {
            amount: 100,
            frequency: "monthly",
            monthlyEquivalent: 100,
          },
          scheduleStartDate: input.startDate,
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "already_excluded_or_transfer",
        historicalMonthlyAverage: 0,
      },
    ];

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1200,
    );
    expect(result.retirementRequirement.bindingConstraint).toBe(
      "liability_overlap",
    );
  });

  it("uses benefits that begin after retirement through the shared monthly engine", () => {
    const input = retirementFixture();
    input.endAge = 67;
    input.spendingPhases[0]!.endAge = 67;
    input.person.cpp.startAge = 66;
    input.person.cpp.monthlyAmountAt65Today = 100;

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1100,
    );
  });

  it("uses retirement spending-phase changes", () => {
    const input = retirementFixture();
    input.endAge = 67;
    input.spendingPhases = [
      {
        ...input.spendingPhases[0]!,
        id: "synthetic-first-retired-year",
        endAge: 66,
      },
      {
        ...input.spendingPhases[0]!,
        id: "synthetic-second-retired-year",
        startAge: 66,
        endAge: 67,
        essentialMultiplier: 2,
      },
    ];

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(
      3600,
    );
  });

  it("recomputes for active spending and terminal-age scenario inputs", () => {
    const baseline = retirementFixture();
    const baselineResult = calculateProjection(baseline);
    const spendingOverride = structuredClone(baseline);
    spendingOverride.monthlyEssentialSpendingToday = 150;
    const spendingResult = calculateProjection(spendingOverride);
    const endAgeOverride = structuredClone(baseline);
    endAgeOverride.endAge = 67;
    endAgeOverride.spendingPhases[0]!.endAge = 67;
    const endAgeResult = calculateProjection(endAgeOverride);

    expect(baselineResult.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1200,
    );
    expect(spendingResult.retirementRequirement.requiredFinancialAssetsToday).toBe(
      1800,
    );
    expect(endAgeResult.retirementRequirement.requiredFinancialAssetsToday).toBe(
      2400,
    );
  });

  it("honours partial calendar years and the exact retirement boundary", () => {
    const input = retirementFixture();
    input.startDate = "2026-07-01";
    input.person.currentAge = 64.5;
    input.person.retirementAge = 65;
    input.endAge = 65.5;
    input.person.employmentIncomePhases[0]!.startAge = 64.5;
    input.spendingPhases[0]!.startAge = 64.5;
    input.spendingPhases[0]!.endAge = 65.5;

    const result = calculateProjection(input);

    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBe(
      600,
    );
    expect(result.summary.retirementDate).toBe("2026-12-31");
  });

  it("marks the current tax model provisional and responds to its configured rate", () => {
    const input = retirementFixture();
    input.accounts.push({
      ...input.accounts[0]!,
      id: "synthetic:rrsp",
      label: "Synthetic RRSP",
      type: "rrsp_rrif",
      openingBalance: 10_000,
      allocation: { cash: 0, fixedIncome: 0, equity: 1 },
    });
    input.accounts[0]!.openingBalance = 0;
    const zeroTax = calculateProjection(input);
    input.tax.effectiveTaxRate = 0.25;
    const flatTax = calculateProjection(input);

    expect(zeroTax.retirementRequirement.provisionalTax).toBe(true);
    expect(zeroTax.retirementRequirement.taxModel).toBe(
      "flat_retirement_tax_compatibility",
    );
    expect(
      flatTax.retirementRequirement.requiredFinancialAssetsToday,
    ).toBeGreaterThan(
      zeroTax.retirementRequirement.requiredFinancialAssetsToday!,
    );
  });

  it("returns an explicit infeasible result when no safe upper bound passes", () => {
    const input = retirementFixture();
    input.monthlyEssentialSpendingToday = 2_000_000_000_000;
    input.person.employmentIncomePhases[0]!.annualNetCashToday =
      24_000_000_000_000;

    const result = calculateProjection(input);

    expect(result.retirementRequirement.status).toBe("infeasible");
    expect(result.retirementRequirement.bindingConstraint).toBe("infeasible");
    expect(result.retirementRequirement.requiredFinancialAssetsToday).toBeNull();
  });

  it("is deterministic across repeated calculations", () => {
    const input = retirementFixture();
    input.accounts[0]!.annualReturn = 0.037;

    expect(calculateProjection(input).retirementRequirement).toEqual(
      calculateProjection(input).retirementRequirement,
    );
  });
});
