import { describe, expect, it } from "vitest";
import {
  rrspAnnualCap,
  tfsaAnnualLimit,
} from "@/src/domain/defaults/canadian-registered-account-room";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  validateProjectionInputs,
  type FinancialAccountInput,
  type ProjectionInputs,
} from "@/src/domain/projection/types";
import { projectionFixture } from "./fixtures/projection";

function investmentAccount(
  id: string,
  type: "tfsa" | "rrsp_rrif" | "non_registered",
  monthlyAmountToday = 0,
  funding: "cash" | "income_withheld" = "cash",
): FinancialAccountInput {
  return {
    id,
    label: `Synthetic ${type} account`,
    origin: "lunchmoney",
    type,
    openingBalance: 0,
    annualReturn: 0,
    withdrawalPriority:
      type === "tfsa" ? 2 : type === "rrsp_rrif" ? 3 : 4,
    allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    contributionPhases:
      monthlyAmountToday > 0
        ? [
            {
              id: `${id}-plan`,
              label: "Synthetic savings plan",
              startAge: 40,
              endAge: 42,
              monthlyAmountToday,
              funding,
              indexingRate: 0,
            },
          ]
        : [],
  };
}

function roomFixture(): ProjectionInputs {
  const input = structuredClone(projectionFixture);
  input.startDate = "2026-07-01";
  input.person.currentAge = 40;
  input.person.retirementAge = 42;
  input.endAge = 42;
  input.person.employmentIncomePhases = [
    {
      id: "synthetic-work",
      label: "Synthetic work",
      startAge: 40,
      endAge: 42,
      annualNetCashToday: 0,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 120000,
        annualPensionAdjustmentToday: 1000,
        annualOtherRoomReductionToday: 500,
        annualGrowth: 0,
      },
    },
  ];
  input.monthlyEssentialSpendingToday = 0;
  input.monthlyDiscretionarySpendingToday = 0;
  input.accounts = [
    {
      id: "cash:reserve",
      label: "Synthetic reserve",
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 100000,
      annualReturn: 0,
      contributionPhases: [],
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    investmentAccount("tfsa:one", "tfsa", 300),
    investmentAccount("tfsa:two", "tfsa"),
    investmentAccount("rrsp:one", "rrsp_rrif"),
    investmentAccount("rrsp:two", "rrsp_rrif"),
    investmentAccount("projection:taxable", "non_registered"),
  ];
  input.accounts.at(-1)!.origin = "projection_configuration";
  input.registeredAccountRoom = {
    tfsa: {
      startingAvailableRoom: {
        source: "configured_amount",
        amount: 1000,
        sourceDescription: "Synthetic TFSA starting room",
        effectiveDate: "2026-07-01",
      },
      annualNewRoom: {
        source: "canadian_reference",
        futureIndexingRate: 0.02,
        roundingIncrement: 500,
      },
      carryForwardUnusedRoom: true,
      withdrawalRoomRecredit: "next_calendar_year",
    },
    rrsp: {
      startingAvailableDeductionRoom: {
        source: "configured_amount",
        amount: 2000,
        sourceDescription: "Synthetic RRSP starting room",
        effectiveDate: "2026-07-01",
      },
      carryForwardUnusedRoom: true,
      newRoom: {
        source: "earned_income",
        annualCap: {
          source: "canadian_reference",
          futureGrowthRate: 0.03,
          futureRoundingIncrement: 10,
        },
        startYearBeforeProjectionMonth: {
          calendarYear: 2026,
          eligibleEarnedIncome: 60000,
          pensionAdjustment: 500,
          otherRoomReduction: 250,
        },
      },
    },
  };
  input.contributionWaterfall = {
    mode: "canonical",
    routes: [
      {
        sourceAccountId: "tfsa:one",
        destinationAccountIds: [
          "tfsa:one",
          "rrsp:one",
          "projection:taxable",
        ],
      },
    ],
    surplusDestinationAccountIds: [
      "tfsa:two",
      "rrsp:two",
      "projection:taxable",
    ],
  };
  input.surplusAllocation = {
    reserveAccountIds: ["cash:reserve"],
    reserveRefillAccountId: "cash:reserve",
    targetCashReserveToday: 0,
    reserveIndexingRate: 0,
    excess: { mode: "retain_as_cash" },
  };
  input.events = [];
  return input;
}

