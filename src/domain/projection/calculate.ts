import type {
  AccountType,
  AnnualProjection,
  AssetAllocation,
  BalanceBreakdown,
  FinancialAccountInput,
  HouseholdMemberInput,
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

function inflationFactor(annualInflation: number, month: number): number {
  return Math.pow(1 + annualInflation, month / MONTHS_PER_YEAR);
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
    realAssets: 0,
    debts: 0,
    netWorth: 0,
  };
}

function emptyView(): ProjectionView {
  return {
    income: emptyIncome(),
    withdrawals: emptyWithdrawals(),
    outflows: emptyOutflows(),
    balances: emptyBalances(),
    allocation: { ...ZERO_ALLOCATION },
  };
}

function addIncome(target: IncomeBreakdown, source: IncomeBreakdown): void {
  target.employment += source.employment;
  target.cpp += source.cpp;
  target.oas += source.oas;
  target.pension += source.pension;
  target.other += source.other;
  target.total += source.total;
}

function addWithdrawal(
  target: WithdrawalBreakdown,
  accountType: AccountType,
  amount: number,
): void {
  if (accountType === "cash") target.cash += amount;
  if (accountType === "tfsa") target.tfsa += amount;
  if (accountType === "rrsp_rrif") target.rrspRrif += amount;
  if (accountType === "non_registered") target.nonRegistered += amount;
  target.total += amount;
}

function benefitMonthlyAmount(
  member: HouseholdMemberInput,
  kind: "cpp" | "oas",
  age: number,
  month: number,
): number {
  const benefit = member[kind];
  if (age < benefit.startAge) return 0;
  const claimFactor = kind === "cpp" ? cppClaimFactor(benefit.startAge) : oasClaimFactor(benefit.startAge);
  return (
    benefit.monthlyAmountAt65Today *
    benefit.percentOfMaximum *
    claimFactor *
    indexedFactor(benefit.indexingRate, month)
  );
}

function accountBalances(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
  ownerId?: string,
): BalanceBreakdown {
  const result = emptyBalances();
  for (const account of accounts) {
    if (ownerId && account.ownerId !== ownerId) continue;
    const balance = balances.get(account.id) ?? 0;
    if (account.type === "cash") result.cash += balance;
    if (account.type === "tfsa") result.tfsa += balance;
    if (account.type === "rrsp_rrif") result.rrspRrif += balance;
    if (account.type === "non_registered") result.nonRegistered += balance;
    if (account.type === "real_asset") result.realAssets += balance;
    if (account.type === "debt") result.debts += balance;
  }
  result.netWorth =
    result.cash + result.tfsa + result.rrspRrif + result.nonRegistered + result.realAssets - result.debts;
  return result;
}

function accountAllocation(
  accounts: FinancialAccountInput[],
  balances: Map<string, number>,
  ownerId?: string,
): AssetAllocation {
  const result = { ...ZERO_ALLOCATION };
  for (const account of accounts) {
    if (ownerId && account.ownerId !== ownerId) continue;
    if (account.type === "real_asset" || account.type === "debt") continue;
    const balance = balances.get(account.id) ?? 0;
    result.cash += balance * account.allocation.cash;
    result.fixedIncome += balance * account.allocation.fixedIncome;
    result.equity += balance * account.allocation.equity;
  }
  return result;
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
      realAssets: divide(view.balances.realAssets),
      debts: divide(view.balances.debts),
      netWorth: divide(view.balances.netWorth),
    },
    allocation: {
      cash: divide(view.allocation.cash),
      fixedIncome: divide(view.allocation.fixedIncome),
      equity: divide(view.allocation.equity),
    },
  };
}

function roundView(view: ProjectionView): ProjectionView {
  return deflateView(view, 1);
}

function firstCashAccount(
  accounts: FinancialAccountInput[],
  ownerId?: string,
): FinancialAccountInput | undefined {
  return accounts.find((account) => account.type === "cash" && (!ownerId || account.ownerId === ownerId));
}

