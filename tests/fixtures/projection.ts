import type {
  BaselineExportContext,
  CurrentBaseline,
} from "@/src/domain/baseline/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";

export const projectionFixture: ProjectionInputs = {
  startDate: "2026-07-14",
  endAge: 95,
  annualInflation: 0.02,
  monthlyEssentialSpendingToday: 3200,
  monthlyDiscretionarySpendingToday: 800,
  retirementGoalToday: 900000,
  tax: {
    effectiveTaxRate: 0.2,
    oasRecoveryThresholdToday: 90000,
    oasRecoveryRate: 0.15,
  },
  person: {
    currentAge: 40,
    retirementAge: 65,
    annualEmploymentNetCashToday: 84000,
    annualIncomeGrowth: 0.02,
    annualPensionToday: 0,
    pensionStartAge: 65,
    pensionIndexingRate: 0.02,
    cpp: { startAge: 65, monthlyAmountAt65Today: 1200, indexingRate: 0.02 },
    oas: { startAge: 65, monthlyAmountAt65Today: 700, indexingRate: 0.02 },
    rrifConversionAge: 71,
  },
  accounts: [
    {
      id: "manual:1",
      label: "Cash account",
      type: "cash",
      openingBalance: 20000,
      annualReturn: 0.02,
      monthlyContributionToday: 0,
      contributionIndexingRate: 0,
      withdrawalPriority: 1,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    },
    {
      id: "manual:2",
      label: "Investment account",
      type: "rrsp_rrif",
      openingBalance: 180000,
      annualReturn: 0.05,
      monthlyContributionToday: 1000,
      contributionFunding: "cash",
      contributionIndexingRate: 0.02,
      withdrawalPriority: 2,
      allocation: { cash: 0, fixedIncome: 0.3, equity: 0.7 },
    },
  ],
  events: [
    {
      id: "future-expense",
      label: "Future expense",
      calendarYear: 2038,
      month: 6,
      amountToday: 10000,
      direction: "outflow",
    },
  ],
};

export const baselineContextFixture: BaselineExportContext = {
  connection: {
    status: "connected",
    checkedAt: "2026-07-14T00:00:00.000Z",
    message: "Lunch Money read-only data loaded successfully.",
  },
  projectionInputs: projectionFixture,
  provenance: {
    monthlyEssentialSpendingToday: {
      value: 3200,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Trailing transaction average",
      effectiveDate: "2026-07-14",
    },
  },
  derived: {
    accountBalances: [
      {
        id: "manual:1",
        lunchMoneyId: 1,
        source: "manual",
        name: "Cash account",
        plannerType: "cash",
        balance: 20000,
        balanceAsOf: "2026-07-14",
        monthlyContribution: 0,
        contributionSource: "lunchmoney_derived",
        contributionFunding: "cash",
      },
    ],
    monthlyIncome: {
      trailingTotal: 84000,
      monthlyAverage: 7000,
      transactionCount: 12,
      basis: "net_deposited_cash",
    },
    essentialSpending: { trailingTotal: 38400, monthlyAverage: 3200, transactionCount: 40 },
    discretionarySpending: { trailingTotal: 9600, monthlyAverage: 800, transactionCount: 20 },
    investmentContributions: {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
      accounts: [
        {
          accountId: "manual:2",
          monthlyAverage: 1000,
          source: "lunchmoney_derived",
          funding: "cash",
        },
      ],
    },
    recurringExpenses: { monthlyTotal: 100, count: 1, items: [] },
  },
  dataThrough: "2026-07-14",
  transactionWindow: {
    startDate: "2025-07-14",
    endDate: "2026-07-14",
    trailingMonths: 12,
    transactionCount: 84,
  },
  recordsAnalyzed: { accounts: 2, categories: 5, recurringItems: 2, transactions: 84 },
  warnings: [
    { code: "fixture_warning", severity: "warning", message: "Fixture warning" },
  ],
  unmappedAccounts: [],
  unmappedCategories: [],
};

export const currentBaselineFixture: CurrentBaseline = {
  ...baselineContextFixture,
  schemaVersion: "1.1",
  provenance: {
    ...baselineContextFixture.provenance,
    monthlyDiscretionarySpendingToday: {
      value: 800,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Trailing transaction average",
      effectiveDate: "2026-07-14",
    },
    "person.annualEmploymentNetCashToday": {
      value: 84000,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Annualized net deposited income",
      effectiveDate: "2026-07-14",
    },
    retirementGoalToday: {
      value: 900000,
      sourceType: "local_configuration",
      sourceDescription: "Retirement goal from planner configuration",
      effectiveDate: "2026-07-14",
    },
    "person.retirementAge": {
      value: 65,
      sourceType: "local_configuration",
      sourceDescription: "Retirement age from planner configuration",
      effectiveDate: "2026-07-14",
    },
    endAge: {
      value: 95,
      sourceType: "local_configuration",
      sourceDescription: "Projection end age from planner configuration",
      effectiveDate: "2026-07-14",
    },
    annualInflation: {
      value: 0.02,
      sourceType: "local_configuration",
      sourceDescription: "Inflation from planner configuration",
      effectiveDate: "2026-07-14",
    },
    "tax.effectiveTaxRate": {
      value: 0.2,
      sourceType: "local_configuration",
      sourceDescription: "Tax assumption from planner configuration",
      effectiveDate: "2026-07-14",
    },
  },
  derived: {
    ...baselineContextFixture.derived,
    accountBalances: [
      ...baselineContextFixture.derived.accountBalances,
      {
        id: "manual:2",
        lunchMoneyId: 2,
        source: "manual",
        name: "Investment account",
        plannerType: "rrsp_rrif",
        balance: 180000,
        balanceAsOf: "2026-07-14",
        monthlyContribution: 1000,
        contributionSource: "lunchmoney_derived",
        contributionFunding: "cash",
      },
    ],
  },
  cashFlowAudit: {
    income: {
      trailingTotal: 84000,
      monthlyAverage: 7000,
      transactionCount: 12,
      breakdown: [
        {
          categoryId: "income-category",
          categoryName: "Employment income",
          accountId: "manual:1",
          accountName: "Cash account",
          transactionCount: 12,
          trailingTotal: 84000,
          monthlyAverage: 7000,
        },
      ],
    },
    essentialSpending: {
      trailingTotal: 38400,
      monthlyAverage: 3200,
      transactionCount: 40,
      breakdown: [
        {
          categoryId: "essential-category",
          categoryName: "Essential",
          accountId: "manual:1",
          accountName: "Cash account",
          transactionCount: 40,
          trailingTotal: 38400,
          monthlyAverage: 3200,
        },
      ],
    },
    discretionarySpending: {
      trailingTotal: 9600,
      monthlyAverage: 800,
      transactionCount: 20,
      breakdown: [
        {
          categoryId: "discretionary-category",
          categoryName: "Discretionary",
          accountId: "manual:1",
          accountName: "Cash account",
          transactionCount: 20,
          trailingTotal: 9600,
          monthlyAverage: 800,
        },
      ],
    },
    investmentContributions: {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
      accounts: [
        {
          accountId: "manual:2",
          accountName: "Investment account",
          monthlyAverage: 1000,
          source: "lunchmoney_derived",
          funding: "cash",
        },
      ],
    },
    recurringExpenses: {
      monthlyTotal: 100,
      count: 1,
      items: [
        {
          description: "Synthetic recurring expense",
          classification: "essential",
          monthlyAmount: 100,
          accountName: "Cash account",
          categoryName: "Essential",
        },
      ],
    },
  },
};
