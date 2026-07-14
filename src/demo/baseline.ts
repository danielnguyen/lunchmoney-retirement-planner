import type { BaselineValue } from "@/src/domain/defaults/types";
import { resolveBaselineRecord } from "@/src/domain/defaults/resolve";
import type { ProjectionInputs } from "@/src/domain/projection/types";

const effectiveDate = "2026-01-01";

function fallback(value: number, description: string): BaselineValue<number> {
  return {
    value,
    sourceType: "application_fallback",
    sourceDescription: description,
    effectiveDate,
  };
}

function canadianReference(
  value: number,
  description: string,
  referenceKind: NonNullable<BaselineValue<number>["referenceKind"]>,
): BaselineValue<number> {
  return {
    value,
    sourceType: "canadian_reference",
    sourceDescription: description,
    effectiveDate,
    referenceKind,
  };
}

export const demoBaseline = resolveBaselineRecord<ProjectionInputs>({
  currentAge: {
    applicationFallback: fallback(40, "Demonstration age"),
  },
  retirementAge: {
    canadianReference: canadianReference(
      65,
      "Standard Canadian public-pension reference age",
      "statutory_program_default",
    ),
    applicationFallback: fallback(65, "Application retirement-age fallback"),
  },
  endAge: {
    applicationFallback: fallback(95, "Demonstration projection end age"),
  },
  currentSavings: {
    applicationFallback: fallback(150000, "Demonstration starting balance"),
  },
  monthlyContribution: {
    applicationFallback: fallback(2000, "Demonstration monthly contribution"),
  },
  annualReturnBeforeRetirement: {
    applicationFallback: fallback(0.05, "Demonstration pre-retirement return"),
  },
  annualReturnAfterRetirement: {
    applicationFallback: fallback(0.04, "Demonstration post-retirement return"),
  },
  annualInflation: {
    canadianReference: canadianReference(
      0.02,
      "Bank of Canada inflation-control target midpoint",
      "published_planning_assumption",
    ),
    applicationFallback: fallback(0.02, "Application inflation fallback"),
  },
  monthlyRetirementSpendingToday: {
    applicationFallback: fallback(4500, "Demonstration retirement spending"),
  },
  monthlyGovernmentBenefitsToday: {
    applicationFallback: fallback(1600, "Demonstration public benefits"),
  },
  retirementGoalToday: {
    applicationFallback: fallback(1000000, "Demonstration retirement goal"),
  },
});

export const demoInputs: ProjectionInputs = Object.fromEntries(
  Object.entries(demoBaseline).map(([key, baseline]) => [key, baseline.value]),
) as ProjectionInputs;
