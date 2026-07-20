export const accountTypes = ["cash", "tfsa", "rrsp_rrif", "non_registered", "debt"] as const;
export const contributionFundingTypes = ["cash", "income_withheld"] as const;

export type AccountType = (typeof accountTypes)[number];
export type ContributionFunding = (typeof contributionFundingTypes)[number];

export type AssetAllocation = {
  cash: number;
  fixedIncome: number;
  equity: number;
};

export type CppBenefitInput = {
  startAge: number;
  monthlyAmountAt65Today: number;
  indexingRate: number;
};

export type OasEligibilityInput = {
  mode: "full" | "partial" | "none";
  qualifyingResidenceYearsAfter18: number | null;
  fraction: number;
};

export type OasBenefitInput = {
  startAge: number;
  fullMonthlyAmountAt65Today: number;
  eligibility: OasEligibilityInput;
  indexingRate: number;
  age75IncreaseRate: number;
};

export type EmploymentIncomePhase = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  annualNetCashToday: number;
  annualGrowth: number;
  rrspRoomGeneration?: {
    annualEligibleEarnedIncomeToday: number;
    annualPensionAdjustmentToday: number;
    annualOtherRoomReductionToday: number;
    annualGrowth: number;
  };
};

export type PersonInput = {
  currentAge: number;
  retirementAge: number;
  employmentIncomePhases: EmploymentIncomePhase[];
  annualPensionToday: number;
  pensionStartAge: number;
  pensionIndexingRate: number;
  cpp: CppBenefitInput;
  oas: OasBenefitInput;
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

export type SavingsPlanPhase = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  monthlyAmountToday: number;
  indexingRate: number;
};

export type FinancialAccountOrigin =
  | "lunchmoney"
  | "projection_configuration";

export type FinancialAccountInput = {
  id: string;
  label: string;
  origin: FinancialAccountOrigin;
  type: AccountType;
  openingBalance: number;
  annualReturn: number;
  contributionPhases: ContributionPhase[];
  withdrawalPriority: number;
  allocation: AssetAllocation;
};

export type SurplusAllocationPolicyInput = {
  reserveAccountIds: string[];
  reserveRefillAccountId: string;
  targetCashReserveToday: number;
  reserveIndexingRate: number;
  excess:
    | { mode: "retain_as_cash" }
    | {
        mode: "allocate_to_account";
        destinationAccountId: string;
      }
    | {
        mode: "allocate_through_contribution_waterfall";
      };
};

export type StartingRoomSource = {
  source: "official_estimate" | "configured_amount" | "explicit_zero";
  amount: number;
  sourceDescription: string;
  effectiveDate: string;
};

export type RegisteredAccountRoomInput = {
  tfsa: {
    startingAvailableRoom: StartingRoomSource;
    annualNewRoom: {
      source: "canadian_reference";
      futureIndexingRate: number;
      roundingIncrement: number;
    };
    carryForwardUnusedRoom: boolean;
    withdrawalRoomRecredit: "next_calendar_year";
  };
  rrsp: {
    startingAvailableDeductionRoom: StartingRoomSource;
    carryForwardUnusedRoom: boolean;
    newRoom: {
      source: "earned_income";
      annualCap: {
        source: "canadian_reference";
        futureGrowthRate: number;
        futureRoundingIncrement: number;
      };
      startYearBeforeProjectionMonth: {
        calendarYear: number;
        eligibleEarnedIncome: number;
        pensionAdjustment: number;
        otherRoomReduction: number;
      };
    };
  };
};

export type ContributionWaterfallRoute = {
  sourceAccountId: string;
  destinationAccountIds: string[];
};

export type ContributionWaterfallInput = {
  mode: "canonical" | "fixed_source_compatibility" | "simple_policy";
  routes: ContributionWaterfallRoute[];
  surplusDestinationAccountIds: string[];
};

export type SavingsPolicyInput =
  | {
      mode: "advanced";
    }
  | {
      mode: "simple";
      operatingCashAccountId: string;
      reserveAccountIds: string[];
      reserveRefillAccountId: string;
      personalTfsaAccountId: string;
      personalRrspAccountId: string;
      workplaceRrspAccountId: string | null;
      taxableAccountId: string;
      taxableAccountOrigin: FinancialAccountOrigin;
      reserveBuildingPhases: SavingsPlanPhase[];
      unplannedCash: "retain_in_operating_cash";
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"];
      workplaceRoomPriority: "first";
      workplaceOverflow: "unallocated";
      reserveAfterTarget: "personal_investing";
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
  registeredAccountRoom?: RegisteredAccountRoomInput;
  contributionWaterfall: ContributionWaterfallInput;
  surplusAllocation: SurplusAllocationPolicyInput;
  savingsPolicy: SavingsPolicyInput;
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
  planned: number;
  allowed: number;
  surplusFunded: number;
  sourceAccount: number;
  redirected: number;
  cashFunded: number;
  incomeWithheld: number;
  unallocatedCashFunded: number;
  unallocatedIncomeWithheld: number;
  unallocated: number;
  total: number;
};

