import type {
  AccountType,
  AnnualProjection,
  AssetAllocation,
  BalanceBreakdown,
  ContributionBreakdown,
  AccountContributionDetail,
  ContributionPhase,
  EmploymentIncomePhase,
  FinancialAccountInput,
  FinancialAssetsBridge,
  GovernmentBenefitCalculationSummary,
  IncomeBreakdown,
  LiabilityInput,
  LiabilityScheduleBreakdown,
  NetWorthBridge,
  NonFinancialAssetInput,
  OutflowBreakdown,
  ProjectionInputs,
  ProjectionObservation,
  ProjectionResult,
  ProjectionView,
  RegisteredProgramAnnualBreakdown,
  RetirementSnapshot,
  SavingsPolicyBreakdown,
  SavingsPolicyTotals,
  SurplusAllocationBreakdown,
  SurplusAllocationTotals,
  WithdrawalBreakdown,
} from "./types";
import { validateProjectionInputs } from "./types";
import {
  cppClaimRules,
  oasClaimRules,
} from "@/src/domain/defaults/canadian-public-benefits";
import {
  RRSP_EARNED_INCOME_RATE,
  RRSP_ANNUAL_LIMITS,
  RRSP_FORMULA_REFERENCE_URL,
  TFSA_ANNUAL_LIMITS,
  TFSA_WITHDRAWAL_REFERENCE_URL,
  rrspAnnualCap,
  tfsaAnnualLimit,
} from "@/src/domain/defaults/canadian-registered-account-room";
import {
  centDifference,
  monetaryValue,
} from "./monetary-reconciliation";
import { monthlyLiabilityInterestRate } from "./liability-interest";

const MONTHS_PER_YEAR = 12;
const AGE_TOLERANCE = 1e-6;
const ZERO_ALLOCATION: AssetAllocation = { cash: 0, fixedIncome: 0, equity: 0 };

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
}

function indexedFactor(annualRate: number, month: number): number {
  return Math.pow(1 + annualRate, month / MONTHS_PER_YEAR);
}

function phaseMonth(endAge: number, startAge: number): number {
  return Math.max(0, Math.round((endAge - startAge) * MONTHS_PER_YEAR));
}

function activeEmploymentPhase(
  phases: EmploymentIncomePhase[],
  workingAge: number,
): EmploymentIncomePhase | undefined {
  return phases.find(
    (phase) =>
      workingAge >= phase.startAge - AGE_TOLERANCE &&
      workingAge < phase.endAge - AGE_TOLERANCE,
  );
}

function activeContributionPhase(
  phases: ContributionPhase[],
  workingAge: number,
): ContributionPhase | undefined {
  return phases.find(
    (phase) =>
      workingAge >= phase.startAge - AGE_TOLERANCE &&
      workingAge < phase.endAge - AGE_TOLERANCE,
  );
}

function lastDayOfMonth(calendarYear: number, calendarMonth: number): string {
  return new Date(Date.UTC(calendarYear, calendarMonth, 0)).toISOString().slice(0, 10);
}

type LiabilityPaymentDemand = {
  liabilityId: string;
  schedule: LiabilityScheduleBreakdown;
  cashPayment: number;
};

function buildLiabilityPaymentDemand(
  liability: LiabilityInput,
  openingBalance: number,
  projectionMonth: number,
  calendarMonthKey: string,
): LiabilityPaymentDemand {
  let interest = 0;
  let regularPayment = 0;
  let principal = 0;
  let lumpSumPrincipal = 0;
  let closingBalance = openingBalance;

  if (
    openingBalance > 0 &&
    liability.treatment.mode === "payoff_at_projection_start" &&
    projectionMonth === 1
  ) {
    regularPayment = openingBalance;
    principal = openingBalance;
    closingBalance = 0;
  } else if (liability.treatment.mode === "amortizing") {
    const configuredLumpSum = liability.treatment.lumpSumPayments
      .filter((payment) => payment.date.slice(0, 7) === calendarMonthKey)
      .reduce((total, payment) => total + payment.amount, 0);

    if (openingBalance <= 0 && configuredLumpSum > 0) {
      throw new Error(
        `Lump-sum payment for liability ${liability.id} occurs after its projected payoff`,
      );
    }
    if (openingBalance > 0) {
      interest =
        openingBalance *
        monthlyLiabilityInterestRate(
          liability.treatment.annualInterestRate,
          liability.treatment.interestRateConvention,
        );
      regularPayment = Math.min(
        liability.treatment.regularPayment.monthlyEquivalent,
        openingBalance + interest,
      );
      principal = Math.max(0, regularPayment - interest);
      const afterRegular =
        openingBalance + interest - regularPayment;
      if (configuredLumpSum > afterRegular + 0.01) {
        throw new Error(
          `Lump-sum payment for liability ${liability.id} exceeds its remaining projected principal`,
        );
      }
      lumpSumPrincipal = Math.min(
        configuredLumpSum,
        Math.max(0, afterRegular),
      );
      closingBalance = Math.max(
        0,
        afterRegular - lumpSumPrincipal,
      );
    }
  }

  if (closingBalance <= 0.005) closingBalance = 0;
  return {
    liabilityId: liability.id,
    schedule: {
      openingBalance,
      interest,
      regularPayment,
      principal,
      lumpSumPrincipal,
      closingBalance,
    },
    cashPayment: regularPayment + lumpSumPrincipal,
  };
}

export function cppClaimFactor(startAge: number): number {
  if (startAge < cppClaimRules.standardAge) {
    return Math.max(
      0,
      1 -
        (cppClaimRules.standardAge - startAge) *
          MONTHS_PER_YEAR *
          cppClaimRules.reductionPerMonth,
    );
  }
  return (
    1 +
    (startAge - cppClaimRules.standardAge) *
      MONTHS_PER_YEAR *
      cppClaimRules.increasePerMonth
  );
}

export function oasClaimFactor(startAge: number): number {
  return (
    1 +
    Math.max(0, startAge - oasClaimRules.earliestAge) *
      MONTHS_PER_YEAR *
      oasClaimRules.increasePerMonth
  );
}

function governmentBenefitSummary(
  inputs: ProjectionInputs,
): GovernmentBenefitCalculationSummary {
  const cppFactor = cppClaimFactor(inputs.person.cpp.startAge);
  const cppMonthly =
    inputs.person.cpp.monthlyAmountAt65Today * cppFactor;
  const oasFactor = oasClaimFactor(inputs.person.oas.startAge);
  const oasMonthly =
    inputs.person.oas.fullMonthlyAmountAt65Today *
    inputs.person.oas.eligibility.fraction *
    oasFactor;
  return {
    cpp: {
      baseMonthlyAmountAt65Today: inputs.person.cpp.monthlyAmountAt65Today,
      claimAge: inputs.person.cpp.startAge,
      claimFactor: cppFactor,
      monthlyAmountAtClaimToday: cppMonthly,
      annualAmountAtClaimToday: cppMonthly * MONTHS_PER_YEAR,
    },
    oas: {
      fullBaseMonthlyAmountAt65Today:
        inputs.person.oas.fullMonthlyAmountAt65Today,
      eligibilityMode: inputs.person.oas.eligibility.mode,
      qualifyingResidenceYearsAfter18:
        inputs.person.oas.eligibility.qualifyingResidenceYearsAfter18,
      eligibilityFraction: inputs.person.oas.eligibility.fraction,
      claimAge: inputs.person.oas.startAge,
      claimFactor: oasFactor,
      monthlyAmountAtClaimToday: oasMonthly,
      annualAmountAtClaimToday: oasMonthly * MONTHS_PER_YEAR,
      age75IncreaseRate: inputs.person.oas.age75IncreaseRate,
      monthlyAmountAfterAge75IncreaseToday:
        oasMonthly * (1 + inputs.person.oas.age75IncreaseRate),
    },
  };
}

function emptyIncome(): IncomeBreakdown {
  return { employment: 0, cpp: 0, oas: 0, pension: 0, other: 0, total: 0 };
}

function emptyWithdrawals(): WithdrawalBreakdown {
  return { cash: 0, tfsa: 0, rrspRrif: 0, nonRegistered: 0, total: 0 };
}

function emptyOutflows(): OutflowBreakdown {
  return {
    essential: 0,
    discretionary: 0,
    liabilityInterest: 0,
    liabilityPrincipal: 0,
    liabilityLumpSumPrincipal: 0,
    liabilityCashPayment: 0,
    oneTime: 0,
    tax: 0,
    oasRecoveryTax: 0,
    contributions: 0,
    unmetRequiredOutflow: 0,
    unmetSpending: 0,
    total: 0,
  };
}

function emptyContributions(): ContributionBreakdown {
  return {
    planned: 0,
    allowed: 0,
    surplusFunded: 0,
    sourceAccount: 0,
    redirected: 0,
    cashFunded: 0,
    incomeWithheld: 0,
    unallocatedCashFunded: 0,
    unallocatedIncomeWithheld: 0,
    unallocated: 0,
    total: 0,
  };
}

function emptyAccountContributionDetail(): AccountContributionDetail {
  return {
    plannedFromAccount: 0,
    depositedIntoAccount: 0,
    sourceAccountDeposit: 0,
    redirectedOut: 0,
    redirectedIn: 0,
    surplusFundedDeposit: 0,
    cashFunded: 0,
    incomeWithheld: 0,
    unallocatedFromAccount: 0,
  };
}

function emptyRegisteredProgram(): RegisteredProgramAnnualBreakdown {
  return {
    openingRoom: 0,
    annualNewRoom: 0,
    withdrawalRoomRestored: 0,
    previousYearEligibleEarnedIncome: 0,
    earnedIncomeRate: 0,
    annualCap: 0,
    pensionAdjustment: 0,
    otherRoomReduction: 0,
    grossGeneratedRoom: 0,
    plannedContributions: 0,
    allowedContributions: 0,
    redirectedIn: 0,
    redirectedOut: 0,
    surplusFundedContributions: 0,
    unallocatedContributions: 0,
    closingRoom: 0,
    carryForwardUnusedRoom: true,
    sourceKind: "starting_room",
  };
}

function emptyBalances(): BalanceBreakdown {
  return {
    cash: 0,
    tfsa: 0,
    rrspRrif: 0,
    nonRegistered: 0,
    financialAssets: 0,
    retirementFundingAssets: 0,
    residenceValue: 0,
    otherNonFinancialAssets: 0,
    totalNonFinancialAssets: 0,
    totalAssets: 0,
    mortgageBalance: 0,
    otherLiabilities: 0,
    totalLiabilities: 0,
    homeEquity: 0,
    totalNetWorth: 0,
  };
}

function emptySurplusAllocation(): SurplusAllocationBreakdown {
  return {
    generated: 0,
    reserveRefill: 0,
    retainedAsCash: 0,
    redirected: 0,
    reserveTarget: 0,
  };
}

function emptySurplusTotals(): SurplusAllocationTotals {
  return {
    generated: 0,
    reserveRefill: 0,
    retainedAsCash: 0,
    redirected: 0,
    accountAllocations: {},
  };
}

function emptySavingsPolicy(): SavingsPolicyBreakdown {
  return {
    positiveCashAvailable: 0,
    personalPlanned: 0,
    personalAllowed: 0,
    personalUnallocated: 0,
    reservePlanned: 0,
    reserveFunded: 0,
    reserveRetainedAsCash: 0,
    reserveRedirected: 0,
    reserveUnfunded: 0,
    workplacePlanned: 0,
    workplaceAllowed: 0,
    workplaceUnallocated: 0,
    unplannedCashRetained: 0,
    totalInvestmentDeposits: 0,
  };
}

function emptySavingsTotals(): SavingsPolicyTotals {
  return emptySavingsPolicy();
}

