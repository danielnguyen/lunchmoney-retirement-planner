import {
  RRIF_REFERENCE_RETRIEVED_DATE,
  RRIF_REFERENCE_EFFECTIVE_DATES,
  RRIF_REFERENCE_URLS,
  rrifPrescribedFactor,
  settleRrifMinimum,
} from "@/src/domain/defaults/rrif-factors";
import type {
  FinancialAccountInput,
  ProjectionInputs,
  RrifAccountLifecycleResult,
  RrifAnnualAccountResult,
  RrifAnnualAggregate,
  RrifCalculationSummary,
  RrifLifecycleState,
} from "./types";

const TOLERANCE = 0.000001;

export type RrifAccountLifecycleState = {
  accountId: string;
  lifecycleState: RrifLifecycleState;
  conversionDate: string | null;
  establishmentYear: number | null;
};

export type RrifAnnualAccountState = {
  calendarYear: number;
  accountId: string;
  lifecycleState: RrifLifecycleState;
  establishmentYear: number | null;
  openingFairMarketValue: number | null;
  openingFairMarketValueToday: number | null;
  ownerAgeAtBeginningOfYear: number | null;
  prescribedFactor: number | null;
  prescribedFactorClass: RrifAnnualAccountResult["prescribedFactorClass"];
  rawMinimum: number;
  payableMinimum: number;
  settlementDifference: number;
  ordinaryWithdrawals: number;
  ordinaryWithdrawalsToday: number;
  forcedDecemberWithdrawal: number;
  forcedDecemberWithdrawalToday: number;
  exhausted: boolean;
};

export type RrifSimulationState = {
  accounts: Map<string, RrifAccountLifecycleState>;
  annual: Map<string, RrifAnnualAccountState>;
};

function annualKey(calendarYear: number, accountId: string): string {
  return `${calendarYear}:${accountId}`;
}

export function createRrifSimulationState(
  inputs: ProjectionInputs,
): RrifSimulationState {
  return {
    accounts: new Map(
      inputs.accounts
        .filter((account) => account.type === "rrsp_rrif")
        .map((account) => [
          account.id,
          {
            accountId: account.id,
            lifecycleState: "rrsp" as const,
            conversionDate: null,
            establishmentYear: null,
          },
        ]),
    ),
    annual: new Map(),
  };
}

export function cloneRrifSimulationState(
  state: RrifSimulationState,
): RrifSimulationState {
  return {
    accounts: new Map(
      [...state.accounts].map(([key, value]) => [key, { ...value }]),
    ),
    annual: new Map(
      [...state.annual].map(([key, value]) => [key, { ...value }]),
    ),
  };
}

export function convertRrspAccounts(
  state: RrifSimulationState,
  conversionDate: string,
  calendarYear: number,
): void {
  for (const account of state.accounts.values()) {
    if (account.lifecycleState === "rrif") continue;
    account.lifecycleState = "rrif";
    account.conversionDate = conversionDate;
    account.establishmentYear = calendarYear;
    state.annual.set(annualKey(calendarYear, account.accountId), {
      calendarYear,
      accountId: account.accountId,
      lifecycleState: "rrif",
      establishmentYear: calendarYear,
      openingFairMarketValue: null,
      openingFairMarketValueToday: null,
      ownerAgeAtBeginningOfYear: null,
      prescribedFactor: null,
      prescribedFactorClass: null,
      rawMinimum: 0,
      payableMinimum: 0,
      settlementDifference: 0,
      ordinaryWithdrawals: 0,
      ordinaryWithdrawalsToday: 0,
      forcedDecemberWithdrawal: 0,
      forcedDecemberWithdrawalToday: 0,
      exhausted: false,
    });
  }
}

