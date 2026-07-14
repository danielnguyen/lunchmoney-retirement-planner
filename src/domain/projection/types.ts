export const accountTypes = [
  "cash",
  "tfsa",
  "rrsp_rrif",
  "non_registered",
  "real_asset",
  "debt",
] as const;

export type AccountType = (typeof accountTypes)[number];

export type AssetAllocation = {
  cash: number;
  fixedIncome: number;
  equity: number;
};

export type PublicBenefitInput = {
  startAge: number;
  monthlyAmountAt65Today: number;
  percentOfMaximum: number;
  indexingRate: number;
};

export type HouseholdMemberInput = {
  id: string;
  label: string;
  currentAge: number;
  retirementAge: number;
  expenseShare: number;
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
  ownerId: string;
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
  ownerId?: string;
  targetAccountId?: string;
};

export type TaxAssumptions = {
  effectiveTaxRate: number;
  oasRecoveryThresholdToday: number;
  oasRecoveryRate: number;
};

export type ProjectionInputs = {
  startYear: number;
  primaryMemberId: string;
  endAge: number;
  annualInflation: number;
  monthlyEssentialSpendingToday: number;
  monthlyDiscretionarySpendingToday: number;
  retirementGoalToday: number;
  tax: TaxAssumptions;
  members: HouseholdMemberInput[];
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
  realAssets: number;
  debts: number;
  netWorth: number;
};

export type ProjectionView = {
  income: IncomeBreakdown;
  withdrawals: WithdrawalBreakdown;
  outflows: OutflowBreakdown;
  balances: BalanceBreakdown;
  allocation: AssetAllocation;
};

export type AnnualProjection = {
  calendarYear: number;
  primaryAge: number;
  phase: "accumulation" | "retirement";
  nominal: ProjectionView;
  real: ProjectionView;
  members: Record<
    string,
    {
      label: string;
      age: number;
      nominal: ProjectionView;
      real: ProjectionView;
    }
  >;
  milestones: string[];
};

export type ProjectionSummary = {
  firstRetirementYear: number;
  netWorthAtFirstRetirementToday: number;
  retirementGoalToday: number;
  goalGapToday: number;
  financialAssetsDepletionAge: number | null;
  endingNetWorthToday: number;
};

export type ProjectionObservation = {
  code: string;
  message: string;
  calendarYear?: number;
  age?: number;
};

export type ProjectionResult = {
  schemaVersion: "2.0";
  inputs: ProjectionInputs;
  summary: ProjectionSummary;
  annual: AnnualProjection[];
  observations: ProjectionObservation[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
  if (!input.primaryMemberId || !Array.isArray(input.members) || input.members.length === 0) {
    throw new Error("At least one household member is required");
  }
  if (!Array.isArray(input.accounts) || !Array.isArray(input.events)) {
    throw new Error("accounts and events must be arrays");
  }
  if (!isFiniteNumber(input.endAge) || input.endAge <= 18 || input.endAge > 120) {
    throw new Error("endAge must be between 19 and 120");
  }
  assertRate("annualInflation", input.annualInflation, -0.2, 0.5);
  assertRate("effectiveTaxRate", input.tax.effectiveTaxRate, 0, 0.8);
  assertRate("oasRecoveryRate", input.tax.oasRecoveryRate, 0, 1);

  const memberIds = new Set<string>();
  let expenseShare = 0;
  for (const member of input.members) {
    if (!member.id || memberIds.has(member.id)) {
      throw new Error("Household member ids must be unique and non-empty");
    }
    memberIds.add(member.id);
    if (member.retirementAge <= member.currentAge) {
      throw new Error(`retirementAge must exceed currentAge for ${member.id}`);
    }
    if (member.cpp.startAge < 60 || member.cpp.startAge > 70) {
      throw new Error(`CPP start age must be between 60 and 70 for ${member.id}`);
    }
    if (member.oas.startAge < 65 || member.oas.startAge > 70) {
      throw new Error(`OAS start age must be between 65 and 70 for ${member.id}`);
    }
    if (member.expenseShare < 0 || member.expenseShare > 1) {
      throw new Error(`expenseShare must be between 0 and 1 for ${member.id}`);
    }
    expenseShare += member.expenseShare;
  }
  if (!memberIds.has(input.primaryMemberId)) {
    throw new Error("primaryMemberId must match a household member");
  }
  if (Math.abs(expenseShare - 1) > 0.001) {
    throw new Error("Household member expense shares must total 1");
  }

  const accountIds = new Set<string>();
  for (const account of input.accounts) {
    if (!account.id || accountIds.has(account.id)) {
      throw new Error("Financial account ids must be unique and non-empty");
    }
    accountIds.add(account.id);
    if (!memberIds.has(account.ownerId)) {
      throw new Error(`Unknown account owner ${account.ownerId}`);
    }
    if (!accountTypes.includes(account.type)) {
      throw new Error(`Unsupported account type ${account.type}`);
    }
    assertRate(`annualReturn for ${account.id}`, account.annualReturn);
    const allocationTotal =
      account.allocation.cash + account.allocation.fixedIncome + account.allocation.equity;
    if (account.type !== "real_asset" && account.type !== "debt" && Math.abs(allocationTotal - 1) > 0.001) {
      throw new Error(`Allocation must total 1 for ${account.id}`);
    }
  }

  for (const event of input.events) {
    if (event.month < 1 || event.month > 12 || !Number.isInteger(event.month)) {
      throw new Error(`Event month must be between 1 and 12 for ${event.id}`);
    }
    if (event.ownerId && !memberIds.has(event.ownerId)) {
      throw new Error(`Unknown event owner ${event.ownerId}`);
    }
    if (event.targetAccountId && !accountIds.has(event.targetAccountId)) {
      throw new Error(`Unknown event target account ${event.targetAccountId}`);
    }
  }

  return input;
}

export const projectionInputsSchema = {
  parse: validateProjectionInputs,
};
