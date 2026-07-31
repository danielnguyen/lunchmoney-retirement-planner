export type TaxableWithdrawalSolution = {
  incomeSource: "rrspWithdrawals" | "rrifWithdrawals";
  grossWithdrawal: number;
  incrementalTax: number;
  netProceeds: number;
  fullySatisfied: boolean;
  acceptedCandidateCents: number;
  acceptedCandidatePassed: boolean;
  oneCentBelowFailed: boolean | null;
  evaluations: number;
};

function cents(value: number): number {
  return Math.max(0, Math.floor((value + 1e-9) * 100));
}

function requiredCents(value: number): number {
  return Math.max(0, Math.ceil((value - 1e-9) * 100));
}

function dollars(value: number): number {
  return value / 100;
}

export function solveTaxableWithdrawal(input: {
  incomeSource: "rrspWithdrawals" | "rrifWithdrawals";
  availableBalance: number;
  requiredNetCash: number;
  incrementalTax: (grossWithdrawal: number) => number;
  minimumIncrementalTax?: number;
  maximumEvaluations?: number;
}): TaxableWithdrawalSolution {
  if (!Number.isFinite(input.availableBalance) || input.availableBalance < 0) {
    throw new Error("Taxable withdrawal balance must be finite and non-negative");
  }
  if (!Number.isFinite(input.requiredNetCash) || input.requiredNetCash < 0) {
    throw new Error("Taxable withdrawal cash need must be finite and non-negative");
  }
  const bound = cents(input.availableBalance);
  const target = requiredCents(input.requiredNetCash);
  const evaluationLimit = input.maximumEvaluations ?? 80;
  const minimumIncrementalTax = input.minimumIncrementalTax ?? 0;
  if (
    !Number.isFinite(minimumIncrementalTax) ||
    minimumIncrementalTax > 0
  ) {
    throw new Error(
      "Taxable withdrawal minimum incremental tax must be finite and non-positive",
    );
  }
  let evaluations = 0;
  const evaluated = new Map<number, number>();

  const evaluate = (candidateCents: number) => {
    evaluations += 1;
    if (evaluations > evaluationLimit) {
      throw new Error("Taxable withdrawal solver exceeded its evaluation limit");
    }
    const gross = dollars(candidateCents);
    const tax = input.incrementalTax(gross);
    if (
      !Number.isFinite(tax) ||
      tax < minimumIncrementalTax - 0.005 ||
      tax > gross + 0.005
    ) {
      throw new Error("Taxable withdrawal tax function returned an invalid result");
    }
    const taxCents = Math.round(tax * 100);
    const netCents = candidateCents - taxCents;
    for (const [priorCandidate, priorNet] of evaluated) {
      if (
        (priorCandidate < candidateCents && priorNet > netCents) ||
        (priorCandidate > candidateCents && priorNet < netCents)
      ) {
        throw new Error(
          "Taxable withdrawal tax function violated the required monotonic net-proceeds assumption",
        );
      }
    }
    evaluated.set(candidateCents, netCents);
    return { gross, tax: dollars(taxCents), netCents };
  };

  const zero = evaluate(0);
  if (target === 0) {
    return {
      incomeSource: input.incomeSource,
      grossWithdrawal: 0,
      incrementalTax: 0,
      netProceeds: 0,
      fullySatisfied: true,
      acceptedCandidateCents: 0,
      acceptedCandidatePassed: true,
      oneCentBelowFailed: null,
      evaluations,
    };
  }
  if (zero.netCents >= target) {
    throw new Error("Taxable withdrawal solver received a non-monotonic zero candidate");
  }
  const full = evaluate(bound);
  if (full.netCents < target) {
    for (const numerator of [1, 2, 3]) {
      const probe = Math.floor((bound * numerator) / 4);
      if (probe > 0 && probe < bound && !evaluated.has(probe)) evaluate(probe);
    }
    return {
      incomeSource: input.incomeSource,
      grossWithdrawal: full.gross,
      incrementalTax: full.tax,
      netProceeds: dollars(full.netCents),
      fullySatisfied: false,
      acceptedCandidateCents: bound,
      acceptedCandidatePassed: false,
      oneCentBelowFailed: null,
      evaluations,
    };
  }

  let low = 0;
  let high = bound;
  while (low + 1 < high) {
    const middle = low + Math.floor((high - low) / 2);
    const result = evaluate(middle);
    if (result.netCents >= target) high = middle;
    else low = middle;
  }
  const accepted = evaluate(high);
  const below = evaluate(high - 1);
  if (accepted.netCents < target || below.netCents >= target) {
    throw new Error("Taxable withdrawal solver failed its exact-cent boundary proof");
  }
  return {
    incomeSource: input.incomeSource,
    grossWithdrawal: accepted.gross,
    incrementalTax: accepted.tax,
    netProceeds: dollars(accepted.netCents),
    fullySatisfied: true,
    acceptedCandidateCents: high,
    acceptedCandidatePassed: true,
    oneCentBelowFailed: true,
    evaluations,
  };
}
