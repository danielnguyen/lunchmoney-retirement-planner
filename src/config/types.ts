import type {
  AssetAllocation,
  ContributionFunding,
  ProjectionEventInput,
  RegisteredAccountRoomInput,
  ContributionWaterfallInput,
  SurplusAllocationPolicyInput,
} from "@/src/domain/projection/types";

export const plannerAccountTypes = [
  "cash",
  "tfsa",
  "rrsp",
  "non_registered",
  "debt",
  "exclude",
] as const;

export type PlannerAccountType = (typeof plannerAccountTypes)[number];

export const transactionClassifications = [
  "essential",
  "discretionary",
  "income",
  "investment_contribution",
  "transfer",
  "exclude",
] as const;

export type TransactionClassification = (typeof transactionClassifications)[number];

export type LiveBaselineAmount = number | "live_baseline";

export const accountRoles = [
  "operating_cash",
  "reserve_member",
  "reserve_refill",
  "personal_tfsa",
  "personal_rrsp",
  "workplace_rrsp",
  "personal_taxable",
] as const;

export type AccountRole = (typeof accountRoles)[number];

export type EmploymentIncomePhaseConfig = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  annualNetCashToday: LiveBaselineAmount;
  annualGrowth: number;
  rrspRoomGeneration?: {
    annualEligibleEarnedIncomeToday: number;
    annualPensionAdjustmentToday: number;
    annualOtherRoomReductionToday: number;
    annualGrowth: number;
  };
  rrspRoom?: {
    eligibleEarnedIncomeToday: number;
    pensionAdjustmentToday: number;
    otherReductionToday: number;
    annualGrowth: number;
  };
};

export type ContributionPhaseConfig = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  monthlyAmountToday: LiveBaselineAmount;
  funding: ContributionFunding;
  indexingRate: number;
};

export type AccountMapping = {
  include: boolean;
  type: PlannerAccountType;
  roles?: AccountRole[];
  monthlyContribution?: number;
  contributionFunding?: ContributionFunding;
  contributionPhases?: ContributionPhaseConfig[];
  annualReturn?: number;
  withdrawalPriority?: number;
  allocation?: AssetAllocation;
};

export type ProjectionAccountConfig = {
  label: string;
  type: Exclude<PlannerAccountType, "debt" | "exclude">;
  annualReturn: number;
  withdrawalPriority: number;
  allocation: AssetAllocation;
  contributionPhases: ContributionPhaseConfig[];
};

export type RegisteredRoomConfig = {
  tfsa: {
    availableAtStart: number;
    asOf: string;
  };
  rrsp: {
    availableAtStart: number;
    asOf: string;
    currentYearBeforePlanStart?: {
      eligibleEarnedIncome: number;
      pensionAdjustment: number;
      otherReduction: number;
    };
  };
};

export type SavingsPlanPhaseConfig = {
  id: string;
  label: string;
  startAge: number;
  endAge: number;
  monthlyAmountToday: number;
  indexingRate: number;
};

export type SavingsPolicyConfig = {
  unplannedCash: "retain_in_operating_cash";
  personalInvesting: {
    order: ["personal_tfsa", "personal_rrsp", "taxable"];
    phases: SavingsPlanPhaseConfig[];
  };
  reserveBuilding: {
    targetToday: number;
    indexingRate: number;
    phases: SavingsPlanPhaseConfig[];
    afterTarget: "personal_investing";
  };
  workplaceRrsp?: {
    roomPriority: "first";
    overflow: "unallocated";
    phases: SavingsPlanPhaseConfig[];
  };
};

export type CategoryMapping =
  | TransactionClassification
  | {
      classification: TransactionClassification;
      contributionAccountId?: string;
      contributionDirection?: "debit" | "credit";
    };

export type PlannerAssumptions = {
  inflation: number;
  cashReturn: number;
  tfsaReturn: number;
  rrspReturn: number;
  nonRegisteredReturn: number;
  debtReturn: number;
  incomeGrowth: number;
  contributionIndexing: number;
  cppIndexing?: number;
  oasIndexing?: number;
  effectiveTaxRate: number;
  oasRecoveryThreshold: number;
  oasRecoveryRate: number;
  pensionAnnualIncome: number;
  pensionStartAge: number;
  pensionIndexing: number;
  rrifConversionAge: number;
  allocations: Record<"cash" | "tfsa" | "rrsp" | "non_registered" | "debt", AssetAllocation>;
};

export type CppAmountAt65Config =
  | {
      source: "official_estimate";
      monthlyAmountToday: number;
      effectiveDate: string;
    }
  | {
      source: "configured_amount";
      monthlyAmountToday: number;
      effectiveDate: string;
    }
  | {
      source: "canadian_reference";
    }
  | {
      source: "explicit_zero";
    };

export type OasFullAmountAt65Config =
  | {
      source: "configured_amount";
      monthlyAmountToday: number;
      effectiveDate: string;
    }
  | {
      source: "canadian_reference";
    };

export type OasEligibilityConfig =
  | { mode: "full" | "none" }
  | {
      mode: "partial";
      qualifyingResidenceYearsAfter18: number;
    };

export type GovernmentBenefitsConfig = {
  cpp: {
    startAge: number;
    indexingRate: number;
    amountAt65: CppAmountAt65Config;
  };
  oas: {
    startAge: number;
    indexingRate: number;
    fullAmountAt65: OasFullAmountAt65Config;
    eligibility: OasEligibilityConfig;
  };
};

export type PlannerConfig = {
  configurationMode: "simple" | "advanced";
  currentAge: number;
  retirementAge: number;
  projectionEndAge: number;
  governmentBenefits?: GovernmentBenefitsConfig;
  cppStartAge?: number;
  oasStartAge?: number;
  cppMonthlyAmountAt65?: number;
  oasMonthlyAmountAt65?: number;
  retirementGoal: number;
  transactionTrailingMonths: number;
  employmentIncomePhases?: EmploymentIncomePhaseConfig[];
  accountMappings: Record<string, AccountMapping>;
  registeredRoom?: RegisteredRoomConfig;
  savingsPolicy?: SavingsPolicyConfig;
  projectionAccounts?: Record<string, ProjectionAccountConfig>;
  registeredAccountRoom?: RegisteredAccountRoomInput;
  contributionWaterfall?: Omit<ContributionWaterfallInput, "mode">;
  surplusAllocation?: SurplusAllocationPolicyInput;
  categoryMappings: Record<string, CategoryMapping>;
  assumptions: PlannerAssumptions;
  futureEvents: ProjectionEventInput[];
};
