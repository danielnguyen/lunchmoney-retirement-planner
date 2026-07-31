import type {
  AccountType,
  RetirementRequirementBindingConstraint,
  RetirementRequirementComposition,
  RetirementRequirementResult,
} from "./types";

const MAX_CANDIDATE_CENTS = 100_000_000_000_000;
const MAX_UPPER_BOUND_EVALUATIONS = 48;

export type RetirementCompositionAccount = {
  accountId: string;
  accountType: AccountType;
  projectedBalanceToday: number;
};

export type RetirementCandidateEvaluation = {
  passes: boolean;
  terminalFinancialAssetsToday: number;
  failure:
    | "unmet_required_outflow"
    | "unmet_spending"
    | "terminal_balance"
    | null;
};

type SolverInput = {
  projectedFinancialAssetsToday: number;
  ownerGoalToday: number;
  terminalAge: number;
  minimumEndingFinancialAssetsToday: number;
  minimumEndingBalanceBaselineSource:
    RetirementRequirementResult["minimumEndingBalanceBaselineSource"];
  minimumEndingBalanceActiveValueSource:
    RetirementRequirementResult["minimumEndingBalanceActiveValueSource"];
  taxModel: RetirementRequirementResult["taxModel"];
  accounts: RetirementCompositionAccount[];
  initialUpperBoundToday: number;
  hasRetirementLiabilityOverlap: boolean;
  evaluate: (
    balancesToday: ReadonlyMap<string, number>,
  ) => RetirementCandidateEvaluation;
};

type Allocation = {
  balancesToday: Map<string, number>;
  composition: RetirementRequirementComposition[];
};

function cents(value: number): number {
  if (value >= MAX_CANDIDATE_CENTS / 100) {
    return MAX_CANDIDATE_CENTS;
  }
  return Math.max(0, Math.round(value * 100));
}

export function allocateRetirementCandidate(
  candidateCents: number,
  accounts: RetirementCompositionAccount[],
): Allocation | null {
  const sorted = [...accounts].sort((left, right) =>
    left.accountId.localeCompare(right.accountId),
  );
  const total = sorted.reduce(
    (sum, account) => sum + account.projectedBalanceToday,
    0,
  );
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    sorted.some(
      (account) =>
        !Number.isFinite(account.projectedBalanceToday) ||
        account.projectedBalanceToday < 0,
    )
  ) {
    return null;
  }

  const shares = sorted.map((account) => {
    const exactCents =
      (candidateCents * account.projectedBalanceToday) / total;
    const floorCents = Math.floor(exactCents);
    return {
      account,
      exactCents,
      assignedCents: floorCents,
      remainder: exactCents - floorCents,
    };
  });
  let residual =
    candidateCents -
    shares.reduce((sum, share) => sum + share.assignedCents, 0);
  const residualOrder = [...shares].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      left.account.accountId.localeCompare(right.account.accountId),
  );
  for (const share of residualOrder) {
    if (residual <= 0) break;
    share.assignedCents += 1;
    residual -= 1;
  }

  const balancesToday = new Map(
    shares.map((share) => [
      share.account.accountId,
      share.assignedCents / 100,
    ]),
  );
  return {
    balancesToday,
    composition: shares.map((share) => ({
      accountId: share.account.accountId,
      accountType: share.account.accountType,
      projectedBalanceToday: share.account.projectedBalanceToday,
      weight: share.account.projectedBalanceToday / total,
      requiredBalanceToday: share.assignedCents / 100,
    })),
  };
}

function bindingConstraint(
  acceptedCents: number,
  below: RetirementCandidateEvaluation | null,
  hasRetirementLiabilityOverlap: boolean,
): RetirementRequirementBindingConstraint {
  if (acceptedCents === 0) return "self_funding";
  if (below?.failure === "terminal_balance") return "terminal_balance";
  if (
    below?.failure === "unmet_required_outflow" &&
    hasRetirementLiabilityOverlap
  ) {
    return "liability_overlap";
  }
  return "retirement_cash_flow";
}

