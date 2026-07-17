import type {
  BaselineWarning,
  CurrentBaseline,
} from "@/src/domain/baseline/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";

const LONG_LIVE_BASELINE_INCOME_CODE = "long_live_baseline_income";
const AGE_TOLERANCE = 1e-6;

function formatYears(value: number): string {
  return new Intl.NumberFormat("en-CA", {
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Replaces the refreshed-baseline long-income warning with warnings that
 * describe the active scenario. Amount overrides therefore affect the warning
 * immediately, while unrelated growth overrides do not.
 */
export function resolveActiveScenarioWarnings(
  baseline: CurrentBaseline,
  activeInputs: ProjectionInputs,
): BaselineWarning[] {
  const otherWarnings = baseline.warnings.filter(
    (warning) => warning.code !== LONG_LIVE_BASELINE_INCOME_CODE,
  );
  const activeWarnings = activeInputs.person.employmentIncomePhases.flatMap(
    (activePhase): BaselineWarning[] => {
      const years = activePhase.endAge - activePhase.startAge;
      if (years <= 5 + AGE_TOLERANCE) return [];

      const refreshedPhase =
        baseline.projectionInputs.person.employmentIncomePhases.find(
          (phase) => phase.id === activePhase.id,
        );
      if (!refreshedPhase) return [];

      const provenance =
        baseline.provenance[
          `person.employmentIncomePhases.${activePhase.id}.annualNetCashToday`
        ];
      const isRefreshedLiveBaseline =
        provenance?.sourceType === "lunchmoney_derived";
      const stillUsesRefreshedAmount =
        activePhase.annualNetCashToday === refreshedPhase.annualNetCashToday;
      if (!isRefreshedLiveBaseline || !stillUsesRefreshedAmount) return [];

      return [{
        code: LONG_LIVE_BASELINE_INCOME_CODE,
        severity: "warning",
        identifier: activePhase.id,
        message:
          `Current Lunch Money employment income is assumed to continue for ${formatYears(years)} years. ` +
          "Consider configuring future employment-income phases.",
      }];
    },
  );

  return [...otherWarnings, ...activeWarnings];
}
