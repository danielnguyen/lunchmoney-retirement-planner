import { describe, expect, it } from "vitest";
import {
  calculateProjection,
  cppClaimFactor,
  oasClaimFactor,
} from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { projectionFixture } from "./fixtures/projection";

function oneYearFixture(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-01-15";
  input.person.currentAge = 40;
  input.person.retirementAge = 41;
  input.endAge = 41;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.person.employmentIncomePhases = [
    {
      id: "working-year",
      label: "Working year",
      startAge: 40,
      endAge: 41,
      annualNetCashToday: 0,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.startAge = 65;
  input.person.oas.startAge = 65;
  input.events = [];
  input.accounts = input.accounts.map((account) => ({
    ...account,
    annualReturn: 0,
    contributionPhases: [],
  }));
  input.accounts[0]!.openingBalance = 100000;
  input.accounts[1]!.openingBalance = 0;
  return input;
}

function bridgeEnding(result: ReturnType<typeof calculateProjection>, mode: "real" | "nominal") {
  const bridge = result.financialAssetsBridge[mode];
  return (
    bridge.startingFinancialAssets +
    bridge.employmentNetCash +
    bridge.publicBenefitsAndPension +
    bridge.otherInflows +
    bridge.incomeWithheldContributions +
    bridge.investmentReturns -
    bridge.essentialSpending -
    bridge.discretionarySpending -
    bridge.oneTimeOutflows -
    bridge.taxes
  );
}

function indexedFactor(annualRate: number, month: number): number {
  return Math.pow(1 + annualRate, month / 12);
}

function surplusFixture(months = 1): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  const retirementAge = 40 + 1 / 12;
  input.startDate = "2026-01-15";
  input.person.currentAge = 40;
  input.person.retirementAge = retirementAge;
  input.endAge = 40 + months / 12;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.tax.effectiveTaxRate = 0;
  input.tax.oasRecoveryRate = 0;
  input.person.employmentIncomePhases = [
    {
      id: "one-month-income",
      label: "One month income",
      startAge: 40,
      endAge: retirementAge,
      annualNetCashToday: 12000,
      annualGrowth: 0,
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.startAge = 65;
  input.person.oas.startAge = 65;
  input.accounts = [
    {
      id: "manual:first-cash",
      label: "First cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "manual:reserve",
      label: "Explicit reserve",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 2,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "projection:future-taxable",
      label: "Future taxable",
      origin: "projection_configuration",
      type: "non_registered",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    },
  ];
  input.surplusAllocation = {
    reserveAccountIds: ["manual:reserve"],
    reserveRefillAccountId: "manual:reserve",
    targetCashReserveToday: 500,
    reserveIndexingRate: 0,
    excess: {
      mode: "allocate_to_account",
      destinationAccountId: "projection:future-taxable",
    },
  };
  input.events = [];
  return input;
}

function simpleSavingsFixture(months = 1): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  const endAge = 40 + months / 12;
  input.startDate = "2026-01-15";
  input.person.currentAge = 40;
  input.person.retirementAge = endAge;
  input.endAge = endAge;
  input.annualInflation = 0;
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.tax.effectiveTaxRate = 0;
  input.tax.oasRecoveryRate = 0;
  input.person.employmentIncomePhases = [
    {
      id: "working",
      label: "Working",
      startAge: 40,
      endAge,
      annualNetCashToday: 60000,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    },
  ];
  input.person.annualPensionToday = 0;
  input.person.cpp.startAge = 65;
  input.person.oas.startAge = 65;
  input.accounts = [
    {
      id: "manual:operating",
      label: "Operating cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "manual:reserve-refill",
      label: "Reserve refill",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 2,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "plaid:personal-tfsa",
      label: "Personal TFSA",
      origin: "lunchmoney",
      type: "tfsa",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [
        {
          id: "personal-plan",
          label: "Personal plan",
          startAge: 40,
          endAge,
          monthlyAmountToday: 1000,
          funding: "cash",
          indexingRate: 0,
        },
      ],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    },
    {
      id: "plaid:personal-rrsp",
      label: "Personal RRSP",
      origin: "lunchmoney",
      type: "rrsp_rrif",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 4,
      allocation: { cash: 0, fixedIncome: 0.3, equity: 0.7 },
    },
    {
      id: "plaid:workplace-rrsp",
      label: "Workplace RRSP",
      origin: "lunchmoney",
      type: "rrsp_rrif",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [
        {
          id: "workplace-plan",
          label: "Workplace plan",
          startAge: 40,
          endAge,
          monthlyAmountToday: 1800,
          funding: "income_withheld",
          indexingRate: 0,
        },
      ],
      withdrawalPriority: 5,
      allocation: { cash: 0, fixedIncome: 0.3, equity: 0.7 },
    },
    {
      id: "projection:future-taxable",
      label: "Future taxable",
      origin: "projection_configuration",
      type: "non_registered",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 6,
      allocation: { cash: 0.05, fixedIncome: 0.25, equity: 0.7 },
    },
  ];
  input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 500;
  input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
    2000;
  input.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth = {
    calendarYear: 2026,
    eligibleEarnedIncome: 0,
    pensionAdjustment: 0,
    otherRoomReduction: 0,
  };
  input.contributionWaterfall = {
    mode: "simple_policy",
    routes: [
      {
        sourceAccountId: "plaid:workplace-rrsp",
        destinationAccountIds: ["plaid:workplace-rrsp"],
      },
      {
        sourceAccountId: "plaid:personal-tfsa",
        destinationAccountIds: [
          "plaid:personal-tfsa",
          "plaid:personal-rrsp",
          "projection:future-taxable",
        ],
      },
    ],
    surplusDestinationAccountIds: [
      "plaid:personal-tfsa",
      "plaid:personal-rrsp",
      "projection:future-taxable",
    ],
  };
  input.surplusAllocation = {
    reserveAccountIds: ["manual:operating", "manual:reserve-refill"],
    reserveRefillAccountId: "manual:reserve-refill",
    targetCashReserveToday: 400,
    reserveIndexingRate: 0,
    excess: { mode: "allocate_through_contribution_waterfall" },
  };
  input.savingsPolicy = {
    mode: "simple",
    operatingCashAccountId: "manual:operating",
    reserveAccountIds: ["manual:operating", "manual:reserve-refill"],
    reserveRefillAccountId: "manual:reserve-refill",
    personalTfsaAccountId: "plaid:personal-tfsa",
    personalRrspAccountId: "plaid:personal-rrsp",
    workplaceRrspAccountId: "plaid:workplace-rrsp",
    taxableAccountId: "projection:future-taxable",
    taxableAccountOrigin: "projection_configuration",
    reserveBuildingPhases: [
      {
        id: "reserve-plan",
        label: "Reserve plan",
        startAge: 40,
        endAge,
        monthlyAmountToday: 1500,
        indexingRate: 0,
      },
    ],
    operatingCashTarget: null,
    unplannedCash: "retain_in_operating_cash",
    personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
    workplaceRoomPriority: "first",
    workplaceOverflow: "unallocated",
    reserveAfterTarget: "personal_investing",
  };
  input.events = [];
  return input;
}

function sweepSavingsFixture(months = 1): ProjectionInputs {
  const input = simpleSavingsFixture(months);
  if (input.savingsPolicy.mode !== "simple") throw new Error("fixture");
  input.savingsPolicy.operatingCashTarget = {
    targetToday: 100,
    indexingRate: 0,
  };
  input.savingsPolicy.unplannedCash = "sweep_above_targets";
  input.accounts
    .flatMap((account) => account.contributionPhases)
    .forEach((phase) => {
      phase.monthlyAmountToday = 0;
    });
  input.savingsPolicy.reserveBuildingPhases.forEach((phase) => {
    phase.monthlyAmountToday = 0;
  });
  return input;
}

describe("public benefit timing", () => {
  it("applies current CPP early and delayed-claim factors", () => {
    expect(cppClaimFactor(60)).toBeCloseTo(0.64);
    expect(cppClaimFactor(65)).toBe(1);
    expect(cppClaimFactor(70)).toBeCloseTo(1.42);
  });

  it("applies the OAS deferral factor", () => {
    expect(oasClaimFactor(65)).toBe(1);
    expect(oasClaimFactor(70)).toBeCloseTo(1.36);
  });

  it("accepts month-aligned fractional claim ages", () => {
    const input = oneYearFixture();
    input.person.cpp.startAge = 65 + 1 / 12;
    input.person.oas.startAge = 65.5;

    const result = calculateProjection(input);

    expect(result.governmentBenefits.cpp.claimFactor).toBeCloseTo(1.007, 10);
    expect(result.governmentBenefits.oas.claimFactor).toBeCloseTo(1.036, 10);
  });

  it("rejects missing, non-finite, and non-month-aligned claim ages", () => {
    for (const [benefit, value] of [
      ["cpp", undefined],
      ["cpp", Number.NaN],
      ["oas", undefined],
      ["oas", Number.POSITIVE_INFINITY],
    ] as const) {
      const input = oneYearFixture();
      (input.person[benefit] as unknown as Record<string, unknown>).startAge =
        value;
      expect(() => calculateProjection(input)).toThrow(
        `${benefit.toUpperCase()} start age must be a finite age`,
      );
    }

    const cppInvalid = oneYearFixture();
    cppInvalid.person.cpp.startAge = 65.1;
    expect(() => calculateProjection(cppInvalid)).toThrow(
      "CPP start age must align to a projection month",
    );

    const oasInvalid = oneYearFixture();
    oasInvalid.person.oas.startAge = 65.1;
    expect(() => calculateProjection(oasInvalid)).toThrow(
      "OAS start age must align to a projection month",
    );
  });

  it("resolves full, partial, and explicitly absent OAS consistently", () => {
    const full = oneYearFixture();
    full.person.oas.fullMonthlyAmountAt65Today = 751.97;
    full.person.oas.startAge = 70;
    full.person.oas.eligibility = {
      mode: "full",
      qualifyingResidenceYearsAfter18: null,
      fraction: 1,
    };
    const partial = structuredClone(full);
    partial.person.oas.eligibility = {
      mode: "partial",
      qualifyingResidenceYearsAfter18: 20,
      fraction: 0.5,
    };
    const none = structuredClone(full);
    none.person.oas.eligibility = {
      mode: "none",
      qualifyingResidenceYearsAfter18: null,
      fraction: 0,
    };

    expect(
      calculateProjection(full).governmentBenefits.oas
        .monthlyAmountAtClaimToday,
    ).toBeCloseTo(751.97 * 1.36, 8);
    expect(
      calculateProjection(partial).governmentBenefits.oas
        .monthlyAmountAtClaimToday,
    ).toBeCloseTo(751.97 * 0.5 * 1.36, 8);
    expect(
      calculateProjection(none).governmentBenefits.oas
        .monthlyAmountAtClaimToday,
    ).toBe(0);
  });

  it("applies the permanent OAS increase after a mid-period age-75 boundary", () => {
    const input = oneYearFixture();
    input.startDate = "2026-01-15";
    input.person.currentAge = 74.5;
    input.person.retirementAge = 75.5;
    input.endAge = 75.5;
    input.person.employmentIncomePhases = [{
      id: "final-working-year",
      label: "Final working year",
      startAge: 74.5,
      endAge: 75.5,
      annualNetCashToday: 0,
      annualGrowth: 0,
    }];
    input.person.cpp.monthlyAmountAt65Today = 0;
    input.person.oas = {
      startAge: 65,
      fullMonthlyAmountAt65Today: 751.97,
      eligibility: {
        mode: "full",
        qualifyingResidenceYearsAfter18: null,
        fraction: 1,
      },
      indexingRate: 0,
      age75IncreaseRate: 0.1,
    };
    input.tax.effectiveTaxRate = 0;
    input.tax.oasRecoveryRate = 0;

    const result = calculateProjection(input);
    const firstSixMonths = structuredClone(input);
    firstSixMonths.person.retirementAge = 75;
    firstSixMonths.endAge = 75;
    firstSixMonths.person.employmentIncomePhases[0]!.endAge = 75;
    const firstSixResult = calculateProjection(firstSixMonths);
    const base = 751.97;
    const expectedFirstSixMonths = 6 * base;
    const expectedFinalSixMonths = 6 * base * 1.1;
    const expectedAnnual = expectedFirstSixMonths + expectedFinalSixMonths;

    expect(firstSixResult.annual[0]!.nominal.income.oas).toBeCloseTo(
      expectedFirstSixMonths,
      2,
    );
    expect(firstSixResult.retirementSnapshot.nominal.income.oas).toBeCloseTo(
      base,
      2,
    );
    expect(
      result.annual[0]!.nominal.income.oas -
        firstSixResult.annual[0]!.nominal.income.oas,
    ).toBeCloseTo(expectedFinalSixMonths, 2);
    expect(result.annual[0]!.nominal.income.oas).toBeCloseTo(
      expectedAnnual,
      2,
    );
    expect(result.retirementSnapshot.nominal.income.oas).toBeCloseTo(
      base * 1.1,
      2,
    );
    expect(
      result.governmentBenefits.oas
        .monthlyAmountAfterAge75IncreaseToday,
    ).toBeCloseTo(827.17, 2);
    expect(
      result.financialAssetsBridge.nominal.publicBenefitsAndPension,
    ).toBeCloseTo(expectedAnnual, 2);
    expect(
      result.financialAssetsBridge.real.publicBenefitsAndPension,
    ).toBeCloseTo(expectedAnnual, 2);
    expect(
      Math.abs(
        bridgeEnding(result, "nominal") -
          result.financialAssetsBridge.nominal.endingFinancialAssets,
      ),
    ).toBeLessThanOrEqual(0.01);
    expect(
      Math.abs(
        bridgeEnding(result, "real") -
          result.financialAssetsBridge.real.endingFinancialAssets,
      ),
    ).toBeLessThanOrEqual(0.01);

  });

  it("rejects internally inconsistent OAS eligibility", () => {
    const input = oneYearFixture();
    input.person.oas.eligibility = {
      mode: "partial",
      qualifyingResidenceYearsAfter18: 20,
      fraction: 0.75,
    };
    expect(() => calculateProjection(input)).toThrow(
      "years / 40",
    );
  });

  it("begins CPP and OAS exactly in the month that reaches each claim boundary", () => {
    const input = oneYearFixture();
    input.person.currentAge = 64;
    input.person.retirementAge = 65;
    input.endAge = 66;
    input.person.employmentIncomePhases = [{
      id: "final-working-year",
      label: "Final working year",
      startAge: 64,
      endAge: 65,
      annualNetCashToday: 0,
      annualGrowth: 0,
    }];
    input.person.cpp = {
      startAge: 65,
      monthlyAmountAt65Today: 100,
      indexingRate: 0,
    };
    input.person.oas = {
      startAge: 65,
      fullMonthlyAmountAt65Today: 100,
      eligibility: {
        mode: "full",
        qualifyingResidenceYearsAfter18: null,
        fraction: 1,
      },
      indexingRate: 0,
      age75IncreaseRate: 0.1,
    };
    input.tax.effectiveTaxRate = 0;
    input.tax.oasRecoveryRate = 0;

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.income.cpp).toBe(100);
    expect(result.annual[0]!.nominal.income.oas).toBe(100);
    expect(result.annual[1]!.nominal.income.cpp).toBe(1200);
    expect(result.annual[1]!.nominal.income.oas).toBe(1200);
  });
});

describe("resolved employment-income phases", () => {
  it("uses two phases month by month and stops income at each configured boundary", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 42;
    input.endAge = 42;
    input.person.employmentIncomePhases = [
      {
        id: "high-income",
        label: "High income",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0,
      },
      {
        id: "lower-income",
        label: "Lower income",
        startAge: 41,
        endAge: 42,
        annualNetCashToday: 6000,
        annualGrowth: 0,
      },
    ];

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.income.employment).toBe(12000);
    expect(result.annual[1]!.nominal.income.employment).toBe(6000);
    expect(result.annual[0]!.employmentPhaseLabels).toEqual(["High income"]);
    expect(result.annual[1]!.employmentPhaseLabels).toEqual(["Lower income"]);
  });

  it("keeps future employment income constant in today dollars when growth equals inflation", () => {
    const input = oneYearFixture();
    input.startDate = "2026-07-15";
    input.person.retirementAge = 43;
    input.endAge = 43;
    input.annualInflation = 0.02;
    input.tax.effectiveTaxRate = 0;
    input.tax.oasRecoveryRate = 0;
    input.person.employmentIncomePhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 0,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
      {
        id: "future",
        label: "Future",
        startAge: 41,
        endAge: 43,
        annualNetCashToday: 24000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 0,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
    ];

    const result = calculateProjection(input);
    const partialTransitionYear = result.annual.find(
      (point) => point.calendarYear === 2027,
    )!;
    const completeFutureYear = result.annual.find(
      (point) => point.calendarYear === 2028,
    )!;
    const oldPhaseStartReal = Array.from(
      { length: 12 },
      (_, index) => {
        const projectionMonth = 19 + index;
        const phaseElapsedMonth = projectionMonth - 12;
        return (
          (24000 / 12) *
          indexedFactor(0.02, phaseElapsedMonth) /
          indexedFactor(0.02, projectionMonth)
        );
      },
    ).reduce((total, amount) => total + amount, 0);

    expect(partialTransitionYear.employmentPhaseLabels).toEqual([
      "Current",
      "Future",
    ]);
    expect(partialTransitionYear.real.income.employment).toBe(18000);
    expect(completeFutureYear.employmentPhaseLabels).toEqual(["Future"]);
    expect(completeFutureYear.real.income.employment).toBe(24000);
    expect(oldPhaseStartReal).not.toBeCloseTo(
      completeFutureYear.real.income.employment,
      2,
    );
    expect(result.retirementSnapshot.calendarDate).toBe("2029-06-30");
    expect(result.retirementSnapshot.real.income.employment).toBe(2000);
    expect(result.financialAssetsBridge.real.employmentNetCash).toBeCloseTo(
      60000,
      2,
    );
    expect(
      Math.abs(
        bridgeEnding(result, "nominal") -
          result.financialAssetsBridge.nominal.endingFinancialAssets,
      ),
    ).toBeLessThanOrEqual(0.01);
    expect(
      Math.abs(
        bridgeEnding(result, "real") -
          result.financialAssetsBridge.real.endingFinancialAssets,
      ),
    ).toBeLessThanOrEqual(0.01);
  });

  it("deflates a zero-growth future phase only from the projection start", () => {
    const input = oneYearFixture();
    input.startDate = "2026-07-15";
    input.person.retirementAge = 43;
    input.endAge = 43;
    input.annualInflation = 0.02;
    input.person.employmentIncomePhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0,
      },
      {
        id: "future-flat",
        label: "Future flat",
        startAge: 41,
        endAge: 43,
        annualNetCashToday: 24000,
        annualGrowth: 0,
      },
    ];

    const result = calculateProjection(input);
    const completeFutureYear = result.annual.find(
      (point) => point.calendarYear === 2028,
    )!;
    const expectedReal = Array.from(
      { length: 12 },
      (_, index) =>
        2000 / indexedFactor(input.annualInflation, 19 + index),
    ).reduce((total, amount) => total + amount, 0);

    expect(completeFutureYear.nominal.income.employment).toBe(24000);
    expect(completeFutureYear.real.income.employment).toBeCloseTo(
      expectedReal,
      2,
    );
  });

  it("preserves adjacent fractional-age phases across partial calendar years", () => {
    const input = oneYearFixture();
    input.startDate = "2026-07-15";
    input.person.currentAge = 40.25;
    input.person.retirementAge = 41.25;
    input.endAge = 41.25;
    input.person.employmentIncomePhases = [
      {
        id: "first-half",
        label: "First half",
        startAge: 40.25,
        endAge: 40.75,
        annualNetCashToday: 12000,
        annualGrowth: 0,
      },
      {
        id: "second-half",
        label: "Second half",
        startAge: 40.75,
        endAge: 41.25,
        annualNetCashToday: 24000,
        annualGrowth: 0,
      },
    ];

    const result = calculateProjection(input);

    expect(result.annual).toHaveLength(2);
    expect(result.annual[0]!.employmentPhaseLabels).toEqual(["First half"]);
    expect(result.annual[0]!.nominal.income.employment).toBe(6000);
    expect(result.annual[1]!.employmentPhaseLabels).toEqual(["Second half"]);
    expect(result.annual[1]!.nominal.income.employment).toBe(12000);
    expect(result.retirementSnapshot.calendarDate).toBe("2027-06-30");
    expect(result.retirementSnapshot.age).toBe(41.25);
    expect(result.retirementSnapshot.nominal.income.employment).toBe(2000);
  });

  it("a lower future-income phase materially reduces assets at retirement", () => {
    const uninterrupted = structuredClone(projectionFixture);
    const phased = structuredClone(projectionFixture);
    phased.person.employmentIncomePhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 42,
        annualNetCashToday: 84000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 100000,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
      {
        id: "future",
        label: "Future",
        startAge: 42,
        endAge: 65,
        annualNetCashToday: 50000,
        annualGrowth: 0,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 70000,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0,
        },
      },
    ];

    expect(
      calculateProjection(phased).summary.financialAssetsAtRetirementToday,
    ).toBeLessThan(
      calculateProjection(uninterrupted).summary.financialAssetsAtRetirementToday,
    );
  });

  it("rejects gaps, overlaps, duplicate ids, and unresolved income strings", () => {
    const gap = oneYearFixture();
    gap.person.retirementAge = 42;
    gap.endAge = 42;
    gap.person.employmentIncomePhases = [
      { id: "one", label: "One", startAge: 40, endAge: 41, annualNetCashToday: 1, annualGrowth: 0 },
      { id: "two", label: "Two", startAge: 41.5, endAge: 42, annualNetCashToday: 1, annualGrowth: 0 },
    ];
    expect(() => calculateProjection(gap)).toThrow("gap");

    const overlap = structuredClone(gap);
    overlap.person.employmentIncomePhases[1]!.startAge = 40.5;
    expect(() => calculateProjection(overlap)).toThrow("overlap");

    const duplicate = structuredClone(gap);
    duplicate.person.employmentIncomePhases[1]!.startAge = 41;
    duplicate.person.employmentIncomePhases[1]!.id = "one";
    expect(() => calculateProjection(duplicate)).toThrow("unique");

    const unresolved = oneYearFixture();
    (
      unresolved.person.employmentIncomePhases[0] as unknown as Record<string, unknown>
    ).annualNetCashToday = "live_baseline";
    expect(() => calculateProjection(unresolved)).toThrow(
      "annualNetCashToday must be resolved before projection",
    );

    const empty = oneYearFixture();
    empty.person.employmentIncomePhases = [];
    expect(() => calculateProjection(empty)).toThrow(
      "At least one resolved employment income phase is required",
    );
  });
});

