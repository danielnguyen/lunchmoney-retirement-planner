import type {
  AccountType,
  AnnualProjection,
  AssetAllocation,
  BalanceBreakdown,
  ContributionBreakdown,
  ContributionPhase,
  EmploymentIncomePhase,
  FinancialAccountInput,
  FinancialAssetsBridge,
  GovernmentBenefitCalculationSummary,
  IncomeBreakdown,
  OutflowBreakdown,
  ProjectionInputs,
  ProjectionObservation,
  ProjectionResult,
  ProjectionView,
  RetirementSnapshot,
  WithdrawalBreakdown,
} from "./types";
import { validateProjectionInputs } from "./types";
import {
  cppClaimRules,
  oasClaimRules,
} from "@/src/domain/defaults/canadian-public-benefits";

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
    oneTime: 0,
    tax: 0,
    oasRecoveryTax: 0,
    contributions: 0,
    unmetSpending: 0,
    total: 0,
  };
}

function emptyContributions(): ContributionBreakdown {
  return { cashFunded: 0, incomeWithheld: 0, total: 0 };
}

function emptyBalances(): BalanceBreakdown {
  return {
    cash: 0,
    tfsa: 0,
    rrspRrif: 0,
    nonRegistered: 0,
    debts: 0,
    financialAssets: 0,
    netWorth: 0,
  };
}

function emptyView(): ProjectionView {
  return {
    income: emptyIncome(),
    withdrawals: emptyWithdrawals(),
    outflows: emptyOutflows(),
    contributions: emptyContributions(),
    balances: emptyBalances(),
    accountBalances: {},
    accountContributions: {},
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
    oneTimeOutflows: 0,
    taxes: 0,
    endingFinancialAssets: 0,
  };
}

function bridgeCalculatedEnding(bridge: FinancialAssetsBridge): number {
  return (
    bridge.startingFinancialAssets +
    bridge.employmentNetCash +
    bridge.publicBenefitsAndPension +
    bridge.otherInflows +
    bridge.incomeWithheldContributions +
    bridge.investmentReturns -
    bridge.essentialSpending -
    bridge.discretionarySpending -
    bridge.oneTimeOutflows -
    bridge.taxes
  );
}

function addWithdrawal(target: WithdrawalBreakdown, accountType: AccountType, amount: number): void {
  if (accountType === "cash") target.cash += amount;
  if (accountType === "tfsa") target.tfsa += amount;
  if (accountType === "rrsp_rrif") target.rrspRrif += amount;
  if (accountType === "non_registered") target.nonRegistered += amount;
  target.total += amount;
}

function accountBalances(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
): BalanceBreakdown {
  const result = emptyBalances();
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0;
    if (account.type === "cash") result.cash += balance;
    if (account.type === "tfsa") result.tfsa += balance;
    if (account.type === "rrsp_rrif") result.rrspRrif += balance;
    if (account.type === "non_registered") result.nonRegistered += balance;
    if (account.type === "debt") result.debts += balance;
  }
  result.financialAssets = result.cash + result.tfsa + result.rrspRrif + result.nonRegistered;
  result.netWorth = result.financialAssets - result.debts;
  return result;
}

