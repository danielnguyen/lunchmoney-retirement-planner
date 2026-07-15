import type {
  AssetAllocation,
  ContributionFunding,
  ProjectionEventInput,
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

export type AccountMapping = {
  include: boolean;
  type: PlannerAccountType;
  monthlyContribution?: number;
  contributionFunding?: ContributionFunding;
  annualReturn?: number;
  withdrawalPriority?: number;
  allocation?: AssetAllocation;
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
  cppIndexing: number;
  oasIndexing: number;
  effectiveTaxRate: number;
  oasRecoveryThreshold: number;
  oasRecoveryRate: number;
  pensionAnnualIncome: number;
  pensionStartAge: number;
  pensionIndexing: number;
  rrifConversionAge: number;
  allocations: Record<"cash" | "tfsa" | "rrsp" | "non_registered" | "debt", AssetAllocation>;
};

export type PlannerConfig = {
  currentAge: number;
  retirementAge: number;
  projectionEndAge: number;
  cppStartAge: number;
  oasStartAge: number;
  cppMonthlyAmountAt65: number;
  oasMonthlyAmountAt65: number;
  retirementGoal: number;
  transactionTrailingMonths: number;
  accountMappings: Record<string, AccountMapping>;
  categoryMappings: Record<string, CategoryMapping>;
  assumptions: PlannerAssumptions;
  futureEvents: ProjectionEventInput[];
};
