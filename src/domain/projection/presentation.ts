import type {
  AnnualProjection,
  FinancialAccountInput,
  ProjectionInputs,
  ProjectionResult,
  ProjectionView,
} from "./types";

const FINANCIAL_ASSET_TYPES = new Set(["cash", "tfsa", "rrsp_rrif", "non_registered"]);
const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function startingFinancialAssets(accounts: FinancialAccountInput[]): number {
  return roundCurrency(
    accounts.reduce(
      (total, account) =>
        FINANCIAL_ASSET_TYPES.has(account.type) ? total + account.openingBalance : total,
      0,
    ),
  );
}

export function monthlyEmploymentNetCash(inputs: ProjectionInputs): number {
  const phase = inputs.person.employmentIncomePhases.find(
    (item) =>
      inputs.person.currentAge >= item.startAge &&
      inputs.person.currentAge < item.endAge,
  );
  return roundCurrency((phase?.annualNetCashToday ?? 0) / 12);
}

export function monthlyInvestmentContributions(inputs: ProjectionInputs): number {
  return roundCurrency(
    inputs.accounts
      .filter((account) => ["tfsa", "rrsp_rrif", "non_registered"].includes(account.type))
      .reduce((total, account) => {
        const phase = account.contributionPhases.find(
          (item) =>
            inputs.person.currentAge >= item.startAge &&
            inputs.person.currentAge < item.endAge,
        );
        return total + (phase?.monthlyAmountToday ?? 0);
      }, 0),
  );
}

export function annualPeriodLabel(inputs: ProjectionInputs, calendarYear: number): string {
  const startYear = Number(inputs.startDate.slice(0, 4));
  const startMonth = Number(inputs.startDate.slice(5, 7));
  const totalMonths = Math.round((inputs.endAge - inputs.person.currentAge) * 12);
  const endingMonthIndex = startMonth - 1 + totalMonths - 1;
  const endYear = startYear + Math.floor(endingMonthIndex / 12);
  const endMonth = (endingMonthIndex % 12) + 1;

  if (calendarYear < startYear || calendarYear > endYear) return String(calendarYear);

  const periodStartMonth = calendarYear === startYear ? startMonth : 1;
  const periodEndMonth = calendarYear === endYear ? endMonth : 12;
  if (periodStartMonth === 1 && periodEndMonth === 12) return String(calendarYear);

  return `${calendarYear} (${MONTH_LABELS[periodStartMonth - 1]}–${MONTH_LABELS[periodEndMonth - 1]})`;
}

export type DisplayMode = "real" | "nominal";

export type MonetaryReconciliationEquation = {
  calculatedValue: number;
  displayedValue: number;
  maximumPeriodDifference: number;
  rawAggregateDifference: number;
  aggregateDifference: number;
  periodsMatched: boolean;
  matched: boolean;
};

export type ContributionReconciliationSummary = {
  totals: {
    planned: number;
    allowed: number;
    surplusFunded: number;
    actual: number;
    unallocated: number;
    cashFunded: number;
    incomeWithheld: number;
    accountDeposits: number;
  };
  equations: {
    planned: MonetaryReconciliationEquation;
    totalActual: MonetaryReconciliationEquation;
    fundingSplit: MonetaryReconciliationEquation;
    accountDeposits: MonetaryReconciliationEquation;
  };
  maximumAccountDifference: number;
  maximumRoomDifference: number;
  maximumSavingsPolicyDifference: number;
  maximumDifference: number;
  calculatedTotalActual: number;
  displayedAccountDeposits: number;
  matched: boolean;
};

type MonetaryEquationDefinition = {
  left: (view: ProjectionView) => number[];
  right: (view: ProjectionView) => number[];
};

function monetaryCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function monetaryValue(cents: number): number {
  return cents / 100;
}

function sumCents(values: number[]): number {
  return values.reduce(
    (total, value) => total + monetaryCents(value),
    0,
  );
}

function centDifference(left: number[], right: number[]): number {
  return sumCents(left) - sumCents(right);
}

