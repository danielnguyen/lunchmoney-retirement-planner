import type { DeterministicInflationPath, DeterministicReturnPath } from "./return-path";
import type { ProjectionInputs } from "./types";
import type { RetirementCandidateEvaluation } from "./retirement-requirement";

export type SpendingCapacityRequest = { phaseIds: string[] };
export type SpendingCapacityResult = {
  status: "available" | "insufficient_assets" | "unavailable";
  reason: string | null;
  scale: number | null;
  referenceMonthlyDiscretionaryToday: number | null;
  precisionMonthlyToday: number;
  terminalFinancialAssetsToday: number | null;
  firstShortfallAge: number | null;
  depletionAge: number | null;
  nextCentFails: boolean | null;
  effectiveInputs: {
    effectiveDate: string;
    retirementAge: number;
    terminalAge: number;
    minimumEndingFinancialAssetsToday: number;
    terminalFloorSource: string;
    projectedRetirementAssetsToday: number;
    taxMode: string;
    provisionalTax: boolean;
    returnPath: string;
    annualInflation: number;
    inflationPath: DeterministicInflationPath | null;
    accounts: Array<{ accountType: string; withdrawalPriority: number; annualReturn: number; returnPath: DeterministicReturnPath | null }>;
    withdrawalStrategy: "configured_static_priority" | "static_priority" | "planned_registered_bridge";
  };
  phases: Array<{
    phaseId: string;
    startAge: number;
    endAge: number;
    source: string;
    monthlyEssentialToday: number;
    configuredMonthlyDiscretionaryToday: number;
    monthlyDiscretionaryCapacityToday: number | null;
    monthlyLifestyleCapacityToday: number | null;
    monthlyDifferenceToday: number | null;
  }>;
  limitations: string[];
};

export function parseSpendingCapacityRequest(value: unknown): SpendingCapacityRequest {
  if (!value || typeof value !== "object" || !("phaseIds" in value) ||
      !Array.isArray(value.phaseIds) || value.phaseIds.length === 0 ||
      value.phaseIds.some((id: unknown) => typeof id !== "string") ||
      new Set(value.phaseIds).size !== value.phaseIds.length) {
    throw new Error("Spending capacity requires unique selected phase IDs.");
  }
  return { phaseIds: value.phaseIds };
}

export function scaleRetirementSpending(
  inputs: ProjectionInputs, phaseIds: string[], scale: number,
): ProjectionInputs {
  return {
    ...inputs,
    spendingPhases: inputs.spendingPhases.map((phase) => phaseIds.includes(phase.id)
      ? { ...phase, discretionaryMultiplier: phase.discretionaryMultiplier * scale }
      : phase),
  };
}

export type SpendingEvaluation = RetirementCandidateEvaluation & {
  firstShortfallAge: number | null;
  depletionAge: number | null;
};