export function beginRrifCalendarYear(input: {
  state: RrifSimulationState;
  calendarYear: number;
  ownerAgeAtBeginningOfYear: number;
  balances: ReadonlyMap<string, number>;
  inflationFactor: number;
}): void {
  const ownerAge = Math.floor(input.ownerAgeAtBeginningOfYear + TOLERANCE);
  for (const account of input.state.accounts.values()) {
    if (account.lifecycleState !== "rrif") continue;
    const key = annualKey(input.calendarYear, account.accountId);
    if (input.state.annual.has(key)) continue;
    const opening = Math.max(0, input.balances.get(account.accountId) ?? 0);
    const factor = rrifPrescribedFactor(ownerAge);
    const rawMinimum = opening * factor.factor;
    const payableMinimum = settleRrifMinimum(rawMinimum);
    input.state.annual.set(key, {
      calendarYear: input.calendarYear,
      accountId: account.accountId,
      lifecycleState: "rrif",
      establishmentYear: account.establishmentYear,
      openingFairMarketValue: opening,
      openingFairMarketValueToday: opening / input.inflationFactor,
      ownerAgeAtBeginningOfYear: ownerAge,
      prescribedFactor: factor.factor,
      prescribedFactorClass: factor.factorClass,
      rawMinimum,
      payableMinimum,
      settlementDifference: payableMinimum - rawMinimum,
      ordinaryWithdrawals: 0,
      ordinaryWithdrawalsToday: 0,
      forcedDecemberWithdrawal: 0,
      forcedDecemberWithdrawalToday: 0,
      exhausted: false,
    });
  }
}

export function rrifLifecycleForAccount(
  state: RrifSimulationState,
  accountId: string,
): RrifLifecycleState {
  return state.accounts.get(accountId)?.lifecycleState ?? "rrsp";
}

export function recordOrdinaryRrifWithdrawal(input: {
  state: RrifSimulationState;
  calendarYear: number;
  accountId: string;
  amount: number;
  inflationFactor: number;
}): void {
  const ledger = input.state.annual.get(
    annualKey(input.calendarYear, input.accountId),
  );
  if (!ledger) {
    throw new Error("RRIF ordinary withdrawal requires an annual account ledger");
  }
  ledger.ordinaryWithdrawals += input.amount;
  ledger.ordinaryWithdrawalsToday += input.amount / input.inflationFactor;
}

export function remainingRrifMinimum(
  state: RrifSimulationState,
  calendarYear: number,
  accountId: string,
): number {
  const ledger = state.annual.get(annualKey(calendarYear, accountId));
  if (!ledger) return 0;
  const remainingAfterOrdinary = settleRrifMinimum(
    Math.max(
      0,
      ledger.payableMinimum - ledger.ordinaryWithdrawals,
    ),
  );
  return settleRrifMinimum(
    Math.max(0, remainingAfterOrdinary - ledger.forcedDecemberWithdrawal),
  );
}

export function recordForcedRrifWithdrawal(input: {
  state: RrifSimulationState;
  calendarYear: number;
  accountId: string;
  amount: number;
  inflationFactor: number;
  exhausted: boolean;
}): void {
  const ledger = input.state.annual.get(
    annualKey(input.calendarYear, input.accountId),
  );
  if (!ledger) {
    throw new Error("RRIF forced withdrawal requires an annual account ledger");
  }
  ledger.forcedDecemberWithdrawal += input.amount;
  ledger.forcedDecemberWithdrawalToday +=
    input.amount / input.inflationFactor;
  ledger.exhausted ||= input.exhausted;
}