function emptyView(): ProjectionView {
  return {
    income: emptyIncome(),
    withdrawals: emptyWithdrawals(),
    outflows: emptyOutflows(),
    contributions: emptyContributions(),
    balances: emptyBalances(),
    accountBalances: {},
    nonFinancialAssetValues: {},
    liabilityBalances: {},
    liabilitySchedules: {},
    accountContributions: {},
    accountContributionDetails: {},
    registeredAccountRoom: {
      tfsa: emptyRegisteredProgram(),
      rrsp: emptyRegisteredProgram(),
    },
    surplusAllocation: emptySurplusAllocation(),
    savingsPolicy: emptySavingsPolicy(),
    accountSurplusAllocations: {},
    allocation: { ...ZERO_ALLOCATION },
  };
}

function emptyBridge(startingFinancialAssets: number): FinancialAssetsBridge {
  return {
    startingFinancialAssets,
    employmentNetCash: 0,
    publicBenefitsAndPension: 0,
    otherInflows: 0,
    incomeWithheldContributions: 0,
    investmentReturns: 0,
    essentialSpending: 0,
    discretionarySpending: 0,
    liabilityCashPayments: 0,
    oneTimeOutflows: 0,
    taxes: 0,
    endingFinancialAssets: 0,
  };
}

function emptyNetWorthBridge(
  startingFinancialAssets: number,
  startingNonFinancialAssets: number,
  startingLiabilities: number,
): NetWorthBridge {
  return {
    startingFinancialAssets,
    startingNonFinancialAssets,
    startingLiabilities,
    externalNetCashInflows: 0,
    incomeWithheldContributions: 0,
    investmentReturns: 0,
    nonFinancialAssetAppreciation: 0,
    nonDebtEssentialSpending: 0,
    discretionarySpending: 0,
    liabilityInterest: 0,
    liabilityPrincipalPayments: 0,
    liabilityPrincipalReduction: 0,
    taxes: 0,
    oneTimeConsumptionOutflows: 0,
    endingNetWorth: 0,
  };
}

function bridgeDifferenceInCents(
  bridge: FinancialAssetsBridge,
): number {
  return centDifference(
    [
      bridge.startingFinancialAssets,
      bridge.employmentNetCash,
      bridge.publicBenefitsAndPension,
      bridge.otherInflows,
      bridge.incomeWithheldContributions,
      bridge.investmentReturns,
    ],
    [
      bridge.essentialSpending,
      bridge.discretionarySpending,
      bridge.liabilityCashPayments,
      bridge.oneTimeOutflows,
      bridge.taxes,
      bridge.endingFinancialAssets,
    ],
  );
}

function netWorthBridgeDifferenceInCents(
  bridge: NetWorthBridge,
): number {
  return centDifference(
    [
      bridge.startingFinancialAssets,
      bridge.startingNonFinancialAssets,
      bridge.externalNetCashInflows,
      bridge.incomeWithheldContributions,
      bridge.investmentReturns,
      bridge.nonFinancialAssetAppreciation,
      bridge.liabilityPrincipalReduction,
    ],
    [
      bridge.startingLiabilities,
      bridge.nonDebtEssentialSpending,
      bridge.discretionarySpending,
      bridge.liabilityInterest,
      bridge.liabilityPrincipalPayments,
      bridge.taxes,
      bridge.oneTimeConsumptionOutflows,
      bridge.endingNetWorth,
    ],
  );
}

function addWithdrawal(target: WithdrawalBreakdown, accountType: AccountType, amount: number): void {
  if (accountType === "cash") target.cash += amount;
  if (accountType === "tfsa") target.tfsa += amount;
  if (accountType === "rrsp_rrif") target.rrspRrif += amount;
  if (accountType === "non_registered") target.nonRegistered += amount;
  target.total += amount;
}

function balanceSheet(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
  nonFinancialAssets: NonFinancialAssetInput[] = [],
  nonFinancialAssetValues: Map<string, number> = new Map(),
  liabilities: LiabilityInput[] = [],
  liabilityBalances: Map<string, number> = new Map(),
): BalanceBreakdown {
  const result = emptyBalances();
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    if (account.type === "cash") result.cash += balance;
    if (account.type === "tfsa") result.tfsa += balance;
    if (account.type === "rrsp_rrif") result.rrspRrif += balance;
    if (account.type === "non_registered") result.nonRegistered += balance;
  }
  result.financialAssets = result.cash + result.tfsa + result.rrspRrif + result.nonRegistered;
  result.retirementFundingAssets = result.financialAssets;
  for (const asset of nonFinancialAssets) {
    const value = nonFinancialAssetValues.get(asset.id) ?? asset.openingValue;
    if (asset.type === "primary_residence") {
      result.residenceValue += value;
    } else {
      result.otherNonFinancialAssets += value;
    }
  }
  result.totalNonFinancialAssets =
    result.residenceValue + result.otherNonFinancialAssets;
  result.totalAssets =
    result.financialAssets + result.totalNonFinancialAssets;
  for (const liability of liabilities) {
    const balance =
      liabilityBalances.get(liability.id) ?? liability.openingBalance;
    if (liability.role === "primary_mortgage") {
      result.mortgageBalance += balance;
    } else {
      result.otherLiabilities += balance;
    }
  }
  result.totalLiabilities =
    result.mortgageBalance + result.otherLiabilities;
  result.homeEquity =
    result.residenceValue - result.mortgageBalance;
  result.totalNetWorth = result.totalAssets - result.totalLiabilities;
  return result;
}

function accountAllocation(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
): AssetAllocation {
  const result = { ...ZERO_ALLOCATION };
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    result.cash += balance * account.allocation.cash;
    result.fixedIncome += balance * account.allocation.fixedIncome;
    result.equity += balance * account.allocation.equity;
  }
  return result;
}

function snapshotAccountBalances(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
): Record<string, number> {
  return Object.fromEntries(accounts.map((account) => [account.id, balances.get(account.id) ?? 0]));
}

function snapshotValues<T extends { id: string }>(
  items: T[],
  values: Map<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    items.map((item) => [item.id, values.get(item.id) ?? 0]),
  );
}

function snapshotView(
  flow: ProjectionView,
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
  nonFinancialAssets: NonFinancialAssetInput[],
  nonFinancialAssetValues: Map<string, number>,
  liabilities: LiabilityInput[],
  liabilityBalances: Map<string, number>,
  factor: number,
  nominalLiabilitySchedules: ProjectionView["liabilitySchedules"] =
    flow.liabilitySchedules,
): ProjectionView {
  const divide = (value: number) => round(value / factor);
  const balancesAtSnapshot = balanceSheet(
    accounts,
    balances,
    nonFinancialAssets,
    nonFinancialAssetValues,
    liabilities,
    liabilityBalances,
  );
  const accountBalancesAtSnapshot = snapshotAccountBalances(accounts, balances);
  const nonFinancialAssetValuesAtSnapshot = snapshotValues(
    nonFinancialAssets,
    nonFinancialAssetValues,
  );
  const liabilityBalancesAtSnapshot = snapshotValues(
    liabilities,
    liabilityBalances,
  );
  const allocationAtSnapshot = accountAllocation(accounts, balances);
  const displayedBalances = {
    cash: divide(balancesAtSnapshot.cash),
    tfsa: divide(balancesAtSnapshot.tfsa),
    rrspRrif: divide(balancesAtSnapshot.rrspRrif),
    nonRegistered: divide(balancesAtSnapshot.nonRegistered),
    residenceValue: divide(balancesAtSnapshot.residenceValue),
    otherNonFinancialAssets: divide(
      balancesAtSnapshot.otherNonFinancialAssets,
    ),
    mortgageBalance: divide(balancesAtSnapshot.mortgageBalance),
    otherLiabilities: divide(balancesAtSnapshot.otherLiabilities),
  };
  const financialAssets = round(
    displayedBalances.cash +
      displayedBalances.tfsa +
      displayedBalances.rrspRrif +
      displayedBalances.nonRegistered,
  );
  const totalNonFinancialAssets = round(
    displayedBalances.residenceValue +
      displayedBalances.otherNonFinancialAssets,
  );
  const totalAssets = round(
    financialAssets + totalNonFinancialAssets,
  );
  const totalLiabilities = round(
    displayedBalances.mortgageBalance +
      displayedBalances.otherLiabilities,
  );
  return {
    income: {
      employment: round(flow.income.employment),
      cpp: round(flow.income.cpp),
      oas: round(flow.income.oas),
      pension: round(flow.income.pension),
      other: round(flow.income.other),
      total: round(flow.income.total),
    },
    withdrawals: {
      cash: round(flow.withdrawals.cash),
      tfsa: round(flow.withdrawals.tfsa),
      rrspRrif: round(flow.withdrawals.rrspRrif),
      nonRegistered: round(flow.withdrawals.nonRegistered),
      total: round(flow.withdrawals.total),
    },
    outflows: {
      essential: round(flow.outflows.essential),
      discretionary: round(flow.outflows.discretionary),
      liabilityInterest: round(flow.outflows.liabilityInterest),
      liabilityPrincipal: round(flow.outflows.liabilityPrincipal),
      liabilityLumpSumPrincipal: round(
        flow.outflows.liabilityLumpSumPrincipal,
      ),
      liabilityCashPayment: round(
        flow.outflows.liabilityCashPayment,
      ),
      oneTime: round(flow.outflows.oneTime),
      tax: round(flow.outflows.tax),
      oasRecoveryTax: round(flow.outflows.oasRecoveryTax),
      contributions: round(flow.outflows.contributions),
      unmetRequiredOutflow: round(
        flow.outflows.unmetRequiredOutflow,
      ),
      unmetSpending: round(flow.outflows.unmetSpending),
      total: round(flow.outflows.total),
    },
    contributions: {
      planned: round(flow.contributions.planned),
      allowed: round(flow.contributions.allowed),
      surplusFunded: round(flow.contributions.surplusFunded),
      sourceAccount: round(flow.contributions.sourceAccount),
      redirected: round(flow.contributions.redirected),
      cashFunded: round(flow.contributions.cashFunded),
      incomeWithheld: round(flow.contributions.incomeWithheld),
      unallocatedCashFunded: round(flow.contributions.unallocatedCashFunded),
      unallocatedIncomeWithheld: round(
        flow.contributions.unallocatedIncomeWithheld,
      ),
      unallocated: round(flow.contributions.unallocated),
      total: round(flow.contributions.total),
    },
    balances: {
      ...displayedBalances,
      financialAssets,
      retirementFundingAssets: financialAssets,
      totalNonFinancialAssets,
      totalAssets,
      totalLiabilities,
      homeEquity: round(
        displayedBalances.residenceValue -
          displayedBalances.mortgageBalance,
      ),
      totalNetWorth: round(totalAssets - totalLiabilities),
    },
    accountBalances: Object.fromEntries(
      Object.entries(accountBalancesAtSnapshot).map(([id, balance]) => [id, divide(balance)]),
    ),
    nonFinancialAssetValues: Object.fromEntries(
      Object.entries(nonFinancialAssetValuesAtSnapshot).map(
        ([id, value]) => [id, divide(value)],
      ),
    ),
    liabilityBalances: Object.fromEntries(
      Object.entries(liabilityBalancesAtSnapshot).map(([id, value]) => [
        id,
        divide(value),
      ]),
    ),
    liabilitySchedules: Object.fromEntries(
      Object.entries(nominalLiabilitySchedules).map(([id, schedule]) => {
        const openingBalance = divide(schedule.openingBalance);
        const interest = divide(schedule.interest);
        const regularPayment = divide(schedule.regularPayment);
        const lumpSumPrincipal = divide(schedule.lumpSumPrincipal);
        return [
          id,
          {
            openingBalance,
            interest,
            regularPayment,
            principal: round(regularPayment - interest),
            lumpSumPrincipal,
            closingBalance: round(
              openingBalance +
                interest -
                regularPayment -
                lumpSumPrincipal,
            ),
          } satisfies LiabilityScheduleBreakdown,
        ];
      }),
    ),
    accountContributions: Object.fromEntries(
      Object.entries(flow.accountContributions).map(([id, amount]) => [id, round(amount)]),
    ),
    accountContributionDetails: Object.fromEntries(
      Object.entries(flow.accountContributionDetails).map(([id, detail]) => [
        id,
        Object.fromEntries(
          Object.entries(detail).map(([key, amount]) => [key, round(amount)]),
        ) as AccountContributionDetail,
      ]),
    ),
    registeredAccountRoom: {
      tfsa: { ...flow.registeredAccountRoom.tfsa },
      rrsp: { ...flow.registeredAccountRoom.rrsp },
    },
    surplusAllocation: {
      generated: round(flow.surplusAllocation.generated),
      reserveRefill: round(flow.surplusAllocation.reserveRefill),
      retainedAsCash: round(flow.surplusAllocation.retainedAsCash),
      redirected: round(flow.surplusAllocation.redirected),
      reserveTarget: round(flow.surplusAllocation.reserveTarget),
    },
    savingsPolicy: Object.fromEntries(
      Object.entries(flow.savingsPolicy).map(([key, value]) => [
        key,
        round(value),
      ]),
    ) as SavingsPolicyBreakdown,
    accountSurplusAllocations: Object.fromEntries(
      Object.entries(flow.accountSurplusAllocations).map(([id, amount]) => [
        id,
        round(amount),
      ]),
    ),
    allocation: {
      cash: divide(allocationAtSnapshot.cash),
      fixedIncome: divide(allocationAtSnapshot.fixedIncome),
      equity: divide(allocationAtSnapshot.equity),
    },
  };
}