function reconcileMonetaryEquation(
  views: ProjectionView[],
  definition: MonetaryEquationDefinition,
): MonetaryReconciliationEquation {
  let calculatedCents = 0;
  let rawDisplayedCents = 0;
  let centStableDisplayedCents = 0;
  let maximumPeriodDifferenceCents = 0;
  let periodsMatched = true;

  for (const view of views) {
    const leftCents = sumCents(definition.left(view));
    const rightCents = sumCents(definition.right(view));
    const differenceCents = Math.abs(leftCents - rightCents);
    const periodMatched = differenceCents <= 1;
    calculatedCents += leftCents;
    rawDisplayedCents += rightCents;
    centStableDisplayedCents += periodMatched ? leftCents : rightCents;
    maximumPeriodDifferenceCents = Math.max(
      maximumPeriodDifferenceCents,
      differenceCents,
    );
    periodsMatched &&= periodMatched;
  }

  const aggregateDifferenceCents = Math.abs(
    calculatedCents - centStableDisplayedCents,
  );
  return {
    calculatedValue: monetaryValue(calculatedCents),
    displayedValue: monetaryValue(centStableDisplayedCents),
    maximumPeriodDifference: monetaryValue(
      maximumPeriodDifferenceCents,
    ),
    rawAggregateDifference: monetaryValue(
      Math.abs(calculatedCents - rawDisplayedCents),
    ),
    aggregateDifference: monetaryValue(aggregateDifferenceCents),
    periodsMatched,
    matched: periodsMatched && aggregateDifferenceCents <= 1,
  };
}