describe("resolved contribution phases", () => {
  it("ends a workplace contribution and begins a later TFSA contribution at the transition", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 42;
    input.endAge = 42;
    input.person.employmentIncomePhases[0]!.endAge = 42;
    input.accounts[1]!.contributionPhases = [
      {
        id: "workplace",
        label: "Workplace",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 100,
        funding: "income_withheld",
        indexingRate: 0,
      },
    ];
    input.accounts.push({
      id: "manual:later-tfsa",
      label: "Later TFSA",
      origin: "lunchmoney",
      type: "tfsa",
      openingBalance: 0,
      annualReturn: 0,
      contributionPhases: [
        {
          id: "later-tfsa",
          label: "Later TFSA",
          startAge: 41,
          endAge: 42,
          monthlyAmountToday: 200,
          funding: "cash",
          indexingRate: 0,
        },
      ],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    });

    const result = calculateProjection(input);

    expect(result.annual[0]!.nominal.contributions.incomeWithheld).toBe(1200);
    expect(result.annual[0]!.nominal.contributions.cashFunded).toBe(0);
    expect(result.annual[1]!.nominal.contributions.incomeWithheld).toBe(0);
    expect(result.annual[1]!.nominal.contributions.cashFunded).toBe(2400);
    expect(result.annual[0]!.nominal.accountContributions["manual:2"]).toBe(1200);
    expect(
      result.annual[1]!.nominal.accountContributions["manual:later-tfsa"],
    ).toBe(2400);
  });

  it("treats gaps as zero contribution and zero-valued phases as no contribution", () => {
    const input = oneYearFixture();
    input.accounts[1]!.contributionPhases = [
      {
        id: "later",
        label: "Later",
        startAge: 40.5,
        endAge: 41,
        monthlyAmountToday: 100,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    const result = calculateProjection(input);
    expect(result.annual[0]!.nominal.contributions.total).toBe(600);
    expect(result.retirementSnapshot.nominal.contributions.total).toBe(100);

    input.accounts[1]!.contributionPhases[0]!.monthlyAmountToday = 0;
    expect(calculateProjection(input).retirementSnapshot.nominal.contributions.total).toBe(0);
  });

  it("keeps cash-funded transfers distinct from income-withheld external additions", () => {
    const cashFunded = oneYearFixture();
    cashFunded.accounts[1]!.contributionPhases = [
      {
        id: "saving",
        label: "Saving",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 1200,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    const incomeWithheld = structuredClone(cashFunded);
    incomeWithheld.accounts[1]!.contributionPhases[0]!.funding = "income_withheld";

    const cashResult = calculateProjection(cashFunded);
    const withheldResult = calculateProjection(incomeWithheld);

    expect(cashResult.retirementSnapshot.nominal.accountBalances["manual:2"]).toBe(14400);
    expect(cashResult.financialAssetsBridge.nominal.incomeWithheldContributions).toBe(0);
    expect(cashResult.financialAssetsBridge.nominal.endingFinancialAssets).toBe(100000);
    expect(withheldResult.financialAssetsBridge.nominal.incomeWithheldContributions).toBe(14400);
    expect(withheldResult.financialAssetsBridge.nominal.endingFinancialAssets).toBe(114400);
  });

  it("rejects contribution phases on cash and debt accounts", () => {
    const input = oneYearFixture();
    input.accounts[0]!.contributionPhases = [
      {
        id: "invalid",
        label: "Invalid",
        startAge: 40,
        endAge: 41,
        monthlyAmountToday: 10,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    expect(() => calculateProjection(input)).toThrow(
      "Contribution phases may only be configured for investment account",
    );
  });
});

describe("exact retirement snapshot and accumulation bridge", () => {
  it("captures an integer-age retirement after the final working month", () => {
    const result = calculateProjection(oneYearFixture());

    expect(result.schemaVersion).toBe("8.0");
    expect(result.retirementSnapshot.calendarDate).toBe("2026-12-31");
    expect(result.retirementSnapshot.age).toBe(41);
    expect(result.retirementSnapshot.flowPeriod).toEqual({
      kind: "final_working_month",
      calendarMonth: "2026-12",
    });
    expect(result.summary.retirementDate).toBe("2026-12-31");
  });

  it("keeps snapshot flows monthly while balances and the bridge retain retirement totals", () => {
    const input = oneYearFixture();
    input.person.retirementAge = 55;
    input.endAge = 55;
    input.person.employmentIncomePhases = [{
      id: "fifteen-working-years",
      label: "Fifteen working years",
      startAge: 40,
      endAge: 55,
      annualNetCashToday: 12000,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 12000,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    }];
    input.accounts[1]!.contributionPhases = [{
      id: "fifteen-saving-years",
      label: "Fifteen saving years",
      startAge: 40,
      endAge: 55,
      monthlyAmountToday: 100,
      funding: "cash",
      indexingRate: 0,
    }];

    const result = calculateProjection(input);
    const finalAnnualRow = result.annual.at(-1)!;

    expect(result.annual).toHaveLength(15);
    expect(result.annual.map((row) => row.nominal.income.employment))
      .toEqual(Array.from({ length: 15 }, () => 12000));
    expect(result.annual.map((row) => row.nominal.contributions.total))
      .toEqual(Array.from({ length: 15 }, () => 1200));
    expect(result.retirementSnapshot.nominal.income.employment).toBe(1000);
    expect(result.retirementSnapshot.nominal.contributions.total).toBe(100);
    expect(
      result.retirementSnapshot.nominal.accountContributions["manual:2"],
    ).toBe(100);
    expect(result.retirementSnapshot.nominal.balances).toEqual(
      finalAnnualRow.nominal.balances,
    );
    expect(result.retirementSnapshot.nominal.accountBalances).toEqual(
      finalAnnualRow.nominal.accountBalances,
    );
    expect(result.financialAssetsBridge.nominal.employmentNetCash).toBe(180000);
    expect(result.financialAssetsBridge.nominal.endingFinancialAssets).toBe(280000);
    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
  });

  it("captures a mid-calendar-year retirement instead of the following December snapshot", () => {
    const input = oneYearFixture();
    input.startDate = "2026-07-15";
    input.endAge = 42;
    input.accounts[0]!.annualReturn = 0.12;
    const result = calculateProjection(input);

    expect(result.retirementSnapshot.calendarDate).toBe("2027-06-30");
    expect(result.summary.financialAssetsAtRetirementToday).toBe(
      result.retirementSnapshot.real.balances.financialAssets,
    );
    const followingDecember = result.annual.find(
      (point) => point.calendarYear === 2027,
    )!;
    expect(followingDecember.age).toBe(41.5);
    expect(result.summary.financialAssetsAtRetirementToday).not.toBe(
      followingDecember.real.balances.financialAssets,
    );
  });

  it("has no employment income or contribution after retirement", () => {
    const input = oneYearFixture();
    input.endAge = 42;
    const result = calculateProjection(input);
    const retiredRow = result.annual.find((point) => point.age === 42)!;

    expect(retiredRow.nominal.income.employment).toBe(0);
    expect(retiredRow.nominal.contributions.total).toBe(0);
  });

  it("reconciles real and nominal bridges within one cent", () => {
    const result = calculateProjection(projectionFixture);

    expect(
      Math.abs(
        bridgeEnding(result, "nominal") -
          result.financialAssetsBridge.nominal.endingFinancialAssets,
      ),
    ).toBeLessThanOrEqual(0.01);
    expect(
      Math.abs(
        bridgeEnding(result, "real") -
          result.summary.financialAssetsAtRetirementToday,
      ),
    ).toBeLessThanOrEqual(0.01);
  });

  it("includes actual investment returns and future events in the bridge", () => {
    const input = oneYearFixture();
    input.accounts[0]!.annualReturn = 0.12;
    input.events = [
      {
        id: "inflow",
        label: "Inflow",
        calendarYear: 2026,
        month: 3,
        amountToday: 1000,
        direction: "inflow",
      },
      {
        id: "outflow",
        label: "Outflow",
        calendarYear: 2026,
        month: 6,
        amountToday: 500,
        direction: "outflow",
      },
    ];
    const result = calculateProjection(input);

    expect(result.financialAssetsBridge.nominal.investmentReturns).toBeGreaterThan(0);
    expect(result.financialAssetsBridge.nominal.otherInflows).toBe(1000);
    expect(result.financialAssetsBridge.nominal.oneTimeOutflows).toBe(500);
    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
  });
});

describe("simple explicit-savings policy", () => {
  it("contains the operating target within an overlapping combined reserve and sweeps only true excess", () => {
    const input = sweepSavingsFixture();
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.savingsPolicy).toMatchObject({
      operatingCashTarget: 100,
      operatingCashBalance: 100,
      combinedReserveTarget: 400,
      combinedReserveBalance: 400,
      targetFundingRetained: 400,
      unplannedCashRetained: 400,
      unplannedCashSwept: 4600,
      operatingTargetUnfunded: 0,
      reserveTargetUnfunded: 0,
    });
    expect(view.accountBalances).toMatchObject({
      "manual:operating": 100,
      "manual:reserve-refill": 300,
      "plaid:personal-tfsa": 500,
      "plaid:personal-rrsp": 2000,
      "projection:future-taxable": 2100,
    });
    expect(view.accountSweepAllocations).toEqual({
      "plaid:personal-tfsa": 500,
      "plaid:personal-rrsp": 2000,
      "projection:future-taxable": 2100,
    });
    expect(view.balances.financialAssets).toBe(5000);

    const reordered = structuredClone(input);
    reordered.accounts.reverse();
    const reorderedView = calculateProjection(reordered).retirementSnapshot
      .nominal;
    expect(reorderedView.savingsPolicy).toEqual(view.savingsPolicy);
    expect(reorderedView.accountSweepAllocations).toEqual(
      view.accountSweepAllocations,
    );
  });

  it("funds independent operating and reserve targets when operating cash is not a reserve member", () => {
    const input = sweepSavingsFixture();
    if (input.savingsPolicy.mode !== "simple") throw new Error("fixture");
    input.savingsPolicy.reserveAccountIds = ["manual:reserve-refill"];
    input.surplusAllocation.reserveAccountIds = ["manual:reserve-refill"];
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.savingsPolicy).toMatchObject({
      operatingCashBalance: 100,
      combinedReserveBalance: 400,
      targetFundingRetained: 500,
      unplannedCashRetained: 500,
      unplannedCashSwept: 4500,
    });
    expect(view.accountBalances).toMatchObject({
      "manual:operating": 100,
      "manual:reserve-refill": 400,
    });
  });

  it("recomputes overlapping reserve membership after satisfying whichever target is short", () => {
    const reserveShort = sweepSavingsFixture();
    reserveShort.accounts.find(
      (account) => account.id === "manual:operating",
    )!.openingBalance = 100;
    const reserveView = calculateProjection(reserveShort).retirementSnapshot
      .nominal;
    expect(reserveView.savingsPolicy.targetFundingRetained).toBe(300);
    expect(reserveView.accountBalances["manual:reserve-refill"]).toBe(300);

    const operatingShort = sweepSavingsFixture();
    operatingShort.accounts.find(
      (account) => account.id === "manual:reserve-refill",
    )!.openingBalance = 400;
    const operatingView = calculateProjection(operatingShort)
      .retirementSnapshot.nominal;
    expect(operatingView.savingsPolicy.targetFundingRetained).toBe(100);
    expect(operatingView.accountBalances["manual:operating"]).toBe(100);
    expect(operatingView.accountBalances["manual:reserve-refill"]).toBe(400);
  });

  it("reports unfunded targets without fabricating investments after required cash uses", () => {
    const input = sweepSavingsFixture();
    if (input.savingsPolicy.mode !== "simple") throw new Error("fixture");
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 1200;
    input.monthlyEssentialSpendingToday = 50;
    input.savingsPolicy.operatingCashTarget!.targetToday = 1000;
    input.surplusAllocation.targetCashReserveToday = 4000;
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.outflows.essential).toBe(50);
    expect(view.savingsPolicy.positiveCashAvailable).toBe(50);
    expect(view.savingsPolicy.unplannedCashRetained).toBe(50);
    expect(view.savingsPolicy.unplannedCashSwept).toBe(0);
    expect(view.savingsPolicy.operatingTargetUnfunded).toBe(950);
    expect(view.savingsPolicy.reserveTargetUnfunded).toBe(3950);
    expect(view.contributions.total).toBe(0);
    expect(view.accountBalances["manual:operating"]).toBe(50);
  });

  it("uses identical indexed target timing in nominal and today-dollar views", () => {
    const input = sweepSavingsFixture(18);
    if (input.savingsPolicy.mode !== "simple") throw new Error("fixture");
    input.annualInflation = 0.12;
    input.savingsPolicy.operatingCashTarget!.indexingRate = 0.12;
    input.surplusAllocation.reserveIndexingRate = 0.12;
    const result = calculateProjection(input);

    for (const point of result.annual) {
      const factor = Math.pow(
        1 + input.annualInflation,
        point.age - input.person.currentAge,
      );
      expect(
        point.nominal.savingsPolicy.operatingCashTarget / factor,
      ).toBeCloseTo(point.real.savingsPolicy.operatingCashTarget, 2);
      expect(
        point.nominal.savingsPolicy.combinedReserveTarget / factor,
      ).toBeCloseTo(point.real.savingsPolicy.combinedReserveTarget, 2);
    }
  });

  it("reports reserve-building redirection separately from unplanned sweep", () => {
    const input = simpleSavingsFixture();
    if (input.savingsPolicy.mode !== "simple") throw new Error("fixture");
    input.savingsPolicy.operatingCashTarget = {
      targetToday: 100,
      indexingRate: 0,
    };
    input.savingsPolicy.unplannedCash = "sweep_above_targets";
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.savingsPolicy.reserveFunded).toBe(1500);
    expect(view.savingsPolicy.reserveRetainedAsCash).toBe(400);
    expect(view.savingsPolicy.reserveRedirected).toBe(1100);
    expect(view.savingsPolicy.unplannedCashRetained).toBe(0);
    expect(view.savingsPolicy.unplannedCashSwept).toBe(2500);
    expect(view.savingsPolicy.totalInvestmentDeposits).toBe(6400);
    expect(
      Object.values(view.accountSweepAllocations).reduce(
        (total, amount) => total + amount,
        0,
      ),
    ).toBe(2500);
  });

  it("invests only explicit plans and retains every unplanned positive dollar in operating cash", () => {
    const result = calculateProjection(simpleSavingsFixture());
    const view = result.retirementSnapshot.nominal;

    expect(view.savingsPolicy).toEqual({
      positiveCashAvailable: 5000,
      personalPlanned: 1000,
      personalAllowed: 1000,
      personalUnallocated: 0,
      reservePlanned: 1500,
      reserveFunded: 1500,
      reserveRetainedAsCash: 400,
      reserveRedirected: 1100,
      reserveUnfunded: 0,
      workplacePlanned: 1800,
      workplaceAllowed: 1800,
      workplaceUnallocated: 0,
      operatingCashTarget: 0,
      operatingCashBalance: 2500,
      combinedReserveTarget: 400,
      combinedReserveBalance: 2900,
      targetFundingRetained: 400,
      unplannedCashRetained: 2500,
      unplannedCashSwept: 0,
      operatingTargetUnfunded: 0,
      reserveTargetUnfunded: 0,
      totalInvestmentDeposits: 3900,
    });
    expect(view.accountContributions).toEqual({
      "plaid:workplace-rrsp": 1800,
      "plaid:personal-tfsa": 500,
      "plaid:personal-rrsp": 200,
      "projection:future-taxable": 1400,
    });
    expect(view.accountBalances).toMatchObject({
      "manual:operating": 2500,
      "manual:reserve-refill": 400,
      "plaid:workplace-rrsp": 1800,
      "plaid:personal-tfsa": 500,
      "plaid:personal-rrsp": 200,
      "projection:future-taxable": 1400,
    });
    expect(view.outflows.contributions).toBe(2100);
    expect(view.contributions.incomeWithheld).toBe(1800);
    expect(view.balances.financialAssets).toBe(6800);

    const moreIncome = simpleSavingsFixture();
    moreIncome.person.employmentIncomePhases[0]!.annualNetCashToday = 120000;
    const higher = calculateProjection(moreIncome).retirementSnapshot.nominal;
    expect(higher.savingsPolicy.totalInvestmentDeposits).toBe(3900);
    expect(higher.savingsPolicy.unplannedCashRetained).toBe(7500);
    expect(higher.accountBalances["manual:operating"]).toBe(7500);
  });

  it("gives workplace RRSP first global-room claim, leaves overflow unallocated, and never uses it for personal cash", () => {
    const input = simpleSavingsFixture();
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      1000;
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.savingsPolicy.workplacePlanned).toBe(1800);
    expect(view.savingsPolicy.workplaceAllowed).toBe(1000);
    expect(view.savingsPolicy.workplaceUnallocated).toBe(800);
    expect(view.savingsPolicy.personalAllowed).toBe(1000);
    expect(view.accountContributions["plaid:workplace-rrsp"]).toBe(1000);
    expect(view.accountContributions["plaid:personal-rrsp"] ?? 0).toBe(0);
    expect(view.accountContributions["plaid:personal-tfsa"]).toBe(500);
    expect(view.accountContributions["projection:future-taxable"]).toBe(1600);
    expect(view.registeredAccountRoom.rrsp.allowedContributions).toBe(1000);
    expect(view.registeredAccountRoom.rrsp.closingRoom).toBe(0);
  });

  it("retains below-target reserve savings, splits the exact crossing month, and redirects the full plan after target", () => {
    const below = simpleSavingsFixture();
    below.surplusAllocation.targetCashReserveToday = 2000;
    const belowView = calculateProjection(below).retirementSnapshot.nominal;
    expect(belowView.savingsPolicy.reserveRetainedAsCash).toBe(1500);
    expect(belowView.savingsPolicy.reserveRedirected).toBe(0);

    const exact = simpleSavingsFixture();
    exact.surplusAllocation.targetCashReserveToday = 1500;
    const exactView = calculateProjection(exact).retirementSnapshot.nominal;
    expect(exactView.savingsPolicy.reserveRetainedAsCash).toBe(1500);
    expect(exactView.savingsPolicy.reserveRedirected).toBe(0);

    const crossing = calculateProjection(
      simpleSavingsFixture(),
    ).retirementSnapshot.nominal;
    expect(crossing.savingsPolicy.reserveRetainedAsCash).toBe(400);
    expect(crossing.savingsPolicy.reserveRedirected).toBe(1100);

    const after = simpleSavingsFixture();
    after.surplusAllocation.targetCashReserveToday = 0;
    const afterView = calculateProjection(after).retirementSnapshot.nominal;
    expect(afterView.savingsPolicy.reserveRetainedAsCash).toBe(0);
    expect(afterView.savingsPolicy.reserveRedirected).toBe(1500);
  });

  it("counts retained operating cash in the combined reserve on the next month and remains account-order independent", () => {
    const input = simpleSavingsFixture(2);
    const result = calculateProjection(input);
    const annual = result.annual[0]!.nominal;
    expect(annual.savingsPolicy.reserveRetainedAsCash).toBe(400);
    expect(annual.savingsPolicy.reserveRedirected).toBe(2600);
    expect(annual.savingsPolicy.unplannedCashRetained).toBe(5000);

    const reordered = structuredClone(input);
    reordered.accounts.reverse();
    const reorderedResult = calculateProjection(reordered);
    expect(reorderedResult.annual[0]!.nominal.savingsPolicy).toEqual(
      annual.savingsPolicy,
    );
    expect(reorderedResult.retirementSnapshot.nominal.accountBalances).toEqual(
      result.retirementSnapshot.nominal.accountBalances,
    );
  });

  it("exposes unfunded cash plans without creating withdrawals solely to fund them", () => {
    const input = simpleSavingsFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 600;
    const view = calculateProjection(input).retirementSnapshot.nominal;

    expect(view.savingsPolicy.positiveCashAvailable).toBe(50);
    expect(view.savingsPolicy.personalPlanned).toBe(1000);
    expect(view.savingsPolicy.personalAllowed).toBe(50);
    expect(view.savingsPolicy.personalUnallocated).toBe(950);
    expect(view.savingsPolicy.reservePlanned).toBe(1500);
    expect(view.savingsPolicy.reserveFunded).toBe(0);
    expect(view.savingsPolicy.reserveUnfunded).toBe(1500);
    expect(view.withdrawals.total).toBe(0);
    expect(view.accountBalances["manual:operating"]).toBe(0);
    expect(view.accountBalances["manual:reserve-refill"]).toBe(0);
  });

  it("reconciles every simple policy equation and both asset bridges within one cent", () => {
    const result = calculateProjection(simpleSavingsFixture(2));
    for (const view of [
      result.annual[0]!.nominal,
      result.annual[0]!.real,
      result.retirementSnapshot.nominal,
      result.retirementSnapshot.real,
    ]) {
      const savings = view.savingsPolicy;
      expect(savings.reserveFunded).toBeCloseTo(
        savings.reserveRetainedAsCash + savings.reserveRedirected,
        2,
      );
      expect(savings.personalPlanned).toBeCloseTo(
        savings.personalAllowed + savings.personalUnallocated,
        2,
      );
      expect(savings.workplacePlanned).toBeCloseTo(
        savings.workplaceAllowed + savings.workplaceUnallocated,
        2,
      );
      expect(savings.totalInvestmentDeposits).toBeCloseTo(
        savings.personalAllowed +
          savings.workplaceAllowed +
          savings.reserveRedirected,
        2,
      );
      expect(
        Object.values(view.accountContributionDetails).reduce(
          (total, detail) => total + detail.depositedIntoAccount,
          0,
        ),
      ).toBeCloseTo(savings.totalInvestmentDeposits, 2);
    }
    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
    expect(bridgeEnding(result, "real")).toBeCloseTo(
      result.financialAssetsBridge.real.endingFinancialAssets,
      2,
    );
  });
});

