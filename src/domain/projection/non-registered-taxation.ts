import type {
  FinancialAccountInput,
  NonRegisteredAnnualAccountResult,
  NonRegisteredAnnualAggregate,
  NonRegisteredDistributionYields,
  NonRegisteredTaxationAssumptions,
} from "./types";
import { centDifference } from "./monetary-reconciliation";

export const NON_REGISTERED_TAX_LIMITATIONS = [
  "Adjusted cost base is pooled per synthetic account rather than tracked by security or tax lot.",
  "Identical-property rules across accounts and superficial-loss rules are not modelled.",
  "Capital-loss carryback and carryforward are not modelled.",
  "Return-of-capital adjustments, commissions, and transaction fees are not modelled.",
  "Foreign tax credits and non-eligible Canadian dividend credits are not modelled.",
  "Arbitrary deductions, refundable credits, and alternative minimum tax are not modelled.",
  "Tax-loss harvesting, withdrawal optimization, and full tax-return preparation are not modelled.",
] as const;

type AnnualRaw = {
  calendarYear: number;
  openingMarketValue: number;
  openingAdjustedCostBase: number;
  openingInflationFactor: number;
  contributions: number;
  contributionsToday: number;
  interestDistributions: number;
  interestDistributionsToday: number;
  eligibleCanadianDividends: number;
  eligibleCanadianDividendsToday: number;
  foreignIncomeDistributions: number;
  foreignIncomeDistributionsToday: number;
  capitalGainDistributions: number;
  capitalGainDistributionsToday: number;
  unrealizedChange: number;
  unrealizedChangeToday: number;
  dispositionProceeds: number;
  dispositionProceedsToday: number;
  adjustedCostBaseDisposed: number;
  adjustedCostBaseDisposedToday: number;
  realizedCapitalGains: number;
  realizedCapitalGainsToday: number;
  realizedCapitalLosses: number;
  realizedCapitalLossesToday: number;
};

export type NonRegisteredAccountState = {
  accountId: string;
  currentMarketValue: number;
  currentAdjustedCostBase: number;
  cumulativeContributions: number;
  reinvestedInterest: number;
  reinvestedEligibleDividends: number;
  reinvestedForeignIncome: number;
  reinvestedCapitalGainDistributions: number;
  cumulativeAdjustedCostBaseDisposed: number;
  cumulativeProceeds: number;
  cumulativeRealizedCapitalGains: number;
  cumulativeRealizedCapitalLosses: number;
  annual: Map<number, AnnualRaw>;
};

export type NonRegisteredSimulationState = {
  mode: NonRegisteredTaxationAssumptions["mode"];
  accounts: Map<string, NonRegisteredAccountState>;
};

