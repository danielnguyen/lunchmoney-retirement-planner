import type {
  Category,
  ManualAccount,
  PlaidAccount,
  RecurringItem,
  Transaction,
} from "@lunch-money/lunch-money-js-v2";
import { describe, expect, it } from "vitest";
import type { PlannerConfig } from "@/src/config/types";
import { deriveCurrentBaseline } from "@/src/domain/baseline/derive";
import type { LunchMoneyData } from "@/src/integrations/lunchmoney/read-service";
import { PlannerRuntimeError } from "@/src/runtime/errors";

const configFixture: PlannerConfig = {
  currentAge: 40,
  retirementAge: 65,
  projectionEndAge: 95,
  cppStartAge: 65,
  oasStartAge: 65,
  cppMonthlyAmountAt65: 1200,
  oasMonthlyAmountAt65: 700,
  retirementGoal: 900000,
  transactionTrailingMonths: 12,
  accountMappings: {
    "manual:1": { include: true, type: "cash", withdrawalPriority: 1 },
    "plaid:2": { include: true, type: "tfsa", withdrawalPriority: 2 },
    "manual:3": { include: false, type: "exclude" },
  },
  surplusAllocation: {
    reserveAccountIds: ["manual:1"],
    reserveRefillAccountId: "manual:1",
    targetCashReserveToday: 1000,
    reserveIndexingRate: 0.02,
    excess: { mode: "retain_as_cash" },
  },
  registeredAccountRoom: {
    tfsa: {
      startingAvailableRoom: {
        source: "configured_amount",
        amount: 10000,
        sourceDescription: "Synthetic available TFSA room",
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
        source: "explicit_zero",
        amount: 0,
        sourceDescription: "Explicit zero starting room",
        effectiveDate: "1970-01-01",
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
          eligibleEarnedIncome: 0,
          pensionAdjustment: 0,
          otherRoomReduction: 0,
        },
      },
    },
  },
  contributionWaterfall: {
    routes: [
      {
        sourceAccountId: "plaid:2",
        destinationAccountIds: ["plaid:2"],
      },
    ],
    surplusDestinationAccountIds: ["plaid:2"],
  },
  categoryMappings: {
    "10": "essential",
    "11": "discretionary",
    "12": "income",
    "13": "transfer",
    "14": {
      classification: "investment_contribution",
      contributionAccountId: "plaid:2",
      contributionDirection: "debit",
    },
  },
  assumptions: {
    inflation: 0.02,
    cashReturn: 0.02,
    tfsaReturn: 0.05,
    rrspReturn: 0.05,
    nonRegisteredReturn: 0.05,
    debtReturn: 0,
    incomeGrowth: 0.02,
    contributionIndexing: 0.02,
    cppIndexing: 0.02,
    oasIndexing: 0.02,
    effectiveTaxRate: 0.2,
    oasRecoveryThreshold: 90000,
    oasRecoveryRate: 0.15,
    pensionAnnualIncome: 0,
    pensionStartAge: 65,
    pensionIndexing: 0.02,
    rrifConversionAge: 71,
    allocations: {
      cash: { cash: 1, fixedIncome: 0, equity: 0 },
      tfsa: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      rrsp: { cash: 0, fixedIncome: 0.3, equity: 0.7 },
      non_registered: { cash: 0.05, fixedIncome: 0.25, equity: 0.7 },
      debt: { cash: 0, fixedIncome: 0, equity: 0 },
    },
  },
  futureEvents: [],
};

function category(id: number, name: string, excludeFromTotals = false): Category {
  return {
    id,
    name,
    description: null,
    is_income: false,
    exclude_from_budget: false,
    exclude_from_totals: excludeFromTotals,
    updated_at: "2026-07-01T00:00:00Z",
    created_at: "2025-01-01T00:00:00Z",
    group_id: null,
    is_group: false,
    archived: false,
    archived_at: null,
    order: null,
    collapsed: false,
  };
}

function transaction(
  id: number,
  amount: number,
  categoryId: number,
  account: { manual?: number; plaid?: number } = { manual: 1 },
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date: `2026-07-${String(id).padStart(2, "0")}`,
    amount: String(amount),
    currency: "cad",
    to_base: amount,
    recurring_id: null,
    payee: `Payee ${id}`,
    category_id: categoryId,
    plaid_account_id: account.plaid ?? null,
    manual_account_id: account.manual ?? null,
    external_id: null,
    tag_ids: [],
    notes: null,
    status: "reviewed",
    is_pending: false,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    split_parent_id: null,
    is_group_parent: false,
    group_parent_id: null,
    source: "manual",
    ...extra,
  };
}