describe("explicit surplus allocation policy", () => {
  it("uses the combined reserve-account balance and deposits the shortfall only into the refill account", () => {
    const input = surplusFixture();
    input.accounts.find(
      (account) => account.id === "manual:first-cash",
    )!.openingBalance = 400;
    input.surplusAllocation.reserveAccountIds = [
      "manual:first-cash",
      "manual:reserve",
    ];
    input.surplusAllocation.reserveRefillAccountId = "manual:reserve";

    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;

    expect(view.surplusAllocation).toMatchObject({
      generated: 1000,
      reserveRefill: 100,
      retainedAsCash: 100,
      redirected: 900,
    });
    expect(view.accountBalances["manual:first-cash"]).toBe(400);
    expect(view.accountBalances["manual:reserve"]).toBe(100);
    expect(view.accountBalances["projection:future-taxable"]).toBe(900);
    expect(view.accountSurplusAllocations).toEqual({
      "manual:reserve": 100,
      "projection:future-taxable": 900,
    });
    expect(
      result.surplusAllocation.reserveAccountsBalanceAtRetirement.nominal,
    ).toBe(500);

    const reordered = structuredClone(input);
    reordered.accounts.reverse();
    const reorderedResult = calculateProjection(reordered);
    expect(reorderedResult.retirementSnapshot.nominal.surplusAllocation).toEqual(
      view.surplusAllocation,
    );
    expect(reorderedResult.retirementSnapshot.nominal.accountBalances).toEqual(
      view.accountBalances,
    );
  });

  it("aggregates three reserve accounts without funding any account to the full target", () => {
    const input = surplusFixture();
    input.accounts.find(
      (account) => account.id === "manual:first-cash",
    )!.openingBalance = 100;
    input.accounts.find(
      (account) => account.id === "manual:reserve",
    )!.openingBalance = 150;
    input.accounts.push({
      id: "manual:third-cash",
      label: "Third cash",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 200,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 4,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    });
    input.surplusAllocation.reserveAccountIds = [
      "manual:first-cash",
      "manual:reserve",
      "manual:third-cash",
    ];

    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;

    expect(view.surplusAllocation).toMatchObject({
      generated: 1000,
      reserveRefill: 50,
      retainedAsCash: 50,
      redirected: 950,
    });
    expect(view.accountBalances).toMatchObject({
      "manual:first-cash": 100,
      "manual:reserve": 200,
      "manual:third-cash": 200,
      "projection:future-taxable": 950,
    });
    expect(view.accountSurplusAllocations).toEqual({
      "manual:reserve": 50,
      "projection:future-taxable": 950,
    });
    expect(
      result.surplusAllocation.reserveAccountsBalanceAtRetirement.nominal,
    ).toBe(500);

    const reordered = structuredClone(input);
    reordered.accounts.reverse();
    const reorderedResult = calculateProjection(reordered);
    expect(reorderedResult.retirementSnapshot.nominal.surplusAllocation).toEqual(
      view.surplusAllocation,
    );
    expect(reorderedResult.retirementSnapshot.nominal.accountBalances).toEqual(
      view.accountBalances,
    );
  });

  it("uses every reserve account return in the same month's aggregate shortfall", () => {
    const input = surplusFixture();
    const firstReserve = input.accounts.find(
      (account) => account.id === "manual:first-cash",
    )!;
    const refillReserve = input.accounts.find(
      (account) => account.id === "manual:reserve",
    )!;
    firstReserve.openingBalance = 100;
    firstReserve.annualReturn = Math.pow(1.01, 12) - 1;
    refillReserve.openingBalance = 200;
    refillReserve.annualReturn = Math.pow(1.02, 12) - 1;
    input.surplusAllocation.reserveAccountIds = [
      firstReserve.id,
      refillReserve.id,
    ];

    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;
    const aggregateAfterReturns = 101 + 204;
    const expectedRefill = 500 - aggregateAfterReturns;
    const refillIfOnlyRefillAccountCounted = 500 - 204;

    expect(result.financialAssetsBridge.nominal.investmentReturns).toBeCloseTo(
      5,
      8,
    );
    expect(view.surplusAllocation).toMatchObject({
      generated: 1000,
      retainedAsCash: expectedRefill,
      redirected: 1000 - expectedRefill,
    });
    expect(view.surplusAllocation.reserveRefill).toBeCloseTo(
      expectedRefill,
      8,
    );
    expect(view.surplusAllocation.reserveRefill).not.toBeCloseTo(
      refillIfOnlyRefillAccountCounted,
      8,
    );
    expect(view.accountBalances["manual:first-cash"]).toBeCloseTo(101, 8);
    expect(view.accountBalances["manual:reserve"]).toBeCloseTo(399, 8);
    expect(
      result.surplusAllocation.reserveAccountsBalanceAtRetirement.nominal,
    ).toBeCloseTo(500, 8);

    const noReturns = structuredClone(input);
    for (const accountId of noReturns.surplusAllocation.reserveAccountIds) {
      noReturns.accounts.find((account) => account.id === accountId)!
        .annualReturn = 0;
    }
    expect(
      calculateProjection(noReturns).retirementSnapshot.nominal
        .surplusAllocation.reserveRefill,
    ).toBe(200);

    expect(bridgeEnding(result, "nominal")).toBeCloseTo(
      result.financialAssetsBridge.nominal.endingFinancialAssets,
      2,
    );
    expect(bridgeEnding(result, "real")).toBeCloseTo(
      result.financialAssetsBridge.real.endingFinancialAssets,
      2,
    );
  });

  it("counts a targeted inflow to any reserve member before calculating the refill", () => {
    const input = surplusFixture();
    input.surplusAllocation.reserveAccountIds = [
      "manual:first-cash",
      "manual:reserve",
    ];
    input.events = [
      {
        id: "targeted-reserve-inflow",
        label: "Synthetic reserve inflow",
        calendarYear: 2026,
        month: 1,
        amountToday: 300,
        direction: "inflow",
        targetAccountId: "manual:first-cash",
      },
    ];

    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;

    expect(view.income.other).toBe(300);
    expect(view.surplusAllocation.generated).toBe(1000);
    expect(view.surplusAllocation.reserveRefill).toBe(200);
    expect(view.accountBalances["manual:first-cash"]).toBe(300);
    expect(view.accountBalances["manual:reserve"]).toBe(200);
    expect(view.accountBalances["projection:future-taxable"]).toBe(800);
  });

  it("uses the explicit reserve account even when another cash account is first and is order-independent", () => {
    const input = surplusFixture();
    const result = calculateProjection(input);
    expect(
      result.retirementSnapshot.nominal.accountBalances[
        "manual:first-cash"
      ],
    ).toBe(0);
    expect(
      result.retirementSnapshot.nominal.accountBalances["manual:reserve"],
    ).toBe(500);
    expect(
      result.retirementSnapshot.nominal.accountBalances[
        "projection:future-taxable"
      ],
    ).toBe(500);

    const reordered = structuredClone(input);
    reordered.accounts.reverse();
    const reorderedResult = calculateProjection(reordered);
    expect(reorderedResult.surplusAllocation).toEqual(
      result.surplusAllocation,
    );
    expect(reorderedResult.retirementSnapshot.nominal.accountBalances).toEqual(
      result.retirementSnapshot.nominal.accountBalances,
    );
  });

  it("refills the reserve first, redirects only excess, and redirects all surplus when already above target", () => {
    const below = calculateProjection(surplusFixture());
    expect(below.retirementSnapshot.nominal.surplusAllocation).toEqual({
      generated: 1000,
      reserveRefill: 500,
      retainedAsCash: 500,
      redirected: 500,
      reserveTarget: 500,
    });

    const aboveInput = surplusFixture();
    aboveInput.accounts.find((account) => account.id === "manual:reserve")!
      .openingBalance = 600;
    const above = calculateProjection(aboveInput);
    expect(above.retirementSnapshot.nominal.surplusAllocation).toMatchObject({
      generated: 1000,
      reserveRefill: 0,
      retainedAsCash: 0,
      redirected: 1000,
    });
  });

  it("retains all generated surplus in the reserve for retain-as-cash mode", () => {
    const input = surplusFixture();
    input.accounts.find(
      (account) => account.id === "manual:first-cash",
    )!.openingBalance = 600;
    input.surplusAllocation.reserveAccountIds = [
      "manual:first-cash",
      "manual:reserve",
    ];
    input.surplusAllocation.excess = { mode: "retain_as_cash" };
    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;

    expect(view.surplusAllocation).toMatchObject({
      generated: 1000,
      reserveRefill: 0,
      retainedAsCash: 1000,
      redirected: 0,
    });
    expect(view.accountSurplusAllocations).toEqual({
      "manual:reserve": 1000,
    });
    expect(view.accountBalances["manual:first-cash"]).toBe(600);
    expect(view.accountBalances["manual:reserve"]).toBe(1000);
  });

  it("reconciles generated, retained, redirected, and per-account allocations in monthly and annual output", () => {
    const result = calculateProjection(surplusFixture());
    for (const view of [
      result.retirementSnapshot.nominal,
      result.retirementSnapshot.real,
      result.annual[0]!.nominal,
      result.annual[0]!.real,
    ]) {
      expect(
        view.surplusAllocation.retainedAsCash +
          view.surplusAllocation.redirected,
      ).toBeCloseTo(view.surplusAllocation.generated, 2);
      expect(
        Object.values(view.accountSurplusAllocations).reduce(
          (sum, value) => sum + value,
          0,
        ),
      ).toBeCloseTo(view.surplusAllocation.generated, 2);
      expect(view.surplusAllocation.reserveRefill).toBeLessThanOrEqual(
        view.surplusAllocation.retainedAsCash,
      );
    }
  });

  it("continues applying the policy after retirement", () => {
    const input = surplusFixture(13);
    input.events = [
      {
        id: "retirement-inflow",
        label: "Synthetic retirement inflow",
        calendarYear: 2027,
        month: 1,
        amountToday: 1200,
        direction: "inflow",
      },
    ];
    const result = calculateProjection(input);
    const retirementYear = result.annual.find(
      (point) => point.calendarYear === 2027,
    )!;

    expect(retirementYear.phase).toBe("retirement");
    expect(retirementYear.nominal.surplusAllocation.generated).toBe(1200);
    expect(retirementYear.nominal.surplusAllocation.redirected).toBe(1200);
  });

  it("indexes the reserve target at exact monthly and annual boundaries", () => {
    const monthlyInput = surplusFixture();
    monthlyInput.surplusAllocation.targetCashReserveToday = 12000;
    monthlyInput.surplusAllocation.reserveIndexingRate = 0.12;
    const monthly = calculateProjection(monthlyInput);
    expect(
      monthly.surplusAllocation.reserveTargetAtRetirement.nominal,
    ).toBeCloseTo(12000 * Math.pow(1.12, 1 / 12), 8);

    const annualInput = surplusFixture(12);
    annualInput.person.retirementAge = 41;
    annualInput.person.employmentIncomePhases[0]!.endAge = 41;
    annualInput.surplusAllocation.targetCashReserveToday = 12000;
    annualInput.surplusAllocation.reserveIndexingRate = 0.12;
    const annual = calculateProjection(annualInput);
    expect(annual.annual[0]!.nominal.surplusAllocation.reserveTarget).toBe(
      13440,
    );
  });

  it("isolates each targeted inflow while unrelated employment and untargeted inflows follow the policy", () => {
    const input = surplusFixture();
    input.events = [
      {
        id: "target-one",
        label: "Target one",
        calendarYear: 2026,
        month: 1,
        amountToday: 200,
        direction: "inflow",
        targetAccountId: "projection:future-taxable",
      },
      {
        id: "target-two",
        label: "Target two",
        calendarYear: 2026,
        month: 1,
        amountToday: 300,
        direction: "inflow",
        targetAccountId: "manual:first-cash",
      },
      {
        id: "untargeted",
        label: "Untargeted",
        calendarYear: 2026,
        month: 1,
        amountToday: 400,
        direction: "inflow",
      },
    ];
    const result = calculateProjection(input);
    const view = result.retirementSnapshot.nominal;

    expect(view.income.other).toBe(900);
    expect(view.surplusAllocation.generated).toBe(1400);
    expect(view.accountBalances["manual:first-cash"]).toBe(300);
    expect(view.accountBalances["manual:reserve"]).toBe(500);
    expect(view.accountBalances["projection:future-taxable"]).toBe(1100);
    expect(view.accountSurplusAllocations).toEqual({
      "manual:reserve": 500,
      "projection:future-taxable": 900,
    });
  });

  it("keeps internal routing asset-neutral at allocation and reflects later account-specific returns", () => {
    const retain = surplusFixture(12);
    retain.person.retirementAge = 41;
    retain.person.employmentIncomePhases[0]!.endAge = 41;
    retain.surplusAllocation.targetCashReserveToday = 0;
    retain.surplusAllocation.excess = { mode: "retain_as_cash" };
    for (const account of retain.accounts) account.annualReturn = 0.05;

    const allocate = structuredClone(retain);
    allocate.surplusAllocation.excess = {
      mode: "allocate_to_account",
      destinationAccountId: "projection:future-taxable",
    };
    const retainedResult = calculateProjection(retain);
    const allocatedResult = calculateProjection(allocate);
    expect(
      allocatedResult.retirementSnapshot.nominal.balances.financialAssets,
    ).toBeCloseTo(
      retainedResult.retirementSnapshot.nominal.balances.financialAssets,
      2,
    );
    expect(
      allocatedResult.retirementSnapshot.nominal.accountBalances[
        "projection:future-taxable"
      ],
    ).toBeGreaterThan(0);
    expect(
      retainedResult.retirementSnapshot.nominal.accountBalances[
        "projection:future-taxable"
      ],
    ).toBe(0);

    const higherReturn = structuredClone(allocate);
    higherReturn.accounts.find(
      (account) => account.id === "projection:future-taxable",
    )!.annualReturn = 0.1;
    const higherReturnResult = calculateProjection(higherReturn);
    expect(
      higherReturnResult.retirementSnapshot.nominal.balances.financialAssets,
    ).toBeGreaterThan(
      allocatedResult.retirementSnapshot.nominal.balances.financialAssets,
    );
    for (const result of [
      retainedResult,
      allocatedResult,
      higherReturnResult,
    ]) {
      expect(bridgeEnding(result, "nominal")).toBeCloseTo(
        result.financialAssetsBridge.nominal.endingFinancialAssets,
        2,
      );
      expect(bridgeEnding(result, "real")).toBeCloseTo(
        result.financialAssetsBridge.real.endingFinancialAssets,
        2,
      );
    }
  });

  it("uses exact retirement flow values in the result-level summary", () => {
    const result = calculateProjection(surplusFixture());
    const monthly = result.retirementSnapshot.nominal.surplusAllocation;
    const summary = result.surplusAllocation;

    expect(summary.throughRetirement.nominal).toMatchObject({
      generated: monthly.generated,
      reserveRefill: monthly.reserveRefill,
      retainedAsCash: monthly.retainedAsCash,
      redirected: monthly.redirected,
    });
    expect(
      summary.throughRetirement.nominal.accountAllocations,
    ).toEqual(result.retirementSnapshot.nominal.accountSurplusAllocations);
    expect(summary.reserveAccountsBalanceAtRetirement.nominal).toBe(500);
    expect(summary.destinationAccountBalanceAtRetirement?.nominal).toBe(500);
  });
});