describe("global registered-account room", () => {
  it("shares one TFSA pool, partially contributes at exhaustion, and renews next January", () => {
    const input = roomFixture();
    input.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
    ];
    const result = calculateProjection(input);
    const partial2026 = result.annual[0]!.nominal;
    const full2027 = result.annual[1]!.nominal;

    expect(partial2026.registeredAccountRoom.tfsa).toMatchObject({
      openingRoom: 1000,
      annualNewRoom: 0,
      plannedContributions: 1800,
      allowedContributions: 1000,
      unallocatedContributions: 800,
      closingRoom: 0,
    });
    expect(partial2026.accountContributions["tfsa:one"]).toBe(1000);
    expect(full2027.registeredAccountRoom.tfsa).toMatchObject({
      openingRoom: 0,
      annualNewRoom: 7000,
      plannedContributions: 3600,
      allowedContributions: 3600,
      closingRoom: 3400,
    });
  });

  it("shares room across two TFSA sources by route priority, independent of account order", () => {
    const input = roomFixture();
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases[0]!.monthlyAmountToday = 800;
    input.accounts.find((account) => account.id === "tfsa:two")!
      .contributionPhases = [
      {
        id: "second-plan",
        label: "Second plan",
        startAge: 40,
        endAge: 42,
        monthlyAmountToday: 800,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    input.contributionWaterfall.routes = [
      {
        sourceAccountId: "tfsa:one",
        destinationAccountIds: ["tfsa:one"],
      },
      {
        sourceAccountId: "tfsa:two",
        destinationAccountIds: ["tfsa:two"],
      },
    ];
    const first = calculateProjection(input).annual[0]!.nominal;
    expect(first.accountContributions["tfsa:one"]).toBe(800);
    expect(first.accountContributions["tfsa:two"]).toBe(200);
    expect(first.registeredAccountRoom.tfsa.closingRoom).toBe(0);

    input.accounts.reverse();
    const reordered = calculateProjection(input).annual[0]!.nominal;
    expect(reordered.accountContributions).toEqual(first.accountContributions);
  });

  it("does not infer starting room from registered balances or add current-year room twice", () => {
    const input = roomFixture();
    const tfsa = input.accounts.find((account) => account.id === "tfsa:one")!;
    tfsa.openingBalance = 500000;
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 0;
    input.contributionWaterfall.routes[0]!.destinationAccountIds = ["tfsa:one"];
    const first = calculateProjection(input).annual[0]!.nominal
      .registeredAccountRoom.tfsa;
    expect(first.openingRoom).toBe(0);
    expect(first.annualNewRoom).toBe(0);
    expect(first.allowedContributions).toBe(0);
  });

  it("applies carry-forward true and the explicit non-statutory false scenario", () => {
    const carry = roomFixture();
    carry.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    carry.contributionWaterfall.routes = [];
    expect(
      calculateProjection(carry).annual[1]!.nominal.registeredAccountRoom
        .tfsa.openingRoom,
    ).toBe(1000);

    const reset = structuredClone(carry);
    reset.registeredAccountRoom!.tfsa.carryForwardUnusedRoom = false;
    expect(
      calculateProjection(reset).annual[1]!.nominal.registeredAccountRoom
        .tfsa.openingRoom,
    ).toBe(0);
  });

  it("restores TFSA withdrawals only at the next January boundary", () => {
    const input = roomFixture();
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    input.accounts.find((account) => account.id === "tfsa:one")!
      .openingBalance = 600;
    input.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    input.monthlyEssentialSpendingToday = 100;
    input.contributionWaterfall.routes = [];
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 0;
    const result = calculateProjection(input);
    expect(
      result.annual[0]!.nominal.registeredAccountRoom.tfsa
        .withdrawalRoomRestored,
    ).toBe(0);
    expect(
      result.annual[1]!.nominal.registeredAccountRoom.tfsa
        .withdrawalRoomRestored,
    ).toBe(600);
  });

  it("uses the published TFSA limit and deterministic labelled forecasts", () => {
    expect(tfsaAnnualLimit(2026, 0.1, 500)).toMatchObject({
      amount: 7000,
      sourceKind: "published_reference",
    });
    expect(tfsaAnnualLimit(2027, 0.1, 500)).toMatchObject({
      amount: 7500,
      sourceKind: "configured_forecast",
    });
  });

  it("generates RRSP room from explicit prior-year values, 18%, caps, and reductions", () => {
    const input = roomFixture();
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    input.contributionWaterfall.routes = [];
    const rrsp = calculateProjection(input).annual[1]!.nominal
      .registeredAccountRoom.rrsp;
    expect(rrsp.previousYearEligibleEarnedIncome).toBe(120000);
    expect(rrsp.earnedIncomeRate).toBe(0.18);
    expect(rrsp.annualCap).toBe(35390);
    expect(rrsp.grossGeneratedRoom).toBe(21600);
    expect(rrsp.pensionAdjustment).toBeCloseTo(1000, 8);
    expect(rrsp.otherRoomReduction).toBeCloseTo(500, 8);
    expect(rrsp.annualNewRoom).toBe(20100);
    expect(rrsp.openingRoom).toBe(2000);
    expect(rrsp.closingRoom).toBe(22100);
  });

  it("uses exact published RRSP caps and deterministic future forecasts", () => {
    expect(rrspAnnualCap(2026, 0.03, 10).amount).toBe(33810);
    expect(rrspAnnualCap(2027, 0.03, 10).amount).toBe(35390);
    expect(rrspAnnualCap(2028, 0.03, 10)).toMatchObject({
      amount: 36450,
      sourceKind: "configured_forecast",
    });
  });

  it("shares one RRSP pool across multiple RRSP accounts by route priority", () => {
    const input = roomFixture();
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    for (const id of ["rrsp:one", "rrsp:two"]) {
      input.accounts.find((account) => account.id === id)!
        .contributionPhases = [
        {
          id: `${id}-shared-plan`,
          label: "Shared RRSP room plan",
          startAge: 40,
          endAge: 42,
          monthlyAmountToday: 400,
          funding: "cash",
          indexingRate: 0,
        },
      ];
    }
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      500;
    input.contributionWaterfall.routes = [
      {
        sourceAccountId: "rrsp:one",
        destinationAccountIds: ["rrsp:one"],
      },
      {
        sourceAccountId: "rrsp:two",
        destinationAccountIds: ["rrsp:two"],
      },
    ];
    const first = calculateProjection(input).annual[0]!.nominal;
    expect(first.accountContributions["rrsp:one"]).toBe(400);
    expect(first.accountContributions["rrsp:two"]).toBe(100);
    expect(first.registeredAccountRoom.rrsp.closingRoom).toBe(0);
  });

  it("binds the RRSP cap and applies carry-forward true or false explicitly", () => {
    const capped = roomFixture();
    capped.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    capped.contributionWaterfall.routes = [];
    capped.person.employmentIncomePhases[0]!.rrspRoomGeneration = {
      annualEligibleEarnedIncomeToday: 500000,
      annualPensionAdjustmentToday: 0,
      annualOtherRoomReductionToday: 0,
      annualGrowth: 0,
    };
    capped.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth =
      {
        calendarYear: 2026,
        eligibleEarnedIncome: 250000,
        pensionAdjustment: 0,
        otherRoomReduction: 0,
      };
    const carry = calculateProjection(capped).annual[1]!.nominal
      .registeredAccountRoom.rrsp;
    expect(carry.grossGeneratedRoom).toBe(35390);
    expect(carry.annualNewRoom).toBe(35390);
    expect(carry.openingRoom).toBe(2000);

    capped.registeredAccountRoom!.rrsp.carryForwardUnusedRoom = false;
    const reset = calculateProjection(capped).annual[1]!.nominal
      .registeredAccountRoom.rrsp;
    expect(reset.openingRoom).toBe(0);
    expect(reset.closingRoom).toBe(35390);
  });

  it("does not restore RRSP room after an RRSP withdrawal", () => {
    const withdrawn = roomFixture();
    withdrawn.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    withdrawn.contributionWaterfall.routes = [];
    withdrawn.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    withdrawn.accounts.find((account) => account.id === "rrsp:one")!
      .openingBalance = 600;
    withdrawn.monthlyEssentialSpendingToday = 80;
    const withWithdrawal = calculateProjection(withdrawn).annual[1]!.nominal
      .registeredAccountRoom.rrsp;

    const noWithdrawal = structuredClone(withdrawn);
    noWithdrawal.monthlyEssentialSpendingToday = 0;
    const withoutWithdrawal = calculateProjection(noWithdrawal).annual[1]!
      .nominal.registeredAccountRoom.rrsp;
    expect(withWithdrawal.annualNewRoom).toBe(withoutWithdrawal.annualNewRoom);
    expect(withWithdrawal.openingRoom).toBe(withoutWithdrawal.openingRoom);
  });

  it("floors RRSP room generation at zero and never uses net deposited cash", () => {
    const input = roomFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 999999;
    input.person.employmentIncomePhases[0]!.rrspRoomGeneration = {
      annualEligibleEarnedIncomeToday: 0,
      annualPensionAdjustmentToday: 2000,
      annualOtherRoomReductionToday: 2000,
      annualGrowth: 0,
    };
    input.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth = {
      calendarYear: 2026,
      eligibleEarnedIncome: 0,
      pensionAdjustment: 1000,
      otherRoomReduction: 1000,
    };
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    input.contributionWaterfall.routes = [];
    const rrsp = calculateProjection(input).annual[1]!.nominal
      .registeredAccountRoom.rrsp;
    expect(rrsp.previousYearEligibleEarnedIncome).toBe(0);
    expect(rrsp.annualNewRoom).toBe(0);
  });
});

describe("contribution waterfall and funding semantics", () => {
  it("redirects TFSA overflow to RRSP and then non-registered", () => {
    const input = roomFixture();
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases[0]!.monthlyAmountToday = 1000;
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 200;
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      300;
    const firstMonth = calculateProjection(input).retirementSnapshot.nominal;
    const annual = calculateProjection(input).annual[0]!.nominal;
    expect(annual.accountContributions["tfsa:one"]).toBe(200);
    expect(annual.accountContributions["rrsp:one"]).toBe(300);
    expect(annual.accountContributions["projection:taxable"]).toBe(5500);
    expect(firstMonth.contributions.total).toBe(1000);
  });

  it("leaves overflow visibly unallocated when no destination has room", () => {
    const input = roomFixture();
    input.contributionWaterfall.routes[0]!.destinationAccountIds = ["tfsa:one"];
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 100;
    const annual = calculateProjection(input).annual[0]!.nominal;
    expect(annual.contributions.planned).toBe(1800);
    expect(annual.contributions.total).toBe(100);
    expect(annual.contributions.unallocated).toBe(1700);
  });

  it("keeps cash-funded unallocated amounts in cash for the surplus policy", () => {
    const input = roomFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 12000;
    input.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 100;
    input.contributionWaterfall.routes[0]!.destinationAccountIds = ["tfsa:one"];
    const first = calculateProjection(input).annual[0]!.nominal;
    expect(first.contributions.cashFunded).toBe(100);
    expect(first.contributions.unallocatedCashFunded).toBe(1700);
    expect(first.surplusAllocation.generated).toBe(5900);
    expect(first.balances.financialAssets).toBe(6000);
  });

  it("keeps income-withheld redirects external and excludes unallocated amounts from assets", () => {
    const input = roomFixture();
    const phase = input.accounts.find(
      (account) => account.id === "tfsa:one",
    )!.contributionPhases[0]!;
    phase.funding = "income_withheld";
    phase.monthlyAmountToday = 500;
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 100;
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      200;
    input.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
      "rrsp:one",
    ];
    const result = calculateProjection(input);
    const annual = result.annual[0]!.nominal;
    expect(annual.contributions.incomeWithheld).toBe(300);
    expect(annual.contributions.unallocatedIncomeWithheld).toBe(2700);
    expect(annual.balances.financialAssets).toBe(100300);
    expect(
      result.financialAssetsBridge.nominal.incomeWithheldContributions,
    ).toBeCloseTo(
      result.annual.reduce(
        (total, row) => total + row.nominal.contributions.incomeWithheld,
        0,
      ),
      8,
    );
  });

  it("uses planned commitments before surplus, then TFSA, RRSP, and taxable destinations", () => {
    const input = roomFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 36000;
    input.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases[0]!.monthlyAmountToday = 800;
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 1000;
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      1000;
    input.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    const first = calculateProjection(input).annual[0]!.nominal;
    expect(first.accountContributionDetails["tfsa:one"]!.sourceAccountDeposit).toBe(
      800,
    );
    expect(first.registeredAccountRoom.tfsa.surplusFundedContributions).toBe(200);
    expect(first.registeredAccountRoom.rrsp.surplusFundedContributions).toBe(
      1000,
    );
    expect(
      first.accountContributionDetails["projection:taxable"]!
        .surplusFundedDeposit,
    ).toBeGreaterThan(0);
    expect(
      first.surplusAllocation.generated,
    ).toBeCloseTo(
      first.surplusAllocation.retainedAsCash +
        first.surplusAllocation.redirected,
      2,
    );
    expect(first.contributions).toMatchObject({
      planned: 4800,
      allowed: 4800,
      surplusFunded: first.surplusAllocation.redirected,
      total: 4800 + first.surplusAllocation.redirected,
    });
    expect(first.contributions.cashFunded).toBe(first.contributions.total);
    expect(first.outflows.contributions).toBe(first.contributions.cashFunded);
    expect(
      Object.values(first.accountContributionDetails).reduce(
        (total, detail) => total + detail.depositedIntoAccount,
        0,
      ),
    ).toBeCloseTo(first.contributions.total, 8);
  });

  it.each([
    ["TFSA", "tfsa:one"],
    ["RRSP", "rrsp:one"],
    ["non-registered", "projection:taxable"],
  ] as const)(
    "includes %s surplus deposits in canonical actual and cash-funded totals",
    (_label, destinationId) => {
      const input = roomFixture();
      input.person.employmentIncomePhases[0]!.annualNetCashToday = 1200;
      input.accounts.find((account) => account.id === "cash:reserve")!
        .openingBalance = 0;
      input.accounts.find((account) => account.id === "tfsa:one")!
        .contributionPhases = [];
      input.contributionWaterfall.routes = [];
      input.contributionWaterfall.surplusDestinationAccountIds = [
        destinationId,
      ];
      input.surplusAllocation.excess = {
        mode: "allocate_through_contribution_waterfall",
      };

      const result = calculateProjection(input);
      const first = result.annual[0]!.nominal;
      const detail = first.accountContributionDetails[destinationId]!;

      expect(first.contributions).toMatchObject({
        planned: 0,
        allowed: 0,
        surplusFunded: 600,
        cashFunded: 600,
        incomeWithheld: 0,
        unallocated: 0,
        total: 600,
      });
      expect(first.outflows.contributions).toBe(600);
      expect(detail).toMatchObject({
        depositedIntoAccount: 600,
        surplusFundedDeposit: 600,
        cashFunded: 600,
      });
      expect(
        Object.values(first.accountContributionDetails).reduce(
          (total, account) => total + account.depositedIntoAccount,
          0,
        ),
      ).toBe(600);
      expect(first.balances.financialAssets).toBe(600);
      expect(result.financialAssetsBridge.nominal.endingFinancialAssets).toBe(
        2400,
      );
      if (destinationId === "tfsa:one") {
        expect(
          first.registeredAccountRoom.tfsa.allowedContributions,
        ).toBe(600);
        expect(
          first.registeredAccountRoom.tfsa.surplusFundedContributions,
        ).toBe(600);
      }
      if (destinationId === "rrsp:one") {
        expect(
          first.registeredAccountRoom.rrsp.allowedContributions,
        ).toBe(600);
        expect(
          first.registeredAccountRoom.rrsp.surplusFundedContributions,
        ).toBe(600);
      }
    },
  );

  it("keeps no-surplus totals unchanged and reconciles mixed planned and surplus deposits", () => {
    const noSurplus = roomFixture();
    const plannedOnly = calculateProjection(noSurplus).annual[0]!.nominal;
    expect(plannedOnly.contributions.surplusFunded).toBe(0);
    expect(plannedOnly.contributions.total).toBe(
      plannedOnly.contributions.allowed,
    );

    const mixed = roomFixture();
    mixed.person.employmentIncomePhases[0]!.annualNetCashToday = 2400;
    mixed.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    mixed.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases[0]!.monthlyAmountToday = 100;
    mixed.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 5000;
    mixed.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
    ];
    mixed.contributionWaterfall.surplusDestinationAccountIds = ["tfsa:two"];
    mixed.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    const result = calculateProjection(mixed);
    const first = result.annual[0]!.nominal;
    expect(first.contributions).toMatchObject({
      planned: 600,
      allowed: 600,
      surplusFunded: 600,
      total: 1200,
      cashFunded: 1200,
    });
    expect(first.outflows.contributions).toBe(1200);
    expect(first.balances.financialAssets).toBe(1200);
    expect(
      Object.values(first.accountContributionDetails).reduce(
        (total, detail) => total + detail.depositedIntoAccount,
        0,
      ),
    ).toBe(1200);
    for (const mode of ["nominal", "real"] as const) {
      const bridge = result.financialAssetsBridge[mode];
      const ending =
        bridge.startingFinancialAssets +
        bridge.employmentNetCash +
        bridge.publicBenefitsAndPension +
        bridge.otherInflows +
        bridge.incomeWithheldContributions +
        bridge.investmentReturns -
        bridge.essentialSpending -
        bridge.discretionarySpending -
        bridge.oneTimeOutflows -
        bridge.taxes;
      expect(ending).toBeCloseTo(bridge.endingFinancialAssets, 2);
    }
  });

  it("keeps regulatory room nominal while ordinary flows follow display mode", () => {
    const input = roomFixture();
    input.annualInflation = 0.12;
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 24000;
    const result = calculateProjection(input);

    expect(result.registeredAccountRoom.denomination).toBe(
      "nominal_regulatory_dollars",
    );
    for (const point of result.annual) {
      expect(point.real.registeredAccountRoom).toEqual(
        point.nominal.registeredAccountRoom,
      );
    }
    expect(result.annual[1]!.real.income.employment).not.toBe(
      result.annual[1]!.nominal.income.employment,
    );
  });

  it("retains surplus fallback as cash when registered room is exhausted", () => {
    const input = roomFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 12000;
    input.accounts.find((account) => account.id === "cash:reserve")!
      .openingBalance = 0;
    input.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    input.contributionWaterfall.routes = [];
    input.contributionWaterfall.surplusDestinationAccountIds = ["tfsa:two"];
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 200;
    input.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    const first = calculateProjection(input).annual[0]!.nominal;
    expect(first.registeredAccountRoom.tfsa.surplusFundedContributions).toBe(
      200,
    );
    expect(first.surplusAllocation.retainedAsCash).toBe(5800);
    expect(first.accountBalances["cash:reserve"]).toBe(5800);
  });

  it("stops RRSP routing at the RRIF conversion age", () => {
    const input = roomFixture();
    input.person.currentAge = 70;
    input.person.retirementAge = 72;
    input.endAge = 72;
    input.person.rrifConversionAge = 71;
    input.person.employmentIncomePhases[0]!.startAge = 70;
    input.person.employmentIncomePhases[0]!.endAge = 72;
    input.accounts.find(
      (account) => account.id === "tfsa:one",
    )!.contributionPhases = [];
    input.accounts.find(
      (account) => account.id === "rrsp:one",
    )!.contributionPhases = [
      {
        id: "rrsp-age-plan",
        label: "RRSP age-boundary plan",
        startAge: 70,
        endAge: 72,
        monthlyAmountToday: 300,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    const phase = input.accounts.find(
      (account) => account.id === "rrsp:one",
    )!.contributionPhases[0]!;
    phase.startAge = 70;
    phase.endAge = 72;
    input.contributionWaterfall.routes = [{
      sourceAccountId: "rrsp:one",
      destinationAccountIds: [
      "rrsp:one",
      "projection:taxable",
      ],
    }];
    input.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 0;
    input.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      100000;
    const result = calculateProjection(input);
    expect(result.annual[0]!.nominal.accountContributions["rrsp:one"]).toBe(
      1800,
    );
    expect(
      result.annual[1]!.nominal.accountContributions["rrsp:one"] ?? 0,
    ).toBe(1800);
    expect(
      result.annual[2]!.nominal.accountContributions["rrsp:one"] ?? 0,
    ).toBe(0);
  });
});

describe("registered-room validation boundaries", () => {
  it("rejects missing room for positive registered contributions", () => {
    const input = roomFixture();
    delete input.registeredAccountRoom;
    expect(() => validateProjectionInputs(input)).toThrow(
      "registeredAccountRoom is required",
    );
  });

  it("requires explicit RRSP generation for overflow and active surplus reachability", () => {
    const overflow = roomFixture();
    delete overflow.person.employmentIncomePhases[0]!.rrspRoomGeneration;
    expect(() => validateProjectionInputs(overflow)).toThrow(
      "rrspRoomGeneration is required whenever RRSP/RRIF can receive contributions",
    );

    const surplusOnly = roomFixture();
    surplusOnly.accounts.find((account) => account.id === "tfsa:one")!
      .contributionPhases = [];
    surplusOnly.contributionWaterfall.routes = [];
    surplusOnly.contributionWaterfall.surplusDestinationAccountIds = [
      "rrsp:one",
    ];
    surplusOnly.surplusAllocation.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    delete surplusOnly.person.employmentIncomePhases[0]!.rrspRoomGeneration;
    expect(() => validateProjectionInputs(surplusOnly)).toThrow(
      "rrspRoomGeneration is required whenever RRSP/RRIF can receive contributions",
    );
  });

  it("accepts explicit zero RRSP generation and omits it when RRSP is unreachable", () => {
    const explicitZero = roomFixture();
    explicitZero.person.employmentIncomePhases[0]!.rrspRoomGeneration = {
      annualEligibleEarnedIncomeToday: 0,
      annualPensionAdjustmentToday: 0,
      annualOtherRoomReductionToday: 0,
      annualGrowth: 0,
    };
    expect(() => validateProjectionInputs(explicitZero)).not.toThrow();

    const unreachable = roomFixture();
    unreachable.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
      "projection:taxable",
    ];
    unreachable.contributionWaterfall.surplusDestinationAccountIds = [
      "tfsa:two",
      "projection:taxable",
    ];
    delete unreachable.person.employmentIncomePhases[0]!.rrspRoomGeneration;
    expect(() => validateProjectionInputs(unreachable)).not.toThrow();
  });

  it("never substitutes net deposited cash for eligible earned income", () => {
    const input = roomFixture();
    input.person.employmentIncomePhases[0]!.annualNetCashToday = 999999;
    input.person.employmentIncomePhases[0]!.rrspRoomGeneration = {
      annualEligibleEarnedIncomeToday: 0,
      annualPensionAdjustmentToday: 0,
      annualOtherRoomReductionToday: 0,
      annualGrowth: 0,
    };
    input.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth = {
      calendarYear: 2026,
      eligibleEarnedIncome: 0,
      pensionAdjustment: 0,
      otherRoomReduction: 0,
    };
    expect(
      calculateProjection(input).annual[1]!.nominal.registeredAccountRoom.rrsp
        .annualNewRoom,
    ).toBe(0);
  });

  it("requires January pre-start RRSP totals to be zero", () => {
    const january = roomFixture();
    january.startDate = "2026-01-01";
    january.registeredAccountRoom!.rrsp.newRoom
      .startYearBeforeProjectionMonth = {
      calendarYear: 2026,
      eligibleEarnedIncome: 0,
      pensionAdjustment: 0,
      otherRoomReduction: 0,
    };
    expect(() => validateProjectionInputs(january)).not.toThrow();

    for (const field of [
      "eligibleEarnedIncome",
      "pensionAdjustment",
      "otherRoomReduction",
    ] as const) {
      const invalid = structuredClone(january);
      invalid.registeredAccountRoom!.rrsp.newRoom
        .startYearBeforeProjectionMonth[field] = 1;
      expect(() => validateProjectionInputs(invalid)).toThrow(
        "January has no pre-projection months",
      );
    }
  });

  it("rejects duplicate sources, duplicate destinations, unknown, cash, debt, and non-registered-before-room routes", () => {
    const duplicateSource = roomFixture();
    duplicateSource.contributionWaterfall.routes.push(
      structuredClone(duplicateSource.contributionWaterfall.routes[0]!),
    );
    expect(() => validateProjectionInputs(duplicateSource)).toThrow(
      "Duplicate contribution waterfall source",
    );

    const duplicateDestination = roomFixture();
    duplicateDestination.contributionWaterfall.routes[0]!.destinationAccountIds =
      ["tfsa:one", "tfsa:one"];
    expect(() => validateProjectionInputs(duplicateDestination)).toThrow(
      "Duplicate destination",
    );

    const unknown = roomFixture();
    unknown.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
      "missing",
    ];
    expect(() => validateProjectionInputs(unknown)).toThrow(
      "Unknown contribution waterfall destination",
    );

    const cash = roomFixture();
    cash.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
      "cash:reserve",
    ];
    expect(() => validateProjectionInputs(cash)).toThrow(
      "must be an investment account",
    );

    const debt = roomFixture();
    debt.liabilities.push({
      id: "debt:one",
      label: "Synthetic liability",
      origin: "lunchmoney",
      openingBalance: 1,
      balanceAsOf: debt.startDate,
      role: null,
      treatment: { mode: "payoff_at_projection_start" },
      historicalPaymentHandling: "already_excluded_or_transfer",
      historicalMonthlyAverage: 0,
    });
    debt.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "tfsa:one",
      "debt:one",
    ];
    expect(() => validateProjectionInputs(debt)).toThrow(
      "Unknown contribution waterfall destination",
    );

    const nonRegisteredFirst = roomFixture();
    nonRegisteredFirst.contributionWaterfall.routes[0]!.destinationAccountIds =
      ["tfsa:one", "projection:taxable", "rrsp:one"];
    expect(() => validateProjectionInputs(nonRegisteredFirst)).toThrow(
      "must be last",
    );
  });

  it("requires the source first and canonical routes for all phased accounts", () => {
    const wrongFirst = roomFixture();
    wrongFirst.contributionWaterfall.routes[0]!.destinationAccountIds = [
      "rrsp:one",
      "tfsa:one",
    ];
    expect(() => validateProjectionInputs(wrongFirst)).toThrow(
      "must start with its source account",
    );

    const missingRoute = roomFixture();
    missingRoute.accounts.find((account) => account.id === "tfsa:two")!
      .contributionPhases = [
      {
        id: "missing-route-plan",
        label: "Missing route",
        startAge: 40,
        endAge: 42,
        monthlyAmountToday: 10,
        funding: "cash",
        indexingRate: 0,
      },
    ];
    expect(() => validateProjectionInputs(missingRoute)).toThrow(
      "requires a route",
    );
  });

  it("prohibits targeted registered inflows while allowing cash and non-registered targets", () => {
    const tfsa = roomFixture();
    tfsa.events = [
      {
        id: "tfsa-event",
        label: "Synthetic TFSA event",
        calendarYear: 2026,
        month: 8,
        amountToday: 100,
        direction: "inflow",
        targetAccountId: "tfsa:one",
      },
    ];
    expect(() => validateProjectionInputs(tfsa)).toThrow(
      "cannot deposit directly into a registered account",
    );

    const allowed = roomFixture();
    allowed.events = [
      {
        id: "cash-event",
        label: "Synthetic cash event",
        calendarYear: 2026,
        month: 8,
        amountToday: 100,
        direction: "inflow",
        targetAccountId: "cash:reserve",
      },
      {
        id: "taxable-event",
        label: "Synthetic taxable event",
        calendarYear: 2026,
        month: 9,
        amountToday: 100,
        direction: "inflow",
        targetAccountId: "projection:taxable",
      },
    ];
    expect(() => validateProjectionInputs(allowed)).not.toThrow();
  });

  it("normalizes omitted canonical routing to visible fixed-source compatibility", () => {
    const input = roomFixture();
    input.contributionWaterfall = {
      mode: "fixed_source_compatibility",
      routes: [],
      surplusDestinationAccountIds: [],
    };
    const resolved = validateProjectionInputs(input);
    expect(resolved.contributionWaterfall.routes).toEqual([
      {
        sourceAccountId: "tfsa:one",
        destinationAccountIds: ["tfsa:one"],
      },
    ]);
  });
});