function addMonthlyFlow(target: ProjectionView, monthly: ProjectionView, factor: number): void {
  for (const key of Object.keys(monthly.income) as Array<keyof IncomeBreakdown>) {
    target.income[key] += monthly.income[key] / factor;
  }
  for (const key of Object.keys(monthly.withdrawals) as Array<keyof WithdrawalBreakdown>) {
    target.withdrawals[key] += monthly.withdrawals[key] / factor;
  }
  for (const key of Object.keys(monthly.outflows) as Array<keyof OutflowBreakdown>) {
    target.outflows[key] += monthly.outflows[key] / factor;
  }
  for (const key of Object.keys(monthly.contributions) as Array<keyof ContributionBreakdown>) {
    target.contributions[key] += monthly.contributions[key] / factor;
  }
  for (const key of Object.keys(monthly.savingsPolicy) as Array<
    keyof SavingsPolicyBreakdown
  >) {
    target.savingsPolicy[key] += monthly.savingsPolicy[key] / factor;
  }
  for (const [accountId, amount] of Object.entries(monthly.accountContributions)) {
    target.accountContributions[accountId] =
      (target.accountContributions[accountId] ?? 0) + amount / factor;
  }
  for (const [accountId, detail] of Object.entries(
    monthly.accountContributionDetails,
  )) {
    const targetDetail =
      target.accountContributionDetails[accountId] ??
      (target.accountContributionDetails[accountId] =
        emptyAccountContributionDetail());
    for (const key of Object.keys(detail) as Array<
      keyof AccountContributionDetail
    >) {
      targetDetail[key] += detail[key] / factor;
    }
  }
  for (const [liabilityId, schedule] of Object.entries(
    monthly.liabilitySchedules,
  )) {
    const targetSchedule =
      target.liabilitySchedules[liabilityId] ??
      (target.liabilitySchedules[liabilityId] = {
        openingBalance: schedule.openingBalance / factor,
        interest: 0,
        regularPayment: 0,
        principal: 0,
        lumpSumPrincipal: 0,
        closingBalance: schedule.closingBalance / factor,
      });
    targetSchedule.interest += schedule.interest / factor;
    targetSchedule.regularPayment +=
      schedule.regularPayment / factor;
    targetSchedule.principal += schedule.principal / factor;
    targetSchedule.lumpSumPrincipal +=
      schedule.lumpSumPrincipal / factor;
    targetSchedule.closingBalance = schedule.closingBalance / factor;
  }
  for (const program of ["tfsa", "rrsp"] as const) {
    const source = monthly.registeredAccountRoom[program];
    const destination = target.registeredAccountRoom[program];
    const flowFields: Array<keyof RegisteredProgramAnnualBreakdown> = [
      "annualNewRoom",
      "withdrawalRoomRestored",
      "plannedContributions",
      "allowedContributions",
      "redirectedIn",
      "redirectedOut",
      "surplusFundedContributions",
      "unallocatedContributions",
    ];
    for (const key of flowFields) {
      const value = source[key];
      if (typeof value === "number") {
        (destination[key] as number) += value;
      }
    }
    const pointFields: Array<keyof RegisteredProgramAnnualBreakdown> = [
      "openingRoom",
      "previousYearEligibleEarnedIncome",
      "annualCap",
      "pensionAdjustment",
      "otherRoomReduction",
      "grossGeneratedRoom",
    ];
    for (const key of pointFields) {
      const value = source[key];
      if (typeof value === "number" && value !== 0) {
        (destination[key] as number) = value;
      }
    }
    destination.earnedIncomeRate = source.earnedIncomeRate;
    destination.closingRoom = source.closingRoom;
    destination.carryForwardUnusedRoom = source.carryForwardUnusedRoom;
    destination.sourceKind = source.sourceKind;
  }
  target.surplusAllocation.generated +=
    monthly.surplusAllocation.generated / factor;
  target.surplusAllocation.reserveRefill +=
    monthly.surplusAllocation.reserveRefill / factor;
  target.surplusAllocation.retainedAsCash +=
    monthly.surplusAllocation.retainedAsCash / factor;
  target.surplusAllocation.redirected +=
    monthly.surplusAllocation.redirected / factor;
  target.surplusAllocation.reserveTarget =
    monthly.surplusAllocation.reserveTarget / factor;
  for (const [accountId, amount] of Object.entries(
    monthly.accountSurplusAllocations,
  )) {
    target.accountSurplusAllocations[accountId] =
      (target.accountSurplusAllocations[accountId] ?? 0) + amount / factor;
  }
}

function addSavingsTotals(
  target: SavingsPolicyTotals,
  monthly: ProjectionView,
  factor: number,
): void {
  for (const key of Object.keys(monthly.savingsPolicy) as Array<
    keyof SavingsPolicyBreakdown
  >) {
    target[key] += monthly.savingsPolicy[key] / factor;
  }
}

function addSurplusTotals(
  target: SurplusAllocationTotals,
  monthly: ProjectionView,
  factor: number,
): void {
  target.generated += monthly.surplusAllocation.generated / factor;
  target.reserveRefill += monthly.surplusAllocation.reserveRefill / factor;
  target.retainedAsCash +=
    monthly.surplusAllocation.retainedAsCash / factor;
  target.redirected += monthly.surplusAllocation.redirected / factor;
  for (const [accountId, amount] of Object.entries(
    monthly.accountSurplusAllocations,
  )) {
    target.accountAllocations[accountId] =
      (target.accountAllocations[accountId] ?? 0) + amount / factor;
  }
}

function assertSurplusReconciled(view: ProjectionView, period: string): void {
  const generatedDifference =
    view.surplusAllocation.generated -
    view.surplusAllocation.retainedAsCash -
    view.surplusAllocation.redirected;
  const accountDifference =
    Object.values(view.accountSurplusAllocations).reduce(
      (total, value) => total + value,
      0,
    ) - view.surplusAllocation.generated;
  if (
    round(Math.abs(generatedDifference)) > 0.01 ||
    round(Math.abs(accountDifference)) > 0.01 ||
    round(
      view.surplusAllocation.reserveRefill -
        view.surplusAllocation.retainedAsCash,
    ) > 0.01
  ) {
    throw new Error(`Surplus allocation failed to reconcile for ${period}`);
  }
}

function assertBalanceSheetReconciled(
  view: ProjectionView,
  period: string,
): void {
  const balances = view.balances;
  const differencesInCents = [
    centDifference(
      [balances.financialAssets],
      [
        balances.cash,
        balances.tfsa,
        balances.rrspRrif,
        balances.nonRegistered,
      ],
    ),
    centDifference(
      [balances.totalNonFinancialAssets],
      [
        balances.residenceValue,
        balances.otherNonFinancialAssets,
      ],
    ),
    centDifference(
      [balances.totalAssets],
      [
        balances.financialAssets,
        balances.totalNonFinancialAssets,
      ],
    ),
    centDifference(
      [balances.totalLiabilities],
      [balances.mortgageBalance, balances.otherLiabilities],
    ),
    centDifference(
      [balances.homeEquity, balances.mortgageBalance],
      [balances.residenceValue],
    ),
    centDifference(
      [balances.totalNetWorth, balances.totalLiabilities],
      [balances.totalAssets],
    ),
  ];
  if (
    differencesInCents.some(
      (difference) => Math.abs(difference) > 1,
    )
  ) {
    throw new Error(`Balance sheet failed to reconcile for ${period}`);
  }
}

function assertLiabilitySchedulesReconciled(
  view: ProjectionView,
  period: string,
): void {
  for (const [liabilityId, schedule] of Object.entries(
    view.liabilitySchedules,
  )) {
    const scheduleDifferenceInCents = centDifference(
      [schedule.openingBalance, schedule.interest],
      [
        schedule.regularPayment,
        schedule.lumpSumPrincipal,
        schedule.closingBalance,
      ],
    );
    const principalDifferenceInCents = centDifference(
      [schedule.regularPayment],
      [schedule.interest, schedule.principal],
    );
    if (
      Math.abs(scheduleDifferenceInCents) > 1 ||
      Math.abs(principalDifferenceInCents) > 1 ||
      schedule.closingBalance < -0.01
    ) {
      throw new Error(
        `Liability schedule failed to reconcile for ${liabilityId} in ${period}`,
      );
    }
  }
}

function assertSurplusTotalsReconciled(
  totals: SurplusAllocationTotals,
  period: string,
): void {
  const routed =
    totals.retainedAsCash + totals.redirected;
  const allocated = Object.values(totals.accountAllocations).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (
    round(Math.abs(totals.generated - routed)) > 0.01 ||
    round(Math.abs(totals.generated - allocated)) > 0.01 ||
    round(totals.reserveRefill - totals.retainedAsCash) > 0.01
  ) {
    throw new Error(
      `Surplus allocation totals failed to reconcile for ${period}`,
    );
  }
}

function assertRegisteredRoomReconciled(
  view: ProjectionView,
  period: string,
): void {
  const tfsa = view.registeredAccountRoom.tfsa;
  const rrsp = view.registeredAccountRoom.rrsp;
  const tfsaDifference =
    tfsa.openingRoom +
    tfsa.annualNewRoom +
    tfsa.withdrawalRoomRestored -
    tfsa.allowedContributions -
    tfsa.closingRoom;
  const rrspDifference =
    rrsp.openingRoom +
    rrsp.annualNewRoom -
    rrsp.allowedContributions -
    rrsp.closingRoom;
  if (
    Math.abs(tfsaDifference) > 0.01 ||
    Math.abs(rrspDifference) > 0.01
  ) {
    throw new Error(
      `Registered account room failed to reconcile for ${period}`,
    );
  }
}

function assertContributionsReconciled(
  view: ProjectionView,
  period: string,
): void {
  const plannedDifference =
    view.contributions.planned -
    view.contributions.allowed -
    view.contributions.unallocated;
  const totalDifference =
    view.contributions.total -
    view.contributions.allowed -
    view.contributions.surplusFunded;
  const fundingDifference =
    view.contributions.cashFunded +
    view.contributions.incomeWithheld -
    view.contributions.total;
  const outflowDifference =
    view.outflows.contributions - view.contributions.cashFunded;
  const accountDepositDifference =
    Object.values(view.accountContributionDetails).reduce(
      (total, detail) => total + detail.depositedIntoAccount,
      0,
    ) - view.contributions.total;
  let accountDifference = 0;
  for (const detail of Object.values(view.accountContributionDetails)) {
    accountDifference = Math.max(
      accountDifference,
      Math.abs(
        detail.depositedIntoAccount -
          detail.sourceAccountDeposit -
          detail.redirectedIn -
          detail.surplusFundedDeposit,
      ),
      detail.plannedFromAccount > 0
        ? Math.abs(
            detail.plannedFromAccount -
              detail.sourceAccountDeposit -
              detail.redirectedOut -
              detail.unallocatedFromAccount,
          )
        : 0,
    );
  }
  if (
    round(Math.abs(plannedDifference)) > 0.01 ||
    round(Math.abs(totalDifference)) > 0.01 ||
    round(Math.abs(fundingDifference)) > 0.01 ||
    round(Math.abs(outflowDifference)) > 0.01 ||
    round(Math.abs(accountDepositDifference)) > 0.01 ||
    round(accountDifference) > 0.01
  ) {
    throw new Error(`Contribution routing failed to reconcile for ${period}`);
  }
}

