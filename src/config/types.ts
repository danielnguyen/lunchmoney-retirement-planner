import type {
  AssetAllocation,
  ContributionFunding,
  ProjectionEventInput,
  RegisteredAccountRoomInput,
  ContributionWaterfallInput,
  SurplusAllocationPolicyInput,
} from "@/src/domain/projection/types";
import type { LiabilityInterestRateConvention } from "@/src/domain/projection/liability-interest";

export const plannerAccountTypes = [
  "cash",
  "tfsa",
  "rrsp",
  "non_registered",
  "real_estate",
  "debt",
  "exclude",
] as const;

export type PlannerAccountType = (typeof plannerAccountTypes)[number];

export const transactionClassifications = [
  "essential",
  "discretionary",
  "income",
  "investment_contribution",
  "debt_payment",
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
  "primary_residence",
  "primary_mortgage",
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
  annualAppreciation?: number;
  withdrawalPriority?: number;
  allocation?: AssetAllocation;
  liability?: LiabilityTreatmentConfig;
};

export const liabilityPaymentFrequencies = [
  "monthly",
  "semimonthly",
  "biweekly",
  "weekly",
] as const;

export type LiabilityPaymentFrequency =
  (typeof liabilityPaymentFrequencies)[number];

export type LiabilityTreatmentConfig =
  | {
      mode: "amortizing";
      annualInterestRate: number;
      interestRateConvention: LiabilityInterestRateConvention;
      regularPayment: {
        amount: number;
        frequency: LiabilityPaymentFrequency;
      };
      scheduleStartDate: string;
      lumpSumPayments: Array<{
        date: string;
        amount: number;
      }>;
      historicalPayment?:
        | {
            mode: "payee_and_source_account";
            sourceAccountId: string;
            payee: string;
          }
        | {
            mode: "already_excluded_or_transfer";
          };
      /** @deprecated Use historicalPayment.mode: already_excluded_or_transfer. */
      historicalPaymentHandling?: "already_excluded_or_transfer";
    }
  | {
      mode: "payoff_at_projection_start";
      historicalPayment?: {
        mode: "already_excluded_or_transfer";
      };
      /** @deprecated Use historicalPayment.mode: already_excluded_or_transfer. */
      historicalPaymentHandling?: "already_excluded_or_transfer";
    };

export type PrimaryResidenceConfig = {
  currentValue: number;
  asOf: string;
  annualAppreciation: number;
};

export type ProjectionAccountConfig = {
  label: string;
  type: Exclude<PlannerAccountType, "debt" | "exclude" | "real_estate">;
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
  operatingCash?: {
    targetToday: number;
    indexingRate: number;
  };
  unplannedCash:
    | "retain_in_operating_cash"
    | "sweep_above_targets";
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
      liabilityRole?: "primary_mortgage";
      liabilityId?: string;
    };

export type PlannerAssumptions = {
  inflation: number;
  cashReturn: number;
  tfsaReturn: number;
  rrspReturn: number;
  nonRegisteredReturn: number;
  debtReturn?: number;
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
  allocations: Record<"cash" | "tfsa" | "rrsp" | "non_registered", AssetAllocation> & {
    debt?: AssetAllocation;
  };
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
  primaryResidence?: PrimaryResidenceConfig;
  projectionAccounts?: Record<string, ProjectionAccountConfig>;
  registeredAccountRoom?: RegisteredAccountRoomInput;
  contributionWaterfall?: Omit<ContributionWaterfallInput, "mode">;
  surplusAllocation?: SurplusAllocationPolicyInput;
  categoryMappings: Record<string, CategoryMapping>;
  assumptions: PlannerAssumptions;
  futureEvents: ProjectionEventInput[];
};