export type AccountContributionDetail = {
  plannedFromAccount: number;
  depositedIntoAccount: number;
  sourceAccountDeposit: number;
  redirectedOut: number;
  redirectedIn: number;
  surplusFundedDeposit: number;
  cashFunded: number;
  incomeWithheld: number;
  unallocatedFromAccount: number;
};

export type RegisteredProgramAnnualBreakdown = {
  openingRoom: number;
  annualNewRoom: number;
  withdrawalRoomRestored: number;
  previousYearEligibleEarnedIncome: number;
  earnedIncomeRate: number;
  annualCap: number;
  pensionAdjustment: number;
  otherRoomReduction: number;
  grossGeneratedRoom: number;
  plannedContributions: number;
  allowedContributions: number;
  redirectedIn: number;
  redirectedOut: number;
  surplusFundedContributions: number;
  unallocatedContributions: number;
  closingRoom: number;
  carryForwardUnusedRoom: boolean;
  sourceKind: "published_reference" | "configured_forecast" | "starting_room";
};

export type RegisteredAccountRoomBreakdown = {
  tfsa: RegisteredProgramAnnualBreakdown;
  rrsp: RegisteredProgramAnnualBreakdown;
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

export type SurplusAllocationBreakdown = {
  generated: number;
  reserveRefill: number;
  retainedAsCash: number;
  redirected: number;
  reserveTarget: number;
};

export type SavingsPolicyBreakdown = {
  positiveCashAvailable: number;
  personalPlanned: number;
  personalAllowed: number;
  personalUnallocated: number;
  reservePlanned: number;
  reserveFunded: number;
  reserveRetainedAsCash: number;
  reserveRedirected: number;
  reserveUnfunded: number;
  workplacePlanned: number;
  workplaceAllowed: number;
  workplaceUnallocated: number;
  unplannedCashRetained: number;
  totalInvestmentDeposits: number;
};

export type ProjectionView = {
  income: IncomeBreakdown;
  withdrawals: WithdrawalBreakdown;
  outflows: OutflowBreakdown;
  contributions: ContributionBreakdown;
  balances: BalanceBreakdown;
  accountBalances: Record<string, number>;
  accountContributions: Record<string, number>;
  accountContributionDetails: Record<string, AccountContributionDetail>;
  registeredAccountRoom: RegisteredAccountRoomBreakdown;
  surplusAllocation: SurplusAllocationBreakdown;
  savingsPolicy: SavingsPolicyBreakdown;
  accountSurplusAllocations: Record<string, number>;
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
  flowPeriod: {
    kind: "final_working_month";
    calendarMonth: string;
  };
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

export type GovernmentBenefitCalculationSummary = {
  cpp: {
    baseMonthlyAmountAt65Today: number;
    claimAge: number;
    claimFactor: number;
    monthlyAmountAtClaimToday: number;
    annualAmountAtClaimToday: number;
  };
  oas: {
    fullBaseMonthlyAmountAt65Today: number;
    eligibilityMode: OasEligibilityInput["mode"];
    qualifyingResidenceYearsAfter18: number | null;
    eligibilityFraction: number;
    claimAge: number;
    claimFactor: number;
    monthlyAmountAtClaimToday: number;
    annualAmountAtClaimToday: number;
    age75IncreaseRate: number;
    monthlyAmountAfterAge75IncreaseToday: number;
  };
};

export type SurplusAllocationTotals = {
  generated: number;
  reserveRefill: number;
  retainedAsCash: number;
  redirected: number;
  accountAllocations: Record<string, number>;
};

export type SurplusAllocationCalculationSummary = {
  policy: {
    reserveAccountIds: string[];
    reserveRefillAccountId: string;
    targetCashReserveToday: number;
    reserveIndexingRate: number;
    excessMode:
      | "retain_as_cash"
      | "allocate_to_account"
      | "allocate_through_contribution_waterfall";
    destinationAccountId: string | null;
  };
  throughRetirement: {
    nominal: SurplusAllocationTotals;
    real: SurplusAllocationTotals;
  };
  reserveTargetAtRetirement: {
    nominal: number;
    real: number;
  };
  reserveAccountsBalanceAtRetirement: {
    nominal: number;
    real: number;
  };
  destinationAccountBalanceAtRetirement: {
    nominal: number;
    real: number;
  } | null;
};

export type RegisteredAccountRoomCalculationSummary = {
  modelled: boolean;
  denomination: "nominal_regulatory_dollars";
  policy: {
    tfsaStartingRoomSource: StartingRoomSource | null;
    rrspStartingRoomSource: StartingRoomSource | null;
    tfsaCarryForwardUnusedRoom: boolean | null;
    rrspCarryForwardUnusedRoom: boolean | null;
    waterfallMode: ContributionWaterfallInput["mode"];
    routes: ContributionWaterfallRoute[];
    surplusDestinationAccountIds: string[];
  };
  references: {
    tfsaAnnualLimit: {
      calendarYear: 2026;
      amount: 7000;
      effectiveDate: "2026-01-01";
      sourceKind: "published_reference";
      referenceUrl: string;
    };
    rrspAnnualCaps: Array<{
      calendarYear: number;
      amount: number;
      effectiveDate: string;
      sourceKind: "published_reference";
      referenceUrl: string;
    }>;
    rrspEarnedIncomeRate: 0.18;
    rrspFormulaReferenceUrl: string;
    tfsaWithdrawalReferenceUrl: string;
  };
  annual: Array<{
    calendarYear: number;
    nominal: RegisteredAccountRoomBreakdown;
    real: RegisteredAccountRoomBreakdown;
  }>;
};

export type SavingsPolicyTotals = SavingsPolicyBreakdown;

export type SavingsPolicyCalculationSummary = {
  mode: SavingsPolicyInput["mode"];
  policy:
    | {
        mode: "advanced";
      }
    | {
        mode: "simple";
        reserveAccountIds: string[];
        reserveRefillAccountId: string;
        operatingCashAccountId: string;
        personalTfsaAccountId: string;
        personalRrspAccountId: string;
        workplaceRrspAccountId: string | null;
        taxableAccountId: string;
        taxableAccountOrigin: FinancialAccountOrigin;
        personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"];
        workplaceRoomPriority: "first";
        workplaceOverflow: "unallocated";
        reserveAfterTarget: "personal_investing";
        unplannedCash: "retain_in_operating_cash";
      };
  throughRetirement: {
    nominal: SavingsPolicyTotals;
    real: SavingsPolicyTotals;
  };
};

export type ProjectionResult = {
  schemaVersion: "7.0";
  inputs: ProjectionInputs;
  summary: ProjectionSummary;
  retirementSnapshot: RetirementSnapshot;
  financialAssetsBridge: {
    nominal: FinancialAssetsBridge;
    real: FinancialAssetsBridge;
  };
  governmentBenefits: GovernmentBenefitCalculationSummary;
  surplusAllocation: SurplusAllocationCalculationSummary;
  registeredAccountRoom: RegisteredAccountRoomCalculationSummary;
  savingsPolicy: SavingsPolicyCalculationSummary;
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

export const PROJECTION_AGE_TOLERANCE = 1e-6;

export function projectionMonthOffset(
  age: number,
  referenceAge: number,
): number | null {
  if (!isFiniteNumber(age) || !isFiniteNumber(referenceAge)) return null;
  const months = (age - referenceAge) * 12;
  const roundedMonths = Math.round(months);
  return Math.abs(months - roundedMonths) <= PROJECTION_AGE_TOLERANCE
    ? roundedMonths
    : null;
}

function assertNonEmptyString(name: string, value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
}

function assertMonthAligned(name: string, age: number, currentAge: number): void {
  if (!isFiniteNumber(age)) throw new Error(`${name} must be a finite age`);
  if (projectionMonthOffset(age, currentAge) === null) {
    throw new Error(`${name} must align to a projection month`);
  }
}

function sameAge(left: number, right: number): boolean {
  return Math.abs(left - right) <= PROJECTION_AGE_TOLERANCE;
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
  assertMonthAligned("CPP start age", input.person.cpp.startAge, input.person.currentAge);
  if (input.person.cpp.startAge < 60 || input.person.cpp.startAge > 70) {
    throw new Error("CPP start age must be between 60 and 70");
  }
  assertMonthAligned("OAS start age", input.person.oas.startAge, input.person.currentAge);
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
  assertNonNegative(
    "OAS fullMonthlyAmountAt65Today",
    input.person.oas.fullMonthlyAmountAt65Today,
  );
  assertRate("OAS age75IncreaseRate", input.person.oas.age75IncreaseRate, 0, 1);
  if (Math.abs(input.person.oas.age75IncreaseRate - 0.1) > PROJECTION_AGE_TOLERANCE) {
    throw new Error("OAS age75IncreaseRate must use the statutory 10% increase");
  }
  const eligibility = input.person.oas.eligibility;
  if (!eligibility || !["full", "partial", "none"].includes(eligibility.mode)) {
    throw new Error("OAS eligibility mode must be full, partial, or none");
  }
  assertRate("OAS eligibility fraction", eligibility.fraction, 0, 1);
  if (eligibility.mode === "full") {
    if (eligibility.qualifyingResidenceYearsAfter18 !== null || eligibility.fraction !== 1) {
      throw new Error("Full OAS eligibility must have no qualifying years and a fraction of 1");
    }
  } else if (eligibility.mode === "none") {
    if (eligibility.qualifyingResidenceYearsAfter18 !== null || eligibility.fraction !== 0) {
      throw new Error("No OAS eligibility must have no qualifying years and a fraction of 0");
    }
  } else {
    const years = eligibility.qualifyingResidenceYearsAfter18;
    if (
      years === null ||
      !Number.isInteger(years) ||
      years < 1 ||
      years > 39 ||
      Math.abs(eligibility.fraction - years / 40) > PROJECTION_AGE_TOLERANCE
    ) {
      throw new Error(
        "Partial OAS eligibility must use 1 through 39 qualifying years and years / 40",
      );
    }
  }

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
    if (phase.rrspRoomGeneration) {
      assertNonNegative(
        `${field}.rrspRoomGeneration.annualEligibleEarnedIncomeToday`,
        phase.rrspRoomGeneration.annualEligibleEarnedIncomeToday,
      );
      assertNonNegative(
        `${field}.rrspRoomGeneration.annualPensionAdjustmentToday`,
        phase.rrspRoomGeneration.annualPensionAdjustmentToday,
      );
      assertNonNegative(
        `${field}.rrspRoomGeneration.annualOtherRoomReductionToday`,
        phase.rrspRoomGeneration.annualOtherRoomReductionToday,
      );
      assertRate(
        `${field}.rrspRoomGeneration.annualGrowth`,
        phase.rrspRoomGeneration.annualGrowth,
        -0.2,
        0.5,
      );
    }
    assertMonthAligned(`${field}.startAge`, phase.startAge, input.person.currentAge);
    assertMonthAligned(`${field}.endAge`, phase.endAge, input.person.currentAge);
    if (
      phase.startAge < input.person.currentAge - PROJECTION_AGE_TOLERANCE ||
      phase.endAge > input.person.retirementAge + PROJECTION_AGE_TOLERANCE
    ) {
      throw new Error(`${field} must stay within currentAge and retirementAge`);
    }
    if (phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE) {
      throw new Error(`${field}.endAge must be greater than startAge`);
    }
    const previous = input.person.employmentIncomePhases[index - 1];
    if (previous) {
      if (phase.startAge < previous.endAge - PROJECTION_AGE_TOLERANCE) {
        throw new Error(
          `Employment income phases overlap between ${previous.id} and ${phase.id}`,
        );
      }
      if (phase.startAge > previous.endAge + PROJECTION_AGE_TOLERANCE) {
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
  const accountsById = new Map<string, FinancialAccountInput>();
  let hasCashAccount = false;
  for (const account of input.accounts) {
    if (!account.id || accountIds.has(account.id)) {
      throw new Error("Financial account ids must be unique and non-empty");
    }
    accountIds.add(account.id);
    accountsById.set(account.id, account);
    assertNonEmptyString(`label for ${account.id}`, account.label);
    if (
      account.origin !== "lunchmoney" &&
      account.origin !== "projection_configuration"
    ) {
      throw new Error(`Unsupported account origin for ${account.id}`);
    }
    if (account.origin === "projection_configuration") {
      if (!account.id.startsWith("projection:")) {
        throw new Error(
          `Projection-configured account ${account.id} must use an id beginning with projection:`,
        );
      }
      if (account.openingBalance !== 0) {
        throw new Error(
          `Projection-configured account ${account.id} must have a fixed zero opening balance`,
        );
      }
      if (account.type === "debt") {
        throw new Error(
          `Projection-configured account ${account.id} cannot use debt`,
        );
      }
    }
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
        phase.startAge < input.person.currentAge - PROJECTION_AGE_TOLERANCE ||
        phase.endAge > input.person.retirementAge + PROJECTION_AGE_TOLERANCE
      ) {
        throw new Error(`${field} must stay within currentAge and retirementAge`);
      }
      if (phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE) {
        throw new Error(`${field}.endAge must be greater than startAge`);
      }
      const previous = account.contributionPhases[index - 1];
      if (previous && phase.startAge < previous.endAge - PROJECTION_AGE_TOLERANCE) {
        throw new Error(
          `Contribution phases overlap between ${previous.id} and ${phase.id} for ${account.id}`,
        );
      }
    }
    assertRate(`annualReturn for ${account.id}`, account.annualReturn);
    if (
      !Number.isInteger(account.withdrawalPriority) ||
      account.withdrawalPriority < 1
    ) {
      throw new Error(
        `withdrawalPriority for ${account.id} must be a positive integer`,
      );
    }
    if (!account.allocation || typeof account.allocation !== "object") {
      throw new Error(`allocation is required for ${account.id}`);
    }
    assertNonNegative(`allocation.cash for ${account.id}`, account.allocation.cash);
    assertNonNegative(
      `allocation.fixedIncome for ${account.id}`,
      account.allocation.fixedIncome,
    );
    assertNonNegative(
      `allocation.equity for ${account.id}`,
      account.allocation.equity,
    );
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

  const registeredAccountIds = new Set(
    input.accounts
      .filter((account) => account.type === "tfsa" || account.type === "rrsp_rrif")
      .map((account) => account.id),
  );
  const hasPositiveRegisteredContribution = input.accounts.some(
    (account) =>
      registeredAccountIds.has(account.id) &&
      account.contributionPhases.some((phase) => phase.monthlyAmountToday > 0),
  );
  if (hasPositiveRegisteredContribution && !input.registeredAccountRoom) {
    throw new Error(
      "registeredAccountRoom is required when positive TFSA or RRSP/RRIF contributions are configured",
    );
  }
  if (input.registeredAccountRoom) {
    const room = input.registeredAccountRoom;
    for (const [field, source] of [
      ["TFSA starting room", room.tfsa.startingAvailableRoom],
      ["RRSP starting deduction room", room.rrsp.startingAvailableDeductionRoom],
    ] as const) {
      if (
        !["official_estimate", "configured_amount", "explicit_zero"].includes(
          source.source,
        )
      ) {
        throw new Error(`${field} source is invalid`);
      }
      assertNonNegative(`${field} amount`, source.amount);
      assertNonEmptyString(`${field} sourceDescription`, source.sourceDescription);
      if (!isIsoCalendarDate(source.effectiveDate)) {
        throw new Error(`${field} effectiveDate must be a valid ISO calendar date`);
      }
      if (source.source === "explicit_zero" && source.amount !== 0) {
        throw new Error(`${field} explicit_zero must resolve to zero`);
      }
    }
    assertRate(
      "TFSA futureIndexingRate",
      room.tfsa.annualNewRoom.futureIndexingRate,
      -0.2,
      0.5,
    );
    assertNonNegative(
      "TFSA roundingIncrement",
      room.tfsa.annualNewRoom.roundingIncrement,
    );
    if (room.tfsa.annualNewRoom.roundingIncrement <= 0) {
      throw new Error("TFSA roundingIncrement must be positive");
    }
    assertRate(
      "RRSP futureGrowthRate",
      room.rrsp.newRoom.annualCap.futureGrowthRate,
      -0.2,
      0.5,
    );
    if (room.rrsp.newRoom.annualCap.futureRoundingIncrement <= 0) {
      throw new Error("RRSP futureRoundingIncrement must be positive");
    }
    const projectionStartYear = Number(input.startDate.slice(0, 4));
    if (projectionStartYear < 2026) {
      throw new Error(
        "registeredAccountRoom requires a projection start year with bundled Canadian room references (2026 or later)",
      );
    }
    const preStart = room.rrsp.newRoom.startYearBeforeProjectionMonth;
    if (preStart.calendarYear !== projectionStartYear) {
      throw new Error(
        "RRSP startYearBeforeProjectionMonth.calendarYear must match the projection start year",
      );
    }
    assertNonNegative("RRSP pre-start eligible earned income", preStart.eligibleEarnedIncome);
    assertNonNegative("RRSP pre-start pension adjustment", preStart.pensionAdjustment);
    assertNonNegative("RRSP pre-start other room reduction", preStart.otherRoomReduction);
    if (
      Number(input.startDate.slice(5, 7)) === 1 &&
      (preStart.eligibleEarnedIncome !== 0 ||
        preStart.pensionAdjustment !== 0 ||
        preStart.otherRoomReduction !== 0)
    ) {
      throw new Error(
        "RRSP startYearBeforeProjectionMonth values must all be zero when projection starts in January because January has no pre-projection months",
      );
    }
  }

  if (!input.contributionWaterfall || typeof input.contributionWaterfall !== "object") {
    throw new Error("contributionWaterfall must be resolved before projection");
  }
  const waterfall = input.contributionWaterfall;
  if (
    waterfall.mode !== "canonical" &&
    waterfall.mode !== "fixed_source_compatibility" &&
    waterfall.mode !== "simple_policy"
  ) {
    throw new Error("contributionWaterfall.mode is invalid");
  }
  if (!Array.isArray(waterfall.routes) || !Array.isArray(waterfall.surplusDestinationAccountIds)) {
    throw new Error("contributionWaterfall routes and surplus destinations must be arrays");
  }
  if (waterfall.mode === "fixed_source_compatibility") {
    waterfall.routes = input.accounts
      .filter((account) => account.contributionPhases.length > 0)
      .map((account) => ({
        sourceAccountId: account.id,
        destinationAccountIds: [account.id],
      }));
    waterfall.surplusDestinationAccountIds = [];
  }
  const routeSources = new Set<string>();
  for (const route of waterfall.routes) {
    assertNonEmptyString("contributionWaterfall sourceAccountId", route.sourceAccountId);
    if (routeSources.has(route.sourceAccountId)) {
      throw new Error(`Duplicate contribution waterfall source ${route.sourceAccountId}`);
    }
    routeSources.add(route.sourceAccountId);
    const source = accountsById.get(route.sourceAccountId);
    if (!source) throw new Error(`Unknown contribution waterfall source ${route.sourceAccountId}`);
    if (source.contributionPhases.length === 0) {
      throw new Error(`Contribution waterfall source ${source.id} has no contribution phases`);
    }
    if (!Array.isArray(route.destinationAccountIds) || route.destinationAccountIds.length === 0) {
      throw new Error(`Contribution waterfall route ${source.id} requires destinations`);
    }
    if (route.destinationAccountIds[0] !== source.id) {
      throw new Error(`Contribution waterfall route ${source.id} must start with its source account`);
    }
    const destinations = new Set<string>();
    for (const [index, destinationId] of route.destinationAccountIds.entries()) {
      if (destinations.has(destinationId)) {
        throw new Error(`Duplicate destination ${destinationId} in contribution route ${source.id}`);
      }
      destinations.add(destinationId);
      const destination = accountsById.get(destinationId);
      if (!destination) throw new Error(`Unknown contribution waterfall destination ${destinationId}`);
      if (!["tfsa", "rrsp_rrif", "non_registered"].includes(destination.type)) {
        throw new Error(`Contribution waterfall destination ${destinationId} must be an investment account`);
      }
      if (
        destination.type === "non_registered" &&
        index !== route.destinationAccountIds.length - 1
      ) {
        throw new Error(`Non-registered destination ${destinationId} must be last`);
      }
      if (
        (destination.type === "tfsa" || destination.type === "rrsp_rrif") &&
        !input.registeredAccountRoom
      ) {
        throw new Error(`Registered destination ${destinationId} requires registeredAccountRoom`);
      }
    }
  }
  if (waterfall.mode === "canonical" || waterfall.mode === "simple_policy") {
    for (const account of input.accounts.filter((item) => item.contributionPhases.length > 0)) {
      if (!routeSources.has(account.id)) {
        throw new Error(`Canonical contribution waterfall requires a route for ${account.id}`);
      }
    }
  }
  const surplusDestinations = new Set<string>();
  for (const [index, destinationId] of waterfall.surplusDestinationAccountIds.entries()) {
    if (surplusDestinations.has(destinationId)) {
      throw new Error(`Duplicate surplus waterfall destination ${destinationId}`);
    }
    surplusDestinations.add(destinationId);
    const destination = accountsById.get(destinationId);
    if (!destination || !["tfsa", "rrsp_rrif", "non_registered"].includes(destination.type)) {
      throw new Error(`Invalid surplus waterfall destination ${destinationId}`);
    }
    if (
      destination.type === "non_registered" &&
      index !== waterfall.surplusDestinationAccountIds.length - 1
    ) {
      throw new Error(
        `Non-registered surplus destination ${destinationId} must be last`,
      );
    }
    if (
      (destination.type === "tfsa" || destination.type === "rrsp_rrif") &&
      !input.registeredAccountRoom
    ) {
      throw new Error(`Registered surplus destination ${destinationId} requires registeredAccountRoom`);
    }
  }

  const surplus = input.surplusAllocation;
  if (!surplus || typeof surplus !== "object") {
    throw new Error(
      "surplusAllocation is required; configure explicit reserve accounts, a refill account, and an excess strategy",
    );
  }
  if (
    !Array.isArray(surplus.reserveAccountIds) ||
    surplus.reserveAccountIds.length === 0
  ) {
    throw new Error(
      "surplusAllocation.reserveAccountIds must be a non-empty array",
    );
  }
  const reserveAccountIds = new Set<string>();
  for (const [index, accountId] of surplus.reserveAccountIds.entries()) {
    assertNonEmptyString(
      `surplusAllocation.reserveAccountIds[${index}]`,
      accountId,
    );
    if (reserveAccountIds.has(accountId)) {
      throw new Error(
        `surplusAllocation.reserveAccountIds contains duplicate account ${accountId}`,
      );
    }
    reserveAccountIds.add(accountId);
  }
  assertNonEmptyString(
    "surplusAllocation.reserveRefillAccountId",
    surplus.reserveRefillAccountId,
  );
  if (!reserveAccountIds.has(surplus.reserveRefillAccountId)) {
    throw new Error(
      "surplusAllocation.reserveRefillAccountId must be included in reserveAccountIds",
    );
  }
  assertNonNegative(
    "surplusAllocation.targetCashReserveToday",
    surplus.targetCashReserveToday,
  );
  assertRate(
    "surplusAllocation.reserveIndexingRate",
    surplus.reserveIndexingRate,
    -0.2,
    0.5,
  );
  if (!surplus.excess || typeof surplus.excess !== "object") {
    throw new Error("surplusAllocation.excess is required");
  }
  const excess = surplus.excess as SurplusAllocationPolicyInput["excess"] &
    Record<string, unknown>;
  if (
    excess.mode !== "retain_as_cash" &&
    excess.mode !== "allocate_to_account" &&
    excess.mode !== "allocate_through_contribution_waterfall"
  ) {
    throw new Error(
      "surplusAllocation.excess.mode must be retain_as_cash, allocate_to_account, or allocate_through_contribution_waterfall",
    );
  }
  if (excess.mode === "retain_as_cash" && "destinationAccountId" in excess) {
    throw new Error(
      "surplusAllocation.excess.destinationAccountId is not allowed for retain_as_cash",
    );
  }
  if (
    excess.mode === "allocate_through_contribution_waterfall" &&
    waterfall.surplusDestinationAccountIds.length === 0
  ) {
    throw new Error(
      "allocate_through_contribution_waterfall requires surplusDestinationAccountIds",
    );
  }
  if (excess.mode === "allocate_to_account") {
    assertNonEmptyString(
      "surplusAllocation.excess.destinationAccountId",
      excess.destinationAccountId,
    );
    if (reserveAccountIds.has(excess.destinationAccountId)) {
      throw new Error(
        "surplusAllocation reserve and destination accounts must be different",
      );
    }
    const destination = accountsById.get(excess.destinationAccountId);
    if (!destination) {
      throw new Error(
        `Unknown surplusAllocation excess destination account ${excess.destinationAccountId}`,
      );
    }
    if (destination.type !== "non_registered") {
      throw new Error(
        `Surplus allocation destination ${destination.id} must be a non-registered account; automatic TFSA, RRSP/RRIF, cash, and debt routing is unavailable`,
      );
    }
  }

  const rrspMayReceiveContributions =
    input.accounts.some(
      (account) =>
        account.type === "rrsp_rrif" &&
        account.contributionPhases.some(
          (phase) => phase.monthlyAmountToday > 0,
        ),
    ) ||
    waterfall.routes.some((route) =>
      route.destinationAccountIds.some(
        (accountId) => accountsById.get(accountId)?.type === "rrsp_rrif",
      ),
    ) ||
    (excess.mode === "allocate_through_contribution_waterfall" &&
      waterfall.surplusDestinationAccountIds.some(
        (accountId) => accountsById.get(accountId)?.type === "rrsp_rrif",
      ));
  if (rrspMayReceiveContributions && !input.registeredAccountRoom) {
    throw new Error(
      "registeredAccountRoom is required whenever RRSP/RRIF can receive contributions",
    );
  }
  if (rrspMayReceiveContributions) {
    for (const [index, phase] of input.person.employmentIncomePhases.entries()) {
      if (!phase.rrspRoomGeneration) {
        throw new Error(
          `employmentIncomePhases[${index}].rrspRoomGeneration is required whenever RRSP/RRIF can receive contributions; configure explicit values, including zeros`,
        );
      }
    }
  }
  for (const reserveAccountId of surplus.reserveAccountIds) {
    const reserveAccount = accountsById.get(reserveAccountId);
    if (!reserveAccount) {
      throw new Error(
        `Unknown surplusAllocation reserve account ${reserveAccountId}`,
      );
    }
    if (reserveAccount.type !== "cash") {
      throw new Error(
        `Surplus allocation reserve account ${reserveAccount.id} must be a cash account`,
      );
    }
  }

  const savingsPolicy = input.savingsPolicy;
  if (!savingsPolicy || typeof savingsPolicy !== "object") {
    throw new Error("savingsPolicy must be resolved before projection");
  }
  if (savingsPolicy.mode !== "advanced" && savingsPolicy.mode !== "simple") {
    throw new Error("savingsPolicy.mode must be advanced or simple");
  }
  if (savingsPolicy.mode === "simple") {
    if (waterfall.mode !== "simple_policy") {
      throw new Error(
        "Simple savings policy requires the compiled simple_policy contribution waterfall",
      );
    }
    const accountFor = (field: string, accountId: string) => {
      assertNonEmptyString(field, accountId);
      const account = accountsById.get(accountId);
      if (!account) throw new Error(`${field} references an unknown account`);
      return account;
    };
    const operatingCash = accountFor(
      "savingsPolicy.operatingCashAccountId",
      savingsPolicy.operatingCashAccountId,
    );
    const reserveRefill = accountFor(
      "savingsPolicy.reserveRefillAccountId",
      savingsPolicy.reserveRefillAccountId,
    );
    const personalTfsa = accountFor(
      "savingsPolicy.personalTfsaAccountId",
      savingsPolicy.personalTfsaAccountId,
    );
    const personalRrsp = accountFor(
      "savingsPolicy.personalRrspAccountId",
      savingsPolicy.personalRrspAccountId,
    );
    const taxable = accountFor(
      "savingsPolicy.taxableAccountId",
      savingsPolicy.taxableAccountId,
    );
    const workplace =
      savingsPolicy.workplaceRrspAccountId === null
        ? null
        : accountFor(
            "savingsPolicy.workplaceRrspAccountId",
            savingsPolicy.workplaceRrspAccountId,
          );
    if (operatingCash.type !== "cash") {
      throw new Error("savingsPolicy operating cash account must be cash");
    }
    if (reserveRefill.type !== "cash") {
      throw new Error("savingsPolicy reserve refill account must be cash");
    }
    if (personalTfsa.type !== "tfsa") {
      throw new Error("savingsPolicy personal TFSA account must be TFSA");
    }
    if (personalRrsp.type !== "rrsp_rrif") {
      throw new Error("savingsPolicy personal RRSP account must be RRSP/RRIF");
    }
    if (workplace && workplace.type !== "rrsp_rrif") {
      throw new Error("savingsPolicy workplace RRSP account must be RRSP/RRIF");
    }
    if (workplace && workplace.id === personalRrsp.id) {
      throw new Error(
        "savingsPolicy personal and workplace RRSP accounts must be different",
      );
    }
    if (taxable.type !== "non_registered") {
      throw new Error(
        "savingsPolicy taxable destination must be non-registered",
      );
    }
    if (taxable.origin !== savingsPolicy.taxableAccountOrigin) {
      throw new Error(
        "savingsPolicy taxable destination origin must match the resolved account",
      );
    }
    if (
      !Array.isArray(savingsPolicy.reserveAccountIds) ||
      savingsPolicy.reserveAccountIds.length === 0 ||
      !savingsPolicy.reserveAccountIds.includes(operatingCash.id) ||
      !savingsPolicy.reserveAccountIds.includes(reserveRefill.id)
    ) {
      throw new Error(
        "savingsPolicy reserve accounts must include operating cash and the reserve refill account",
      );
    }
    if (
      savingsPolicy.reserveAccountIds.length !==
        surplus.reserveAccountIds.length ||
      savingsPolicy.reserveAccountIds.some(
        (accountId, index) =>
          accountId !== surplus.reserveAccountIds[index],
      ) ||
      savingsPolicy.reserveRefillAccountId !==
        surplus.reserveRefillAccountId
    ) {
      throw new Error(
        "savingsPolicy reserve references must match the resolved surplus allocation policy",
      );
    }
    if (
      savingsPolicy.unplannedCash !== "retain_in_operating_cash" ||
      savingsPolicy.workplaceRoomPriority !== "first" ||
      savingsPolicy.workplaceOverflow !== "unallocated" ||
      savingsPolicy.reserveAfterTarget !== "personal_investing" ||
      !Array.isArray(savingsPolicy.personalOrder) ||
      savingsPolicy.personalOrder.length !== 3 ||
      savingsPolicy.personalOrder[0] !== "personal_tfsa" ||
      savingsPolicy.personalOrder[1] !== "personal_rrsp" ||
      savingsPolicy.personalOrder[2] !== "taxable"
    ) {
      throw new Error("savingsPolicy contains an unsupported simple policy");
    }
    const personalRoute = waterfall.routes.find(
      (route) => route.sourceAccountId === personalTfsa.id,
    );
    if (
      personalTfsa.contributionPhases.length > 0 &&
      (!personalRoute ||
        personalRoute.destinationAccountIds.length !== 3 ||
        personalRoute.destinationAccountIds[0] !== personalTfsa.id ||
        personalRoute.destinationAccountIds[1] !== personalRrsp.id ||
        personalRoute.destinationAccountIds[2] !== taxable.id)
    ) {
      throw new Error(
        "Simple personal contribution route must be personal TFSA, personal RRSP, then taxable",
      );
    }
    if (workplace) {
      const workplaceRoute = waterfall.routes.find(
        (route) => route.sourceAccountId === workplace.id,
      );
      if (
        workplace.contributionPhases.length > 0 &&
        (!workplaceRoute ||
          workplaceRoute.destinationAccountIds.length !== 1 ||
          workplaceRoute.destinationAccountIds[0] !== workplace.id ||
          waterfall.routes[0]?.sourceAccountId !== workplace.id)
      ) {
        throw new Error(
          "Simple workplace RRSP route must be first and must not redirect overflow",
        );
      }
    }
    if (
      waterfall.surplusDestinationAccountIds.length !== 3 ||
      waterfall.surplusDestinationAccountIds[0] !== personalTfsa.id ||
      waterfall.surplusDestinationAccountIds[1] !== personalRrsp.id ||
      waterfall.surplusDestinationAccountIds[2] !== taxable.id
    ) {
      throw new Error(
        "Simple reserve redirect route must use personal TFSA, personal RRSP, then taxable",
      );
    }
    if (!Array.isArray(savingsPolicy.reserveBuildingPhases)) {
      throw new Error(
        "savingsPolicy.reserveBuildingPhases must be an array",
      );
    }
    const phaseIds = new Set<string>();
    let previousReservePhase: SavingsPlanPhase | undefined;
    for (const [index, phase] of savingsPolicy.reserveBuildingPhases.entries()) {
      const field = `savingsPolicy.reserveBuildingPhases[${index}]`;
      assertNonEmptyString(`${field}.id`, phase.id);
      assertNonEmptyString(`${field}.label`, phase.label);
      if (phaseIds.has(phase.id)) {
        throw new Error(
          `Savings policy reserve-building phase ids must be unique: ${phase.id}`,
        );
      }
      phaseIds.add(phase.id);
      assertNonNegative(
        `${field}.monthlyAmountToday`,
        phase.monthlyAmountToday,
      );
      assertRate(`${field}.indexingRate`, phase.indexingRate, -0.2, 0.5);
      assertMonthAligned(
        `${field}.startAge`,
        phase.startAge,
        input.person.currentAge,
      );
      assertMonthAligned(
        `${field}.endAge`,
        phase.endAge,
        input.person.currentAge,
      );
      if (
        phase.startAge < input.person.currentAge - PROJECTION_AGE_TOLERANCE ||
        phase.endAge >
          input.person.retirementAge + PROJECTION_AGE_TOLERANCE ||
        phase.endAge <= phase.startAge + PROJECTION_AGE_TOLERANCE
      ) {
        throw new Error(
          `${field} must be a positive range within working ages`,
        );
      }
      if (
        previousReservePhase &&
        phase.startAge <
          previousReservePhase.endAge - PROJECTION_AGE_TOLERANCE
      ) {
        throw new Error(
          `${field} overlaps the preceding reserve-building phase`,
        );
      }
      previousReservePhase = phase;
    }
  } else if (waterfall.mode === "simple_policy") {
    throw new Error(
      "Advanced savings policy cannot use a simple_policy contribution waterfall",
    );
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
    if (event.direction === "inflow" && event.targetAccountId) {
      const target = accountsById.get(event.targetAccountId);
      if (target?.type === "tfsa" || target?.type === "rrsp_rrif") {
        throw new Error(
          `Targeted event inflow ${event.id} cannot deposit directly into a registered account because contribution-room treatment is not modelled`,
        );
      }
    }
  }

  return input;
}

export const projectionInputsSchema = {
  parse: validateProjectionInputs,
};