function assertSavingsPolicyReconciled(
  view: ProjectionView,
  period: string,
  mode: ProjectionInputs["savingsPolicy"]["mode"],
): void {
  if (mode !== "simple") return;
  const savings = view.savingsPolicy;
  const differences = [
    savings.reserveFunded -
      savings.reserveRetainedAsCash -
      savings.reserveRedirected,
    savings.personalPlanned -
      savings.personalAllowed -
      savings.personalUnallocated,
    savings.workplacePlanned -
      savings.workplaceAllowed -
      savings.workplaceUnallocated,
    savings.totalInvestmentDeposits -
      savings.personalAllowed -
      savings.workplaceAllowed -
      savings.reserveRedirected,
    savings.positiveCashAvailable -
      savings.personalAllowed -
      savings.reserveFunded -
      savings.unplannedCashRetained,
    view.contributions.planned -
      savings.personalPlanned -
      savings.workplacePlanned,
    view.contributions.allowed -
      savings.personalAllowed -
      savings.workplaceAllowed,
    view.contributions.unallocated -
      savings.personalUnallocated -
      savings.workplaceUnallocated,
    view.contributions.surplusFunded -
      savings.reserveRedirected,
    view.contributions.total - savings.totalInvestmentDeposits,
  ];
  if (
    differences.some(
      (difference) => round(Math.abs(difference)) > 0.01,
    )
  ) {
    throw new Error(
      `Simple savings policy failed to reconcile for ${period}`,
    );
  }
}

function milestoneLabels(inputs: ProjectionInputs, previousMonth: number, month: number): string[] {
  const previousAge = inputs.person.currentAge + previousMonth / MONTHS_PER_YEAR;
  const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
  const checks: Array<[number, string]> = [
    [inputs.person.retirementAge, "Retirement"],
    [inputs.person.cpp.startAge, "CPP begins"],
    [inputs.person.oas.startAge, "OAS begins"],
    [inputs.person.rrifConversionAge, "RRIF conversion age"],
  ];
  return checks.filter(([target]) => previousAge < target && age >= target).map(([, label]) => label);
}