function lunchMoneyData(): LunchMoneyData {
  const manualAccounts = [
    {
      id: 1,
      name: "Chequing",
      display_name: "Everyday cash",
      to_base: 1234.56,
      status: "active",
      balance_as_of: "2026-07-10T00:00:00Z",
    } as ManualAccount,
    {
      id: 3,
      name: "Excluded",
      display_name: null,
      to_base: 999,
      status: "active",
      balance_as_of: "2026-07-10T00:00:00Z",
    } as ManualAccount,
  ];
  const plaidAccounts = [
    {
      id: 2,
      name: "Investment",
      display_name: "TFSA",
      to_base: 5000.25,
      status: "active",
      balance_last_update: "2026-07-11T00:00:00Z",
    } as PlaidAccount,
  ];
  const categories = [
    category(10, "Needs"),
    category(11, "Wants"),
    category(12, "Pay"),
    category(13, "Transfers"),
    category(14, "Investing"),
    category(15, "Ignored", true),
  ];
  const recurringItems = [
    {
      id: 50,
      description: "Annual essential bill",
      status: "reviewed",
      transaction_criteria: {
        start_date: null,
        end_date: null,
        granularity: "year",
        quantity: 1,
        anchor_date: "2026-01-01",
        payee: "Annual bill",
        amount: "1200",
        to_base: 1200,
        currency: "cad",
        plaid_account_id: null,
        manual_account_id: 1,
      },
      overrides: { category_id: 10 },
      matches: null,
      created_by: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      source: "manual",
    } as RecurringItem,
  ];
  const transactions = [
    transaction(1, 1200, 10),
    transaction(2, -200, 10),
    transaction(3, 600, 11),
    transaction(4, -3000, 12),
    transaction(5, 500, 13),
    transaction(6, 1000, 15),
    transaction(7, 240, 14),
    transaction(8, 999, 10, { manual: 3 }),
    transaction(9, 1200, 10, { manual: 1 }, { is_group_parent: true }),
  ];
  return { manualAccounts, plaidAccounts, categories, recurringItems, transactions };
}

const window = { startDate: "2025-07-14", endDate: "2026-07-14", trailingMonths: 12 };

