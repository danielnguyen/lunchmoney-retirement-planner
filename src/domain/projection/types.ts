import { z } from "zod";

export const projectionInputsSchema = z
  .object({
    currentAge: z.number().min(18).max(100),
    retirementAge: z.number().min(18).max(100),
    endAge: z.number().min(19).max(120),
    currentSavings: z.number().min(0),
    monthlyContribution: z.number().min(0),
    annualReturnBeforeRetirement: z.number().min(-0.99).max(1),
    annualReturnAfterRetirement: z.number().min(-0.99).max(1),
    annualInflation: z.number().min(-0.2).max(0.5),
    monthlyRetirementSpendingToday: z.number().min(0),
    monthlyGovernmentBenefitsToday: z.number().min(0),
    retirementGoalToday: z.number().min(0),
  })
  .refine((value) => value.retirementAge > value.currentAge, {
    message: "retirementAge must be greater than currentAge",
    path: ["retirementAge"],
  })
  .refine((value) => value.endAge > value.retirementAge, {
    message: "endAge must be greater than retirementAge",
    path: ["endAge"],
  });

export type ProjectionInputs = z.infer<typeof projectionInputsSchema>;

export type ProjectionPoint = {
  age: number;
  yearIndex: number;
  nominalBalance: number;
  realBalance: number;
  realGoal: number;
  annualContributions: number;
  annualWithdrawals: number;
  annualInvestmentGrowth: number;
  phase: "accumulation" | "retirement";
};

export type ProjectionSummary = {
  balanceAtRetirementNominal: number;
  balanceAtRetirementToday: number;
  retirementGoalToday: number;
  goalGapToday: number;
  depletionAge: number | null;
  endingBalanceToday: number;
};

export type ProjectionResult = {
  schemaVersion: "1.0";
  inputs: ProjectionInputs;
  summary: ProjectionSummary;
  yearly: ProjectionPoint[];
};
