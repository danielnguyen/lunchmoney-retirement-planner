import type {
  AccountType,
  AnnualProjection,
  AssetAllocation,
  BalanceBreakdown,
  FinancialAccountInput,
  IncomeBreakdown,
  OutflowBreakdown,
  ProjectionInputs,
  ProjectionObservation,
  ProjectionResult,
  ProjectionView,
  WithdrawalBreakdown,
} from "./types";
import { validateProjectionInputs } from "./types";

const MONTHS_PER_YEAR = 12;
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

export function cppClaimFactor(startAge: number): number {
  if (startAge < 65) {
    return Math.max(0, 1 - (65 - startAge) * MONTHS_PER_YEAR * 0.006);
  }
  return 1 + (startAge - 65) * MONTHS_PER_YEAR * 0.007;
}

export function oasClaimFactor(startAge: number): number {
  return 1 + Math.max(0, startAge - 65) * MONTHS_PER_YEAR * 0.006;
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
    balances: emptyBalances(),
    accountBalances: {},
    allocation: { ...ZERO_ALLOCATION },
  };
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

function deflateView(view: ProjectionView, factor: number): ProjectionView {
  const divide = (value: number) => round(value / factor);
  return {
    income: {
      employment: divide(view.income.employment),
      cpp: divide(view.income.cpp),
      oas: divide(view.income.oas),
      pension: divide(view.income.pension),
      other: divide(view.income.other),
      total: divide(view.income.total),
    },
    withdrawals: {
      cash: divide(view.withdrawals.cash),
      tfsa: divide(view.withdrawals.tfsa),
      rrspRrif: divide(view.withdrawals.rrspRrif),
      nonRegistered: divide(view.withdrawals.nonRegistered),
      total: divide(view.withdrawals.total),
    },
    outflows: {
      essential: divide(view.outflows.essential),
      discretionary: divide(view.outflows.discretionary),
      oneTime: divide(view.outflows.oneTime),
      tax: divide(view.outflows.tax),
      oasRecoveryTax: divide(view.outflows.oasRecoveryTax),
      contributions: divide(view.outflows.contributions),
      unmetSpending: divide(view.outflows.unmetSpending),
      total: divide(view.outflows.total),
    },
    balances: {
      cash: divide(view.balances.cash),
      tfsa: divide(view.balances.tfsa),
      rrspRrif: divide(view.balances.rrspRrif),
      nonRegistered: divide(view.balances.nonRegistered),
      debts: divide(view.balances.debts),
      financialAssets: divide(view.balances.financialAssets),
      netWorth: divide(view.balances.netWorth),
    },
    accountBalances: Object.fromEntries(
      Object.entries(view.accountBalances).map(([id, balance]) => [id, divide(balance)]),
    ),
    allocation: {
      cash: divide(view.allocation.cash),
      fixedIncome: divide(view.allocation.fixedIncome),
      equity: divide(view.allocation.equity),
    },
  };
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
  const totalMonths = Math.round((inputs.endAge - inputs.person.currentAge) * MONTHS_PER_YEAR);
  const balances = new Map(inputs.accounts.map((account) => [account.id, account.openingBalance]));
  const annual: AnnualProjection[] = [];
  const observations: ProjectionObservation[] = [];
  let annualFlow = emptyView();
  let financialAssetsDepletionAge: number | null = null;

  function snapshot(month: number, previousMonth: number, calendarYear: number): void {
    const factor = indexedFactor(inputs.annualInflation, month);
    annualFlow.balances = accountBalances(inputs.accounts, balances);
    annualFlow.accountBalances = snapshotAccountBalances(inputs.accounts, balances);
    annualFlow.allocation = accountAllocation(inputs.accounts, balances);
    const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
    annual.push({
      calendarYear,
      age: round(age),
      phase: age < inputs.person.retirementAge ? "accumulation" : "retirement",
      nominal: deflateView(annualFlow, 1),
      real: deflateView(annualFlow, factor),
      milestones: milestoneLabels(inputs, previousMonth, month),
    });
    annualFlow = emptyView();
  }

  for (let month = 1; month <= totalMonths; month += 1) {
    const factor = indexedFactor(inputs.annualInflation, month);
    const age = inputs.person.currentAge + month / MONTHS_PER_YEAR;
    const calendarYear = inputs.startYear + Math.floor((month - 1) / MONTHS_PER_YEAR);
    const calendarMonth = ((month - 1) % MONTHS_PER_YEAR) + 1;

    for (const account of inputs.accounts) {
      const current = balances.get(account.id) ?? 0;
      balances.set(account.id, Math.max(0, current * (1 + monthlyRate(account.annualReturn))));
    }

    const income = emptyIncome();
    if (age < inputs.person.retirementAge) {
      income.employment =
        (inputs.person.annualEmploymentIncomeToday *
          indexedFactor(inputs.person.annualIncomeGrowth, month)) /
        MONTHS_PER_YEAR;
    }
    if (age >= inputs.person.cpp.startAge) {
      income.cpp =
        inputs.person.cpp.monthlyAmountAt65Today *
        cppClaimFactor(inputs.person.cpp.startAge) *
        indexedFactor(inputs.person.cpp.indexingRate, month);
    }
    if (age >= inputs.person.oas.startAge) {
      income.oas =
        inputs.person.oas.monthlyAmountAt65Today *
        oasClaimFactor(inputs.person.oas.startAge) *
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
      annualFlow.income[key] += income[key];
    }

    const taxableIncome = income.employment + income.cpp + income.oas + income.pension;
    const threshold = inputs.tax.oasRecoveryThresholdToday * factor / MONTHS_PER_YEAR;
    const recoveryTax = Math.min(
      income.oas,
      Math.max(0, taxableIncome - threshold) * inputs.tax.oasRecoveryRate,
    );
    const regularTax = taxableIncome * inputs.tax.effectiveTaxRate;
    annualFlow.outflows.tax += regularTax + recoveryTax;
    annualFlow.outflows.oasRecoveryTax += recoveryTax;

    const essential = inputs.monthlyEssentialSpendingToday * factor;
    const discretionary = inputs.monthlyDiscretionarySpendingToday * factor;
    annualFlow.outflows.essential += essential;
    annualFlow.outflows.discretionary += discretionary;

    let totalContributions = 0;
    for (const account of inputs.accounts) {
      if (age >= inputs.person.retirementAge || account.type === "debt") continue;
      const contribution =
        account.monthlyContributionToday * indexedFactor(account.contributionIndexingRate, month);
      if (contribution <= 0) continue;
      balances.set(account.id, (balances.get(account.id) ?? 0) + contribution);
      annualFlow.outflows.contributions += contribution;
      totalContributions += contribution;
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
        annualFlow.income.other += amount;
        annualFlow.income.total += amount;
      } else {
        eventOutflows += amount;
        annualFlow.outflows.oneTime += amount;
      }
    }

    let cashPosition =
      income.total +
      eventInflows -
      essential -
      discretionary -
      regularTax -
      recoveryTax -
      totalContributions -
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
        annualFlow.outflows.tax += withdrawalTax;
      }
      balances.set(account.id, balance - grossWithdrawal);
      addWithdrawal(annualFlow.withdrawals, account.type, grossWithdrawal);
      gap -= netCash;
    }

    if (gap > 0) annualFlow.outflows.unmetSpending += gap;
    annualFlow.outflows.total =
      annualFlow.outflows.essential +
      annualFlow.outflows.discretionary +
      annualFlow.outflows.oneTime +
      annualFlow.outflows.tax +
      annualFlow.outflows.contributions +
      annualFlow.outflows.unmetSpending;

    const currentBalances = accountBalances(inputs.accounts, balances);
    if (financialAssetsDepletionAge === null && currentBalances.financialAssets <= 0.01) {
      financialAssetsDepletionAge = age;
    }
    if (month % MONTHS_PER_YEAR === 0 || month === totalMonths) {
      snapshot(month, Math.max(0, month - MONTHS_PER_YEAR), calendarYear);
    }
  }

  const retirement =
    annual.find((point) => point.age >= inputs.person.retirementAge) ?? annual.at(-1)!;
  const ending = annual.at(-1)!;
  const assetsAtRetirement = retirement.real.balances.financialAssets;

  observations.push({
    code: "retirement",
    message: `Retirement begins in ${retirement.calendarYear}.`,
    calendarYear: retirement.calendarYear,
    age: retirement.age,
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
    schemaVersion: "3.0",
    inputs,
    summary: {
      retirementYear: retirement.calendarYear,
      financialAssetsAtRetirementToday: round(assetsAtRetirement),
      retirementGoalToday: round(inputs.retirementGoalToday),
      goalGapToday: round(assetsAtRetirement - inputs.retirementGoalToday),
      financialAssetsDepletionAge:
        financialAssetsDepletionAge === null ? null : round(financialAssetsDepletionAge),
      endingFinancialAssetsToday: round(ending.real.balances.financialAssets),
    },
    annual,
    observations,
  };
}
