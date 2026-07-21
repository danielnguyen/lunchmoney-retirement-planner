import type {
  Category,
  ChildCategory,
  ManualAccount,
  PlaidAccount,
  RecurringItem,
  Transaction,
} from "@lunch-money/lunch-money-js-v2";
import { describe, expect, it } from "vitest";
import type { PlannerConfig } from "@/src/config/types";
import { deriveCurrentBaseline } from "@/src/domain/baseline/derive";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { buildBalanceSheetReconciliation } from "@/src/domain/projection/presentation";
import type { LunchMoneyData } from "@/src/integrations/lunchmoney/read-service";
import { PlannerRuntimeError } from "@/src/runtime/errors";

const configFixture: PlannerConfig = {
  configurationMode: "advanced",
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
    expect(baseline.projectionInputs.spendingPhases).toEqual([
      {
        id: "compatibility-full-projection",
        label: "Historical full-projection spending",
        startAge: 40,
        endAge: 95,
        essentialMultiplier: 1,
        discretionaryMultiplier: 1,
        source: "compatibility_default",
      },
    ]);
    expect(
      baseline.provenance[
        "spendingPhases.compatibility-full-projection.source"
      ],
    ).toMatchObject({
      value: "compatibility_default",
      sourceType: "local_configuration",
      sourceDescription: expect.stringContaining("Backward-compatible"),
    });
    expect(baseline.projectionInputs.accounts[1]!.contributionPhases).toEqual([
      expect.objectContaining({
        id: "legacy-current-contribution",
        monthlyAmountToday: 20,
        funding: "cash",
        indexingRate: 0.02,
      }),
    ]);
    expect(baseline.recordsAnalyzed.transactions).toBe(8);
    expect(baseline.schemaVersion).toBe("1.9");
    expect(baseline.warnings).toContainEqual(
      expect.objectContaining({ code: "long_live_baseline_income" }),
    );
  });

  it("keeps live spending evidence separate from configured lifestyle multipliers", () => {
    const config = structuredClone(configFixture);
    config.spendingPhases = [
      {
        id: "synthetic-current-lifestyle",
        label: "Synthetic current lifestyle",
        startAge: 40,
        endAge: 65,
        essentialMultiplier: 1,
        discretionaryMultiplier: 1,
      },
      {
        id: "synthetic-retirement-lifestyle",
        label: "Synthetic retirement lifestyle",
        startAge: 65,
        endAge: 95,
        essentialMultiplier: 1,
        discretionaryMultiplier: 0.6,
      },
    ];
    const baseline = deriveCurrentBaseline(
      config,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.projectionInputs.spendingPhases[1]).toMatchObject({
      discretionaryMultiplier: 0.6,
      source: "explicit_configuration",
    });
    expect(
      baseline.provenance[
        "spendingPhases.synthetic-retirement-lifestyle.discretionaryMultiplier"
      ],
    ).toMatchObject({
      value: 0.6,
      sourceType: "local_configuration",
    });
    expect(
      baseline.provenance.monthlyDiscretionarySpendingToday,
    ).toMatchObject({
      sourceType: "lunchmoney_derived",
    });
  });

  it("emits deterministic UI-safe Lunch Money account and category mapping references", () => {
    const config = structuredClone(configFixture);
    config.accountMappings.cash = { include: false, type: "exclude" };
    const data = lunchMoneyData();
    data.manualAccounts[0] = {
      ...data.manualAccounts[0]!,
      name: "Synthetic manual fallback",
      display_name: "Synthetic manual display",
      institution_name: "Synthetic manual institution",
    } as ManualAccount;
    data.manualAccounts[1] = {
      ...data.manualAccounts[1]!,
      institution_name: data.manualAccounts[1]!.name,
    } as ManualAccount;
    data.plaidAccounts[0] = {
      ...data.plaidAccounts[0]!,
      name: "Synthetic Plaid fallback",
      display_name: null,
      institution_name: "Synthetic Plaid institution",
    } as PlaidAccount;
    const child = {
      ...category(21, "Synthetic child category", true),
      description: "Synthetic child description",
      group_id: 20,
    } as ChildCategory;
    data.categories.push({
      ...category(20, "Synthetic parent category", true),
      description: "Synthetic parent description",
      is_group: true,
      children: [child],
    });
    data.transactions.push(transaction(10, 0, 13, {}));

    const baseline = deriveCurrentBaseline(
      config,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.schemaVersion).toBe("1.9");
    expect(baseline.lunchMoneyMappings.accounts).toEqual([
      {
        mappingId: "manual:1",
        lunchMoneyId: 1,
        source: "manual",
        label: "Synthetic manual display",
        description: "Synthetic manual institution",
      },
      {
        mappingId: "manual:3",
        lunchMoneyId: 3,
        source: "manual",
        label: "Excluded",
        description: null,
      },
      {
        mappingId: "plaid:2",
        lunchMoneyId: 2,
        source: "plaid",
        label: "Synthetic Plaid fallback",
        description: "Synthetic Plaid institution",
      },
      {
        mappingId: "cash",
        lunchMoneyId: null,
        source: "cash",
        label: "Cash transactions",
        description: null,
      },
    ]);
    expect(baseline.lunchMoneyMappings.categories).toEqual(
      expect.arrayContaining([
        {
          mappingId: "20",
          lunchMoneyId: 20,
          name: "Synthetic parent category",
          description: "Synthetic parent description",
        },
        {
          mappingId: "21",
          lunchMoneyId: 21,
          name: "Synthetic child category",
          description: "Synthetic child description",
        },
      ]),
    );
    expect(
      baseline.lunchMoneyMappings.categories.map(({ lunchMoneyId }) => lunchMoneyId),
    ).toEqual([10, 11, 12, 13, 14, 15, 20, 21]);
  });

  it("resolves registered room, waterfall routes, and material provenance", () => {
    const baseline = deriveCurrentBaseline(
      configFixture,
      lunchMoneyData(),
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.schemaVersion).toBe("1.9");
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

  it("separates liabilities from financial accounts and replaces mapped historical debt payments once", () => {
    const config = structuredClone(configFixture);
    config.accountMappings["manual:3"] = {
      include: true,
      type: "debt",
      roles: ["primary_mortgage"],
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: { amount: 100, frequency: "monthly" },
        scheduleStartDate: "2026-01-01",
        lumpSumPayments: [],
      },
    };
    config.primaryResidence = {
      currentValue: 500000,
      asOf: "2026-07-01",
      annualAppreciation: 0.02,
    };
    config.categoryMappings["16"] = {
      classification: "debt_payment",
      liabilityId: "manual:3",
    };
    const data = lunchMoneyData();
    data.categories.push(category(16, "Synthetic debt payment"));
    const debtTransaction = data.transactions.find(
      (item) => item.id === 8,
    )!;
    debtTransaction.category_id = 16;
    data.transactions.push(
      transaction(10, -999, 16, { manual: 3 }),
    );

    const baseline = deriveCurrentBaseline(
      config,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(
      baseline.projectionInputs.accounts.some(
        (account) => account.id === "manual:3",
      ),
    ).toBe(false);
    expect(baseline.projectionInputs.liabilities).toEqual([
      expect.objectContaining({
        id: "manual:3",
        openingBalance: 999,
        role: "primary_mortgage",
        historicalPaymentHandling: "category_mapped",
        treatment: expect.objectContaining({
          mode: "amortizing",
          interestRateConvention: "canadian_mortgage",
        }),
      }),
    ]);
    expect(baseline.projectionInputs.nonFinancialAssets).toEqual([
      expect.objectContaining({
        type: "primary_residence",
        openingValue: 500000,
        availableForWithdrawals: false,
      }),
    ]);
    expect(baseline.derived.essentialSpending.trailingTotal).toBe(1000);
    expect(baseline.derived.debtPayments).toMatchObject({
      trailingTotal: 999,
      transactionCount: 1,
    });
    expect(
      baseline.cashFlowAudit.debtPayments.liabilities[0],
    ).toMatchObject({
      liabilityId: "manual:3",
      liabilityRole: "primary_mortgage",
      scheduleReplaced: true,
    });
    expect(baseline.warnings).toContainEqual(
      expect.objectContaining({ code: "liability_payment_mismatch" }),
    );
    expect(
      baseline.provenance["liabilities.manual:3.openingBalance"],
    ).toMatchObject({
      value: 999,
      sourceType: "lunchmoney_derived",
    });
    expect(
      baseline.provenance[
        "liabilities.manual:3.treatment.interestRateConvention"
      ],
    ).toMatchObject({
      value: "canadian_mortgage",
      sourceType: "local_configuration",
    });
    expect(
      baseline.provenance[
        "nonFinancialAssets.primaryResidence.annualAppreciation"
      ],
    ).toMatchObject({
      value: 0.02,
      sourceType: "local_configuration",
    });
  });

  it("imports the residence and matches mortgage payments before a shared spending category", () => {
    const config = structuredClone(configFixture);
    config.accountMappings["manual:3"] = {
      include: true,
      type: "debt",
      roles: ["primary_mortgage"],
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: { amount: 1000, frequency: "monthly" },
        scheduleStartDate: "2026-01-01",
        lumpSumPayments: [],
        historicalPayment: {
          mode: "payee_and_source_account",
          sourceAccountId: "manual:1",
          payee: "Synthetic Mortgage Payment",
        },
      },
    };
    config.accountMappings["manual:4"] = {
      include: true,
      type: "real_estate",
      roles: ["primary_residence"],
      annualAppreciation: 0.02,
    };
    const data = lunchMoneyData();
    data.manualAccounts.push({
      id: 4,
      name: "Synthetic residence",
      display_name: "Synthetic primary residence",
      to_base: 500000,
      status: "active",
      balance_as_of: "2026-07-09T00:00:00Z",
    } as ManualAccount);
    data.transactions = data.transactions.filter(
      (item) => item.id !== 8,
    );
    data.transactions.push(
      transaction(20, 900, 10, { manual: 1 }, {
        date: "2026-05-28",
        payee: "synthetic mortgage payment",
      }),
      transaction(21, 1100, 10, { manual: 1 }, {
        date: "2026-06-30",
        payee: "  Synthetic   Mortgage Payment  ",
      }),
      transaction(22, 250, 10, { manual: 1 }, {
        payee: "Synthetic home repair",
      }),
      transaction(23, 75, 10, { plaid: 2 }, {
        payee: "Synthetic Mortgage Payment",
      }),
      transaction(24, 50, 10, { manual: 1 }, {
        payee: "Mortgage Payment",
      }),
      transaction(25, -1100, 13, { manual: 1 }, {
        payee: "Synthetic Mortgage Payment",
      }),
    );
    data.recurringItems.push({
      ...data.recurringItems[0]!,
      id: 51,
      description: "Synthetic mortgage recurring item",
      transaction_criteria: {
        ...data.recurringItems[0]!.transaction_criteria,
        payee: "SYNTHETIC MORTGAGE PAYMENT",
        to_base: 1000,
      },
      overrides: { category_id: 10 },
    } as RecurringItem);

    const baseline = deriveCurrentBaseline(
      config,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );

    expect(baseline.schemaVersion).toBe("1.9");
    expect(baseline.projectionInputs.nonFinancialAssets).toEqual([
      expect.objectContaining({
        id: "manual:4",
        origin: "lunchmoney",
        openingValue: 500000,
        valueAsOf: "2026-07-09",
        annualAppreciation: 0.02,
        availableForWithdrawals: false,
      }),
    ]);
    expect(
      baseline.projectionInputs.accounts.some(
        (account) => account.id === "manual:4",
      ),
    ).toBe(false);
    expect(baseline.derived.nonFinancialAssetBalances).toEqual([
      expect.objectContaining({
        id: "manual:4",
        plannerType: "real_estate",
        value: 500000,
      }),
    ]);
    expect(baseline.projectionInputs.liabilities[0]).toMatchObject({
      id: "manual:3",
      historicalPaymentHandling: "payee_and_source_account",
      historicalMonthlyAverage: 166.67,
    });
    expect(baseline.derived.debtPayments).toMatchObject({
      trailingTotal: 2000,
      transactionCount: 2,
    });
    expect(baseline.derived.essentialSpending).toMatchObject({
      // Existing broad-category spending is 1,000. The exact-source/payee
      // mortgage records are removed, while unrelated same-category records
      // remain 250 + 75 + 50.
      trailingTotal: 1375,
      transactionCount: 5,
    });
    expect(baseline.derived.recurringExpenses.count).toBe(1);
    expect(baseline.warnings).toContainEqual(
      expect.objectContaining({
        code: "liability_payment_mismatch",
      }),
    );
    expect(
      baseline.provenance[
        "nonFinancialAssets.manual:4.openingValue"
      ],
    ).toMatchObject({
      sourceType: "lunchmoney_derived",
      value: 500000,
    });

    const projection = calculateProjection(
      baseline.projectionInputs,
    );
    expect(
      projection.annual[0]!.nominal.liabilitySchedules["manual:3"]!
        .regularPayment,
    ).toBeGreaterThan(0);
    for (const mode of ["nominal", "real"] as const) {
      expect(
        buildBalanceSheetReconciliation(projection, mode).matched,
      ).toBe(true);
    }
  });

  it("rejects ambiguous mortgage-history handling and unresolved matcher sources", () => {
    const configured = structuredClone(configFixture);
    configured.accountMappings["manual:3"] = {
      include: true,
      type: "debt",
      roles: ["primary_mortgage"],
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: { amount: 100, frequency: "monthly" },
        scheduleStartDate: "2026-01-01",
        lumpSumPayments: [],
        historicalPayment: {
          mode: "payee_and_source_account",
          sourceAccountId: "manual:1",
          payee: "Synthetic mortgage payment",
        },
      },
    };
    configured.primaryResidence = {
      currentValue: 500000,
      asOf: "2026-07-01",
      annualAppreciation: 0,
    };
    configured.categoryMappings["16"] = {
      classification: "debt_payment",
      liabilityId: "manual:3",
    };
    const data = lunchMoneyData();
    data.categories.push(category(16, "Synthetic debt"));
    expect(() =>
      deriveCurrentBaseline(
        configured,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("exactly one historical-payment handling source");

    delete configured.categoryMappings["16"];
    const liability =
      configured.accountMappings["manual:3"]!.liability;
    if (!liability || liability.mode !== "amortizing") {
      throw new Error("Synthetic liability must amortize");
    }
    liability.historicalPayment = {
      mode: "payee_and_source_account",
      sourceAccountId: "manual:synthetic-missing",
      payee: "Synthetic mortgage payment",
    };
    expect(() =>
      deriveCurrentBaseline(
        configured,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("must resolve to exactly one included financial account");

    liability.historicalPayment = {
      mode: "payee_and_source_account",
      sourceAccountId: "1",
      payee: "Synthetic mortgage payment",
    };
    configured.accountMappings["plaid:1"] = {
      include: true,
      type: "cash",
      withdrawalPriority: 9,
    };
    data.plaidAccounts.push({
      id: 1,
      name: "Synthetic second source",
      display_name: null,
      to_base: 100,
      status: "active",
      balance_last_update: "2026-07-11T00:00:00Z",
    } as PlaidAccount);
    expect(() =>
      deriveCurrentBaseline(
        configured,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("must resolve to exactly one included financial account");
  });

  it("rejects a negative imported real-estate balance", () => {
    const config = structuredClone(configFixture);
    config.accountMappings["manual:3"] = {
      include: true,
      type: "real_estate",
      roles: ["primary_residence"],
      annualAppreciation: 0,
    };
    const data = lunchMoneyData();
    data.manualAccounts.find((account) => account.id === 3)!.to_base =
      -1;

    expect(() =>
      deriveCurrentBaseline(
        config,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("must have a non-negative imported balance");
  });

  it.each([
    ["monthly", 12],
    ["semimonthly", 24],
    ["biweekly", 26],
    ["weekly", 52],
  ] as const)(
    "converts a %s liability payment to the resolved monthly equivalent",
    (frequency, paymentsPerYear) => {
      const config = structuredClone(configFixture);
      config.accountMappings["manual:3"] = {
        include: true,
        type: "debt",
        liability: {
          mode: "amortizing",
          annualInterestRate: 0,
          interestRateConvention: "effective_annual",
          regularPayment: { amount: 100, frequency },
          scheduleStartDate: "2026-01-01",
          lumpSumPayments: [],
          historicalPaymentHandling: "already_excluded_or_transfer",
        },
      };

      const baseline = deriveCurrentBaseline(
        config,
        lunchMoneyData(),
        window,
        "2026-07-14T12:00:00.000Z",
      );
      const treatment =
        baseline.projectionInputs.liabilities[0]!.treatment;
      if (treatment.mode !== "amortizing") {
        throw new Error("Synthetic liability must amortize");
      }

      expect(treatment.regularPayment.amount).toBe(100);
      expect(treatment.regularPayment.frequency).toBe(frequency);
      expect(treatment.regularPayment.monthlyEquivalent).toBeCloseTo(
        (100 * paymentsPerYear) / 12,
        8,
      );
    },
  );

  it("uses the selected convention when validating first-month liability interest", () => {
    const data = lunchMoneyData();
    data.manualAccounts.find((account) => account.id === 3)!.to_base =
      100000;
    const effective = structuredClone(configFixture);
    effective.accountMappings["manual:3"] = {
      include: true,
      type: "debt",
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.12,
        interestRateConvention: "effective_annual",
        regularPayment: { amount: 960, frequency: "monthly" },
        scheduleStartDate: "2026-01-01",
        lumpSumPayments: [],
        historicalPaymentHandling: "already_excluded_or_transfer",
      },
    };
    const effectiveBaseline = deriveCurrentBaseline(
      effective,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(
      effectiveBaseline.projectionInputs.liabilities[0]!.treatment,
    ).toMatchObject({
      mode: "amortizing",
      interestRateConvention: "effective_annual",
    });

    const canadian = structuredClone(effective);
    const treatment =
      canadian.accountMappings["manual:3"]!.liability;
    if (!treatment || treatment.mode !== "amortizing") {
      throw new Error("Synthetic liability must amortize");
    }
    treatment.interestRateConvention = "canadian_mortgage";
    expect(() =>
      deriveCurrentBaseline(
        canadian,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("cannot cover the first projected month's interest");
  });

  it("blocks untreated positive debt and missing historical-payment handling, while zero debt remains zero", () => {
    const data = lunchMoneyData();
    const untreated = structuredClone(configFixture);
    untreated.accountMappings["manual:3"] = {
      include: true,
      type: "debt",
    };
    expect(() =>
      deriveCurrentBaseline(
        untreated,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("requires an explicit liability treatment");

    const noHistory = structuredClone(untreated);
    noHistory.accountMappings["manual:3"]!.liability = {
      mode: "payoff_at_projection_start",
    };
    expect(() =>
      deriveCurrentBaseline(
        noHistory,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("needs exactly one historical-payment handling source");

    const zeroData = lunchMoneyData();
    zeroData.manualAccounts.find((account) => account.id === 3)!.to_base =
      0;
    const zero = deriveCurrentBaseline(
      untreated,
      zeroData,
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(zero.projectionInputs.liabilities[0]).toMatchObject({
      id: "manual:3",
      openingBalance: 0,
      treatment: { mode: "zero_balance" },
      historicalPaymentHandling: "not_applicable",
    });
  });

  it("compiles the simple owner policy into one authoritative resolved model and creates a future taxable account", () => {
    const config = structuredClone(configFixture);
    config.configurationMode = "simple";
    delete config.surplusAllocation;
    delete config.registeredAccountRoom;
    delete config.contributionWaterfall;
    config.accountMappings = {
      "manual:1": {
        include: true,
        type: "cash",
        roles: ["operating_cash", "reserve_member"],
        withdrawalPriority: 1,
      },
      "manual:4": {
        include: true,
        type: "cash",
        roles: ["reserve_member", "reserve_refill"],
        withdrawalPriority: 2,
      },
      "plaid:2": {
        include: true,
        type: "tfsa",
        roles: ["personal_tfsa"],
        withdrawalPriority: 3,
      },
      "plaid:5": {
        include: true,
        type: "rrsp",
        roles: ["personal_rrsp"],
        withdrawalPriority: 4,
      },
      "plaid:6": {
        include: true,
        type: "rrsp",
        roles: ["workplace_rrsp"],
        withdrawalPriority: 5,
      },
      "manual:3": {
        include: true,
        type: "debt",
        liability: {
          mode: "payoff_at_projection_start",
          historicalPaymentHandling: "already_excluded_or_transfer",
        },
      },
    };
    config.categoryMappings["14"] = "transfer";
    config.employmentIncomePhases = [
      {
        id: "working",
        label: "Working",
        startAge: 40,
        endAge: 65,
        annualNetCashToday: "live_baseline",
        annualGrowth: 0.02,
        rrspRoom: {
          eligibleEarnedIncomeToday: 80000,
          pensionAdjustmentToday: 4000,
          otherReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
    ];
    config.registeredRoom = {
      tfsa: { availableAtStart: 12000, asOf: "2026-07-01" },
      rrsp: {
        availableAtStart: 18000,
        asOf: "2026-07-01",
        currentYearBeforePlanStart: {
          eligibleEarnedIncome: 50000,
          pensionAdjustment: 4000,
          otherReduction: 0,
        },
      },
    };
    config.savingsPolicy = {
      unplannedCash: "retain_in_operating_cash",
      personalInvesting: {
        order: ["personal_tfsa", "personal_rrsp", "taxable"],
        phases: [
          {
            id: "personal",
            label: "Personal saving",
            startAge: 40,
            endAge: 65,
            monthlyAmountToday: 500,
            indexingRate: 0,
          },
        ],
      },
      reserveBuilding: {
        targetToday: 10000,
        indexingRate: 0.02,
        phases: [
          {
            id: "reserve",
            label: "Reserve saving",
            startAge: 40,
            endAge: 45,
            monthlyAmountToday: 300,
            indexingRate: 0,
          },
        ],
        afterTarget: "personal_investing",
      },
      workplaceRrsp: {
        roomPriority: "first",
        overflow: "unallocated",
        phases: [
          {
            id: "workplace",
            label: "Workplace saving",
            startAge: 40,
            endAge: 65,
            monthlyAmountToday: 800,
            indexingRate: 0,
          },
        ],
      },
    };

    const data = lunchMoneyData();
    data.manualAccounts.push({
      id: 4,
      name: "Reserve",
      display_name: "Reserve",
      to_base: 2500,
      status: "active",
      balance_as_of: "2026-07-10T00:00:00Z",
    } as ManualAccount);
    data.plaidAccounts.push(
      {
        id: 5,
        name: "Personal retirement",
        display_name: "Personal RRSP",
        to_base: 4000,
        status: "active",
        balance_last_update: "2026-07-11T00:00:00Z",
      } as PlaidAccount,
      {
        id: 6,
        name: "Workplace retirement",
        display_name: "Workplace RRSP",
        to_base: 6000,
        status: "active",
        balance_last_update: "2026-07-11T00:00:00Z",
      } as PlaidAccount,
    );

    const baseline = deriveCurrentBaseline(
      config,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );
    const inputs = baseline.projectionInputs;
    const taxable = inputs.accounts.find(
      (account) => account.id === "projection:future-taxable",
    )!;

    expect(inputs.savingsPolicy).toMatchObject({
      mode: "simple",
      operatingCashAccountId: "manual:1",
      reserveAccountIds: ["manual:1", "manual:4"],
      reserveRefillAccountId: "manual:4",
      personalTfsaAccountId: "plaid:2",
      personalRrspAccountId: "plaid:5",
      workplaceRrspAccountId: "plaid:6",
      taxableAccountId: "projection:future-taxable",
      taxableAccountOrigin: "projection_configuration",
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
    });
    expect(taxable).toMatchObject({
      origin: "projection_configuration",
      openingBalance: 0,
      type: "non_registered",
      annualReturn: config.assumptions.nonRegisteredReturn,
      allocation: config.assumptions.allocations.non_registered,
      contributionPhases: [],
      withdrawalPriority: 6,
    });
    expect(
      baseline.derived.accountBalances.some(
        (account) => account.id === taxable.id,
      ),
    ).toBe(false);
    expect(inputs.contributionWaterfall).toEqual({
      mode: "simple_policy",
      routes: [
        {
          sourceAccountId: "plaid:6",
          destinationAccountIds: ["plaid:6"],
        },
        {
          sourceAccountId: "plaid:2",
          destinationAccountIds: [
            "plaid:2",
            "plaid:5",
            "projection:future-taxable",
          ],
        },
      ],
      surplusDestinationAccountIds: [
        "plaid:2",
        "plaid:5",
        "projection:future-taxable",
      ],
    });
    expect(inputs.registeredAccountRoom).toMatchObject({
      tfsa: {
        startingAvailableRoom: {
          amount: 12000,
          source: "configured_amount",
        },
        carryForwardUnusedRoom: true,
        withdrawalRoomRecredit: "next_calendar_year",
      },
      rrsp: {
        startingAvailableDeductionRoom: {
          amount: 18000,
          source: "configured_amount",
        },
        carryForwardUnusedRoom: true,
      },
    });
    expect(
      baseline.provenance["accounts.projection:future-taxable.openingBalance"],
    ).toMatchObject({
      value: 0,
      sourceDescription: expect.stringContaining("not an imported balance"),
    });
    expect(
      baseline.provenance["accounts.manual:1.roles"]?.value,
    ).toEqual(["operating_cash", "reserve_member"]);

    const sweepConfig = structuredClone(config);
    sweepConfig.savingsPolicy!.operatingCash = {
      targetToday: 6000,
      indexingRate: 0.02,
    };
    sweepConfig.savingsPolicy!.unplannedCash = "sweep_above_targets";
    const sweepBaseline = deriveCurrentBaseline(
      sweepConfig,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(sweepBaseline.projectionInputs.savingsPolicy).toMatchObject({
      mode: "simple",
      operatingCashTarget: { targetToday: 6000, indexingRate: 0.02 },
      unplannedCash: "sweep_above_targets",
    });
    expect(
      sweepBaseline.provenance["savingsPolicy.operatingCash.targetToday"],
    ).toMatchObject({ value: 6000, sourceType: "local_configuration" });

    const independentTargets = structuredClone(sweepConfig);
    independentTargets.accountMappings["manual:1"]!.roles = [
      "operating_cash",
    ];
    const independentBaseline = deriveCurrentBaseline(
      independentTargets,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    );
    expect(
      independentBaseline.projectionInputs.savingsPolicy,
    ).toMatchObject({
      operatingCashAccountId: "manual:1",
      reserveAccountIds: ["manual:4"],
      reserveRefillAccountId: "manual:4",
    });

    const missingSweepTarget = structuredClone(sweepConfig);
    delete missingSweepTarget.savingsPolicy!.operatingCash;
    expect(() =>
      deriveCurrentBaseline(
        missingSweepTarget,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow("requires an explicit operating cash target");

    delete config.registeredRoom!.rrsp.currentYearBeforePlanStart;
    expect(() =>
      deriveCurrentBaseline(
        config,
        data,
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow(
      "currentYearBeforePlanStart is required when the live projection starts from February through December",
    );

    const januaryData = structuredClone(data);
    januaryData.transactions = januaryData.transactions.map(
      (transactionValue) => ({
        ...transactionValue,
        date: transactionValue.date.replace("2026-07-", "2026-01-"),
      }),
    );
    const january = deriveCurrentBaseline(
      config,
      januaryData,
      {
        startDate: "2025-01-14",
        endDate: "2026-01-14",
        trailingMonths: 12,
      },
      "2026-01-14T12:00:00.000Z",
    );
    expect(
      january.projectionInputs.registeredAccountRoom?.rrsp.newRoom
        .startYearBeforeProjectionMonth,
    ).toEqual({
      calendarYear: 2026,
      eligibleEarnedIncome: 0,
      pensionAdjustment: 0,
      otherRoomReduction: 0,
    });
  });

  it("uses a real personal-taxable role without creating the projected replacement", () => {
    const config = structuredClone(configFixture);
    config.configurationMode = "simple";
    delete config.surplusAllocation;
    delete config.registeredAccountRoom;
    delete config.contributionWaterfall;
    config.accountMappings["manual:1"]!.roles = [
      "operating_cash",
      "reserve_member",
      "reserve_refill",
    ];
    config.accountMappings["plaid:2"]!.roles = ["personal_tfsa"];
    config.accountMappings["plaid:5"] = {
      include: true,
      type: "rrsp",
      roles: ["personal_rrsp"],
      withdrawalPriority: 3,
    };
    config.accountMappings["plaid:6"] = {
      include: true,
      type: "rrsp",
      roles: ["workplace_rrsp"],
      withdrawalPriority: 4,
    };
    config.accountMappings["plaid:7"] = {
      include: true,
      type: "non_registered",
      roles: ["personal_taxable"],
      withdrawalPriority: 5,
    };
    config.categoryMappings["14"] = "transfer";
    config.employmentIncomePhases = [
      {
        id: "working",
        label: "Working",
        startAge: 40,
        endAge: 65,
        annualNetCashToday: 60000,
        annualGrowth: 0,
        rrspRoom: {
          eligibleEarnedIncomeToday: 80000,
          pensionAdjustmentToday: 0,
          otherReductionToday: 0,
          annualGrowth: 0,
        },
      },
    ];
    config.registeredRoom = {
      tfsa: { availableAtStart: 0, asOf: "2026-07-01" },
      rrsp: {
        availableAtStart: 0,
        asOf: "2026-07-01",
        currentYearBeforePlanStart: {
          eligibleEarnedIncome: 0,
          pensionAdjustment: 0,
          otherReduction: 0,
        },
      },
    };
    config.savingsPolicy = {
      unplannedCash: "retain_in_operating_cash",
      personalInvesting: {
        order: ["personal_tfsa", "personal_rrsp", "taxable"],
        phases: [],
      },
      reserveBuilding: {
        targetToday: 0,
        indexingRate: 0,
        phases: [],
        afterTarget: "personal_investing",
      },
      workplaceRrsp: {
        roomPriority: "first",
        overflow: "unallocated",
        phases: [],
      },
    };
    const data = lunchMoneyData();
    data.plaidAccounts.push(
      { id: 5, name: "P", to_base: 0, status: "active" } as PlaidAccount,
      { id: 6, name: "W", to_base: 0, status: "active" } as PlaidAccount,
      { id: 7, name: "T", to_base: 0, status: "active" } as PlaidAccount,
    );

    const inputs = deriveCurrentBaseline(
      config,
      data,
      window,
      "2026-07-14T12:00:00.000Z",
    ).projectionInputs;
    expect(inputs.accounts.some(({ id }) => id === "projection:future-taxable")).toBe(false);
    expect(inputs.savingsPolicy).toMatchObject({
      mode: "simple",
      taxableAccountId: "plaid:7",
      taxableAccountOrigin: "lunchmoney",
    });
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

  it("blocks missing RRSP generation when RRSP is reachable only by overflow or surplus", () => {
    const projectionRrsp = {
      label: "Synthetic future RRSP",
      type: "rrsp" as const,
      annualReturn: 0.05,
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    };

    const overflow = structuredClone(configFixture);
    overflow.projectionAccounts = {
      "projection:future-rrsp": projectionRrsp,
    };
    overflow.contributionWaterfall!.routes[0]!.destinationAccountIds.push(
      "projection:future-rrsp",
    );
    expect(() =>
      deriveCurrentBaseline(
        overflow,
        lunchMoneyData(),
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow(
      "rrspRoomGeneration is required whenever RRSP/RRIF can receive contributions",
    );

    const surplusOnly = structuredClone(configFixture);
    surplusOnly.projectionAccounts = {
      "projection:future-rrsp": projectionRrsp,
    };
    surplusOnly.contributionWaterfall!.surplusDestinationAccountIds = [
      "projection:future-rrsp",
    ];
    surplusOnly.surplusAllocation!.excess = {
      mode: "allocate_through_contribution_waterfall",
    };
    expect(() =>
      deriveCurrentBaseline(
        surplusOnly,
        lunchMoneyData(),
        window,
        "2026-07-14T12:00:00.000Z",
      ),
    ).toThrow(
      "rrspRoomGeneration is required whenever RRSP/RRIF can receive contributions",
    );
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
          config.surplusAllocation!.reserveAccountIds = ["manual:missing"];
          config.surplusAllocation!.reserveRefillAccountId =
            "manual:missing";
        },
        "Unknown surplusAllocation reserve account",
      ],
      [
        "non-cash reserve",
        (config) => {
          config.surplusAllocation!.reserveAccountIds = ["plaid:2"];
          config.surplusAllocation!.reserveRefillAccountId = "plaid:2";
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
          config.accountMappings["plaid:2"]!.liability = {
            mode: "payoff_at_projection_start",
            historicalPaymentHandling: "already_excluded_or_transfer",
          };
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
