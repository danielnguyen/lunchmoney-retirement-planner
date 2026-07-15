import type { BaselineExportContext } from "@/src/domain/baseline/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";

export const projectionFixture: ProjectionInputs = {
  startYear: 2026,
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
    annualEmploymentIncomeToday: 84000,
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
      },
    ],
    monthlyIncome: { trailingTotal: 84000, monthlyAverage: 7000, transactionCount: 12 },
    essentialSpending: { trailingTotal: 38400, monthlyAverage: 3200, transactionCount: 40 },
    discretionarySpending: { trailingTotal: 9600, monthlyAverage: 800, transactionCount: 20 },
    investmentContributions: {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
      accounts: [
        { accountId: "manual:2", monthlyAverage: 1000, source: "lunchmoney_derived" },
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
