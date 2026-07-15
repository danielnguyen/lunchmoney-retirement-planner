export const accountTypes = ["cash", "tfsa", "rrsp_rrif", "non_registered", "debt"] as const;

export type AccountType = (typeof accountTypes)[number];

export type AssetAllocation = {
  cash: number;
  fixedIncome: number;
  equity: number;
};

export type PublicBenefitInput = {
  startAge: number;
  monthlyAmountAt65Today: number;
  indexingRate: number;
};

export type PersonInput = {
  currentAge: number;
  retirementAge: number;
  annualEmploymentIncomeToday: number;
  annualIncomeGrowth: number;
  annualPensionToday: number;
  pensionStartAge: number;
  pensionIndexingRate: number;
  cpp: PublicBenefitInput;
  oas: PublicBenefitInput;
  rrifConversionAge: number;
};

export type FinancialAccountInput = {
  id: string;
  label: string;
  type: AccountType;
  openingBalance: number;
  annualReturn: number;
  monthlyContributionToday: number;
  contributionIndexingRate: number;
  withdrawalPriority: number;
  allocation: AssetAllocation;
};

export type ProjectionEventInput = {
  id: string;
  label: string;
  calendarYear: number;
  month: number;
  amountToday: number;
  direction: "inflow" | "outflow";
  targetAccountId?: string;
};

export type TaxAssumptions = {
  effectiveTaxRate: number;
  oasRecoveryThresholdToday: number;
  oasRecoveryRate: number;
};

export type ProjectionInputs = {
  startYear: number;
  endAge: number;
  annualInflation: number;
  monthlyEssentialSpendingToday: number;
  monthlyDiscretionarySpendingToday: number;
  retirementGoalToday: number;
  tax: TaxAssumptions;
  person: PersonInput;
  accounts: FinancialAccountInput[];
  events: ProjectionEventInput[];
};

export type IncomeBreakdown = {
  employment: number;
  cpp: number;
  oas: number;
  pension: number;
  other: number;
  total: number;
};

export type WithdrawalBreakdown = {
  cash: number;
  tfsa: number;
  rrspRrif: number;
  nonRegistered: number;
  total: number;
};

export type OutflowBreakdown = {
  essential: number;
  discretionary: number;
  oneTime: number;
  tax: number;
  oasRecoveryTax: number;
  contributions: number;
  unmetSpending: number;
  total: number;
};

export type BalanceBreakdown = {
  cash: number;
  tfsa: number;
  rrspRrif: number;
  nonRegistered: number;
  debts: number;
  financialAssets: number;
  netWorth: number;
};

export type ProjectionView = {
  income: IncomeBreakdown;
  withdrawals: WithdrawalBreakdown;
  outflows: OutflowBreakdown;
  balances: BalanceBreakdown;
  accountBalances: Record<string, number>;
  allocation: AssetAllocation;
};

export type AnnualProjection = {
  calendarYear: number;
  age: number;
  phase: "accumulation" | "retirement";
  nominal: ProjectionView;
  real: ProjectionView;
  milestones: string[];
};

export type ProjectionSummary = {
  retirementYear: number;
  financialAssetsAtRetirementToday: number;
  retirementGoalToday: number;
  goalGapToday: number;
  financialAssetsDepletionAge: number | null;
  endingFinancialAssetsToday: number;
};

export type ProjectionObservation = {
  code: string;
  message: string;
  calendarYear?: number;
  age?: number;
};

