import type {
  BaselineWarning,
  BaselineWarningCode,
  CurrentBaseline,
} from "@/src/domain/baseline/types";
import type { ProjectionInputs } from "@/src/domain/projection/types";

const LONG_LIVE_BASELINE_INCOME_CODE = "long_live_baseline_income";
const AGE_TOLERANCE = 1e-6;

export type ScenarioWarningPlacement =
  | "action_required"
  | "calculation_note";

const scenarioWarningPlacement: Record<
  BaselineWarningCode,
  ScenarioWarningPlacement
> = {
  transactions_skipped: "calculation_note",
  no_transactions: "action_required",
  unused_account_mapping: "action_required",
  contribution_target_required: "action_required",
  suggested_recurring_ignored: "action_required",
  negative_derived_total: "action_required",
  cash_account_required: "action_required",
  invalid_manual_contribution: "action_required",
  withdrawal_priority_required: "action_required",
  negative_asset_balance: "action_required",
  long_live_baseline_income: "action_required",
  cpp_canadian_reference_in_use: "action_required",
  oas_canadian_reference_in_use: "action_required",
  legacy_zero_cpp_amount: "action_required",
  legacy_zero_oas_amount: "action_required",
  contribution_waterfall_compatibility: "calculation_note",
  liability_payment_mismatch: "action_required",
  flat_tax_compatibility_active: "calculation_note",
  canadian_tax_provisional: "calculation_note",
  opening_tax_year_context_active: "calculation_note",
  suspicious_employment_income_bases: "action_required",
  inactive_flat_tax_fields: "calculation_note",
  oas_recovery_threshold_estimate: "calculation_note",
  rrif_minimums_not_modelled: "calculation_note",
  rrif_statutory_minimums_active: "calculation_note",
  non_registered_tax_not_modelled: "calculation_note",
  non_registered_tax_simplified_active: "calculation_note",
  non_registered_zero_acb: "action_required",
  non_registered_distribution_yield_review: "action_required",
  non_registered_foreign_tax_credit_not_modelled: "calculation_note",
  supported_tax_model_complete: "calculation_note",
};

export function organizeScenarioWarnings(
  warnings: readonly BaselineWarning[],
): {
  actionRequired: BaselineWarning[];
  calculationNotes: BaselineWarning[];
} {
  const actionRequired: BaselineWarning[] = [];
  const calculationNotes: BaselineWarning[] = [];

  for (const warning of warnings) {
    if (
      warning.severity === "error" ||
      scenarioWarningPlacement[warning.code] === "action_required"
    ) {
      actionRequired.push(warning);
    } else {
      calculationNotes.push(warning);
    }
  }

  return { actionRequired, calculationNotes };
}

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