export function buildContributionReconciliation(
  projection: ProjectionResult,
  mode: DisplayMode,
): ContributionReconciliationSummary {
  const views = projection.annual.map((point) => point[mode]);
  const accountDepositValues = (view: ProjectionView) =>
    Object.values(view.accountContributionDetails).map(
      (detail) => detail.depositedIntoAccount,
    );
  const equations = {
    planned: reconcileMonetaryEquation(views, {
      left: (view) => [view.contributions.planned],
      right: (view) => [
        view.contributions.allowed,
        view.contributions.unallocated,
      ],
    }),
    totalActual: reconcileMonetaryEquation(views, {
      left: (view) => [view.contributions.total],
      right: (view) => [
        view.contributions.allowed,
        view.contributions.surplusFunded,
      ],
    }),
    fundingSplit: reconcileMonetaryEquation(views, {
      left: (view) => [
        view.contributions.cashFunded,
        view.contributions.incomeWithheld,
      ],
      right: (view) => [view.contributions.total],
    }),
    accountDeposits: reconcileMonetaryEquation(views, {
      left: (view) => [view.contributions.total],
      right: accountDepositValues,
    }),
  };

  let maximumAccountDifferenceCents = 0;
  let maximumRoomDifferenceCents = 0;
  let maximumSavingsPolicyDifferenceCents = 0;
  for (const view of views) {
    for (const detail of Object.values(
      view.accountContributionDetails,
    )) {
      maximumAccountDifferenceCents = Math.max(
        maximumAccountDifferenceCents,
        Math.abs(
          centDifference(
            [detail.depositedIntoAccount],
            [
              detail.sourceAccountDeposit,
              detail.redirectedIn,
              detail.surplusFundedDeposit,
            ],
          ),
        ),
      );
      if (detail.plannedFromAccount !== 0) {
        maximumAccountDifferenceCents = Math.max(
          maximumAccountDifferenceCents,
          Math.abs(
            centDifference(
              [detail.plannedFromAccount],
              [
                detail.sourceAccountDeposit,
                detail.redirectedOut,
                detail.unallocatedFromAccount,
              ],
            ),
          ),
        );
      }
    }

    const tfsa = view.registeredAccountRoom.tfsa;
    const rrsp = view.registeredAccountRoom.rrsp;
    maximumRoomDifferenceCents = Math.max(
      maximumRoomDifferenceCents,
      Math.abs(
        centDifference(
          [
            tfsa.openingRoom,
            tfsa.annualNewRoom,
            tfsa.withdrawalRoomRestored,
          ],
          [tfsa.allowedContributions, tfsa.closingRoom],
        ),
      ),
      Math.abs(
        centDifference(
          [rrsp.openingRoom, rrsp.annualNewRoom],
          [rrsp.allowedContributions, rrsp.closingRoom],
        ),
      ),
    );

    if (projection.savingsPolicy.mode === "simple") {
      const savings = view.savingsPolicy;
      const differences = [
        centDifference(
          [savings.reserveFunded],
          [
            savings.reserveRetainedAsCash,
            savings.reserveRedirected,
          ],
        ),
        centDifference(
          [savings.personalPlanned],
          [savings.personalAllowed, savings.personalUnallocated],
        ),
        centDifference(
          [savings.workplacePlanned],
          [savings.workplaceAllowed, savings.workplaceUnallocated],
        ),
        centDifference(
          [savings.totalInvestmentDeposits],
          [
            savings.personalAllowed,
            savings.workplaceAllowed,
            savings.reserveRedirected,
          ],
        ),
        centDifference(
          [savings.positiveCashAvailable],
          [
            savings.personalAllowed,
            savings.reserveFunded,
            savings.unplannedCashRetained,
          ],
        ),
        centDifference(
          [view.contributions.planned],
          [savings.personalPlanned, savings.workplacePlanned],
        ),
        centDifference(
          [view.contributions.allowed],
          [savings.personalAllowed, savings.workplaceAllowed],
        ),
        centDifference(
          [view.contributions.unallocated],
          [
            savings.personalUnallocated,
            savings.workplaceUnallocated,
          ],
        ),
        centDifference(
          [view.contributions.surplusFunded],
          [savings.reserveRedirected],
        ),
        centDifference(
          [view.contributions.total],
          [savings.totalInvestmentDeposits],
        ),
      ];
      maximumSavingsPolicyDifferenceCents = Math.max(
        maximumSavingsPolicyDifferenceCents,
        ...differences.map(Math.abs),
      );
    }
  }

  const maximumAccountDifference = monetaryValue(
    maximumAccountDifferenceCents,
  );
  const maximumRoomDifference = monetaryValue(
    maximumRoomDifferenceCents,
  );
  const maximumSavingsPolicyDifference = monetaryValue(
    maximumSavingsPolicyDifferenceCents,
  );
  const maximumDifference = Math.max(
    ...Object.values(equations).flatMap((equation) => [
      equation.maximumPeriodDifference,
      equation.aggregateDifference,
    ]),
    maximumAccountDifference,
    maximumRoomDifference,
    maximumSavingsPolicyDifference,
  );
  const matched =
    Object.values(equations).every((equation) => equation.matched) &&
    maximumAccountDifferenceCents <= 1 &&
    maximumRoomDifferenceCents <= 1 &&
    maximumSavingsPolicyDifferenceCents <= 1;
  const totalActualCents = monetaryCents(
    equations.totalActual.calculatedValue,
  );
  const plannedCents = monetaryCents(
    equations.planned.calculatedValue,
  );
  const allowedCents = views.reduce(
    (total, view) =>
      total + monetaryCents(view.contributions.allowed),
    0,
  );
  const cashFundedCents = views.reduce(
    (total, view) =>
      total + monetaryCents(view.contributions.cashFunded),
    0,
  );
  const rawSurplusFundedCents = views.reduce(
    (total, view) =>
      total + monetaryCents(view.contributions.surplusFunded),
    0,
  );
  const rawUnallocatedCents = views.reduce(
    (total, view) =>
      total + monetaryCents(view.contributions.unallocated),
    0,
  );
  const rawIncomeWithheldCents = views.reduce(
    (total, view) =>
      total + monetaryCents(view.contributions.incomeWithheld),
    0,
  );

  return {
    totals: {
      planned: monetaryValue(plannedCents),
      allowed: monetaryValue(allowedCents),
      surplusFunded: monetaryValue(
        equations.totalActual.periodsMatched
          ? totalActualCents - allowedCents
          : rawSurplusFundedCents,
      ),
      actual: monetaryValue(totalActualCents),
      unallocated: monetaryValue(
        equations.planned.periodsMatched
          ? plannedCents - allowedCents
          : rawUnallocatedCents,
      ),
      cashFunded: monetaryValue(cashFundedCents),
      incomeWithheld: monetaryValue(
        equations.fundingSplit.periodsMatched
          ? totalActualCents - cashFundedCents
          : rawIncomeWithheldCents,
      ),
      accountDeposits: equations.accountDeposits.displayedValue,
    },
    equations,
    maximumAccountDifference,
    maximumRoomDifference,
    maximumSavingsPolicyDifference,
    maximumDifference,
    calculatedTotalActual: equations.totalActual.calculatedValue,
    displayedAccountDeposits:
      equations.accountDeposits.displayedValue,
    matched,
  };
}