describe("annual presentation compatibility", () => {
  it("retains account balances, benefit streams, milestones, and partial-year rows", () => {
    const result = calculateProjection(projectionFixture);
    expect(result.annual.length).toBeGreaterThan(40);
    expect(result.annual[0]!.nominal.accountBalances["manual:1"]).toBeDefined();
    expect(result.annual.at(-1)!.age).toBe(projectionFixture.endAge);
    expect(result.annual.some((point) => point.nominal.income.cpp > 0)).toBe(true);
    expect(result.annual.some((point) => point.nominal.income.oas > 0)).toBe(true);
    expect(result.annual.flatMap((point) => point.milestones)).toEqual(
      expect.arrayContaining(["Retirement", "CPP begins", "OAS begins", "RRIF conversion age"]),
    );
  });

  it("keeps liabilities out of financial assets and records them in the net-worth bridge", () => {
    const input = structuredClone(projectionFixture);
    input.liabilities.push({
      id: "manual:3",
      label: "Synthetic liability",
      origin: "lunchmoney",
      openingBalance: 10000,
      balanceAsOf: input.startDate,
      role: null,
      treatment: { mode: "payoff_at_projection_start" },
      historicalPaymentHandling: "already_excluded_or_transfer",
      historicalMonthlyAverage: 0,
    });
    const result = calculateProjection(input);

    expect(result.financialAssetsBridge.real.startingFinancialAssets).toBe(200000);
    expect(result.netWorthBridge.real.startingLiabilities).toBe(10000);
    expect(result.inputs.accounts.some((account) => account.id === "manual:3")).toBe(false);
  });
});