function accountAllocation(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
): AssetAllocation {
  const result = { ...ZERO_ALLOCATION };
  for (const account of accounts) {
    if (account.type === "debt") continue;
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

function snapshotView(
  flow: ProjectionView,
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
  factor: number,
): ProjectionView {
  const divide = (value: number) => round(value / factor);
  const balancesAtSnapshot = accountBalances(accounts, balances);
  const accountBalancesAtSnapshot = snapshotAccountBalances(accounts, balances);
  const allocationAtSnapshot = accountAllocation(accounts, balances);
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
      oneTime: round(flow.outflows.oneTime),
      tax: round(flow.outflows.tax),
      oasRecoveryTax: round(flow.outflows.oasRecoveryTax),
      contributions: round(flow.outflows.contributions),
      unmetSpending: round(flow.outflows.unmetSpending),
      total: round(flow.outflows.total),
    },
    contributions: {
      cashFunded: round(flow.contributions.cashFunded),
      incomeWithheld: round(flow.contributions.incomeWithheld),
      total: round(flow.contributions.total),
    },
    balances: {
      cash: divide(balancesAtSnapshot.cash),
      tfsa: divide(balancesAtSnapshot.tfsa),
      rrspRrif: divide(balancesAtSnapshot.rrspRrif),
      nonRegistered: divide(balancesAtSnapshot.nonRegistered),
      debts: divide(balancesAtSnapshot.debts),
      financialAssets: divide(balancesAtSnapshot.financialAssets),
      netWorth: divide(balancesAtSnapshot.netWorth),
    },
    accountBalances: Object.fromEntries(
      Object.entries(accountBalancesAtSnapshot).map(([id, balance]) => [id, divide(balance)]),
    ),
    accountContributions: Object.fromEntries(
      Object.entries(flow.accountContributions).map(([id, amount]) => [id, round(amount)]),
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
  for (const [accountId, amount] of Object.entries(monthly.accountContributions)) {
    target.accountContributions[accountId] =
      (target.accountContributions[accountId] ?? 0) + amount / factor;
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
  const annual: AnnualProjection[] = [];
  const observations: ProjectionObservation[] = [];
  const startingFinancialAssets = accountBalances(inputs.accounts, balances).financialAssets;
  const nominalBridge = emptyBridge(startingFinancialAssets);
  const realBridge = emptyBridge(startingFinancialAssets);
  let annualNominalFlow = emptyView();
  let annualRealFlow = emptyView();
  let annualEmploymentPhaseLabels = new Set<string>();
  let annualContributionPhaseLabels = new Map<string, Set<string>>();
  let financialAssetsDepletionAge: number | null = null;
  let previousSnapshotMonth = 0;
  let retirementSnapshot: RetirementSnapshot | undefined;

  function snapshot(month: number, previousMonth: number, calendarYear: number): void {
    const factor = indexedFactor(inputs.annualInflation, month);
    const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
    annual.push({
      calendarYear,
      age: round(age),
      phase: age < inputs.person.retirementAge ? "accumulation" : "retirement",
      nominal: snapshotView(annualNominalFlow, inputs.accounts, balances, 1),
      real: snapshotView(annualRealFlow, inputs.accounts, balances, factor),
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

    const balancesBeforeReturn = accountBalances(inputs.accounts, balances).financialAssets;
    for (const account of inputs.accounts) {
      const current = balances.get(account.id) ?? 0;
      balances.set(account.id, Math.max(0, current * (1 + monthlyRate(account.annualReturn))));
    }
    const balancesAfterReturn = accountBalances(inputs.accounts, balances).financialAssets;
    if (month <= retirementMonth) {
      nominalBridge.investmentReturns += balancesAfterReturn - balancesBeforeReturn;
      realBridge.investmentReturns +=
        balancesAfterReturn / factor - balancesBeforeReturn / previousFactor;
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

    let cashFundedContributions = 0;
    let incomeWithheldContributions = 0;
    for (const account of inputs.accounts) {
      if (
        workingAge >= inputs.person.retirementAge - AGE_TOLERANCE ||
        account.type === "debt"
      ) {
        continue;
      }
      const contributionPhase = activeContributionPhase(
        account.contributionPhases,
        workingAge,
      );
      if (!contributionPhase) continue;
      const contribution =
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
      if (contribution <= 0) continue;
      balances.set(account.id, (balances.get(account.id) ?? 0) + contribution);
      monthlyFlow.accountContributions[account.id] =
        (monthlyFlow.accountContributions[account.id] ?? 0) + contribution;
      if (contributionPhase.funding === "cash") {
        monthlyFlow.outflows.contributions += contribution;
        monthlyFlow.contributions.cashFunded += contribution;
        cashFundedContributions += contribution;
      } else {
        monthlyFlow.contributions.incomeWithheld += contribution;
        incomeWithheldContributions += contribution;
      }
      monthlyFlow.contributions.total += contribution;
    }

    let eventInflows = 0;
    let eventOutflows = 0;
    const matchingEvents = inputs.events.filter(
      (event) => event.calendarYear === calendarYear && event.month === calendarMonth,
    );
    for (const event of matchingEvents) {
      const amount = event.amountToday * factor;
      if (event.direction === "inflow") {
        eventInflows += amount;
        monthlyFlow.income.other += amount;
        monthlyFlow.income.total += amount;
      } else {
        eventOutflows += amount;
        monthlyFlow.outflows.oneTime += amount;
      }
    }

    let cashPosition =
      income.total +
      eventInflows -
      essential -
      discretionary -
      regularTax -
      recoveryTax -
      cashFundedContributions -
      eventOutflows;

    if (cashPosition > 0) {
      const targetEvent = matchingEvents.find(
        (event) => event.direction === "inflow" && event.targetAccountId,
      );
      const target = targetEvent
        ? inputs.accounts.find((account) => account.id === targetEvent.targetAccountId)
        : inputs.accounts.find((account) => account.type === "cash");
      if (target) balances.set(target.id, (balances.get(target.id) ?? 0) + cashPosition);
      cashPosition = 0;
    }

    let gap = Math.max(0, -cashPosition);
    const withdrawalAccounts = inputs.accounts
      .filter((account) => account.type !== "debt")
      .sort((left, right) => left.withdrawalPriority - right.withdrawalPriority);

    for (const account of withdrawalAccounts) {
      if (gap <= 0) break;
      const balance = balances.get(account.id) ?? 0;
      if (balance <= 0) continue;
      let grossWithdrawal = Math.min(balance, gap);
      let netCash = grossWithdrawal;
      if (account.type === "rrsp_rrif") {
        const netRate = 1 - inputs.tax.effectiveTaxRate;
        grossWithdrawal = Math.min(balance, gap / netRate);
        const withdrawalTax = grossWithdrawal * inputs.tax.effectiveTaxRate;
        netCash = grossWithdrawal - withdrawalTax;
        monthlyFlow.outflows.tax += withdrawalTax;
      }
      balances.set(account.id, balance - grossWithdrawal);
      addWithdrawal(monthlyFlow.withdrawals, account.type, grossWithdrawal);
      gap -= netCash;
    }

    if (gap > 0) monthlyFlow.outflows.unmetSpending += gap;
    monthlyFlow.outflows.total =
      monthlyFlow.outflows.essential +
      monthlyFlow.outflows.discretionary +
      monthlyFlow.outflows.oneTime +
      monthlyFlow.outflows.tax +
      monthlyFlow.outflows.contributions +
      monthlyFlow.outflows.unmetSpending;

    addMonthlyFlow(annualNominalFlow, monthlyFlow, 1);
    addMonthlyFlow(annualRealFlow, monthlyFlow, factor);
    if (month <= retirementMonth) {
      const requestedExternalOutflows =
        monthlyFlow.outflows.essential +
        monthlyFlow.outflows.discretionary +
        monthlyFlow.outflows.oneTime +
        monthlyFlow.outflows.tax;
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
      nominalBridge.oneTimeOutflows += monthlyFlow.outflows.oneTime * fundedRatio;
      nominalBridge.taxes += monthlyFlow.outflows.tax * fundedRatio;

      realBridge.employmentNetCash += income.employment / factor;
      realBridge.publicBenefitsAndPension += publicBenefitsAndPension / factor;
      realBridge.otherInflows += eventInflows / factor;
      realBridge.incomeWithheldContributions += incomeWithheldContributions / factor;
      realBridge.essentialSpending +=
        (monthlyFlow.outflows.essential * fundedRatio) / factor;
      realBridge.discretionarySpending +=
        (monthlyFlow.outflows.discretionary * fundedRatio) / factor;
      realBridge.oneTimeOutflows +=
        (monthlyFlow.outflows.oneTime * fundedRatio) / factor;
      realBridge.taxes += (monthlyFlow.outflows.tax * fundedRatio) / factor;
    }

    const currentBalances = accountBalances(inputs.accounts, balances);
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
        nominal: snapshotView(monthlyFlow, inputs.accounts, balances, 1),
        real: snapshotView(retirementRealMonthlyFlow, inputs.accounts, balances, factor),
      };
      nominalBridge.endingFinancialAssets =
        retirementSnapshot.nominal.balances.financialAssets;
      realBridge.endingFinancialAssets = retirementSnapshot.real.balances.financialAssets;
    }
    if (calendarMonth === MONTHS_PER_YEAR || month === totalMonths) {
      snapshot(month, previousSnapshotMonth, calendarYear);
    }
  }

  if (!retirementSnapshot) {
    throw new Error("The exact retirement snapshot could not be captured");
  }
  const nominalBridgeDifference =
    bridgeCalculatedEnding(nominalBridge) - nominalBridge.endingFinancialAssets;
  const realBridgeDifference =
    bridgeCalculatedEnding(realBridge) - realBridge.endingFinancialAssets;
  if (
    Math.abs(nominalBridgeDifference) > 0.01 ||
    Math.abs(realBridgeDifference) > 0.01
  ) {
    throw new Error(
      `Financial assets bridge failed to reconcile (nominal ${nominalBridgeDifference.toFixed(2)}, real ${realBridgeDifference.toFixed(2)})`,
    );
  }

  const ending = annual.at(-1)!;
  const assetsAtRetirement = retirementSnapshot.real.balances.financialAssets;
  const retirementYear = Number(retirementSnapshot.calendarDate.slice(0, 4));

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
    schemaVersion: "5.0",
    inputs,
    summary: {
      retirementYear,
      retirementDate: retirementSnapshot.calendarDate,
      financialAssetsAtRetirementToday: round(assetsAtRetirement),
      retirementGoalToday: round(inputs.retirementGoalToday),
      goalGapToday: round(assetsAtRetirement - inputs.retirementGoalToday),
      financialAssetsDepletionAge:
        financialAssetsDepletionAge === null ? null : round(financialAssetsDepletionAge),
      endingFinancialAssetsToday: round(ending.real.balances.financialAssets),
    },
    retirementSnapshot,
    financialAssetsBridge: {
      nominal: nominalBridge,
      real: realBridge,
    },
    governmentBenefits: benefits,
    annual,
    observations,
  };
}