function accountAnnualResult(
  state: RrifSimulationState,
  lifecycle: RrifAccountLifecycleState,
  calendarYear: number,
  periodStatus: RrifAnnualAggregate["periodStatus"],
): RrifAnnualAccountResult {
  const ledger = state.annual.get(annualKey(calendarYear, lifecycle.accountId));
  if (!ledger) {
    return {
      calendarYear,
      accountId: lifecycle.accountId,
      lifecycleState: lifecycle.lifecycleState,
      establishmentYear: lifecycle.establishmentYear,
      periodStatus,
      openingFairMarketValue: null,
      openingFairMarketValueToday: null,
      ownerAgeAtBeginningOfYear: null,
      prescribedFactor: null,
      prescribedFactorClass: null,
      rawMinimum: 0,
      payableMinimum: 0,
      settlementDifference: 0,
      ordinaryWithdrawals: 0,
      ordinaryWithdrawalsToday: 0,
      forcedDecemberWithdrawal: 0,
      forcedDecemberWithdrawalToday: 0,
      actualWithdrawals: 0,
      actualWithdrawalsToday: 0,
      remainingMinimum: 0,
      remainingMinimumToday: 0,
      status: "not_yet_converted",
    };
  }
  const actual = ledger.ordinaryWithdrawals + ledger.forcedDecemberWithdrawal;
  const actualToday =
    ledger.ordinaryWithdrawalsToday + ledger.forcedDecemberWithdrawalToday;
  const remaining = remainingRrifMinimum(
    state,
    calendarYear,
    lifecycle.accountId,
  );
  const openingFactor =
    ledger.openingFairMarketValue && ledger.openingFairMarketValueToday
      ? ledger.openingFairMarketValue / ledger.openingFairMarketValueToday
      : 1;
  const status: RrifAnnualAccountResult["status"] =
    ledger.establishmentYear === calendarYear
      ? "establishment_year_no_minimum"
      : ledger.exhausted && remaining > TOLERANCE
        ? "account_exhausted"
        : remaining <= TOLERANCE
          ? ledger.forcedDecemberWithdrawal > TOLERANCE
            ? "satisfied_by_december_true_up"
            : "satisfied_by_ordinary_withdrawals"
          : periodStatus === "stopped_incomplete"
            ? "stopped_incomplete"
            : periodStatus === "partial_period"
              ? "partial_year_unsettled"
              : "minimum_active";
  return {
    ...ledger,
    periodStatus,
    actualWithdrawals: actual,
    actualWithdrawalsToday: actualToday,
    remainingMinimum: remaining,
    remainingMinimumToday: remaining / openingFactor,
    status,
  };
}

export function rrifAnnualAggregate(input: {
  mode: ProjectionInputs["rrifMinimumWithdrawals"]["mode"];
  state: RrifSimulationState;
  calendarYear: number;
  periodStatus: RrifAnnualAggregate["periodStatus"];
}): RrifAnnualAggregate {
  const accounts = [...input.state.accounts.values()]
    .sort((left, right) => left.accountId.localeCompare(right.accountId))
    .map((account) =>
      accountAnnualResult(
        input.state,
        account,
        input.calendarYear,
        input.periodStatus,
      ),
    );
  if (input.mode === "not_modelled_compatibility") {
    for (const account of accounts) account.status = "compatibility_mode";
  }
  const factorEvidence = accounts.filter(
    (account) => account.prescribedFactor !== null,
  );
  const satisfiedAccounts = accounts.filter(
    (account) => account.payableMinimum > 0,
  );
  return {
    calendarYear: input.calendarYear,
    periodStatus: input.periodStatus,
    openingFairMarketValue: accounts.reduce(
      (sum, account) => sum + (account.openingFairMarketValue ?? 0),
      0,
    ),
    openingFairMarketValueToday: accounts.reduce(
      (sum, account) => sum + (account.openingFairMarketValueToday ?? 0),
      0,
    ),
    factorAge:
      factorEvidence.length > 0
        ? factorEvidence[0]!.ownerAgeAtBeginningOfYear
        : null,
    prescribedFactor:
      factorEvidence.length > 0 &&
      factorEvidence.every(
        (account) =>
          account.prescribedFactor === factorEvidence[0]!.prescribedFactor,
      )
        ? factorEvidence[0]!.prescribedFactor
        : null,
    minimumRequired: accounts.reduce(
      (sum, account) => sum + account.payableMinimum,
      0,
    ),
    minimumRequiredToday: accounts.reduce(
      (sum, account) =>
        sum +
        (account.openingFairMarketValue && account.payableMinimum
          ? account.openingFairMarketValueToday! *
            (account.payableMinimum / account.openingFairMarketValue)
          : 0),
      0,
    ),
    ordinaryWithdrawals: accounts.reduce(
      (sum, account) => sum + account.ordinaryWithdrawals,
      0,
    ),
    ordinaryWithdrawalsToday: accounts.reduce(
      (sum, account) => sum + account.ordinaryWithdrawalsToday,
      0,
    ),
    forcedDecemberWithdrawal: accounts.reduce(
      (sum, account) => sum + account.forcedDecemberWithdrawal,
      0,
    ),
    forcedDecemberWithdrawalToday: accounts.reduce(
      (sum, account) => sum + account.forcedDecemberWithdrawalToday,
      0,
    ),
    actualWithdrawals: accounts.reduce(
      (sum, account) => sum + account.actualWithdrawals,
      0,
    ),
    actualWithdrawalsToday: accounts.reduce(
      (sum, account) => sum + account.actualWithdrawalsToday,
      0,
    ),
    remainingMinimum: accounts.reduce(
      (sum, account) => sum + account.remainingMinimum,
      0,
    ),
    remainingMinimumToday: accounts.reduce(
      (sum, account) => sum + account.remainingMinimumToday,
      0,
    ),
    satisfied:
      input.mode === "not_modelled_compatibility" ||
      input.periodStatus !== "complete_calendar_year"
        ? null
        : satisfiedAccounts.every(
            (account) => account.remainingMinimum <= TOLERANCE,
          ),
    accountExhaustion: accounts.some(
      (account) => account.status === "account_exhausted",
    ),
    accounts,
  };
}

