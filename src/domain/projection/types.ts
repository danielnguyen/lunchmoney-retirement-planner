export const accountTypes = ["cash", "tfsa", "rrsp_rrif", "non_registered", "debt"] as const;
export const contributionFundingTypes = ["cash", "income_withheld"] as const;

export type AccountType = (typeof accountTypes)[number];
export type ContributionFunding = (typeof contributionFundingTypes)[number];

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

export type EmploymentIncomePhase = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  annualNetCashToday: number;
  annualGrowth: number;
};

export type PersonInput = {
  currentAge: number;
  retirementAge: number;
  employmentIncomePhases: EmploymentIncomePhase[];
  annualPensionToday: number;
  pensionStartAge: number;
  pensionIndexingRate: number;
  cpp: PublicBenefitInput;
  oas: PublicBenefitInput;
  rrifConversionAge: number;
};

export type ContributionPhase = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  monthlyAmountToday: number;
  funding: ContributionFunding;
  indexingRate: number;
};

export type FinancialAccountInput = {
  id: string;
  label: string;
  type: AccountType;
  openingBalance: number;
  annualReturn: number;
  contributionPhases: ContributionPhase[];
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
  startDate: string;
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

export type ContributionBreakdown = {
  cashFunded: number;
  incomeWithheld: number;
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
  contributions: ContributionBreakdown;
  balances: BalanceBreakdown;
  accountBalances: Record<string, number>;
  accountContributions: Record<string, number>;
  allocation: AssetAllocation;
};

export type AnnualProjection = {
  calendarYear: number;
  age: number;
  phase: "accumulation" | "retirement";
  nominal: ProjectionView;
  real: ProjectionView;
  milestones: string[];
  employmentPhaseLabels: string[];
  contributionPhaseLabels: Record<string, string[]>;
};

export type ProjectionSummary = {
  retirementYear: number;
  retirementDate: string;
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

export type RetirementSnapshot = {
  calendarDate: string;
  age: number;
  nominal: ProjectionView;
  real: ProjectionView;
};

export type FinancialAssetsBridge = {
  startingFinancialAssets: number;
  employmentNetCash: number;
  publicBenefitsAndPension: number;
  otherInflows: number;
  incomeWithheldContributions: number;
  investmentReturns: number;
  essentialSpending: number;
  discretionarySpending: number;
  oneTimeOutflows: number;
  taxes: number;
  endingFinancialAssets: number;
};

export type ProjectionResult = {
  schemaVersion: "4.0";
  inputs: ProjectionInputs;
  summary: ProjectionSummary;
  retirementSnapshot: RetirementSnapshot;
  financialAssetsBridge: {
    nominal: FinancialAssetsBridge;
    real: FinancialAssetsBridge;
  };
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

const PHASE_AGE_TOLERANCE = 1e-6;

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertMonthAligned(name: string, age: number, currentAge: number): void {
  if (!isFiniteNumber(age)) throw new Error(`${name} must be a finite age`);
  const months = (age - currentAge) * 12;
  if (Math.abs(months - Math.round(months)) > PHASE_AGE_TOLERANCE) {
    throw new Error(`${name} must align to a projection month`);
  }
}

function sameAge(left: number, right: number): boolean {
  return Math.abs(left - right) <= PHASE_AGE_TOLERANCE;
}

function isIsoCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateProjectionInputs(value: unknown): ProjectionInputs {
  if (!value || typeof value !== "object") {
    throw new Error("Projection inputs must be an object");
  }

  const input = value as ProjectionInputs;
  if (!isIsoCalendarDate(input.startDate)) {
    throw new Error("startDate must be a valid ISO calendar date");
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
  assertMonthAligned("retirementAge", input.person.retirementAge, input.person.currentAge);
  assertMonthAligned("endAge", input.endAge, input.person.currentAge);
  if (input.person.cpp.startAge < 60 || input.person.cpp.startAge > 70) {
    throw new Error("CPP start age must be between 60 and 70");
  }
  if (input.person.oas.startAge < 65 || input.person.oas.startAge > 70) {
    throw new Error("OAS start age must be between 65 and 70");
  }

  assertRate("annualInflation", input.annualInflation, -0.2, 0.5);
  assertRate("effectiveTaxRate", input.tax?.effectiveTaxRate, 0, 0.8);
  assertRate("oasRecoveryRate", input.tax?.oasRecoveryRate, 0, 1);
  assertRate("pensionIndexingRate", input.person.pensionIndexingRate, -0.2, 0.5);
  assertRate("CPP indexingRate", input.person.cpp.indexingRate, -0.2, 0.5);
  assertRate("OAS indexingRate", input.person.oas.indexingRate, -0.2, 0.5);
  assertNonNegative("monthlyEssentialSpendingToday", input.monthlyEssentialSpendingToday);
  assertNonNegative("monthlyDiscretionarySpendingToday", input.monthlyDiscretionarySpendingToday);
  assertNonNegative("retirementGoalToday", input.retirementGoalToday);
  assertNonNegative("annualPensionToday", input.person.annualPensionToday);
  assertNonNegative("CPP monthlyAmountAt65Today", input.person.cpp.monthlyAmountAt65Today);
  assertNonNegative("OAS monthlyAmountAt65Today", input.person.oas.monthlyAmountAt65Today);

  const personRecord = input.person as unknown as Record<string, unknown>;
  if (
    "annualEmploymentNetCashToday" in personRecord ||
    "annualIncomeGrowth" in personRecord
  ) {
    throw new Error(
      "Projection inputs must use employmentIncomePhases instead of scalar employment income fields",
    );
  }
  if (
    !Array.isArray(input.person.employmentIncomePhases) ||
    input.person.employmentIncomePhases.length === 0
  ) {
    throw new Error("At least one resolved employment income phase is required");
  }
  const employmentIds = new Set<string>();
  for (const [index, phase] of input.person.employmentIncomePhases.entries()) {
    const field = `employmentIncomePhases[${index}]`;
    assertNonEmptyString(`${field}.id`, phase.id);
    assertNonEmptyString(`${field}.label`, phase.label);
    if (employmentIds.has(phase.id)) {
      throw new Error(`Employment income phase ids must be unique: ${phase.id}`);
    }
    employmentIds.add(phase.id);
    if ((phase as unknown as Record<string, unknown>).annualNetCashToday === "live_baseline") {
      throw new Error(`${field}.annualNetCashToday must be resolved before projection`);
    }
    assertNonNegative(`${field}.annualNetCashToday`, phase.annualNetCashToday);
    assertRate(`${field}.annualGrowth`, phase.annualGrowth, -0.2, 0.5);
    assertMonthAligned(`${field}.startAge`, phase.startAge, input.person.currentAge);
    assertMonthAligned(`${field}.endAge`, phase.endAge, input.person.currentAge);
    if (
      phase.startAge < input.person.currentAge - PHASE_AGE_TOLERANCE ||
      phase.endAge > input.person.retirementAge + PHASE_AGE_TOLERANCE
    ) {
      throw new Error(`${field} must stay within currentAge and retirementAge`);
    }
    if (phase.endAge <= phase.startAge + PHASE_AGE_TOLERANCE) {
      throw new Error(`${field}.endAge must be greater than startAge`);
    }
    const previous = input.person.employmentIncomePhases[index - 1];
    if (previous) {
      if (phase.startAge < previous.endAge - PHASE_AGE_TOLERANCE) {
        throw new Error(
          `Employment income phases overlap between ${previous.id} and ${phase.id}`,
        );
      }
      if (phase.startAge > previous.endAge + PHASE_AGE_TOLERANCE) {
        throw new Error(
          `Employment income phases have a gap between ${previous.id} and ${phase.id}`,
        );
      }
    }
  }
  if (
    !sameAge(
      input.person.employmentIncomePhases[0]!.startAge,
      input.person.currentAge,
    )
  ) {
    throw new Error("The first employment income phase must begin at currentAge");
  }
  if (
    !sameAge(
      input.person.employmentIncomePhases.at(-1)!.endAge,
      input.person.retirementAge,
    )
  ) {
    throw new Error("The final employment income phase must end at retirementAge");
  }

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
    const accountRecord = account as unknown as Record<string, unknown>;
    if (
      "monthlyContributionToday" in accountRecord ||
      "contributionFunding" in accountRecord ||
      "contributionIndexingRate" in accountRecord
    ) {
      throw new Error(
        `Projection account ${account.id} must use contributionPhases instead of scalar contribution fields`,
      );
    }
    if (!Array.isArray(account.contributionPhases)) {
      throw new Error(`contributionPhases must be an array for ${account.id}`);
    }
    if (
      account.contributionPhases.length > 0 &&
      !["tfsa", "rrsp_rrif", "non_registered"].includes(account.type)
    ) {
      throw new Error(
        `Contribution phases may only be configured for investment account ${account.id}`,
      );
    }
    const contributionIds = new Set<string>();
    for (const [index, phase] of account.contributionPhases.entries()) {
      const field = `contributionPhases[${index}] for ${account.id}`;
      assertNonEmptyString(`${field}.id`, phase.id);
      assertNonEmptyString(`${field}.label`, phase.label);
      if (contributionIds.has(phase.id)) {
        throw new Error(`Contribution phase ids must be unique for ${account.id}: ${phase.id}`);
      }
      contributionIds.add(phase.id);
      if ((phase as unknown as Record<string, unknown>).monthlyAmountToday === "live_baseline") {
        throw new Error(`${field}.monthlyAmountToday must be resolved before projection`);
      }
      assertNonNegative(`${field}.monthlyAmountToday`, phase.monthlyAmountToday);
      assertRate(`${field}.indexingRate`, phase.indexingRate, -0.2, 0.5);
      if (!contributionFundingTypes.includes(phase.funding)) {
        throw new Error(`Unsupported contribution funding for ${account.id}`);
      }
      assertMonthAligned(`${field}.startAge`, phase.startAge, input.person.currentAge);
      assertMonthAligned(`${field}.endAge`, phase.endAge, input.person.currentAge);
      if (
        phase.startAge < input.person.currentAge - PHASE_AGE_TOLERANCE ||
        phase.endAge > input.person.retirementAge + PHASE_AGE_TOLERANCE
      ) {
        throw new Error(`${field} must stay within currentAge and retirementAge`);
      }
      if (phase.endAge <= phase.startAge + PHASE_AGE_TOLERANCE) {
        throw new Error(`${field}.endAge must be greater than startAge`);
      }
      const previous = account.contributionPhases[index - 1];
      if (previous && phase.startAge < previous.endAge - PHASE_AGE_TOLERANCE) {
        throw new Error(
          `Contribution phases overlap between ${previous.id} and ${phase.id} for ${account.id}`,
        );
      }
    }
    assertRate(`annualReturn for ${account.id}`, account.annualReturn);
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