export type ProjectionResult = {
  schemaVersion: "3.0";
  inputs: ProjectionInputs;
  summary: ProjectionSummary;
  annual: AnnualProjection[];
  observations: ProjectionObservation[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertNonNegative(name: string, value: number): void {
  if (!isFiniteNumber(value) || value < 0) throw new Error(`${name} must be non-negative`);
}

function assertRate(name: string, value: number, min = -0.99, max = 1): void {
  if (!isFiniteNumber(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
}

export function validateProjectionInputs(value: unknown): ProjectionInputs {
  if (!value || typeof value !== "object") {
    throw new Error("Projection inputs must be an object");
  }

  const input = value as ProjectionInputs;
  if (!Number.isInteger(input.startYear) || input.startYear < 1900 || input.startYear > 2300) {
    throw new Error("startYear must be a valid calendar year");
  }
  if (!input.person || typeof input.person !== "object") {
    throw new Error("A person projection input is required");
  }
  if (!Array.isArray(input.accounts) || input.accounts.length === 0 || !Array.isArray(input.events)) {
    throw new Error("At least one account and an events array are required");
  }
  if (!isFiniteNumber(input.person.currentAge) || input.person.currentAge < 18 || input.person.currentAge > 100) {
    throw new Error("currentAge must be between 18 and 100");
  }
  if (!isFiniteNumber(input.endAge) || input.endAge <= input.person.currentAge || input.endAge > 120) {
    throw new Error("endAge must exceed currentAge and be no greater than 120");
  }
  if (input.person.retirementAge <= input.person.currentAge || input.person.retirementAge > input.endAge) {
    throw new Error("retirementAge must be after currentAge and no later than endAge");
  }
  if (input.person.cpp.startAge < 60 || input.person.cpp.startAge > 70) {
    throw new Error("CPP start age must be between 60 and 70");
  }
  if (input.person.oas.startAge < 65 || input.person.oas.startAge > 70) {
    throw new Error("OAS start age must be between 65 and 70");
  }

  assertRate("annualInflation", input.annualInflation, -0.2, 0.5);
  assertRate("effectiveTaxRate", input.tax?.effectiveTaxRate, 0, 0.8);
  assertRate("oasRecoveryRate", input.tax?.oasRecoveryRate, 0, 1);
  assertRate("annualIncomeGrowth", input.person.annualIncomeGrowth, -0.2, 0.5);
  assertRate("pensionIndexingRate", input.person.pensionIndexingRate, -0.2, 0.5);
  assertRate("CPP indexingRate", input.person.cpp.indexingRate, -0.2, 0.5);
  assertRate("OAS indexingRate", input.person.oas.indexingRate, -0.2, 0.5);
  assertNonNegative("monthlyEssentialSpendingToday", input.monthlyEssentialSpendingToday);
  assertNonNegative("monthlyDiscretionarySpendingToday", input.monthlyDiscretionarySpendingToday);
  assertNonNegative("retirementGoalToday", input.retirementGoalToday);
  assertNonNegative("annualEmploymentIncomeToday", input.person.annualEmploymentIncomeToday);
  assertNonNegative("annualPensionToday", input.person.annualPensionToday);
  assertNonNegative("CPP monthlyAmountAt65Today", input.person.cpp.monthlyAmountAt65Today);
  assertNonNegative("OAS monthlyAmountAt65Today", input.person.oas.monthlyAmountAt65Today);

  const accountIds = new Set<string>();
  let hasCashAccount = false;
  for (const account of input.accounts) {
    if (!account.id || accountIds.has(account.id)) {
      throw new Error("Financial account ids must be unique and non-empty");
    }
    accountIds.add(account.id);
    if (!accountTypes.includes(account.type)) {
      throw new Error(`Unsupported account type ${account.type}`);
    }
    if (account.type === "cash") hasCashAccount = true;
    assertNonNegative(`openingBalance for ${account.id}`, account.openingBalance);
    assertNonNegative(`monthlyContributionToday for ${account.id}`, account.monthlyContributionToday);
    assertRate(`annualReturn for ${account.id}`, account.annualReturn);
    assertRate(`contributionIndexingRate for ${account.id}`, account.contributionIndexingRate, -0.2, 0.5);
    const allocationTotal =
      account.allocation.cash + account.allocation.fixedIncome + account.allocation.equity;
    if (account.type !== "debt" && Math.abs(allocationTotal - 1) > 0.001) {
      throw new Error(`Allocation must total 1 for ${account.id}`);
    }
    if (account.type === "debt" && Math.abs(allocationTotal) > 0.001) {
      throw new Error(`Debt allocation must total 0 for ${account.id}`);
    }
  }
  if (!hasCashAccount) {
    throw new Error("At least one included cash account is required for cash-flow projection");
  }

  for (const event of input.events) {
    if (!event.id || !event.label) throw new Error("Events require an id and label");
    if (event.month < 1 || event.month > 12 || !Number.isInteger(event.month)) {
      throw new Error(`Event month must be between 1 and 12 for ${event.id}`);
    }
    assertNonNegative(`amountToday for ${event.id}`, event.amountToday);
    if (event.targetAccountId && !accountIds.has(event.targetAccountId)) {
      throw new Error(`Unknown event target account ${event.targetAccountId}`);
    }
  }

  return input;
}

export const projectionInputsSchema = {
  parse: validateProjectionInputs,
};