function clean(value: number): number {
  if (Math.abs(value) <= 1e-9) return 0;
  return value;
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function annualRecord(
  account: NonRegisteredAccountState,
  calendarYear: number,
  inflationFactor: number,
): AnnualRaw {
  const existing = account.annual.get(calendarYear);
  if (existing) return existing;
  const created: AnnualRaw = {
    calendarYear,
    openingMarketValue: account.currentMarketValue,
    openingAdjustedCostBase: account.currentAdjustedCostBase,
    openingInflationFactor: inflationFactor,
    contributions: 0,
    contributionsToday: 0,
    interestDistributions: 0,
    interestDistributionsToday: 0,
    eligibleCanadianDividends: 0,
    eligibleCanadianDividendsToday: 0,
    foreignIncomeDistributions: 0,
    foreignIncomeDistributionsToday: 0,
    capitalGainDistributions: 0,
    capitalGainDistributionsToday: 0,
    unrealizedChange: 0,
    unrealizedChangeToday: 0,
    dispositionProceeds: 0,
    dispositionProceedsToday: 0,
    adjustedCostBaseDisposed: 0,
    adjustedCostBaseDisposedToday: 0,
    realizedCapitalGains: 0,
    realizedCapitalGainsToday: 0,
    realizedCapitalLosses: 0,
    realizedCapitalLossesToday: 0,
  };
  account.annual.set(calendarYear, created);
  return created;
}

export function createNonRegisteredSimulationState(input: {
  assumptions: NonRegisteredTaxationAssumptions;
  accounts: FinancialAccountInput[];
  openingBalances?: ReadonlyMap<string, number>;
  candidateAdjustedCostBases?: ReadonlyMap<string, number>;
}): NonRegisteredSimulationState {
  if (input.assumptions.mode === "not_modelled_compatibility") {
    return { mode: input.assumptions.mode, accounts: new Map() };
  }
  const financialAccounts = new Map(
    input.accounts.map((account) => [account.id, account]),
  );
  return {
    mode: "simplified_canadian",
    accounts: new Map(
      input.assumptions.accounts.map((treatment) => {
        const account = financialAccounts.get(treatment.accountId)!;
        const market =
          input.openingBalances?.get(account.id) ?? account.openingBalance;
        const acb =
          input.candidateAdjustedCostBases?.get(account.id) ??
          treatment.openingAdjustedCostBase.amount;
        return [
          account.id,
          {
            accountId: account.id,
            currentMarketValue: market,
            currentAdjustedCostBase: acb,
            cumulativeContributions: 0,
            reinvestedInterest: 0,
            reinvestedEligibleDividends: 0,
            reinvestedForeignIncome: 0,
            reinvestedCapitalGainDistributions: 0,
            cumulativeAdjustedCostBaseDisposed: 0,
            cumulativeProceeds: 0,
            cumulativeRealizedCapitalGains: 0,
            cumulativeRealizedCapitalLosses: 0,
            annual: new Map(),
          },
        ];
      }),
    ),
  };
}

export function cloneNonRegisteredSimulationState(
  state: NonRegisteredSimulationState,
): NonRegisteredSimulationState {
  return {
    mode: state.mode,
    accounts: new Map(
      [...state.accounts].map(([id, account]) => [
        id,
        {
          ...account,
          annual: new Map(
            [...account.annual].map(([year, record]) => [
              year,
              { ...record },
            ]),
          ),
        },
      ]),
    ),
  };
}

export function nonRegisteredTreatment(
  assumptions: NonRegisteredTaxationAssumptions,
  accountId: string,
) {
  return assumptions.mode === "simplified_canadian"
    ? assumptions.accounts.find((item) => item.accountId === accountId)
    : undefined;
}

export function recordNonRegisteredReturn(input: {
  state: NonRegisteredSimulationState;
  accountId: string;
  calendarYear: number;
  inflationFactor: number;
  openingInflationFactor?: number;
  totalReturnAmount: number;
  distributions: NonRegisteredDistributionYields;
}): void {
  const account = input.state.accounts.get(input.accountId);
  if (!account) return;
  const annual = annualRecord(
    account,
    input.calendarYear,
    input.openingInflationFactor ?? input.inflationFactor,
  );
  const totalDistributions =
    input.distributions.interest +
    input.distributions.eligibleCanadianDividends +
    input.distributions.foreignIncome +
    input.distributions.capitalGains;
  const unrealizedChange = input.totalReturnAmount - totalDistributions;
  account.currentMarketValue = Math.max(
    0,
    clean(account.currentMarketValue + input.totalReturnAmount),
  );
  account.currentAdjustedCostBase = Math.max(
    0,
    clean(account.currentAdjustedCostBase + totalDistributions),
  );
  account.reinvestedInterest += input.distributions.interest;
  account.reinvestedEligibleDividends +=
    input.distributions.eligibleCanadianDividends;
  account.reinvestedForeignIncome += input.distributions.foreignIncome;
  account.reinvestedCapitalGainDistributions +=
    input.distributions.capitalGains;
  annual.interestDistributions += input.distributions.interest;
  annual.interestDistributionsToday +=
    input.distributions.interest / input.inflationFactor;
  annual.eligibleCanadianDividends +=
    input.distributions.eligibleCanadianDividends;
  annual.eligibleCanadianDividendsToday +=
    input.distributions.eligibleCanadianDividends / input.inflationFactor;
  annual.foreignIncomeDistributions += input.distributions.foreignIncome;
  annual.foreignIncomeDistributionsToday +=
    input.distributions.foreignIncome / input.inflationFactor;
  annual.capitalGainDistributions += input.distributions.capitalGains;
  annual.capitalGainDistributionsToday +=
    input.distributions.capitalGains / input.inflationFactor;
  annual.unrealizedChange += unrealizedChange;
  annual.unrealizedChangeToday += unrealizedChange / input.inflationFactor;
}

export function depositNonRegistered(input: {
  state: NonRegisteredSimulationState;
  accountId: string;
  calendarYear: number;
  inflationFactor: number;
  openingInflationFactor?: number;
  amount: number;
}): void {
  const account = input.state.accounts.get(input.accountId);
  if (!account || input.amount === 0) return;
  if (!Number.isFinite(input.amount) || input.amount < 0) {
    throw new Error("Non-registered deposit must be finite and non-negative");
  }
  const annual = annualRecord(
    account,
    input.calendarYear,
    input.openingInflationFactor ?? input.inflationFactor,
  );
  account.currentMarketValue += input.amount;
  account.currentAdjustedCostBase += input.amount;
  account.cumulativeContributions += input.amount;
  annual.contributions += input.amount;
  annual.contributionsToday += input.amount / input.inflationFactor;
}

export type NonRegisteredDispositionPreview = {
  accountId: string;
  grossProceeds: number;
  fractionDisposed: number;
  adjustedCostBaseDisposed: number;
  realizedCapitalGain: number;
  realizedCapitalLoss: number;
  closingMarketValue: number;
  closingAdjustedCostBase: number;
};

export function previewNonRegisteredDisposition(input: {
  state: NonRegisteredSimulationState;
  accountId: string;
  grossProceeds: number;
}): NonRegisteredDispositionPreview {
  const account = input.state.accounts.get(input.accountId);
  if (!account) {
    throw new Error(`Missing non-registered state for ${input.accountId}`);
  }
  if (!Number.isFinite(input.grossProceeds) || input.grossProceeds < 0) {
    throw new Error("Non-registered proceeds must be finite and non-negative");
  }
  const proceeds = Math.min(input.grossProceeds, account.currentMarketValue);
  const fractionDisposed =
    account.currentMarketValue === 0
      ? 0
      : Math.min(1, proceeds / account.currentMarketValue);
  // Investment returns retain raw precision, while sale candidates settle in
  // cents. Treat a positive maximum-cent sale that leaves less than one cent
  // of raw market value as account exhaustion, consuming the complete pooled
  // ACB instead of carrying a non-withdrawable fractional-cent artifact.
  const full =
    fractionDisposed >= 1 - 1e-12 ||
    (proceeds > 0 && account.currentMarketValue - proceeds < 0.01);
  const adjustedCostBaseDisposed = full
    ? account.currentAdjustedCostBase
    : account.currentAdjustedCostBase * fractionDisposed;
  const gainOrLoss = proceeds - adjustedCostBaseDisposed;
  return {
    accountId: input.accountId,
    grossProceeds: proceeds,
    fractionDisposed,
    adjustedCostBaseDisposed,
    realizedCapitalGain: Math.max(0, gainOrLoss),
    realizedCapitalLoss: Math.max(0, -gainOrLoss),
    closingMarketValue: full
      ? 0
      : Math.max(0, clean(account.currentMarketValue - proceeds)),
    closingAdjustedCostBase: full
      ? 0
      : Math.max(
          0,
          clean(
            account.currentAdjustedCostBase - adjustedCostBaseDisposed,
          ),
        ),
  };
}

export function commitNonRegisteredDisposition(input: {
  state: NonRegisteredSimulationState;
  preview: NonRegisteredDispositionPreview;
  calendarYear: number;
  inflationFactor: number;
  openingInflationFactor?: number;
}): void {
  const account = input.state.accounts.get(input.preview.accountId);
  if (!account) throw new Error("Missing non-registered disposition account");
  const annual = annualRecord(
    account,
    input.calendarYear,
    input.openingInflationFactor ?? input.inflationFactor,
  );
  account.currentMarketValue = input.preview.closingMarketValue;
  account.currentAdjustedCostBase = input.preview.closingAdjustedCostBase;
  account.cumulativeAdjustedCostBaseDisposed +=
    input.preview.adjustedCostBaseDisposed;
  account.cumulativeProceeds += input.preview.grossProceeds;
  account.cumulativeRealizedCapitalGains +=
    input.preview.realizedCapitalGain;
  account.cumulativeRealizedCapitalLosses +=
    input.preview.realizedCapitalLoss;
  annual.dispositionProceeds += input.preview.grossProceeds;
  annual.dispositionProceedsToday +=
    input.preview.grossProceeds / input.inflationFactor;
  annual.adjustedCostBaseDisposed +=
    input.preview.adjustedCostBaseDisposed;
  annual.adjustedCostBaseDisposedToday +=
    input.preview.adjustedCostBaseDisposed / input.inflationFactor;
  annual.realizedCapitalGains += input.preview.realizedCapitalGain;
  annual.realizedCapitalGainsToday +=
    input.preview.realizedCapitalGain / input.inflationFactor;
  annual.realizedCapitalLosses += input.preview.realizedCapitalLoss;
  annual.realizedCapitalLossesToday +=
    input.preview.realizedCapitalLoss / input.inflationFactor;
}

function resultForAccount(input: {
  account: NonRegisteredAccountState;
  calendarYear: number;
  closingInflationFactor: number;
  periodStatus: NonRegisteredAnnualAccountResult["periodStatus"];
}): NonRegisteredAnnualAccountResult {
  const raw =
    input.account.annual.get(input.calendarYear) ??
    annualRecord(
      input.account,
      input.calendarYear,
      input.closingInflationFactor,
    );
  const totalDistributions =
    raw.interestDistributions +
    raw.eligibleCanadianDividends +
    raw.foreignIncomeDistributions +
    raw.capitalGainDistributions;
  const totalDistributionsToday =
    raw.interestDistributionsToday +
    raw.eligibleCanadianDividendsToday +
    raw.foreignIncomeDistributionsToday +
    raw.capitalGainDistributionsToday;
  const closingMarketValue = input.account.currentMarketValue;
  const closingAdjustedCostBase = input.account.currentAdjustedCostBase;
  const difference = centDifference(
    [closingMarketValue],
    [
      raw.openingMarketValue,
      raw.contributions,
      totalDistributions,
      raw.unrealizedChange,
      -raw.dispositionProceeds,
    ],
  );
  return {
    calendarYear: input.calendarYear,
    accountId: input.account.accountId,
    periodStatus: input.periodStatus,
    openingMarketValue: money(raw.openingMarketValue),
    openingMarketValueToday: money(
      raw.openingMarketValue / raw.openingInflationFactor,
    ),
    openingAdjustedCostBase: money(raw.openingAdjustedCostBase),
    openingAdjustedCostBaseToday: money(
      raw.openingAdjustedCostBase / raw.openingInflationFactor,
    ),
    contributions: money(raw.contributions),
    contributionsToday: money(raw.contributionsToday),
    interestDistributions: money(raw.interestDistributions),
    interestDistributionsToday: money(raw.interestDistributionsToday),
    eligibleCanadianDividends: money(raw.eligibleCanadianDividends),
    eligibleCanadianDividendsToday: money(
      raw.eligibleCanadianDividendsToday,
    ),
    foreignIncomeDistributions: money(raw.foreignIncomeDistributions),
    foreignIncomeDistributionsToday: money(
      raw.foreignIncomeDistributionsToday,
    ),
    capitalGainDistributions: money(raw.capitalGainDistributions),
    capitalGainDistributionsToday: money(
      raw.capitalGainDistributionsToday,
    ),
    totalDistributions: money(totalDistributions),
    totalDistributionsToday: money(totalDistributionsToday),
    unrealizedChange: money(raw.unrealizedChange),
    unrealizedChangeToday: money(raw.unrealizedChangeToday),
    dispositionProceeds: money(raw.dispositionProceeds),
    dispositionProceedsToday: money(raw.dispositionProceedsToday),
    adjustedCostBaseDisposed: money(raw.adjustedCostBaseDisposed),
    adjustedCostBaseDisposedToday: money(
      raw.adjustedCostBaseDisposedToday,
    ),
    realizedCapitalGains: money(raw.realizedCapitalGains),
    realizedCapitalGainsToday: money(raw.realizedCapitalGainsToday),
    realizedCapitalLosses: money(raw.realizedCapitalLosses),
    realizedCapitalLossesToday: money(raw.realizedCapitalLossesToday),
    closingMarketValue: money(closingMarketValue),
    closingMarketValueToday: money(
      closingMarketValue / input.closingInflationFactor,
    ),
    closingAdjustedCostBase: money(closingAdjustedCostBase),
    closingAdjustedCostBaseToday: money(
      closingAdjustedCostBase / input.closingInflationFactor,
    ),
    closingUnrealizedGainOrLoss: money(
      closingMarketValue - closingAdjustedCostBase,
    ),
    closingUnrealizedGainOrLossToday: money(
      (closingMarketValue - closingAdjustedCostBase) /
        input.closingInflationFactor,
    ),
    reconciled: Math.abs(difference) <= 1,
  };
}

const SUM_FIELDS = [
  "openingMarketValue",
  "openingMarketValueToday",
  "openingAdjustedCostBase",
  "openingAdjustedCostBaseToday",
  "contributions",
  "contributionsToday",
  "interestDistributions",
  "interestDistributionsToday",
  "eligibleCanadianDividends",
  "eligibleCanadianDividendsToday",
  "foreignIncomeDistributions",
  "foreignIncomeDistributionsToday",
  "capitalGainDistributions",
  "capitalGainDistributionsToday",
  "totalDistributions",
  "totalDistributionsToday",
  "unrealizedChange",
  "unrealizedChangeToday",
  "dispositionProceeds",
  "dispositionProceedsToday",
  "adjustedCostBaseDisposed",
  "adjustedCostBaseDisposedToday",
  "realizedCapitalGains",
  "realizedCapitalGainsToday",
  "realizedCapitalLosses",
  "realizedCapitalLossesToday",
  "closingMarketValue",
  "closingMarketValueToday",
  "closingAdjustedCostBase",
  "closingAdjustedCostBaseToday",
  "closingUnrealizedGainOrLoss",
  "closingUnrealizedGainOrLossToday",
] as const;

export function nonRegisteredAnnualAggregate(input: {
  state: NonRegisteredSimulationState;
  calendarYear: number;
  closingInflationFactor: number;
  periodStatus: NonRegisteredAnnualAccountResult["periodStatus"];
}): NonRegisteredAnnualAggregate {
  const accounts = [...input.state.accounts.values()]
    .sort((left, right) => left.accountId.localeCompare(right.accountId))
    .map((account) => resultForAccount({ ...input, account }));
  const totals = Object.fromEntries(
    SUM_FIELDS.map((field) => [
      field,
      money(accounts.reduce((sum, account) => sum + account[field], 0)),
    ]),
  ) as Pick<NonRegisteredAnnualAccountResult, (typeof SUM_FIELDS)[number]>;
  return {
    calendarYear: input.calendarYear,
    periodStatus: input.periodStatus,
    ...totals,
    reconciled: accounts.every((account) => account.reconciled),
    accounts,
    unusedCurrentYearCapitalLoss: money(
      Math.max(
        0,
        totals.realizedCapitalLosses - totals.realizedCapitalGains,
      ),
    ),
  };
}