export function rrifCalculationSummary(input: {
  inputs: ProjectionInputs;
  state: RrifSimulationState;
  annual: RrifAnnualAggregate[];
}): RrifCalculationSummary {
  const statutory = input.inputs.rrifMinimumWithdrawals.mode === "statutory";
  const accounts: RrifAccountLifecycleResult[] = [...input.state.accounts.values()]
    .sort((left, right) => left.accountId.localeCompare(right.accountId))
    .map((account) => ({
      accountId: account.accountId,
      lifecycleState: statutory ? account.lifecycleState : "rrsp",
      conversionDate: statutory ? account.conversionDate : null,
      establishmentYear: statutory ? account.establishmentYear : null,
      conversionSource: statutory
        ? "configured_age_boundary"
        : "compatibility_milestone_only",
    }));
  return {
    mode: input.inputs.rrifMinimumWithdrawals.mode,
    source: input.inputs.rrifMinimumWithdrawals.source,
    conversionAge: input.inputs.person.rrifConversionAge,
    ownerAgeBasis: statutory
      ? "owner_age_at_beginning_of_year"
      : "not_applicable",
    settlementTiming: statutory ? "december_true_up" : "not_applicable",
    supportedRrifClass: statutory ? "all_other_rrifs" : "not_applicable",
    provisional: true,
    limitations: statutory
      ? [
          "spouse_age_elections_not_modelled",
          "legacy_rrif_classes_not_modelled",
          "non_registered_investment_income_not_modelled",
          "full_tax_return_deductions_and_refundable_credits_not_modelled",
        ]
      : [
          "rrif_minimum_withdrawals_not_modelled",
          "non_registered_investment_income_not_modelled",
        ],
    references: {
      retrievedDate: RRIF_REFERENCE_RETRIEVED_DATE,
      maturityUrl: RRIF_REFERENCE_URLS.rrspMaturity,
      maturedRrspTransferUrl: RRIF_REFERENCE_URLS.maturedRrspTransfer,
      minimumUrl: RRIF_REFERENCE_URLS.minimumAmount,
      factorsUrl: RRIF_REFERENCE_URLS.prescribedFactors,
      receivingIncomeUrl: RRIF_REFERENCE_URLS.receivingIncome,
      circularUrl: RRIF_REFERENCE_URLS.circular,
      pensionIncomeCreditUrl: RRIF_REFERENCE_URLS.pensionIncomeAmount,
      effectiveDates: { ...RRIF_REFERENCE_EFFECTIVE_DATES },
    },
    accounts,
    annual: input.annual,
  };
}

export function registeredAccounts(
  accounts: FinancialAccountInput[],
): FinancialAccountInput[] {
  return accounts.filter((account) => account.type === "rrsp_rrif");
}