export function calculateProjection(rawInputs: ProjectionInputs): ProjectionResult {
  const inputs = validateProjectionInputs(rawInputs);
  const benefits = governmentBenefitSummary(inputs);
  const startYear = Number(inputs.startDate.slice(0, 4));
  const startMonth = Number(inputs.startDate.slice(5, 7));
  const totalMonths = Math.round((inputs.endAge - inputs.person.currentAge) * MONTHS_PER_YEAR);
  const retirementMonth = Math.round(
    (inputs.person.retirementAge - inputs.person.currentAge) * MONTHS_PER_YEAR,
  );
  const balances = new Map(inputs.accounts.map((account) => [account.id, account.openingBalance]));
  const nonFinancialAssetValues = new Map(
    inputs.nonFinancialAssets.map((asset) => [
      asset.id,
      asset.openingValue,
    ]),
  );
  const liabilityBalances = new Map(
    inputs.liabilities.map((liability) => [
      liability.id,
      liability.openingBalance,
    ]),
  );
  const liabilityPayoffDates: Record<string, string | null> =
    Object.fromEntries(
      inputs.liabilities.map((liability) => [
        liability.id,
        liability.openingBalance === 0 ? inputs.startDate : null,
      ]),
    );
  const reserveAccounts = inputs.surplusAllocation.reserveAccountIds.map(
    (accountId) =>
      inputs.accounts.find((account) => account.id === accountId)!,
  );
  const reserveRefillAccount = inputs.accounts.find(
    (account) =>
      account.id === inputs.surplusAllocation.reserveRefillAccountId,
  )!;
  const destinationAccountId =
    inputs.surplusAllocation.excess.mode === "allocate_to_account"
      ? inputs.surplusAllocation.excess.destinationAccountId
      : null;
  const destinationAccount =
    destinationAccountId
      ? inputs.accounts.find(
          (account) => account.id === destinationAccountId,
        )!
      : null;
  const annual: AnnualProjection[] = [];
  const observations: ProjectionObservation[] = [];
  const startingSheet = balanceSheet(
    inputs.accounts,
    balances,
    inputs.nonFinancialAssets,
    nonFinancialAssetValues,
    inputs.liabilities,
    liabilityBalances,
  );
  const startingFinancialAssets = startingSheet.financialAssets;
  const nominalBridge = emptyBridge(startingFinancialAssets);
  const realBridge = emptyBridge(startingFinancialAssets);
  const nominalNetWorthBridge = emptyNetWorthBridge(
    startingFinancialAssets,
    startingSheet.totalNonFinancialAssets,
    startingSheet.totalLiabilities,
  );
  const realNetWorthBridge = emptyNetWorthBridge(
    startingFinancialAssets,
    startingSheet.totalNonFinancialAssets,
    startingSheet.totalLiabilities,
  );
  let annualNominalFlow = emptyView();
  let annualRealFlow = emptyView();
  let annualEmploymentPhaseLabels = new Set<string>();
  let annualContributionPhaseLabels = new Map<string, Set<string>>();
  let financialAssetsDepletionAge: number | null = null;
  let previousSnapshotMonth = 0;
  let retirementSnapshot: RetirementSnapshot | undefined;
  const nominalSurplusThroughRetirement = emptySurplusTotals();
  const realSurplusThroughRetirement = emptySurplusTotals();
  const nominalSavingsThroughRetirement = emptySavingsTotals();
  const realSavingsThroughRetirement = emptySavingsTotals();
  let reserveTargetAtRetirementNominal = 0;
  let reserveTargetAtRetirementReal = 0;
  let reserveBalanceAtRetirementNominal = 0;
  let reserveBalanceAtRetirementReal = 0;
  let destinationBalanceAtRetirementNominal = 0;
  let destinationBalanceAtRetirementReal = 0;
  let tfsaRoom =
    inputs.registeredAccountRoom?.tfsa.startingAvailableRoom.amount ?? 0;
  let rrspRoom =
    inputs.registeredAccountRoom?.rrsp.startingAvailableDeductionRoom.amount ??
    0;
  const tfsaWithdrawalsByYear = new Map<number, number>();
  const rrspGenerationByYear = new Map<
    number,
    { eligible: number; pensionAdjustment: number; otherReduction: number }
  >();
  if (inputs.registeredAccountRoom) {
    const preStart =
      inputs.registeredAccountRoom.rrsp.newRoom
        .startYearBeforeProjectionMonth;
    rrspGenerationByYear.set(preStart.calendarYear, {
      eligible: preStart.eligibleEarnedIncome,
      pensionAdjustment: preStart.pensionAdjustment,
      otherReduction: preStart.otherRoomReduction,
    });
  }

  function contributionDetail(
    view: ProjectionView,
    accountId: string,
  ): AccountContributionDetail {
    return (
      view.accountContributionDetails[accountId] ??
      (view.accountContributionDetails[accountId] =
        emptyAccountContributionDetail())
    );
  }

  function availableForAccount(
    account: FinancialAccountInput,
    workingAge: number,
  ): number {
    if (account.type === "tfsa") return tfsaRoom;
    if (account.type === "rrsp_rrif") {
      return workingAge >= inputs.person.rrifConversionAge - AGE_TOLERANCE
        ? 0
        : rrspRoom;
    }
    return Number.POSITIVE_INFINITY;
  }

  function consumeRoom(account: FinancialAccountInput, amount: number): void {
    if (account.type === "tfsa") tfsaRoom = Math.max(0, tfsaRoom - amount);
    if (account.type === "rrsp_rrif") {
      rrspRoom = Math.max(0, rrspRoom - amount);
    }
  }

  function snapshot(month: number, previousMonth: number, calendarYear: number): void {
    const factor = indexedFactor(inputs.annualInflation, month);
    const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
    const nominal = snapshotView(
      annualNominalFlow,
      inputs.accounts,
      balances,
      inputs.nonFinancialAssets,
      nonFinancialAssetValues,
      inputs.liabilities,
      liabilityBalances,
      1,
    );
    const real = snapshotView(
      annualRealFlow,
      inputs.accounts,
      balances,
      inputs.nonFinancialAssets,
      nonFinancialAssetValues,
      inputs.liabilities,
      liabilityBalances,
      factor,
      annualNominalFlow.liabilitySchedules,
    );
    assertSurplusReconciled(nominal, `${calendarYear} nominal`);
    assertSurplusReconciled(real, `${calendarYear} real`);
    assertContributionsReconciled(nominal, `${calendarYear} nominal`);
    assertContributionsReconciled(real, `${calendarYear} real`);
    assertSavingsPolicyReconciled(
      nominal,
      `${calendarYear} nominal`,
      inputs.savingsPolicy.mode,
    );
    assertBalanceSheetReconciled(nominal, `${calendarYear} nominal`);
    assertBalanceSheetReconciled(real, `${calendarYear} real`);
    assertLiabilitySchedulesReconciled(
      nominal,
      `${calendarYear} nominal`,
    );
    assertLiabilitySchedulesReconciled(real, `${calendarYear} real`);
    assertSavingsPolicyReconciled(
      real,
      `${calendarYear} real`,
      inputs.savingsPolicy.mode,
    );
    if (inputs.registeredAccountRoom) {
      assertRegisteredRoomReconciled(nominal, `${calendarYear} nominal`);
      assertRegisteredRoomReconciled(real, `${calendarYear} real`);
    }
    annual.push({
      calendarYear,
      age: round(age),
      phase: age < inputs.person.retirementAge ? "accumulation" : "retirement",
      nominal,
      real,
      milestones: milestoneLabels(inputs, previousMonth, month),
      employmentPhaseLabels: [...annualEmploymentPhaseLabels],
      contributionPhaseLabels: Object.fromEntries(
        [...annualContributionPhaseLabels.entries()].map(([accountId, labels]) => [
          accountId,
          [...labels],
        ]),
      ),
    });
    annualNominalFlow = emptyView();
    annualRealFlow = emptyView();
    annualEmploymentPhaseLabels = new Set<string>();
    annualContributionPhaseLabels = new Map<string, Set<string>>();
    previousSnapshotMonth = month;
  }

  for (let month = 1; month <= totalMonths; month += 1) {
    const previousFactor = indexedFactor(inputs.annualInflation, month - 1);
    const factor = indexedFactor(inputs.annualInflation, month);
    const workingAge = inputs.person.currentAge + (month - 1) / MONTHS_PER_YEAR;
    const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
    const calendarMonthIndex = startMonth - 1 + month - 1;
    const calendarYear = startYear + Math.floor(calendarMonthIndex / MONTHS_PER_YEAR);
    const calendarMonth = (calendarMonthIndex % MONTHS_PER_YEAR) + 1;
    const monthlyFlow = emptyView();
    if (inputs.registeredAccountRoom) {
      const tfsaLedger = monthlyFlow.registeredAccountRoom.tfsa;
      const rrspLedger = monthlyFlow.registeredAccountRoom.rrsp;
      tfsaLedger.carryForwardUnusedRoom =
        inputs.registeredAccountRoom.tfsa.carryForwardUnusedRoom;
      rrspLedger.carryForwardUnusedRoom =
        inputs.registeredAccountRoom.rrsp.carryForwardUnusedRoom;
      rrspLedger.earnedIncomeRate = RRSP_EARNED_INCOME_RATE;
      if (month === 1) {
        tfsaLedger.openingRoom = tfsaRoom;
        rrspLedger.openingRoom = rrspRoom;
      } else if (calendarMonth === 1) {
        const tfsaReference = tfsaAnnualLimit(
          calendarYear,
          inputs.registeredAccountRoom.tfsa.annualNewRoom
            .futureIndexingRate,
          inputs.registeredAccountRoom.tfsa.annualNewRoom.roundingIncrement,
        );
        const restored =
          tfsaWithdrawalsByYear.get(calendarYear - 1) ?? 0;
        const tfsaCarry =
          inputs.registeredAccountRoom.tfsa.carryForwardUnusedRoom
            ? tfsaRoom
            : 0;
        tfsaRoom =
          tfsaCarry +
          tfsaReference.amount +
          restored;
        tfsaLedger.openingRoom = tfsaCarry;
        tfsaLedger.annualNewRoom = tfsaReference.amount;
        tfsaLedger.withdrawalRoomRestored = restored;
        tfsaLedger.sourceKind = tfsaReference.sourceKind;

        const previousGeneration =
          rrspGenerationByYear.get(calendarYear - 1) ?? {
            eligible: 0,
            pensionAdjustment: 0,
            otherReduction: 0,
          };
        const rrspReference = rrspAnnualCap(
          calendarYear,
          inputs.registeredAccountRoom.rrsp.newRoom.annualCap
            .futureGrowthRate,
          inputs.registeredAccountRoom.rrsp.newRoom.annualCap
            .futureRoundingIncrement,
        );
        const grossGenerated = Math.min(
          previousGeneration.eligible * RRSP_EARNED_INCOME_RATE,
          rrspReference.amount,
        );
        const newRoom = Math.max(
          0,
          grossGenerated -
            previousGeneration.pensionAdjustment -
            previousGeneration.otherReduction,
        );
        const rrspCarry =
          inputs.registeredAccountRoom.rrsp.carryForwardUnusedRoom
            ? rrspRoom
            : 0;
        rrspRoom = rrspCarry + newRoom;
        rrspLedger.openingRoom = rrspCarry;
        rrspLedger.annualNewRoom = newRoom;
        rrspLedger.previousYearEligibleEarnedIncome =
          previousGeneration.eligible;
        rrspLedger.annualCap = rrspReference.amount;
        rrspLedger.pensionAdjustment =
          previousGeneration.pensionAdjustment;
        rrspLedger.otherRoomReduction =
          previousGeneration.otherReduction;
        rrspLedger.grossGeneratedRoom = grossGenerated;
        rrspLedger.sourceKind = rrspReference.sourceKind;
      }
    }
    monthlyFlow.surplusAllocation.reserveTarget =
      inputs.surplusAllocation.targetCashReserveToday *
      indexedFactor(inputs.surplusAllocation.reserveIndexingRate, month);

    const balancesBeforeReturn = balanceSheet(
      inputs.accounts,
      balances,
    ).financialAssets;
    for (const account of inputs.accounts) {
      const current = balances.get(account.id) ?? 0;
      balances.set(account.id, Math.max(0, current * (1 + monthlyRate(account.annualReturn))));
    }
    const balancesAfterReturn = balanceSheet(
      inputs.accounts,
      balances,
    ).financialAssets;
    const nonFinancialAssetsBeforeAppreciation =
      inputs.nonFinancialAssets.reduce(
        (total, asset) =>
          total + (nonFinancialAssetValues.get(asset.id) ?? 0),
        0,
      );
    for (const asset of inputs.nonFinancialAssets) {
      const current = nonFinancialAssetValues.get(asset.id) ?? 0;
      nonFinancialAssetValues.set(
        asset.id,
        Math.max(
          0,
          current * (1 + monthlyRate(asset.annualAppreciation)),
        ),
      );
    }
    const nonFinancialAssetsAfterAppreciation =
      inputs.nonFinancialAssets.reduce(
        (total, asset) =>
          total + (nonFinancialAssetValues.get(asset.id) ?? 0),
        0,
      );
    if (month <= retirementMonth) {
      nominalBridge.investmentReturns += balancesAfterReturn - balancesBeforeReturn;
      realBridge.investmentReturns +=
        balancesAfterReturn / factor - balancesBeforeReturn / previousFactor;
      nominalNetWorthBridge.investmentReturns +=
        balancesAfterReturn - balancesBeforeReturn;
      realNetWorthBridge.investmentReturns +=
        balancesAfterReturn / factor -
        balancesBeforeReturn / previousFactor;
      nominalNetWorthBridge.nonFinancialAssetAppreciation +=
        nonFinancialAssetsAfterAppreciation -
        nonFinancialAssetsBeforeAppreciation;
      realNetWorthBridge.nonFinancialAssetAppreciation +=
        nonFinancialAssetsAfterAppreciation / factor -
        nonFinancialAssetsBeforeAppreciation / previousFactor;
    }

    const income = emptyIncome();
    const employmentPhase =
      workingAge < inputs.person.retirementAge - AGE_TOLERANCE
        ? activeEmploymentPhase(inputs.person.employmentIncomePhases, workingAge)
        : undefined;
    if (employmentPhase) {
      income.employment =
        (employmentPhase.annualNetCashToday *
          indexedFactor(
            employmentPhase.annualGrowth,
            phaseMonth(age, employmentPhase.startAge),
          )) /
        MONTHS_PER_YEAR;
      annualEmploymentPhaseLabels.add(employmentPhase.label);
      if (employmentPhase.rrspRoomGeneration) {
        const generation =
          rrspGenerationByYear.get(calendarYear) ?? {
            eligible: 0,
            pensionAdjustment: 0,
            otherReduction: 0,
          };
        const generationFactor = indexedFactor(
          employmentPhase.rrspRoomGeneration.annualGrowth,
          phaseMonth(age, employmentPhase.startAge),
        );
        generation.eligible +=
          (employmentPhase.rrspRoomGeneration
            .annualEligibleEarnedIncomeToday *
            generationFactor) /
          MONTHS_PER_YEAR;
        generation.pensionAdjustment +=
          (employmentPhase.rrspRoomGeneration
            .annualPensionAdjustmentToday *
            generationFactor) /
          MONTHS_PER_YEAR;
        generation.otherReduction +=
          (employmentPhase.rrspRoomGeneration
            .annualOtherRoomReductionToday *
            generationFactor) /
          MONTHS_PER_YEAR;
        rrspGenerationByYear.set(calendarYear, generation);
      }
    }
    if (age >= inputs.person.cpp.startAge) {
      income.cpp =
        benefits.cpp.monthlyAmountAtClaimToday *
        indexedFactor(inputs.person.cpp.indexingRate, month);
    }
    if (age >= inputs.person.oas.startAge) {
      const age75Factor =
        age > 75 + AGE_TOLERANCE
          ? 1 + inputs.person.oas.age75IncreaseRate
          : 1;
      income.oas =
        benefits.oas.monthlyAmountAtClaimToday *
        age75Factor *
        indexedFactor(inputs.person.oas.indexingRate, month);
    }
    if (age >= inputs.person.pensionStartAge) {
      income.pension =
        (inputs.person.annualPensionToday *
          indexedFactor(inputs.person.pensionIndexingRate, month)) /
        MONTHS_PER_YEAR;
    }
    income.total = income.employment + income.cpp + income.oas + income.pension;
    for (const key of Object.keys(income) as Array<keyof IncomeBreakdown>) {
      monthlyFlow.income[key] += income[key];
    }

    const grossRetirementIncome = income.cpp + income.oas + income.pension;
    const threshold = inputs.tax.oasRecoveryThresholdToday * factor / MONTHS_PER_YEAR;
    const recoveryTax = Math.min(
      income.oas,
      Math.max(0, grossRetirementIncome - threshold) * inputs.tax.oasRecoveryRate,
    );
    const regularTax = grossRetirementIncome * inputs.tax.effectiveTaxRate;
    monthlyFlow.outflows.tax += regularTax + recoveryTax;
    monthlyFlow.outflows.oasRecoveryTax += recoveryTax;

    const essential = inputs.monthlyEssentialSpendingToday * factor;
    const discretionary = inputs.monthlyDiscretionarySpendingToday * factor;
    monthlyFlow.outflows.essential += essential;
    monthlyFlow.outflows.discretionary += discretionary;

    let eventInflows = 0;
    let unassignedEventInflows = 0;
    let eventOutflows = 0;
    const matchingEvents = inputs.events.filter(
      (event) =>
        event.calendarYear === calendarYear &&
        event.month === calendarMonth,
    );
    for (const event of matchingEvents) {
      const amount = event.amountToday * factor;
      if (event.direction === "inflow") {
        eventInflows += amount;
        monthlyFlow.income.other += amount;
        monthlyFlow.income.total += amount;
        if (event.targetAccountId) {
          balances.set(
            event.targetAccountId,
            (balances.get(event.targetAccountId) ?? 0) + amount,
          );
        } else {
          unassignedEventInflows += amount;
        }
      } else {
        eventOutflows += amount;
        monthlyFlow.outflows.oneTime += amount;
      }
    }

    let liabilityCashPayment = 0;
    let liabilityInterest = 0;
    let liabilityPrincipal = 0;
    let liabilityLumpSumPrincipal = 0;
    const calendarMonthKey = `${calendarYear}-${String(
      calendarMonth,
    ).padStart(2, "0")}`;
    const liabilityPaymentDemands = inputs.liabilities.map(
      (liability) =>
        buildLiabilityPaymentDemand(
          liability,
          liabilityBalances.get(liability.id) ?? 0,
          month,
          calendarMonthKey,
        ),
    );
    const requiredLiabilityCashPayment =
      liabilityPaymentDemands.reduce(
        (total, demand) => total + demand.cashPayment,
        0,
      );

    let cashFundedContributions = 0;
    let incomeWithheldContributions = 0;
    const processContributionRoute = (
      route: ProjectionInputs["contributionWaterfall"]["routes"][number],
      availableCash: number,
    ): {
      planned: number;
      deposited: number;
      unallocated: number;
      funding: "cash" | "income_withheld" | null;
    } => {
      if (workingAge >= inputs.person.retirementAge - AGE_TOLERANCE) {
        return {
          planned: 0,
          deposited: 0,
          unallocated: 0,
          funding: null,
        };
      }
      const account = inputs.accounts.find(
        (candidate) => candidate.id === route.sourceAccountId,
      )!;
      const contributionPhase = activeContributionPhase(
        account.contributionPhases,
        workingAge,
      );
      if (!contributionPhase) {
        return {
          planned: 0,
          deposited: 0,
          unallocated: 0,
          funding: null,
        };
      }
      const planned =
        contributionPhase.monthlyAmountToday *
        indexedFactor(
          contributionPhase.indexingRate,
          phaseMonth(age, contributionPhase.startAge),
        );
      annualContributionPhaseLabels.set(
        account.id,
        (annualContributionPhaseLabels.get(account.id) ?? new Set<string>()).add(
          contributionPhase.label,
        ),
      );
      if (planned <= 0) {
        return {
          planned: 0,
          deposited: 0,
          unallocated: 0,
          funding: contributionPhase.funding,
        };
      }
      monthlyFlow.contributions.planned += planned;
      const sourceDetail = contributionDetail(monthlyFlow, account.id);
      sourceDetail.plannedFromAccount += planned;
      const sourceProgram =
        account.type === "tfsa"
          ? monthlyFlow.registeredAccountRoom.tfsa
          : account.type === "rrsp_rrif"
            ? monthlyFlow.registeredAccountRoom.rrsp
            : null;
      if (sourceProgram) sourceProgram.plannedContributions += planned;

      let remaining =
        contributionPhase.funding === "cash"
          ? Math.min(planned, Math.max(0, availableCash))
          : planned;
      let deposited = 0;
      for (const destinationId of route.destinationAccountIds) {
        if (remaining <= 0) break;
        const destination = inputs.accounts.find(
          (candidate) => candidate.id === destinationId,
        )!;
        const amount = Math.min(
          remaining,
          availableForAccount(destination, workingAge),
        );
        if (amount <= 0) continue;
        consumeRoom(destination, amount);
        balances.set(
          destination.id,
          (balances.get(destination.id) ?? 0) + amount,
        );
        monthlyFlow.accountContributions[destination.id] =
          (monthlyFlow.accountContributions[destination.id] ?? 0) + amount;
        const destinationDetail = contributionDetail(
          monthlyFlow,
          destination.id,
        );
        destinationDetail.depositedIntoAccount += amount;
        if (destination.id === account.id) {
          destinationDetail.sourceAccountDeposit += amount;
          monthlyFlow.contributions.sourceAccount += amount;
        } else {
          sourceDetail.redirectedOut += amount;
          destinationDetail.redirectedIn += amount;
          monthlyFlow.contributions.redirected += amount;
          const destinationProgram =
            destination.type === "tfsa"
              ? monthlyFlow.registeredAccountRoom.tfsa
              : destination.type === "rrsp_rrif"
                ? monthlyFlow.registeredAccountRoom.rrsp
                : null;
          if (destinationProgram) destinationProgram.redirectedIn += amount;
          if (sourceProgram) sourceProgram.redirectedOut += amount;
        }
        const destinationProgram =
          destination.type === "tfsa"
            ? monthlyFlow.registeredAccountRoom.tfsa
            : destination.type === "rrsp_rrif"
              ? monthlyFlow.registeredAccountRoom.rrsp
              : null;
        if (destinationProgram) {
          destinationProgram.allowedContributions += amount;
        }
        if (contributionPhase.funding === "cash") {
          destinationDetail.cashFunded += amount;
        } else {
          destinationDetail.incomeWithheld += amount;
        }
        deposited += amount;
        remaining -= amount;
      }
      const unallocated = planned - deposited;
      monthlyFlow.contributions.allowed += deposited;
      monthlyFlow.contributions.total += deposited;
      if (contributionPhase.funding === "cash") {
        monthlyFlow.outflows.contributions += deposited;
        monthlyFlow.contributions.cashFunded += deposited;
        monthlyFlow.contributions.unallocatedCashFunded += unallocated;
        cashFundedContributions += deposited;
      } else {
        monthlyFlow.contributions.incomeWithheld += deposited;
        monthlyFlow.contributions.unallocatedIncomeWithheld += unallocated;
        incomeWithheldContributions += deposited;
      }
      monthlyFlow.contributions.unallocated += unallocated;
      sourceDetail.unallocatedFromAccount += unallocated;
      if (sourceProgram) sourceProgram.unallocatedContributions += unallocated;
      return {
        planned,
        deposited,
        unallocated,
        funding: contributionPhase.funding,
      };
    };

    const simplePolicy =
      inputs.savingsPolicy.mode === "simple" ? inputs.savingsPolicy : null;
    const workplaceRoute = simplePolicy?.workplaceRrspAccountId
      ? inputs.contributionWaterfall.routes.find(
          (route) =>
            route.sourceAccountId ===
            simplePolicy.workplaceRrspAccountId,
        )
      : undefined;
    if (simplePolicy) {
      if (workplaceRoute) {
        const workplace = processContributionRoute(
          workplaceRoute,
          Number.POSITIVE_INFINITY,
        );
        monthlyFlow.savingsPolicy.workplacePlanned = workplace.planned;
        monthlyFlow.savingsPolicy.workplaceAllowed = workplace.deposited;
        monthlyFlow.savingsPolicy.workplaceUnallocated =
          workplace.unallocated;
      }
    }

    const withdrawalAccounts = [...inputs.accounts].sort(
      (left, right) =>
        left.withdrawalPriority - right.withdrawalPriority,
    );
    let withdrawalTaxTotal = 0;
    const fundCashNeedFromWithdrawals = (
      requestedNetCash: number,
    ): number => {
      let remaining = requestedNetCash;
      for (const account of withdrawalAccounts) {
        if (remaining <= 0) break;
        const balance = balances.get(account.id) ?? 0;
        if (balance <= 0) continue;
        let grossWithdrawal = Math.min(balance, remaining);
        let netCash = grossWithdrawal;
        if (account.type === "rrsp_rrif") {
          const netRate = 1 - inputs.tax.effectiveTaxRate;
          grossWithdrawal = Math.min(balance, remaining / netRate);
          const withdrawalTax =
            grossWithdrawal * inputs.tax.effectiveTaxRate;
          netCash = grossWithdrawal - withdrawalTax;
          monthlyFlow.outflows.tax += withdrawalTax;
          withdrawalTaxTotal += withdrawalTax;
        }
        balances.set(account.id, balance - grossWithdrawal);
        addWithdrawal(
          monthlyFlow.withdrawals,
          account.type,
          grossWithdrawal,
        );
        if (account.type === "tfsa") {
          tfsaWithdrawalsByYear.set(
            calendarYear,
            (tfsaWithdrawalsByYear.get(calendarYear) ?? 0) +
              grossWithdrawal,
          );
        }
        remaining -= netCash;
      }
      return Math.max(0, remaining);
    };

    let availableCurrentMonthCash =
      income.total + unassignedEventInflows;
    const liabilityPaymentFromCurrentCash = Math.min(
      availableCurrentMonthCash,
      requiredLiabilityCashPayment,
    );
    availableCurrentMonthCash -= liabilityPaymentFromCurrentCash;
    const remainingRequiredLiabilityPayment =
      fundCashNeedFromWithdrawals(
        requiredLiabilityCashPayment -
          liabilityPaymentFromCurrentCash,
      );
    if (remainingRequiredLiabilityPayment > 0.005) {
      monthlyFlow.outflows.unmetRequiredOutflow =
        remainingRequiredLiabilityPayment;
      throw new Error(
        `Required liability payment could not be funded for ${calendarMonthKey}`,
      );
    }

    for (const demand of liabilityPaymentDemands) {
      const schedule = demand.schedule;
      liabilityBalances.set(
        demand.liabilityId,
        schedule.closingBalance,
      );
      if (
        schedule.openingBalance > 0 &&
        schedule.closingBalance === 0 &&
        liabilityPayoffDates[demand.liabilityId] === null
      ) {
        liabilityPayoffDates[demand.liabilityId] = lastDayOfMonth(
          calendarYear,
          calendarMonth,
        );
      }
      monthlyFlow.liabilitySchedules[demand.liabilityId] = schedule;
      liabilityInterest += schedule.interest;
      liabilityPrincipal += schedule.principal;
      liabilityLumpSumPrincipal += schedule.lumpSumPrincipal;
      liabilityCashPayment += demand.cashPayment;

      if (month <= retirementMonth) {
        nominalNetWorthBridge.liabilityPrincipalPayments +=
          schedule.principal + schedule.lumpSumPrincipal;
        nominalNetWorthBridge.liabilityPrincipalReduction +=
          schedule.openingBalance - schedule.closingBalance;
        realNetWorthBridge.liabilityPrincipalPayments +=
          (schedule.principal + schedule.lumpSumPrincipal) / factor;
        realNetWorthBridge.liabilityPrincipalReduction +=
          schedule.openingBalance / previousFactor -
          schedule.closingBalance / factor;
      }
    }
    monthlyFlow.outflows.liabilityInterest = liabilityInterest;
    monthlyFlow.outflows.liabilityPrincipal = liabilityPrincipal;
    monthlyFlow.outflows.liabilityLumpSumPrincipal =
      liabilityLumpSumPrincipal;
    monthlyFlow.outflows.liabilityCashPayment =
      liabilityCashPayment;

    if (!simplePolicy) {
      for (const route of inputs.contributionWaterfall.routes) {
        processContributionRoute(route, Number.POSITIVE_INFINITY);
      }
    }

    let cashPosition =
      availableCurrentMonthCash -
      essential -
      discretionary -
      regularTax -
      recoveryTax -
      cashFundedContributions -
      eventOutflows;
    if (cashPosition < 0) {
      const unmetSpending = fundCashNeedFromWithdrawals(
        -cashPosition,
      );
      if (unmetSpending > 0) {
        monthlyFlow.outflows.unmetSpending += unmetSpending;
      }
      cashPosition = 0;
    }

    if (simplePolicy) {
      const positiveCashAvailable = Math.max(0, cashPosition);
      monthlyFlow.savingsPolicy.positiveCashAvailable =
        positiveCashAvailable;
      const personalRoute = inputs.contributionWaterfall.routes.find(
        (route) =>
          route.sourceAccountId ===
          simplePolicy.personalTfsaAccountId,
      );
      if (personalRoute) {
        const personal = processContributionRoute(
          personalRoute,
          positiveCashAvailable,
        );
        monthlyFlow.savingsPolicy.personalPlanned = personal.planned;
        monthlyFlow.savingsPolicy.personalAllowed = personal.deposited;
        monthlyFlow.savingsPolicy.personalUnallocated =
          personal.unallocated;
        cashPosition -= personal.deposited;
      }

      const reservePhase =
        workingAge < inputs.person.retirementAge - AGE_TOLERANCE
          ? simplePolicy.reserveBuildingPhases.find(
              (phase) =>
                workingAge >= phase.startAge - AGE_TOLERANCE &&
                workingAge < phase.endAge - AGE_TOLERANCE,
            )
          : undefined;
      const reservePlanned = reservePhase
        ? reservePhase.monthlyAmountToday *
          indexedFactor(
            reservePhase.indexingRate,
            phaseMonth(age, reservePhase.startAge),
          )
        : 0;
      const reserveFunded = Math.min(
        reservePlanned,
        Math.max(0, cashPosition),
      );
      const reserveBalance = reserveAccounts.reduce(
        (total, account) => total + (balances.get(account.id) ?? 0),
        0,
      );
      const reserveShortfall = Math.max(
        0,
        monthlyFlow.surplusAllocation.reserveTarget - reserveBalance,
      );
      const reserveRetained = Math.min(
        reserveFunded,
        reserveShortfall,
      );
      if (reserveRetained > 0) {
        balances.set(
          reserveRefillAccount.id,
          (balances.get(reserveRefillAccount.id) ?? 0) +
            reserveRetained,
        );
        monthlyFlow.accountSurplusAllocations[
          reserveRefillAccount.id
        ] = reserveRetained;
      }
      let reserveRedirected = 0;
      let remainingReserveInvestment =
        reserveFunded - reserveRetained;
      for (const destinationId of
        inputs.contributionWaterfall.surplusDestinationAccountIds) {
        if (remainingReserveInvestment <= 0) break;
        const destination = inputs.accounts.find(
          (account) => account.id === destinationId,
        )!;
        const amount = Math.min(
          remainingReserveInvestment,
          availableForAccount(destination, workingAge),
        );
        if (amount <= 0) continue;
        consumeRoom(destination, amount);
        balances.set(
          destination.id,
          (balances.get(destination.id) ?? 0) + amount,
        );
        monthlyFlow.accountSurplusAllocations[destination.id] =
          (monthlyFlow.accountSurplusAllocations[destination.id] ??
            0) + amount;
        monthlyFlow.accountContributions[destination.id] =
          (monthlyFlow.accountContributions[destination.id] ?? 0) +
          amount;
        const detail = contributionDetail(
          monthlyFlow,
          destination.id,
        );
        detail.depositedIntoAccount += amount;
        detail.surplusFundedDeposit += amount;
        detail.cashFunded += amount;
        monthlyFlow.contributions.surplusFunded += amount;
        monthlyFlow.contributions.cashFunded += amount;
        monthlyFlow.contributions.total += amount;
        monthlyFlow.outflows.contributions += amount;
        if (destination.type === "tfsa") {
          monthlyFlow.registeredAccountRoom.tfsa
            .surplusFundedContributions += amount;
          monthlyFlow.registeredAccountRoom.tfsa
            .allowedContributions += amount;
        }
        if (destination.type === "rrsp_rrif") {
          monthlyFlow.registeredAccountRoom.rrsp
            .surplusFundedContributions += amount;
          monthlyFlow.registeredAccountRoom.rrsp
            .allowedContributions += amount;
        }
        reserveRedirected += amount;
        remainingReserveInvestment -= amount;
      }
      if (remainingReserveInvestment > 0.01) {
        throw new Error(
          "Simple reserve-building investment route left an amount unallocated",
        );
      }
      cashPosition -= reserveFunded;
      const unplannedCashRetained = Math.max(0, cashPosition);
      if (unplannedCashRetained > 0) {
        balances.set(
          simplePolicy.operatingCashAccountId,
          (balances.get(simplePolicy.operatingCashAccountId) ?? 0) +
            unplannedCashRetained,
        );
        monthlyFlow.accountSurplusAllocations[
          simplePolicy.operatingCashAccountId
        ] =
          (monthlyFlow.accountSurplusAllocations[
            simplePolicy.operatingCashAccountId
          ] ?? 0) + unplannedCashRetained;
      }
      const policyGenerated =
        reserveFunded + unplannedCashRetained;
      monthlyFlow.surplusAllocation.generated = policyGenerated;
      monthlyFlow.surplusAllocation.reserveRefill =
        reserveRetained;
      monthlyFlow.surplusAllocation.retainedAsCash =
        reserveRetained + unplannedCashRetained;
      monthlyFlow.surplusAllocation.redirected =
        reserveRedirected;
      monthlyFlow.savingsPolicy.reservePlanned = reservePlanned;
      monthlyFlow.savingsPolicy.reserveFunded = reserveFunded;
      monthlyFlow.savingsPolicy.reserveRetainedAsCash =
        reserveRetained;
      monthlyFlow.savingsPolicy.reserveRedirected =
        reserveRedirected;
      monthlyFlow.savingsPolicy.reserveUnfunded =
        reservePlanned - reserveFunded;
      monthlyFlow.savingsPolicy.unplannedCashRetained =
        unplannedCashRetained;
      monthlyFlow.savingsPolicy.totalInvestmentDeposits =
        monthlyFlow.contributions.total;
      if (cashPosition > 0) cashPosition = 0;
    } else if (cashPosition > 0) {
      const generated = cashPosition;
      const reserveBalance = reserveAccounts.reduce(
        (total, account) => total + (balances.get(account.id) ?? 0),
        0,
      );
      const reserveShortfall = Math.max(
        0,
        monthlyFlow.surplusAllocation.reserveTarget - reserveBalance,
      );
      const reserveRefill = Math.min(generated, reserveShortfall);
      if (reserveRefill > 0) {
        balances.set(
          reserveRefillAccount.id,
          (balances.get(reserveRefillAccount.id) ?? 0) + reserveRefill,
        );
        monthlyFlow.accountSurplusAllocations[reserveRefillAccount.id] =
          reserveRefill;
      }
      const excess = generated - reserveRefill;
      let retainedAsCash = reserveRefill;
      let redirected = 0;
      if (inputs.surplusAllocation.excess.mode === "retain_as_cash") {
        if (excess > 0) {
          balances.set(
            reserveRefillAccount.id,
            (balances.get(reserveRefillAccount.id) ?? 0) + excess,
          );
          monthlyFlow.accountSurplusAllocations[reserveRefillAccount.id] =
            (monthlyFlow.accountSurplusAllocations[
              reserveRefillAccount.id
            ] ?? 0) +
            excess;
        }
        retainedAsCash += excess;
      } else if (
        inputs.surplusAllocation.excess.mode === "allocate_to_account"
      ) {
        if (excess > 0) {
          balances.set(
            destinationAccount!.id,
            (balances.get(destinationAccount!.id) ?? 0) + excess,
          );
          monthlyFlow.accountSurplusAllocations[destinationAccount!.id] =
            excess;
        }
        redirected = excess;
      } else {
        let remainingExcess = excess;
        for (const destinationId of
          inputs.contributionWaterfall.surplusDestinationAccountIds) {
          if (remainingExcess <= 0) break;
          const waterfallDestination = inputs.accounts.find(
            (account) => account.id === destinationId,
          )!;
          const amount = Math.min(
            remainingExcess,
            availableForAccount(waterfallDestination, workingAge),
          );
          if (amount <= 0) continue;
          consumeRoom(waterfallDestination, amount);
          balances.set(
            waterfallDestination.id,
            (balances.get(waterfallDestination.id) ?? 0) + amount,
          );
          monthlyFlow.accountSurplusAllocations[waterfallDestination.id] =
            (monthlyFlow.accountSurplusAllocations[
              waterfallDestination.id
            ] ?? 0) + amount;
          monthlyFlow.accountContributions[waterfallDestination.id] =
            (monthlyFlow.accountContributions[waterfallDestination.id] ?? 0) +
            amount;
          const detail = contributionDetail(
            monthlyFlow,
            waterfallDestination.id,
          );
          detail.depositedIntoAccount += amount;
          detail.surplusFundedDeposit += amount;
          detail.cashFunded += amount;
          monthlyFlow.contributions.surplusFunded += amount;
          monthlyFlow.contributions.cashFunded += amount;
          monthlyFlow.contributions.total += amount;
          monthlyFlow.outflows.contributions += amount;
          if (waterfallDestination.type === "tfsa") {
            monthlyFlow.registeredAccountRoom.tfsa
              .surplusFundedContributions += amount;
            monthlyFlow.registeredAccountRoom.tfsa.allowedContributions +=
              amount;
          }
          if (waterfallDestination.type === "rrsp_rrif") {
            monthlyFlow.registeredAccountRoom.rrsp
              .surplusFundedContributions += amount;
            monthlyFlow.registeredAccountRoom.rrsp.allowedContributions +=
              amount;
          }
          redirected += amount;
          remainingExcess -= amount;
        }
        if (remainingExcess > 0) {
          balances.set(
            reserveRefillAccount.id,
            (balances.get(reserveRefillAccount.id) ?? 0) + remainingExcess,
          );
          monthlyFlow.accountSurplusAllocations[reserveRefillAccount.id] =
            (monthlyFlow.accountSurplusAllocations[
              reserveRefillAccount.id
            ] ?? 0) + remainingExcess;
          retainedAsCash += remainingExcess;
        }
      }
      monthlyFlow.surplusAllocation.generated = generated;
      monthlyFlow.surplusAllocation.reserveRefill = reserveRefill;
      monthlyFlow.surplusAllocation.retainedAsCash = retainedAsCash;
      monthlyFlow.surplusAllocation.redirected = redirected;
      cashPosition = 0;
    }

    monthlyFlow.outflows.total =
      monthlyFlow.outflows.essential +
      monthlyFlow.outflows.discretionary +
      monthlyFlow.outflows.liabilityCashPayment +
      monthlyFlow.outflows.oneTime +
      monthlyFlow.outflows.tax +
      monthlyFlow.outflows.contributions +
      monthlyFlow.outflows.unmetRequiredOutflow +
      monthlyFlow.outflows.unmetSpending;
    monthlyFlow.registeredAccountRoom.tfsa.closingRoom = tfsaRoom;
    monthlyFlow.registeredAccountRoom.rrsp.closingRoom = rrspRoom;

    assertContributionsReconciled(
      monthlyFlow,
      `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
    );
    assertSavingsPolicyReconciled(
      monthlyFlow,
      `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
      inputs.savingsPolicy.mode,
    );

    addMonthlyFlow(annualNominalFlow, monthlyFlow, 1);
    addMonthlyFlow(annualRealFlow, monthlyFlow, factor);
    if (month <= retirementMonth) {
      addSurplusTotals(nominalSurplusThroughRetirement, monthlyFlow, 1);
      addSurplusTotals(realSurplusThroughRetirement, monthlyFlow, factor);
      addSavingsTotals(nominalSavingsThroughRetirement, monthlyFlow, 1);
      addSavingsTotals(realSavingsThroughRetirement, monthlyFlow, factor);
      const requestedExternalOutflows =
        monthlyFlow.outflows.essential +
        monthlyFlow.outflows.discretionary +
        monthlyFlow.outflows.oneTime +
        regularTax +
        recoveryTax;
      const fundedExternalOutflows = Math.max(
        0,
        requestedExternalOutflows - monthlyFlow.outflows.unmetSpending,
      );
      const fundedRatio =
        requestedExternalOutflows > 0
          ? Math.min(1, fundedExternalOutflows / requestedExternalOutflows)
          : 1;
      const publicBenefitsAndPension = income.cpp + income.oas + income.pension;
      nominalBridge.employmentNetCash += income.employment;
      nominalBridge.publicBenefitsAndPension += publicBenefitsAndPension;
      nominalBridge.otherInflows += eventInflows;
      nominalBridge.incomeWithheldContributions += incomeWithheldContributions;
      nominalBridge.essentialSpending += monthlyFlow.outflows.essential * fundedRatio;
      nominalBridge.discretionarySpending +=
        monthlyFlow.outflows.discretionary * fundedRatio;
      nominalBridge.liabilityCashPayments += liabilityCashPayment;
      nominalBridge.oneTimeOutflows += monthlyFlow.outflows.oneTime * fundedRatio;
      nominalBridge.taxes +=
        (regularTax + recoveryTax) * fundedRatio +
        withdrawalTaxTotal;

      nominalNetWorthBridge.externalNetCashInflows +=
        income.total + eventInflows;
      nominalNetWorthBridge.incomeWithheldContributions +=
        incomeWithheldContributions;
      nominalNetWorthBridge.nonDebtEssentialSpending +=
        monthlyFlow.outflows.essential * fundedRatio;
      nominalNetWorthBridge.discretionarySpending +=
        monthlyFlow.outflows.discretionary * fundedRatio;
      nominalNetWorthBridge.liabilityInterest += liabilityInterest;
      nominalNetWorthBridge.taxes +=
        (regularTax + recoveryTax) * fundedRatio +
        withdrawalTaxTotal;
      nominalNetWorthBridge.oneTimeConsumptionOutflows +=
        monthlyFlow.outflows.oneTime * fundedRatio;

      realBridge.employmentNetCash += income.employment / factor;
      realBridge.publicBenefitsAndPension += publicBenefitsAndPension / factor;
      realBridge.otherInflows += eventInflows / factor;
      realBridge.incomeWithheldContributions += incomeWithheldContributions / factor;
      realBridge.essentialSpending +=
        (monthlyFlow.outflows.essential * fundedRatio) / factor;
      realBridge.discretionarySpending +=
        (monthlyFlow.outflows.discretionary * fundedRatio) / factor;
      realBridge.liabilityCashPayments +=
        liabilityCashPayment / factor;
      realBridge.oneTimeOutflows +=
        (monthlyFlow.outflows.oneTime * fundedRatio) / factor;
      realBridge.taxes +=
        ((regularTax + recoveryTax) * fundedRatio +
          withdrawalTaxTotal) /
        factor;

      realNetWorthBridge.externalNetCashInflows +=
        (income.total + eventInflows) / factor;
      realNetWorthBridge.incomeWithheldContributions +=
        incomeWithheldContributions / factor;
      realNetWorthBridge.nonDebtEssentialSpending +=
        (monthlyFlow.outflows.essential * fundedRatio) / factor;
      realNetWorthBridge.discretionarySpending +=
        (monthlyFlow.outflows.discretionary * fundedRatio) / factor;
      realNetWorthBridge.liabilityInterest +=
        liabilityInterest / factor;
      realNetWorthBridge.taxes +=
        ((regularTax + recoveryTax) * fundedRatio +
          withdrawalTaxTotal) /
        factor;
      realNetWorthBridge.oneTimeConsumptionOutflows +=
        (monthlyFlow.outflows.oneTime * fundedRatio) / factor;
    }

    const currentBalances = balanceSheet(
      inputs.accounts,
      balances,
      inputs.nonFinancialAssets,
      nonFinancialAssetValues,
      inputs.liabilities,
      liabilityBalances,
    );
    if (financialAssetsDepletionAge === null && currentBalances.financialAssets <= 0.01) {
      financialAssetsDepletionAge = age;
    }
    if (month === retirementMonth) {
      const retirementRealMonthlyFlow = emptyView();
      addMonthlyFlow(retirementRealMonthlyFlow, monthlyFlow, factor);
      retirementSnapshot = {
        calendarDate: lastDayOfMonth(calendarYear, calendarMonth),
        age: round(inputs.person.retirementAge),
        flowPeriod: {
          kind: "final_working_month",
          calendarMonth: `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
        },
        nominal: snapshotView(
          monthlyFlow,
          inputs.accounts,
          balances,
          inputs.nonFinancialAssets,
          nonFinancialAssetValues,
          inputs.liabilities,
          liabilityBalances,
          1,
        ),
        real: snapshotView(
          retirementRealMonthlyFlow,
          inputs.accounts,
          balances,
          inputs.nonFinancialAssets,
          nonFinancialAssetValues,
          inputs.liabilities,
          liabilityBalances,
          factor,
          monthlyFlow.liabilitySchedules,
        ),
      };
      assertSurplusReconciled(
        retirementSnapshot.nominal,
        "retirement snapshot nominal",
      );
      assertSurplusReconciled(
        retirementSnapshot.real,
        "retirement snapshot real",
      );
      assertSavingsPolicyReconciled(
        retirementSnapshot.nominal,
        "retirement snapshot nominal",
        inputs.savingsPolicy.mode,
      );
      assertBalanceSheetReconciled(
        retirementSnapshot.nominal,
        "retirement snapshot nominal",
      );
      assertBalanceSheetReconciled(
        retirementSnapshot.real,
        "retirement snapshot real",
      );
      assertLiabilitySchedulesReconciled(
        retirementSnapshot.nominal,
        "retirement snapshot nominal",
      );
      assertLiabilitySchedulesReconciled(
        retirementSnapshot.real,
        "retirement snapshot real",
      );
      assertSavingsPolicyReconciled(
        retirementSnapshot.real,
        "retirement snapshot real",
        inputs.savingsPolicy.mode,
      );
      reserveTargetAtRetirementNominal =
        monthlyFlow.surplusAllocation.reserveTarget;
      reserveTargetAtRetirementReal =
        reserveTargetAtRetirementNominal / factor;
      reserveBalanceAtRetirementNominal = reserveAccounts.reduce(
        (total, account) => total + (balances.get(account.id) ?? 0),
        0,
      );
      reserveBalanceAtRetirementReal =
        reserveBalanceAtRetirementNominal / factor;
      if (destinationAccount) {
        destinationBalanceAtRetirementNominal =
          balances.get(destinationAccount.id) ?? 0;
        destinationBalanceAtRetirementReal =
          destinationBalanceAtRetirementNominal / factor;
      }
      nominalBridge.endingFinancialAssets =
        retirementSnapshot.nominal.balances.financialAssets;
      realBridge.endingFinancialAssets = retirementSnapshot.real.balances.financialAssets;
      nominalNetWorthBridge.endingNetWorth =
        retirementSnapshot.nominal.balances.totalNetWorth;
      realNetWorthBridge.endingNetWorth =
        retirementSnapshot.real.balances.totalNetWorth;
    }
    if (calendarMonth === MONTHS_PER_YEAR || month === totalMonths) {
      snapshot(month, previousSnapshotMonth, calendarYear);
    }
  }

  if (!retirementSnapshot) {
    throw new Error("The exact retirement snapshot could not be captured");
  }
  assertSurplusTotalsReconciled(
    nominalSurplusThroughRetirement,
    "through retirement nominal",
  );
  assertSurplusTotalsReconciled(
    realSurplusThroughRetirement,
    "through retirement real",
  );
  const nominalBridgeDifferenceInCents =
    bridgeDifferenceInCents(nominalBridge);
  const realBridgeDifferenceInCents = bridgeDifferenceInCents(realBridge);
  const nominalNetWorthBridgeDifferenceInCents =
    netWorthBridgeDifferenceInCents(nominalNetWorthBridge);
  const realNetWorthBridgeDifferenceInCents =
    netWorthBridgeDifferenceInCents(realNetWorthBridge);
  if (
    Math.abs(nominalBridgeDifferenceInCents) > 1 ||
    Math.abs(realBridgeDifferenceInCents) > 1 ||
    Math.abs(nominalNetWorthBridgeDifferenceInCents) > 1 ||
    Math.abs(realNetWorthBridgeDifferenceInCents) > 1
  ) {
    throw new Error(
      `Balance-sheet bridges failed to reconcile (financial nominal ${monetaryValue(nominalBridgeDifferenceInCents).toFixed(2)}, financial real ${monetaryValue(realBridgeDifferenceInCents).toFixed(2)}, net worth nominal ${monetaryValue(nominalNetWorthBridgeDifferenceInCents).toFixed(2)}, net worth real ${monetaryValue(realNetWorthBridgeDifferenceInCents).toFixed(2)})`,
    );
  }

  const ending = annual.at(-1)!;
  const assetsAtRetirement = retirementSnapshot.real.balances.financialAssets;
  const retirementYear = Number(retirementSnapshot.calendarDate.slice(0, 4));
  const mortgage = inputs.liabilities.find(
    (liability) => liability.role === "primary_mortgage",
  );
  const mortgagePayoffDate = mortgage
    ? liabilityPayoffDates[mortgage.id] ?? null
    : null;
  const mortgagePayoffAge = mortgagePayoffDate
    ? (() => {
        const payoffYear = Number(mortgagePayoffDate.slice(0, 4));
        const payoffMonth = Number(mortgagePayoffDate.slice(5, 7));
        const offset =
          (payoffYear - startYear) * 12 +
          (payoffMonth - startMonth) +
          1;
        return round(inputs.person.currentAge + offset / 12);
      })()
    : null;

  observations.push({
    code: "retirement",
    message: `Retirement begins after ${retirementSnapshot.calendarDate}.`,
    calendarYear: retirementYear,
    age: retirementSnapshot.age,
  });
  observations.push({
    code: "cpp_start",
    message: `CPP begins at age ${inputs.person.cpp.startAge}.`,
    age: inputs.person.cpp.startAge,
  });
  observations.push({
    code: "oas_start",
    message: `OAS begins at age ${inputs.person.oas.startAge}.`,
    age: inputs.person.oas.startAge,
  });
  observations.push({
    code: "portfolio_duration",
    message:
      financialAssetsDepletionAge === null
        ? `Financial assets remain above zero through age ${inputs.endAge}.`
        : `Financial assets reach zero near age ${round(financialAssetsDepletionAge)}.`,
    age: financialAssetsDepletionAge ?? inputs.endAge,
  });

  return {
    schemaVersion: "8.0",
    inputs,
    summary: {
      retirementYear,
      retirementDate: retirementSnapshot.calendarDate,
      financialAssetsAtRetirementToday: round(assetsAtRetirement),
      nonFinancialAssetsAtRetirementToday: round(
        retirementSnapshot.real.balances.totalNonFinancialAssets,
      ),
      liabilitiesAtRetirementToday: round(
        retirementSnapshot.real.balances.totalLiabilities,
      ),
      homeEquityAtRetirementToday: round(
        retirementSnapshot.real.balances.homeEquity,
      ),
      totalNetWorthAtRetirementToday: round(
        retirementSnapshot.real.balances.totalNetWorth,
      ),
      retirementGoalToday: round(inputs.retirementGoalToday),
      goalGapToday: round(assetsAtRetirement - inputs.retirementGoalToday),
      financialAssetsDepletionAge:
        financialAssetsDepletionAge === null ? null : round(financialAssetsDepletionAge),
      endingFinancialAssetsToday: round(ending.real.balances.financialAssets),
      endingNetWorthToday: round(
        ending.real.balances.totalNetWorth,
      ),
      mortgagePayoffDate,
      mortgagePayoffAge,
    },
    retirementSnapshot,
    financialAssetsBridge: {
      nominal: nominalBridge,
      real: realBridge,
    },
    netWorthBridge: {
      nominal: nominalNetWorthBridge,
      real: realNetWorthBridge,
    },
    liabilityPayoffDates,
    governmentBenefits: benefits,
    surplusAllocation: {
      policy: {
        reserveAccountIds: reserveAccounts.map((account) => account.id),
        reserveRefillAccountId: reserveRefillAccount.id,
        targetCashReserveToday:
          inputs.surplusAllocation.targetCashReserveToday,
        reserveIndexingRate: inputs.surplusAllocation.reserveIndexingRate,
        excessMode: inputs.surplusAllocation.excess.mode,
        destinationAccountId: destinationAccount?.id ?? null,
      },
      throughRetirement: {
        nominal: nominalSurplusThroughRetirement,
        real: realSurplusThroughRetirement,
      },
      reserveTargetAtRetirement: {
        nominal: reserveTargetAtRetirementNominal,
        real: reserveTargetAtRetirementReal,
      },
      reserveAccountsBalanceAtRetirement: {
        nominal: reserveBalanceAtRetirementNominal,
        real: reserveBalanceAtRetirementReal,
      },
      destinationAccountBalanceAtRetirement: destinationAccount
        ? {
            nominal: destinationBalanceAtRetirementNominal,
            real: destinationBalanceAtRetirementReal,
          }
        : null,
    },
    registeredAccountRoom: {
      modelled: Boolean(inputs.registeredAccountRoom),
      denomination: "nominal_regulatory_dollars",
      policy: {
        tfsaStartingRoomSource:
          inputs.registeredAccountRoom?.tfsa.startingAvailableRoom ?? null,
        rrspStartingRoomSource:
          inputs.registeredAccountRoom?.rrsp
            .startingAvailableDeductionRoom ?? null,
        tfsaCarryForwardUnusedRoom:
          inputs.registeredAccountRoom?.tfsa.carryForwardUnusedRoom ?? null,
        rrspCarryForwardUnusedRoom:
          inputs.registeredAccountRoom?.rrsp.carryForwardUnusedRoom ?? null,
        waterfallMode: inputs.contributionWaterfall.mode,
        routes: inputs.contributionWaterfall.routes,
        surplusDestinationAccountIds:
          inputs.contributionWaterfall.surplusDestinationAccountIds,
      },
      references: {
        tfsaAnnualLimit: {
          calendarYear: 2026,
          amount: 7000,
          effectiveDate: "2026-01-01",
          sourceKind: "published_reference",
          referenceUrl: TFSA_ANNUAL_LIMITS[0]!.referenceUrl,
        },
        rrspAnnualCaps: RRSP_ANNUAL_LIMITS.map((reference) => ({
          calendarYear: reference.calendarYear,
          amount: reference.amount,
          effectiveDate: reference.effectiveDate,
          sourceKind: "published_reference" as const,
          referenceUrl: reference.referenceUrl,
        })),
        rrspEarnedIncomeRate: RRSP_EARNED_INCOME_RATE,
        rrspFormulaReferenceUrl: RRSP_FORMULA_REFERENCE_URL,
        tfsaWithdrawalReferenceUrl: TFSA_WITHDRAWAL_REFERENCE_URL,
      },
      annual: annual.map((point) => ({
        calendarYear: point.calendarYear,
        nominal: point.nominal.registeredAccountRoom,
        real: point.real.registeredAccountRoom,
      })),
    },
    savingsPolicy: {
      mode: inputs.savingsPolicy.mode,
      policy:
        inputs.savingsPolicy.mode === "advanced"
          ? { mode: "advanced" }
          : {
              mode: "simple",
              reserveAccountIds: inputs.savingsPolicy.reserveAccountIds,
              reserveRefillAccountId:
                inputs.savingsPolicy.reserveRefillAccountId,
              operatingCashAccountId:
                inputs.savingsPolicy.operatingCashAccountId,
              personalTfsaAccountId:
                inputs.savingsPolicy.personalTfsaAccountId,
              personalRrspAccountId:
                inputs.savingsPolicy.personalRrspAccountId,
              workplaceRrspAccountId:
                inputs.savingsPolicy.workplaceRrspAccountId,
              taxableAccountId: inputs.savingsPolicy.taxableAccountId,
              taxableAccountOrigin:
                inputs.savingsPolicy.taxableAccountOrigin,
              personalOrder: inputs.savingsPolicy.personalOrder,
              workplaceRoomPriority:
                inputs.savingsPolicy.workplaceRoomPriority,
              workplaceOverflow:
                inputs.savingsPolicy.workplaceOverflow,
              reserveAfterTarget:
                inputs.savingsPolicy.reserveAfterTarget,
              unplannedCash: inputs.savingsPolicy.unplannedCash,
            },
      throughRetirement: {
        nominal: nominalSavingsThroughRetirement,
        real: realSavingsThroughRetirement,
      },
    },
    annual,
    observations,
  };
}