export type AnnualChartRow = {
  [key: string]: string | number;
  year: number;
  periodLabel: string;
  age: number;
  essential: number;
  discretionary: number;
  oneTime: number;
  tax: number;
  contributions: number;
  cashFundedContributions: number;
  incomeWithheldContributions: number;
  plannedContributions: number;
  allowedContributions: number;
  surplusFundedContributions: number;
  actualContributions: number;
  redirectedContributions: number;
  unallocatedContributions: number;
  tfsaRoomOpening: number;
  tfsaRoomNew: number;
  tfsaRoomWithdrawalRestored: number;
  tfsaRoomClosing: number;
  tfsaPlannedContributions: number;
  tfsaAllowedContributions: number;
  tfsaSurplusContributions: number;
  tfsaUnallocatedContributions: number;
  rrspRoomOpening: number;
  rrspRoomNew: number;
  rrspRoomClosing: number;
  rrspPreviousYearEligibleEarnedIncome: number;
  rrspEarnedIncomeRate: number;
  rrspAnnualCap: number;
  rrspPensionAdjustment: number;
  rrspOtherRoomReduction: number;
  rrspGrossGeneratedRoom: number;
  rrspPlannedContributions: number;
  rrspAllowedContributions: number;
  rrspSurplusContributions: number;
  rrspUnallocatedContributions: number;
  registeredRoomDenomination: "nominal_regulatory_dollars";
  employmentNetCash: number;
  employmentPhase: string;
  contributionPhases: string;
  cpp: number;
  oas: number;
  pension: number;
  otherIncome: number;
  cashWithdrawal: number;
  tfsaWithdrawal: number;
  rrspWithdrawal: number;
  nonRegisteredWithdrawal: number;
  surplusGenerated: number;
  surplusReserveRefill: number;
  surplusRetainedAsCash: number;
  surplusRedirected: number;
  surplusReserveTarget: number;
  positiveCashAvailable: number;
  personalPlanAmount: number;
  personalPlanAllowed: number;
  personalPlanUnallocated: number;
  reserveBuildingPlanAmount: number;
  reserveBuildingFunded: number;
  reserveCashRetained: number;
  reservePlanRedirected: number;
  reservePlanUnfunded: number;
  workplacePlanned: number;
  workplaceAllowed: number;
  workplaceUnallocated: number;
  unplannedCashRetained: number;
  totalInvestmentDeposits: number;
  financialAssets: number;
  goal: number;
  milestones: string;
};

export type AnnualLedgerRow = {
  periodLabel: string;
  year: number;
  age: number;
  income: number;
  withdrawals: number;
  tax: number;
  spending: number;
  actualContributions: number;
  surplusFundedContributions: number;
  surplusGenerated: number;
  surplusReserveRefill: number;
  surplusRetainedAsCash: number;
  surplusRedirected: number;
  surplusReserveTarget: number;
  positiveCashAvailable: number;
  personalPlanAmount: number;
  personalPlanAllowed: number;
  personalPlanUnallocated: number;
  reserveBuildingPlanAmount: number;
  reserveBuildingFunded: number;
  reserveCashRetained: number;
  reservePlanRedirected: number;
  reservePlanUnfunded: number;
  workplacePlanned: number;
  workplaceAllowed: number;
  workplaceUnallocated: number;
  unplannedCashRetained: number;
  totalInvestmentDeposits: number;
  financialAssets: number;
  milestones: string;
};