// Bounded integer search in cents of the largest selected phase. Each other
// selected phase changes by at most one cent per step, preserving its shape.
export function solveSpendingCapacity(
  inputs: ProjectionInputs,
  request: SpendingCapacityRequest,
  effectiveInputs: SpendingCapacityResult["effectiveInputs"],
  evaluate: (scale: number) => SpendingEvaluation,
): SpendingCapacityResult {
  const selected = inputs.spendingPhases.filter((p) => request.phaseIds.includes(p.id));
  const reference = Math.max(0, ...selected.map((p) =>
    inputs.monthlyDiscretionarySpendingToday * p.discretionaryMultiplier));
  const result: SpendingCapacityResult = {
    status: "unavailable", reason: null, scale: null,
    referenceMonthlyDiscretionaryToday: null, precisionMonthlyToday: 0.01,
    terminalFinancialAssetsToday: null, firstShortfallAge: null, depletionAge: null,
    nextCentFails: null, effectiveInputs,
    phases: selected.map((p) => ({
      phaseId: p.id, startAge: p.startAge, endAge: p.endAge, source: p.source,
      monthlyEssentialToday: inputs.monthlyEssentialSpendingToday * p.essentialMultiplier,
      configuredMonthlyDiscretionaryToday: inputs.monthlyDiscretionarySpendingToday * p.discretionaryMultiplier,
      monthlyDiscretionaryCapacityToday: null, monthlyLifestyleCapacityToday: null,
      monthlyDifferenceToday: null,
    })),
    limitations: [
      "Deterministic scenario, not a probability of success or guaranteed safe withdrawal rate.",
      "Monotone spending search with sampled checks; arbitrary nonmonotonic feasible islands are not exhaustively ruled out.",
      "Precision is one cent of the largest selected monthly discretionary phase in today's dollars; other phases retain their relative shape.",
      "Uses the active withdrawal strategy, mandatory RRIF distributions and existing tax assumptions; no withdrawal optimization.",
      "Temporary analysis is excluded from configured forward-projection JSON/CSV exports.",
      ...(effectiveInputs.provisionalTax ? ["Tax modelling is provisional under the active compatibility assumptions."] : []),
    ],
  };
  const unavailable = (reason: string) => ({ ...result, status: "unavailable" as const, reason });
  if (inputs.retirementDrawdown?.annualSpendableCashTargetToday !== undefined) return unavailable("Remove the fixed spendable-cash target to solve phase-based discretionary capacity; the fixed target would override the candidate spending.");
  if (!request.phaseIds.length || new Set(request.phaseIds).size !== request.phaseIds.length ||
      selected.length !== request.phaseIds.length || selected.some((p) =>
        p.source !== "explicit_configuration" || p.startAge < inputs.person.retirementAge ||
        p.endAge > inputs.endAge || p.startAge >= p.endAge)) {
    return unavailable("Select explicit spending phases entirely within the active retirement horizon.");
  }
  if (!Number.isFinite(reference) || reference <= 0 || selected.some((p) => p.discretionaryMultiplier <= 0)) {
    return unavailable("Selected phases must each have a positive configured discretionary spending base.");
  }
  const samples = new Map<number, SpendingEvaluation>();
  const check = (candidateCents: number) => {
    const sample = evaluate(candidateCents / 100 / reference);
    if (!Number.isFinite(sample.terminalFinancialAssetsToday)) throw new Error("Nonfinite candidate");
    for (const [priorCents, prior] of samples) {
      const lower = priorCents < candidateCents ? prior : sample;
      const higher = priorCents < candidateCents ? sample : prior;
      if ((!lower.passes && higher.passes) ||
          ((lower.passes || lower.failure === "terminal_balance") &&
           (higher.passes || higher.failure === "terminal_balance") &&
           higher.terminalFinancialAssetsToday > lower.terminalFinancialAssetsToday + 0.01)) {
        throw new Error("Nonmonotonic candidates");
      }
    }
    samples.set(candidateCents, sample);
    return sample;
  };
  try {
    const zero = check(0);
    if (!zero.passes) return {
      ...result, status: "insufficient_assets", reason: "Required cash flows or the terminal floor fail even with selected discretionary spending set to zero.",
      terminalFinancialAssetsToday: zero.failure === "unmet_required_outflow" ? null : zero.terminalFinancialAssetsToday,
      firstShortfallAge: zero.firstShortfallAge, depletionAge: zero.depletionAge,
    };
    const maxCents = 100_000_000_000;
    let low = 0;
    let high = Math.min(maxCents, Math.max(1, Math.ceil(reference * 100)));
    while (check(high).passes) {
      low = high;
      if (high === maxCents) return unavailable("No finite failing spending bound was established within the supported search limit.");
      high = Math.min(maxCents, high * 2);
    }
    // Probe the whole bracket, not only the binary-search traversal.
    for (let i = 1; i < 16; i++) check(Math.floor(high * i / 16));
    while (high - low > 1) {
      const mid = Math.floor((low + high) / 2);
      if (check(mid).passes) low = mid;
      else high = mid;
    }
    const accepted = check(low);
    if (!accepted.passes || check(low + 1).passes) return unavailable("The adjacent-cent boundary could not be verified.");
    const scale = low / 100 / reference;
    return {
      ...result, status: "available", scale,
      referenceMonthlyDiscretionaryToday: low / 100,
      terminalFinancialAssetsToday: accepted.terminalFinancialAssetsToday,
      firstShortfallAge: accepted.firstShortfallAge, depletionAge: accepted.depletionAge,
      nextCentFails: true,
      phases: result.phases.map((p) => ({ ...p,
        monthlyDiscretionaryCapacityToday: p.configuredMonthlyDiscretionaryToday * scale,
        monthlyLifestyleCapacityToday: p.monthlyEssentialToday + p.configuredMonthlyDiscretionaryToday * scale,
        monthlyDifferenceToday: p.configuredMonthlyDiscretionaryToday * (scale - 1),
      })),
    };
  } catch {
    return unavailable("Candidate evaluation was nonsolvable, nonfinite or nonmonotonic; no capacity is reported.");
  }
}