function milestoneLabels(
  inputs: ProjectionInputs,
  previousMonth: number,
  month: number,
): string[] {
  const labels: string[] = [];
  for (const member of inputs.members) {
    const previousAge = member.currentAge + previousMonth / MONTHS_PER_YEAR;
    const age = member.currentAge + month / MONTHS_PER_YEAR;
    const checks: Array<[number, string]> = [
      [member.retirementAge, `${member.label} retires`],
      [member.cpp.startAge, `${member.label} CPP begins`],
      [member.oas.startAge, `${member.label} OAS begins`],
      [member.rrifConversionAge, `${member.label} RRIF conversion age`],
    ];
    for (const [targetAge, label] of checks) {
      if (previousAge < targetAge && age >= targetAge) labels.push(label);
    }
  }
  return labels;
}

export function calculateProjection(rawInputs: ProjectionInputs): ProjectionResult {
  const inputs = validateProjectionInputs(rawInputs);
  const primary = inputs.members.find((member) => member.id === inputs.primaryMemberId)!;
  const totalMonths = Math.round((inputs.endAge - primary.currentAge) * MONTHS_PER_YEAR);
  const balances = new Map(inputs.accounts.map((account) => [account.id, account.openingBalance]));
  const annual: AnnualProjection[] = [];
  const observations: ProjectionObservation[] = [];
  const memberFlows = new Map<string, ProjectionView>(
    inputs.members.map((member) => [member.id, emptyView()]),
  );
  let householdFlow = emptyView();
  let financialAssetsDepletionAge: number | null = null;

  function snapshot(month: number, previousMonth: number, calendarYear: number): void {
    const factor = inflationFactor(inputs.annualInflation, month);
    householdFlow.balances = accountBalances(inputs.accounts, balances);
    householdFlow.allocation = accountAllocation(inputs.accounts, balances);

    const memberSnapshots: AnnualProjection["members"] = {};
    for (const member of inputs.members) {
      const flow = memberFlows.get(member.id)!;
      flow.balances = accountBalances(inputs.accounts, balances, member.id);
      flow.allocation = accountAllocation(inputs.accounts, balances, member.id);
      memberSnapshots[member.id] = {
        label: member.label,
        age: round(member.currentAge + month / MONTHS_PER_YEAR),
        nominal: roundView(flow),
        real: deflateView(flow, factor),
      };
    }

    const primaryAge = primary.currentAge + month / MONTHS_PER_YEAR;
    annual.push({
      calendarYear,
      primaryAge: round(primaryAge),
      phase: primaryAge < primary.retirementAge ? "accumulation" : "retirement",
      nominal: roundView(householdFlow),
      real: deflateView(householdFlow, factor),
      members: memberSnapshots,
      milestones: milestoneLabels(inputs, previousMonth, month),
    });

    householdFlow = emptyView();
    for (const member of inputs.members) memberFlows.set(member.id, emptyView());
  }

  for (let month = 1; month <= totalMonths; month += 1) {
    const factor = inflationFactor(inputs.annualInflation, month);
    const calendarYear = inputs.startYear + Math.floor((month - 1) / MONTHS_PER_YEAR);
    const calendarMonth = ((month - 1) % MONTHS_PER_YEAR) + 1;

    for (const account of inputs.accounts) {
      const current = balances.get(account.id) ?? 0;
      balances.set(account.id, Math.max(0, current * (1 + monthlyRate(account.annualReturn))));
    }

    let totalIncome = 0;
    let totalBaseTax = 0;
    let totalContributions = 0;
    let totalEventInflows = 0;
    let totalEventOutflows = 0;

    for (const member of inputs.members) {
      const age = member.currentAge + month / MONTHS_PER_YEAR;
      const memberFlow = memberFlows.get(member.id)!;
      const income = emptyIncome();

      if (age < member.retirementAge) {
        income.employment =
          (member.annualEmploymentIncomeToday * indexedFactor(member.annualIncomeGrowth, month)) /
          MONTHS_PER_YEAR;
      }
      income.cpp = benefitMonthlyAmount(member, "cpp", age, month);
      income.oas = benefitMonthlyAmount(member, "oas", age, month);
      if (age >= member.pensionStartAge) {
        income.pension =
          (member.annualPensionToday * indexedFactor(member.pensionIndexingRate, month)) /
          MONTHS_PER_YEAR;
      }
      income.total = income.employment + income.cpp + income.oas + income.pension + income.other;
      addIncome(memberFlow.income, income);
      addIncome(householdFlow.income, income);
      totalIncome += income.total;

      const taxableIncome = income.employment + income.cpp + income.oas + income.pension;
      const threshold = inputs.tax.oasRecoveryThresholdToday * factor / MONTHS_PER_YEAR;
      const recoveryTax = Math.min(
        income.oas,
        Math.max(0, taxableIncome - threshold) * inputs.tax.oasRecoveryRate,
      );
      const regularTax = taxableIncome * inputs.tax.effectiveTaxRate;
      memberFlow.outflows.tax += regularTax + recoveryTax;
      memberFlow.outflows.oasRecoveryTax += recoveryTax;
      householdFlow.outflows.tax += regularTax + recoveryTax;
      householdFlow.outflows.oasRecoveryTax += recoveryTax;
      totalBaseTax += regularTax + recoveryTax;
    }

    const essential = inputs.monthlyEssentialSpendingToday * factor;
    const discretionary = inputs.monthlyDiscretionarySpendingToday * factor;
    householdFlow.outflows.essential += essential;
    householdFlow.outflows.discretionary += discretionary;
    for (const member of inputs.members) {
      const flow = memberFlows.get(member.id)!;
      flow.outflows.essential += essential * member.expenseShare;
      flow.outflows.discretionary += discretionary * member.expenseShare;
    }

    for (const account of inputs.accounts) {
      const owner = inputs.members.find((member) => member.id === account.ownerId)!;
      const age = owner.currentAge + month / MONTHS_PER_YEAR;
      if (age >= owner.retirementAge || account.type === "debt" || account.type === "real_asset") continue;
      const contribution =
        account.monthlyContributionToday * indexedFactor(account.contributionIndexingRate, month);
      if (contribution <= 0) continue;
      balances.set(account.id, (balances.get(account.id) ?? 0) + contribution);
      householdFlow.outflows.contributions += contribution;
      memberFlows.get(owner.id)!.outflows.contributions += contribution;
      totalContributions += contribution;
    }

    const matchingEvents = inputs.events.filter(
      (event) => event.calendarYear === calendarYear && event.month === calendarMonth,
    );
    for (const event of matchingEvents) {
      const amount = event.amountToday * factor;
      const ownerFlow = event.ownerId ? memberFlows.get(event.ownerId) : undefined;
      if (event.direction === "inflow") {
        totalEventInflows += amount;
        householdFlow.income.other += amount;
        householdFlow.income.total += amount;
        if (ownerFlow) {
          ownerFlow.income.other += amount;
          ownerFlow.income.total += amount;
        }
      } else {
        totalEventOutflows += amount;
        householdFlow.outflows.oneTime += amount;
        if (ownerFlow) ownerFlow.outflows.oneTime += amount;
      }
    }

    let cashPosition =
      totalIncome + totalEventInflows - essential - discretionary - totalBaseTax - totalContributions - totalEventOutflows;

    if (cashPosition > 0) {
      const targetEvent = matchingEvents.find(
        (event) => event.direction === "inflow" && event.targetAccountId,
      );
      const target = targetEvent
        ? inputs.accounts.find((account) => account.id === targetEvent.targetAccountId)
        : firstCashAccount(inputs.accounts);
      if (target) balances.set(target.id, (balances.get(target.id) ?? 0) + cashPosition);
      cashPosition = 0;
    }

    let gap = Math.max(0, -cashPosition);
    const withdrawalAccounts = inputs.accounts
      .filter((account) => !["real_asset", "debt"].includes(account.type))
      .sort((left, right) => left.withdrawalPriority - right.withdrawalPriority);

    for (const account of withdrawalAccounts) {
      if (gap <= 0) break;
      const balance = balances.get(account.id) ?? 0;
      if (balance <= 0) continue;
      const ownerFlow = memberFlows.get(account.ownerId)!;
      let grossWithdrawal = Math.min(balance, gap);
      let netCash = grossWithdrawal;

      if (account.type === "rrsp_rrif") {
        const netRate = 1 - inputs.tax.effectiveTaxRate;
        grossWithdrawal = Math.min(balance, gap / netRate);
        const withdrawalTax = grossWithdrawal * inputs.tax.effectiveTaxRate;
        netCash = grossWithdrawal - withdrawalTax;
        householdFlow.outflows.tax += withdrawalTax;
        ownerFlow.outflows.tax += withdrawalTax;
      }

      balances.set(account.id, balance - grossWithdrawal);
      addWithdrawal(householdFlow.withdrawals, account.type, grossWithdrawal);
      addWithdrawal(ownerFlow.withdrawals, account.type, grossWithdrawal);
      gap -= netCash;
    }

    if (gap > 0) {
      householdFlow.outflows.unmetSpending += gap;
      const totalShare = inputs.members.reduce((sum, member) => sum + member.expenseShare, 0);
      for (const member of inputs.members) {
        memberFlows.get(member.id)!.outflows.unmetSpending += gap * (member.expenseShare / totalShare);
      }
    }

    householdFlow.outflows.total =
      householdFlow.outflows.essential +
      householdFlow.outflows.discretionary +
      householdFlow.outflows.oneTime +
      householdFlow.outflows.tax +
      householdFlow.outflows.contributions +
      householdFlow.outflows.unmetSpending;
    for (const member of inputs.members) {
      const outflows = memberFlows.get(member.id)!.outflows;
      outflows.total =
        outflows.essential +
        outflows.discretionary +
        outflows.oneTime +
        outflows.tax +
        outflows.contributions +
        outflows.unmetSpending;
    }

    const currentBalances = accountBalances(inputs.accounts, balances);
    const financialAssets =
      currentBalances.cash +
      currentBalances.tfsa +
      currentBalances.rrspRrif +
      currentBalances.nonRegistered;
    if (financialAssetsDepletionAge === null && financialAssets <= 0.01) {
      financialAssetsDepletionAge = primary.currentAge + month / MONTHS_PER_YEAR;
    }

    if (month % MONTHS_PER_YEAR === 0 || month === totalMonths) {
      snapshot(month, Math.max(0, month - MONTHS_PER_YEAR), calendarYear);
    }
  }

  const firstRetirement = annual.find((point) => point.primaryAge >= primary.retirementAge) ?? annual.at(-1)!;
  const ending = annual.at(-1)!;
  const netWorthAtFirstRetirementToday = firstRetirement.real.balances.netWorth;

  observations.push({
    code: "first_retirement",
    message: `The first retirement transition occurs in ${firstRetirement.calendarYear}.`,
    calendarYear: firstRetirement.calendarYear,
    age: firstRetirement.primaryAge,
  });
  for (const member of inputs.members) {
    observations.push({
      code: `cpp_start_${member.id}`,
      message: `${member.label} CPP begins at age ${member.cpp.startAge}.`,
      age: member.cpp.startAge,
    });
    observations.push({
      code: `oas_start_${member.id}`,
      message: `${member.label} OAS begins at age ${member.oas.startAge}.`,
      age: member.oas.startAge,
    });
  }
  observations.push({
    code: "portfolio_duration",
    message:
      financialAssetsDepletionAge === null
        ? `Financial assets remain above zero through age ${inputs.endAge}.`
        : `Financial assets reach zero near age ${round(financialAssetsDepletionAge)}.`,
    age: financialAssetsDepletionAge ?? inputs.endAge,
  });

  return {
    schemaVersion: "2.0",
    inputs,
    summary: {
      firstRetirementYear: firstRetirement.calendarYear,
      netWorthAtFirstRetirementToday: round(netWorthAtFirstRetirementToday),
      retirementGoalToday: round(inputs.retirementGoalToday),
      goalGapToday: round(netWorthAtFirstRetirementToday - inputs.retirementGoalToday),
      financialAssetsDepletionAge:
        financialAssetsDepletionAge === null ? null : round(financialAssetsDepletionAge),
      endingNetWorthToday: round(ending.real.balances.netWorth),
    },
    annual,
    observations,
  };
}