export function buildAnnualChartData(
  inputs: ProjectionInputs,
  projection: ProjectionResult,
  mode: DisplayMode,
): AnnualChartRow[] {
  return projection.annual.map((point) => {
    const view = point[mode];
    return {
      year: point.calendarYear,
      periodLabel: annualPeriodLabel(inputs, point.calendarYear),
      age: point.age,
      essential: view.outflows.essential,
      discretionary: view.outflows.discretionary,
      oneTime: view.outflows.oneTime,
      tax: view.outflows.tax,
      contributions: view.outflows.contributions,
      cashFundedContributions: view.contributions.cashFunded,
      incomeWithheldContributions: view.contributions.incomeWithheld,
      plannedContributions: view.contributions.planned,
      allowedContributions: view.contributions.allowed,
      surplusFundedContributions: view.contributions.surplusFunded,
      actualContributions: view.contributions.total,
      redirectedContributions: view.contributions.redirected,
      unallocatedContributions: view.contributions.unallocated,
      tfsaRoomOpening: view.registeredAccountRoom.tfsa.openingRoom,
      tfsaRoomNew: view.registeredAccountRoom.tfsa.annualNewRoom,
      tfsaRoomWithdrawalRestored:
        view.registeredAccountRoom.tfsa.withdrawalRoomRestored,
      tfsaRoomClosing: view.registeredAccountRoom.tfsa.closingRoom,
      tfsaPlannedContributions:
        view.registeredAccountRoom.tfsa.plannedContributions,
      tfsaAllowedContributions:
        view.registeredAccountRoom.tfsa.allowedContributions,
      tfsaSurplusContributions:
        view.registeredAccountRoom.tfsa.surplusFundedContributions,
      tfsaUnallocatedContributions:
        view.registeredAccountRoom.tfsa.unallocatedContributions,
      rrspRoomOpening: view.registeredAccountRoom.rrsp.openingRoom,
      rrspRoomNew: view.registeredAccountRoom.rrsp.annualNewRoom,
      rrspRoomClosing: view.registeredAccountRoom.rrsp.closingRoom,
      rrspPreviousYearEligibleEarnedIncome:
        view.registeredAccountRoom.rrsp.previousYearEligibleEarnedIncome,
      rrspEarnedIncomeRate:
        view.registeredAccountRoom.rrsp.earnedIncomeRate,
      rrspAnnualCap: view.registeredAccountRoom.rrsp.annualCap,
      rrspPensionAdjustment:
        view.registeredAccountRoom.rrsp.pensionAdjustment,
      rrspOtherRoomReduction:
        view.registeredAccountRoom.rrsp.otherRoomReduction,
      rrspGrossGeneratedRoom:
        view.registeredAccountRoom.rrsp.grossGeneratedRoom,
      rrspPlannedContributions:
        view.registeredAccountRoom.rrsp.plannedContributions,
      rrspAllowedContributions:
        view.registeredAccountRoom.rrsp.allowedContributions,
      rrspSurplusContributions:
        view.registeredAccountRoom.rrsp.surplusFundedContributions,
      rrspUnallocatedContributions:
        view.registeredAccountRoom.rrsp.unallocatedContributions,
      registeredRoomDenomination:
        projection.registeredAccountRoom.denomination,
      employmentNetCash: view.income.employment,
      employmentPhase: point.employmentPhaseLabels.join(" → "),
      contributionPhases: Object.values(point.contributionPhaseLabels)
        .flat()
        .join(" · "),
      cpp: view.income.cpp,
      oas: view.income.oas,
      pension: view.income.pension,
      otherIncome: view.income.other,
      cashWithdrawal: view.withdrawals.cash,
      tfsaWithdrawal: view.withdrawals.tfsa,
      rrspWithdrawal: view.withdrawals.rrspRrif,
      nonRegisteredWithdrawal: view.withdrawals.nonRegistered,
      surplusGenerated: view.surplusAllocation.generated,
      surplusReserveRefill: view.surplusAllocation.reserveRefill,
      surplusRetainedAsCash: view.surplusAllocation.retainedAsCash,
      surplusRedirected: view.surplusAllocation.redirected,
      surplusReserveTarget: view.surplusAllocation.reserveTarget,
      positiveCashAvailable:
        view.savingsPolicy.positiveCashAvailable,
      personalPlanAmount: view.savingsPolicy.personalPlanned,
      personalPlanAllowed: view.savingsPolicy.personalAllowed,
      personalPlanUnallocated:
        view.savingsPolicy.personalUnallocated,
      reserveBuildingPlanAmount:
        view.savingsPolicy.reservePlanned,
      reserveBuildingFunded: view.savingsPolicy.reserveFunded,
      reserveCashRetained:
        view.savingsPolicy.reserveRetainedAsCash,
      reservePlanRedirected:
        view.savingsPolicy.reserveRedirected,
      reservePlanUnfunded: view.savingsPolicy.reserveUnfunded,
      workplacePlanned: view.savingsPolicy.workplacePlanned,
      workplaceAllowed: view.savingsPolicy.workplaceAllowed,
      workplaceUnallocated:
        view.savingsPolicy.workplaceUnallocated,
      unplannedCashRetained:
        view.savingsPolicy.unplannedCashRetained,
      totalInvestmentDeposits:
        view.savingsPolicy.totalInvestmentDeposits,
      financialAssets: view.balances.financialAssets,
      goal:
        mode === "real"
          ? inputs.retirementGoalToday
          : inputs.retirementGoalToday *
            Math.pow(1 + inputs.annualInflation, point.age - inputs.person.currentAge),
      milestones: point.milestones.join(" · "),
      ...Object.fromEntries(
        Object.entries(view.accountBalances).map(([id, value]) => [`account:${id}`, value]),
      ),
      ...Object.fromEntries(
        Object.entries(view.accountContributions).map(([id, value]) => [
          `contribution:${id}`,
          value,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(view.accountSurplusAllocations).map(([id, value]) => [
          `surplusAllocation:${id}`,
          value,
        ]),
      ),
      ...Object.fromEntries(
        Object.entries(view.accountContributionDetails).flatMap(
          ([id, detail]) => [
            [`plannedContribution:${id}`, detail.plannedFromAccount],
            [`actualContribution:${id}`, detail.depositedIntoAccount],
            [`redirectedIn:${id}`, detail.redirectedIn],
            [`redirectedOut:${id}`, detail.redirectedOut],
            [`surplusContribution:${id}`, detail.surplusFundedDeposit],
          ],
        ),
      ),
    };
  });
}

export function buildAnnualLedgerData(
  inputs: ProjectionInputs,
  projection: ProjectionResult,
  mode: DisplayMode,
): AnnualLedgerRow[] {
  return projection.annual.map((point) => {
    const view = point[mode];
    return {
      periodLabel: annualPeriodLabel(inputs, point.calendarYear),
      year: point.calendarYear,
      age: point.age,
      income: view.income.total,
      withdrawals: view.withdrawals.total,
      tax: view.outflows.tax,
      spending: roundCurrency(
        view.outflows.essential + view.outflows.discretionary + view.outflows.oneTime,
      ),
      actualContributions: view.contributions.total,
      surplusFundedContributions: view.contributions.surplusFunded,
      surplusGenerated: view.surplusAllocation.generated,
      surplusReserveRefill: view.surplusAllocation.reserveRefill,
      surplusRetainedAsCash: view.surplusAllocation.retainedAsCash,
      surplusRedirected: view.surplusAllocation.redirected,
      surplusReserveTarget: view.surplusAllocation.reserveTarget,
      positiveCashAvailable:
        view.savingsPolicy.positiveCashAvailable,
      personalPlanAmount: view.savingsPolicy.personalPlanned,
      personalPlanAllowed: view.savingsPolicy.personalAllowed,
      personalPlanUnallocated:
        view.savingsPolicy.personalUnallocated,
      reserveBuildingPlanAmount:
        view.savingsPolicy.reservePlanned,
      reserveBuildingFunded: view.savingsPolicy.reserveFunded,
      reserveCashRetained:
        view.savingsPolicy.reserveRetainedAsCash,
      reservePlanRedirected:
        view.savingsPolicy.reserveRedirected,
      reservePlanUnfunded: view.savingsPolicy.reserveUnfunded,
      workplacePlanned: view.savingsPolicy.workplacePlanned,
      workplaceAllowed: view.savingsPolicy.workplaceAllowed,
      workplaceUnallocated:
        view.savingsPolicy.workplaceUnallocated,
      unplannedCashRetained:
        view.savingsPolicy.unplannedCashRetained,
      totalInvestmentDeposits:
        view.savingsPolicy.totalInvestmentDeposits,
      financialAssets: view.balances.financialAssets,
      milestones: point.milestones.join(" · ") || "—",
    };
  });
}

export type SavingsPolicyPreview = {
  mode: "simple" | "advanced";
  reserveAccounts: string[];
  reserveRefillAccount: string;
  operatingCashAccount: string | null;
  workplacePriority: string;
  workplaceOverflow: string;
  personalOrder: string;
  taxableDestination: string | null;
  taxableDestinationKind: "imported" | "projection-only" | null;
  reserveTransition: string;
  unplannedCash: string;
};

export function buildSavingsPolicyPreview(
  inputs: ProjectionInputs,
): SavingsPolicyPreview {
  const accountLabel = (accountId: string) =>
    inputs.accounts.find((account) => account.id === accountId)?.label ??
    "Unavailable account";
  const reserveAccounts = inputs.surplusAllocation.reserveAccountIds.map(
    accountLabel,
  );
  const reserveRefillAccount = accountLabel(
    inputs.surplusAllocation.reserveRefillAccountId,
  );
  if (inputs.savingsPolicy.mode === "advanced") {
    return {
      mode: "advanced",
      reserveAccounts,
      reserveRefillAccount,
      operatingCashAccount: null,
      workplacePriority: "Advanced route order",
      workplaceOverflow: "Advanced route policy",
      personalOrder: "Advanced configured routes",
      taxableDestination:
        inputs.surplusAllocation.excess.mode === "allocate_to_account"
          ? accountLabel(
              inputs.surplusAllocation.excess.destinationAccountId,
            )
          : null,
      taxableDestinationKind: null,
      reserveTransition: "Advanced surplus policy",
      unplannedCash: "Advanced surplus policy",
    };
  }
  return {
    mode: "simple",
    reserveAccounts,
    reserveRefillAccount,
    operatingCashAccount: accountLabel(
      inputs.savingsPolicy.operatingCashAccountId,
    ),
    workplacePriority:
      "Workplace RRSP gets first claim on global RRSP room",
    workplaceOverflow: "Workplace RRSP overflow is unallocated",
    personalOrder: "Personal TFSA → personal RRSP → taxable",
    taxableDestination: accountLabel(
      inputs.savingsPolicy.taxableAccountId,
    ),
    taxableDestinationKind:
      inputs.savingsPolicy.taxableAccountOrigin === "lunchmoney"
        ? "imported"
        : "projection-only",
    reserveTransition:
      "Reserve-building savings redirect through the personal order after the indexed target",
    unplannedCash:
      "Unplanned positive cash is retained in operating cash and is not swept into investments",
  };
}

export function closestAnnualPoint(
  annual: AnnualProjection[],
  selectedYear: number,
): AnnualProjection | undefined {
  return annual.reduce<AnnualProjection | undefined>(
    (closest, point) =>
      !closest ||
      Math.abs(point.calendarYear - selectedYear) <
        Math.abs(closest.calendarYear - selectedYear)
        ? point
        : closest,
    undefined,
  );
}