describe("live baseline derivation", () => {
  it("uses exact mapped balances and derives cash flow from posted transactions", () => {
    const baseline = deriveCurrentBaseline(
      configFixture,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(baseline.derived.accountBalances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "manual:1", balance: 1234.56 }),
        expect.objectContaining({ id: "plaid:2", balance: 5000.25 }),
      ]),
    );
    expect(baseline.derived.essentialSpending).toMatchObject({
      trailingTotal: 1000,
      monthlyAverage: 83.33,
      transactionCount: 2,
    });
    expect(baseline.derived.discretionarySpending.trailingTotal).toBe(600);
    expect(baseline.derived.monthlyIncome.trailingTotal).toBe(3000);
    expect(baseline.derived.monthlyIncome.basis).toBe("net_deposited_cash");
    expect(baseline.derived.investmentContributions.monthlyAverage).toBe(20);
    expect(baseline.derived.investmentContributions.accounts[0]?.funding).toBe("cash");
    expect(baseline.derived.recurringExpenses.monthlyTotal).toBe(100);
    expect(baseline.dataThrough).toBe("2026-07-08");
    expect(baseline.projectionInputs.startDate).toBe("2026-07-08");
    expect(
      baseline.projectionInputs.person.employmentIncomePhases[0]!.annualNetCashToday,
    ).toBe(3000);
    expect(baseline.projectionInputs.person.employmentIncomePhases).toEqual([
      expect.objectContaining({
        id: "legacy-current-income",
        startAge: 40,
        endAge: 65,
        annualGrowth: 0.02,
      }),
    ]);
    expect(baseline.projectionInputs.accounts[1]!.contributionPhases).toEqual([
      expect.objectContaining({
        id: "legacy-current-contribution",
        monthlyAmountToday: 20,
        funding: "cash",
        indexingRate: 0.02,
      }),
    ]);
    expect(baseline.recordsAnalyzed.transactions).toBe(8);
    expect(baseline.schemaVersion).toBe("1.5");
    expect(baseline.warnings).toContainEqual(
      expect.objectContaining({ code: "long_live_baseline_income" }),
    );
  });

  it("resolves registered room, waterfall routes, and material provenance", () => {
    const baseline = deriveCurrentBaseline(
      configFixture,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.schemaVersion).toBe("1.5");
    expect(
      baseline.projectionInputs.registeredAccountRoom?.tfsa
        .startingAvailableRoom.amount,
    ).toBe(10000);
    expect(baseline.projectionInputs.contributionWaterfall).toMatchObject({
      mode: "canonical",
      routes: [
        {
          sourceAccountId: "plaid:2",
          destinationAccountIds: ["plaid:2"],
        },
      ],
    });
    expect(
      baseline.provenance[
        "registeredAccountRoom.tfsa.startingAvailableRoom.amount"
      ],
    ).toMatchObject({
      sourceType: "local_configuration",
      value: 10000,
    });
    expect(
      baseline.provenance[
        "registeredAccountRoom.rrsp.newRoom.earnedIncomeRate"
      ],
    ).toMatchObject({
      sourceType: "canadian_reference",
      value: 0.18,
    });
    expect(
      baseline.provenance[
        "contributionWaterfall.routes.0.destinationAccountIds"
      ]?.value,
    ).toEqual(["plaid:2"]);
  });

  it("blocks positive registered contributions when room is omitted", () => {
    const config = structuredClone(configFixture);
    delete config.registeredAccountRoom;
    expect(() =>
      deriveCurrentBaseline(
        config,
        lunchMoneyData(),
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("registeredAccountRoom is required");
  });

  it("normalizes omitted waterfall configuration visibly without inventing overflow", () => {
    const config = structuredClone(configFixture);
    delete config.contributionWaterfall;
    const baseline = deriveCurrentBaseline(
      config,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.contributionWaterfall).toEqual({
      mode: "fixed_source_compatibility",
      routes: [
        {
          sourceAccountId: "plaid:2",
          destinationAccountIds: ["plaid:2"],
        },
      ],
      surplusDestinationAccountIds: [],
    });
    expect(baseline.warnings).toContainEqual(
      expect.objectContaining({
        code: "contribution_waterfall_compatibility",
      }),
    );
  });

  it("retains reconciled category and account audit evidence without raw transactions", () => {
    const baseline = deriveCurrentBaseline(
      configFixture,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );
    const { income, essentialSpending, discretionarySpending } = baseline.cashFlowAudit;

    expect(income.breakdown).toEqual([
      expect.objectContaining({
        categoryName: "Pay",
        accountName: "Everyday cash",
        trailingTotal: 3000,
        monthlyAverage: 250,
        transactionCount: 1,
      }),
    ]);
    expect(
      essentialSpending.breakdown.reduce((total, row) => total + row.trailingTotal, 0),
    ).toBe(baseline.derived.essentialSpending.trailingTotal);
    expect(
      essentialSpending.breakdown.reduce((total, row) => total + row.monthlyAverage, 0),
    ).toBe(baseline.derived.essentialSpending.monthlyAverage);
    expect(
      discretionarySpending.breakdown.reduce((total, row) => total + row.trailingTotal, 0),
    ).toBe(baseline.derived.discretionarySpending.trailingTotal);
    expect(baseline.cashFlowAudit.investmentContributions.accounts).toEqual([
      expect.objectContaining({
        accountName: "TFSA",
        funding: "cash",
        source: "lunchmoney_derived",
        monthlyAverage: 20,
      }),
    ]);
    expect(baseline.cashFlowAudit.recurringExpenses.items).toEqual([
      expect.objectContaining({
        accountName: "Everyday cash",
        categoryName: "Needs",
        monthlyAmount: 100,
      }),
    ]);
    expect(income.breakdown[0]).not.toHaveProperty("transactionId");
  });

  it("excludes transfers, ignored categories, grouped parents, and excluded accounts", () => {
    const baseline = deriveCurrentBaseline(
      configFixture,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(baseline.derived.essentialSpending.trailingTotal).not.toBeGreaterThan(1000);
    expect(baseline.derived.monthlyIncome.trailingTotal).toBe(3000);
  });

  it("returns visible blocking details for unmapped accounts and required categories", () => {
    const incomplete = structuredClone(configFixture);
    delete incomplete.accountMappings["manual:3"];
    delete incomplete.categoryMappings["11"];
    try {
      deriveCurrentBaseline(incomplete, lunchMoneyData(), window, "2026-07-14T12:00:00.000Z");
      throw new Error("Expected configuration_required");
    } catch (error) {
      expect(error).toBeInstanceOf(PlannerRuntimeError);
      const runtimeError = error as PlannerRuntimeError;
      expect(runtimeError.code).toBe("configuration_required");
      expect(runtimeError.details.unmappedAccounts).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "manual:3", name: "Excluded" })]),
      );
      expect(runtimeError.details.unmappedCategories).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "11", name: "Wants" })]),
      );
    }
  });

  it("resolves explicit live-baseline employment and contribution phases to numbers", () => {
    const phased = structuredClone(configFixture);
    phased.employmentIncomePhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 42,
        annualNetCashToday: "live_baseline",
        annualGrowth: 0,
      },
      {
        id: "future",
        label: "Future",
        startAge: 42,
        endAge: 65,
        annualNetCashToday: 60000,
        annualGrowth: 0.01,
      },
    ];
    phased.accountMappings["plaid:2"]!.contributionPhases = [
      {
        id: "current",
        label: "Current",
        startAge: 40,
        endAge: 42,
        monthlyAmountToday: "live_baseline",
        funding: "income_withheld",
        indexingRate: 0,
      },
      {
        id: "future",
        label: "Future",
        startAge: 42,
        endAge: 65,
        monthlyAmountToday: 500,
        funding: "cash",
        indexingRate: 0.02,
      },
    ];

    const baseline = deriveCurrentBaseline(
      phased,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.person.employmentIncomePhases).toEqual([
      expect.objectContaining({ id: "current", annualNetCashToday: 3000 }),
      expect.objectContaining({ id: "future", annualNetCashToday: 60000 }),
    ]);
    expect(baseline.projectionInputs.accounts[1]!.contributionPhases).toEqual([
      expect.objectContaining({
        id: "current",
        monthlyAmountToday: 20,
        funding: "income_withheld",
      }),
      expect.objectContaining({
        id: "future",
        monthlyAmountToday: 500,
        funding: "cash",
      }),
    ]);
    expect(
      baseline.provenance[
        "person.employmentIncomePhases.current.annualNetCashToday"
      ]?.sourceType,
    ).toBe("lunchmoney_derived");
  });

  it("resolves dated Canadian references and explicit partial OAS eligibility", () => {
    const canonical = structuredClone(configFixture);
    delete canonical.cppStartAge;
    delete canonical.oasStartAge;
    delete canonical.cppMonthlyAmountAt65;
    delete canonical.oasMonthlyAmountAt65;
    delete canonical.assumptions.cppIndexing;
    delete canonical.assumptions.oasIndexing;
    canonical.governmentBenefits = {
      cpp: {
        startAge: 60,
        indexingRate: 0.02,
        amountAt65: { source: "canadian_reference" },
      },
      oas: {
        startAge: 70,
        indexingRate: 0.02,
        fullAmountAt65: { source: "canadian_reference" },
        eligibility: {
          mode: "partial",
          qualifyingResidenceYearsAfter18: 20,
        },
      },
    };

    const baseline = deriveCurrentBaseline(
      canonical,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.person.cpp).toMatchObject({
      startAge: 60,
      monthlyAmountAt65Today: 877.01,
    });
    expect(baseline.projectionInputs.person.oas).toMatchObject({
      startAge: 70,
      fullMonthlyAmountAt65Today: 751.97,
      eligibility: {
        mode: "partial",
        qualifyingResidenceYearsAfter18: 20,
        fraction: 0.5,
      },
      age75IncreaseRate: 0.1,
    });
    expect(
      baseline.provenance["person.cpp.monthlyAmountAt65Today"],
    ).toMatchObject({
      sourceType: "canadian_reference",
      effectiveDate: "2026-04-01",
      referenceKind: "population_average",
      referenceUrl: expect.stringContaining("canada.ca"),
    });
    expect(baseline.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "cpp_canadian_reference_in_use",
        "oas_canadian_reference_in_use",
      ]),
    );
  });

  it("keeps official CPP estimates distinct from configured OAS planning amounts", () => {
    const canonical = structuredClone(configFixture);
    delete canonical.cppStartAge;
    delete canonical.oasStartAge;
    delete canonical.cppMonthlyAmountAt65;
    delete canonical.oasMonthlyAmountAt65;
    delete canonical.assumptions.cppIndexing;
    delete canonical.assumptions.oasIndexing;
    canonical.governmentBenefits = {
      cpp: {
        startAge: 65,
        indexingRate: 0.02,
        amountAt65: {
          source: "official_estimate",
          monthlyAmountToday: 1111,
          effectiveDate: "2026-06-01",
        },
      },
      oas: {
        startAge: 65,
        indexingRate: 0.02,
        fullAmountAt65: {
          source: "configured_amount",
          monthlyAmountToday: 700,
          effectiveDate: "2026-06-01",
        },
        eligibility: { mode: "none" },
      },
    };

    const baseline = deriveCurrentBaseline(
      canonical,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.provenance["person.cpp.amountSourceMode"]?.value).toBe(
      "official_estimate",
    );
    expect(
      baseline.provenance["person.cpp.monthlyAmountAt65Today"]
        ?.sourceDescription,
    ).toContain("official CPP estimate");
    expect(
      baseline.provenance["person.oas.fullMonthlyAmountAt65Today"]
        ?.sourceDescription,
    ).toContain("not a personal entitlement");
    expect(baseline.projectionInputs.person.oas.eligibility).toEqual({
      mode: "none",
      qualifyingResidenceYearsAfter18: null,
      fraction: 0,
    });
    expect(
      baseline.warnings.some((warning) =>
        warning.code.includes("canadian_reference"),
      ),
    ).toBe(false);
  });

  it("keeps legacy zero benefit amounts at zero and emits migration warnings", () => {
    const legacyZero = structuredClone(configFixture);
    legacyZero.cppMonthlyAmountAt65 = 0;
    legacyZero.oasMonthlyAmountAt65 = 0;

    const baseline = deriveCurrentBaseline(
      legacyZero,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.person.cpp.monthlyAmountAt65Today).toBe(0);
    expect(
      baseline.projectionInputs.person.oas.fullMonthlyAmountAt65Today,
    ).toBe(0);
    expect(baseline.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        "legacy_zero_cpp_amount",
        "legacy_zero_oas_amount",
      ]),
    );
    expect(
      baseline.provenance["person.cpp.monthlyAmountAt65Today"]
        ?.sourceDescription,
    ).toContain("compatibility");
  });

  it("appends projection-only accounts at fixed zero with complete provenance and no imported baseline balance", () => {
    const configured = structuredClone(configFixture);
    configured.projectionAccounts = {
      "projection:future-taxable": {
        label: "Synthetic future taxable",
        type: "non_registered",
        annualReturn: 0.06,
        withdrawalPriority: 4,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
        contributionPhases: [],
      },
    };
    configured.surplusAllocation = {
      reserveAccountIds: ["manual:1"],
      reserveRefillAccountId: "manual:1",
      targetCashReserveToday: 5000,
      reserveIndexingRate: 0.02,
      excess: {
        mode: "allocate_to_account",
        destinationAccountId: "projection:future-taxable",
      },
    };

    const baseline = deriveCurrentBaseline(
      configured,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );
    const projectionAccount = baseline.projectionInputs.accounts.at(-1)!;

    expect(projectionAccount).toMatchObject({
      id: "projection:future-taxable",
      origin: "projection_configuration",
      openingBalance: 0,
      type: "non_registered",
      annualReturn: 0.06,
      contributionPhases: [],
    });
    expect(
      baseline.derived.accountBalances.some(
        (account) => account.id === projectionAccount.id,
      ),
    ).toBe(false);
    expect(
      baseline.provenance[
        "accounts.projection:future-taxable.openingBalance"
      ],
    ).toMatchObject({
      value: 0,
      sourceType: "local_configuration",
      sourceDescription: expect.stringContaining("not an imported balance"),
    });
    expect(
      baseline.provenance["accounts.projection:future-taxable.origin"]?.value,
    ).toBe("projection_configuration");
    expect(
      baseline.provenance[
        "surplusAllocation.excess.destinationAccountId"
      ]?.value,
    ).toBe("projection:future-taxable");
    expect(
      baseline.projectionInputs.accounts.slice(0, 2).map(({ origin }) => origin),
    ).toEqual(["lunchmoney", "lunchmoney"]);
  });

  it("resolves a valid imported non-registered excess destination", () => {
    const configured = structuredClone(configFixture);
    configured.accountMappings["plaid:2"]!.type = "non_registered";
    configured.surplusAllocation = {
      reserveAccountIds: ["manual:1"],
      reserveRefillAccountId: "manual:1",
      targetCashReserveToday: 5000,
      reserveIndexingRate: 0,
      excess: {
        mode: "allocate_to_account",
        destinationAccountId: "plaid:2",
      },
    };

    const baseline = deriveCurrentBaseline(
      configured,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(baseline.projectionInputs.surplusAllocation.excess).toEqual({
      mode: "allocate_to_account",
      destinationAccountId: "plaid:2",
    });
  });

  it("resolves every reserve account, the refill account, and their provenance", () => {
    const configured = structuredClone(configFixture);
    configured.accountMappings["manual:3"] = {
      include: true,
      type: "cash",
      withdrawalPriority: 3,
    };
    configured.surplusAllocation = {
      reserveAccountIds: ["manual:1", "manual:3"],
      reserveRefillAccountId: "manual:1",
      targetCashReserveToday: 5000,
      reserveIndexingRate: 0.02,
      excess: { mode: "retain_as_cash" },
    };

    const baseline = deriveCurrentBaseline(
      configured,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.surplusAllocation).toMatchObject({
      reserveAccountIds: ["manual:1", "manual:3"],
      reserveRefillAccountId: "manual:1",
    });
    expect(
      baseline.provenance["surplusAllocation.reserveAccountIds"]?.value,
    ).toEqual(["manual:1", "manual:3"]);
    expect(
      baseline.provenance["surplusAllocation.reserveRefillAccountId"]?.value,
    ).toBe("manual:1");
  });

  it("blocks missing, non-cash reserve, and missing or registered excess destinations", () => {
    const cases: Array<[string, (config: PlannerConfig) => void, string]> = [
      [
        "missing reserve",
        (config) => {
          config.surplusAllocation.reserveAccountIds = ["manual:missing"];
          config.surplusAllocation.reserveRefillAccountId =
            "manual:missing";
        },
        "Unknown surplusAllocation reserve account",
      ],
      [
        "non-cash reserve",
        (config) => {
          config.surplusAllocation.reserveAccountIds = ["plaid:2"];
          config.surplusAllocation.reserveRefillAccountId = "plaid:2";
        },
        "must be a cash account",
      ],
      [
        "missing destination",
        (config) => {
          config.surplusAllocation = {
            reserveAccountIds: ["manual:1"],
            reserveRefillAccountId: "manual:1",
            targetCashReserveToday: 0,
            reserveIndexingRate: 0,
            excess: {
              mode: "allocate_to_account",
              destinationAccountId: "manual:missing",
            },
          };
        },
        "Unknown surplusAllocation excess destination",
      ],
      [
        "TFSA destination",
        (config) => {
          config.surplusAllocation = {
            reserveAccountIds: ["manual:1"],
            reserveRefillAccountId: "manual:1",
            targetCashReserveToday: 0,
            reserveIndexingRate: 0,
            excess: {
              mode: "allocate_to_account",
              destinationAccountId: "plaid:2",
            },
          };
        },
        "must be a non-registered account",
      ],
      [
        "RRSP destination",
        (config) => {
          config.accountMappings["plaid:2"]!.type = "rrsp";
          config.surplusAllocation = {
            reserveAccountIds: ["manual:1"],
            reserveRefillAccountId: "manual:1",
            targetCashReserveToday: 0,
            reserveIndexingRate: 0,
            excess: {
              mode: "allocate_to_account",
              destinationAccountId: "plaid:2",
            },
          };
        },
        "must be a non-registered account",
      ],
      [
        "debt destination",
        (config) => {
          config.accountMappings["plaid:2"]!.type = "debt";
          config.surplusAllocation = {
            reserveAccountIds: ["manual:1"],
            reserveRefillAccountId: "manual:1",
            targetCashReserveToday: 0,
            reserveIndexingRate: 0,
            excess: {
              mode: "allocate_to_account",
              destinationAccountId: "plaid:2",
            },
          };
        },
        "must be a non-registered account",
      ],
    ];

    for (const [, mutate, message] of cases) {
      const configured = structuredClone(configFixture);
      mutate(configured);
      expect(() =>
        deriveCurrentBaseline(
          configured,
          lunchMoneyData(),
          window,
          "2026-07-14T12:00:00.000Z",
        ),
      ).toThrow(message);
    }
  });
});