export function solveRetirementRequirement(
  input: SolverInput,
): RetirementRequirementResult {
  const base = {
    projectedFinancialAssetsToday: input.projectedFinancialAssetsToday,
    terminalAge: input.terminalAge,
    minimumEndingFinancialAssetsToday:
      input.minimumEndingFinancialAssetsToday,
    minimumEndingBalanceBaselineSource:
      input.minimumEndingBalanceBaselineSource,
    minimumEndingBalanceActiveValueSource:
      input.minimumEndingBalanceActiveValueSource,
    ownerGoalToday: input.ownerGoalToday,
    compositionMode:
      "projected_retirement_account_weights" as const,
    taxModel: input.taxModel,
    provisionalTax: true as const,
  };
  const zeroAllocation = allocateRetirementCandidate(0, input.accounts);
  const zeroEvaluation = input.evaluate(
    zeroAllocation?.balancesToday ?? new Map<string, number>(),
  );
  if (!zeroAllocation) {
    return {
      ...base,
      status: "unavailable",
      requiredFinancialAssetsToday: null,
      fundingMarginToday: null,
      ownerGoalDifferenceToday:
        input.projectedFinancialAssetsToday - input.ownerGoalToday,
      composition: [],
      bindingConstraint: "unavailable_composition",
      solver: {
        zeroCandidatePassed: zeroEvaluation.passes,
        highestFailingCandidateCents: zeroEvaluation.passes ? null : 0,
        acceptedCandidateCents: null,
        acceptedCandidatePassed: false,
        oneCentBelowFailed: null,
        upperBoundEvaluations: 0,
        binarySearchIterations: 0,
      },
      reason:
        "Projected retirement-funding accounts do not have a positive, finite retirement-boundary composition.",
    };
  }

  if (zeroEvaluation.passes) {
    return {
      ...base,
      status: "available",
      requiredFinancialAssetsToday: 0,
      fundingMarginToday: input.projectedFinancialAssetsToday,
      ownerGoalDifferenceToday:
        input.projectedFinancialAssetsToday - input.ownerGoalToday,
      composition: zeroAllocation.composition,
      bindingConstraint: "self_funding",
      solver: {
        zeroCandidatePassed: true,
        highestFailingCandidateCents: null,
        acceptedCandidateCents: 0,
        acceptedCandidatePassed: true,
        oneCentBelowFailed: null,
        upperBoundEvaluations: 0,
        binarySearchIterations: 0,
      },
      reason: null,
    };
  }

  let highestFailingCents = 0;
  let lowestPassingCents: number | null = null;
  let upperBoundCents = Math.min(
    MAX_CANDIDATE_CENTS,
    Math.max(1, cents(input.initialUpperBoundToday)),
  );
  let upperBoundEvaluations = 0;
  while (
    upperBoundEvaluations < MAX_UPPER_BOUND_EVALUATIONS &&
    upperBoundCents <= MAX_CANDIDATE_CENTS
  ) {
    upperBoundEvaluations += 1;
    const allocation = allocateRetirementCandidate(
      upperBoundCents,
      input.accounts,
    )!;
    if (input.evaluate(allocation.balancesToday).passes) {
      lowestPassingCents = upperBoundCents;
      break;
    }
    highestFailingCents = upperBoundCents;
    if (upperBoundCents === MAX_CANDIDATE_CENTS) break;
    upperBoundCents = Math.min(
      MAX_CANDIDATE_CENTS,
      upperBoundCents * 2,
    );
  }

  if (lowestPassingCents === null) {
    return {
      ...base,
      status: "infeasible",
      requiredFinancialAssetsToday: null,
      fundingMarginToday: null,
      ownerGoalDifferenceToday:
        input.projectedFinancialAssetsToday - input.ownerGoalToday,
      composition: zeroAllocation.composition.map((entry) => ({
        ...entry,
        requiredBalanceToday: null,
      })),
      bindingConstraint: "infeasible",
      solver: {
        zeroCandidatePassed: false,
        highestFailingCandidateCents: highestFailingCents,
        acceptedCandidateCents: null,
        acceptedCandidatePassed: false,
        oneCentBelowFailed: null,
        upperBoundEvaluations,
        binarySearchIterations: 0,
      },
      reason:
        "No passing retirement-funding amount could be established within the deterministic safe upper bound.",
    };
  }

  let binarySearchIterations = 0;
  while (lowestPassingCents - highestFailingCents > 1) {
    binarySearchIterations += 1;
    const candidateCents = Math.floor(
      (highestFailingCents + lowestPassingCents) / 2,
    );
    const allocation = allocateRetirementCandidate(
      candidateCents,
      input.accounts,
    )!;
    if (input.evaluate(allocation.balancesToday).passes) {
      lowestPassingCents = candidateCents;
    } else {
      highestFailingCents = candidateCents;
    }
  }

  const acceptedAllocation = allocateRetirementCandidate(
    lowestPassingCents,
    input.accounts,
  )!;
  const acceptedEvaluation = input.evaluate(
    acceptedAllocation.balancesToday,
  );
  const belowEvaluation =
    lowestPassingCents === 0
      ? null
      : input.evaluate(
          allocateRetirementCandidate(
            lowestPassingCents - 1,
            input.accounts,
          )!.balancesToday,
        );
  if (
    !acceptedEvaluation.passes ||
    (belowEvaluation !== null && belowEvaluation.passes)
  ) {
    throw new Error(
      "Retirement requirement solver failed its exact-cent boundary proof",
    );
  }

  const requiredToday = lowestPassingCents / 100;
  return {
    ...base,
    status: "available",
    requiredFinancialAssetsToday: requiredToday,
    fundingMarginToday:
      input.projectedFinancialAssetsToday - requiredToday,
    ownerGoalDifferenceToday:
      input.projectedFinancialAssetsToday - input.ownerGoalToday,
    composition: acceptedAllocation.composition,
    bindingConstraint: bindingConstraint(
      lowestPassingCents,
      belowEvaluation,
      input.hasRetirementLiabilityOverlap,
    ),
    solver: {
      zeroCandidatePassed: false,
      highestFailingCandidateCents: highestFailingCents,
      acceptedCandidateCents: lowestPassingCents,
      acceptedCandidatePassed: true,
      oneCentBelowFailed: true,
      upperBoundEvaluations,
      binarySearchIterations,
    },
    reason: null,
  };
}
