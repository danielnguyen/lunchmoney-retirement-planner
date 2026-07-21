import type { BaselineValue } from "@/src/domain/defaults/types";
import { resolveActiveScenarioWarnings } from "@/src/domain/baseline/scenario-warnings";
import {
  buildAnnualChartData,
  buildAnnualLedgerData,
  buildContributionReconciliation,
  buildBalanceSheetReconciliation,
  buildSavingsPolicyPreview,
  annualPeriodLabel,
  closestAnnualPoint,
  monthlyEmploymentNetCash,
  monthlyInvestmentContributions,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import {
  projectionMonthOffset,
  type FinancialAccountInput,
} from "@/src/domain/projection/types";
import {
  liabilityInterestRateConventionLabel,
} from "@/src/domain/projection/liability-interest";
import type {
  ExplanationContext,
  ExplanationDocument,
  ExplanationSourceType,
  ExplanationStep,
  ExplanationTarget,
} from "./types";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const exactCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

const accountTypeLabels: Record<FinancialAccountInput["type"], string> = {
  cash: "Cash",
  tfsa: "TFSA",
  rrsp_rrif: "RRSP / RRIF",
  non_registered: "Non-registered",
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sameValue(left: number, right: number): boolean {
  return Math.abs(round(left) - round(right)) < 0.001;
}

function sourceType(value?: BaselineValue<unknown>): ExplanationSourceType {
  if (value?.sourceType === "lunchmoney_derived") return "lunchmoney";
  if (value?.sourceType === "local_configuration") return "configuration";
  if (value?.sourceType === "canadian_reference") return "canadian_reference";
  return "projection";
}

function evidence(
  context: ExplanationContext,
  provenanceKey: string,
  activeValue?: number,
  refreshedValue?: number,
): {
  sourceType: ExplanationSourceType;
  sourceDescription?: string;
  effectiveDate?: string;
} {
  const provenance = context.baseline.provenance[provenanceKey];
  if (
    activeValue !== undefined &&
    refreshedValue !== undefined &&
    !sameValue(activeValue, refreshedValue)
  ) {
    return {
      sourceType: "override",
      sourceDescription: `Temporary override; refreshed baseline was ${exactCurrency.format(refreshedValue)}`,
      effectiveDate: context.baseline.dataThrough,
    };
  }
  return {
    sourceType: sourceType(provenance),
    sourceDescription: provenance?.sourceDescription,
    effectiveDate: provenance?.effectiveDate,
  };
}

function inputAssumption(
  context: ExplanationContext,
  label: string,
  value: number,
  baselineValue: number,
  provenanceKey: string,
  format: (input: number) => string,
) {
  const details = evidence(context, provenanceKey, value, baselineValue);
  return {
    label,
    value: details.sourceType === "override"
      ? `${format(value)} active; ${format(baselineValue)} refreshed`
      : format(value),
    ...details,
  };
}

function sourceLabel(type: ExplanationSourceType): string {
  if (type === "lunchmoney") return "Lunch Money";
  if (type === "configuration") return "Local configuration";
  if (type === "canadian_reference") return "Canadian reference";
  if (type === "override") return "Temporary override";
  return "Projection";
}

function employmentPhaseRows(context: ExplanationContext) {
  return context.inputs.person.employmentIncomePhases.map((phase) => {
    const refreshed = context.baseline.projectionInputs.person.employmentIncomePhases.find(
      (item) => item.id === phase.id,
    );
    const provenanceKey =
      `person.employmentIncomePhases.${phase.id}.annualNetCashToday`;
    const amountDetails = evidence(
      context,
      provenanceKey,
      phase.annualNetCashToday,
      refreshed?.annualNetCashToday,
    );
    const growthDetails = evidence(
      context,
      `person.employmentIncomePhases.${phase.id}.annualGrowth`,
      phase.annualGrowth,
      refreshed?.annualGrowth,
    );
    const details =
      amountDetails.sourceType === "override" || growthDetails.sourceType === "override"
        ? {
            sourceType: "override" as const,
            effectiveDate: context.baseline.dataThrough,
          }
        : amountDetails;
    const compatibilityFallback = context.baseline.provenance[
      provenanceKey
    ]?.sourceDescription.includes("normalized into a resolved");
    return {
      phase: phase.label,
      startAge: phase.startAge,
      endAge: phase.endAge,
      annualNetCashToday: phase.annualNetCashToday,
      annualGrowth: percent.format(phase.annualGrowth),
      source: `${sourceLabel(details.sourceType)}${compatibilityFallback ? " · Compatibility fallback" : ""}`,
      effectiveDate: details.effectiveDate ?? context.baseline.dataThrough,
    };
  });
}

function contributionPhaseRows(context: ExplanationContext) {
  return context.inputs.accounts.flatMap((account) =>
    account.contributionPhases.map((phase) => {
      const refreshed = context.baseline.projectionInputs.accounts
        .find((item) => item.id === account.id)
        ?.contributionPhases.find((item) => item.id === phase.id);
      const provenanceKey =
        `accounts.${account.id}.contributionPhases.${phase.id}.monthlyAmountToday`;
      const amountDetails = evidence(
        context,
        provenanceKey,
        phase.monthlyAmountToday,
        refreshed?.monthlyAmountToday,
      );
      const indexingDetails = evidence(
        context,
        `accounts.${account.id}.contributionPhases.${phase.id}.indexingRate`,
        phase.indexingRate,
        refreshed?.indexingRate,
      );
      const details =
        amountDetails.sourceType === "override" ||
        indexingDetails.sourceType === "override"
          ? {
              sourceType: "override" as const,
              effectiveDate: context.baseline.dataThrough,
            }
          : amountDetails;
      const compatibilityFallback = context.baseline.provenance[
        provenanceKey
      ]?.sourceDescription.includes("normalized into a resolved");
      return {
        account: account.label,
        phase: phase.label,
        startAge: phase.startAge,
        endAge: phase.endAge,
        monthlyAmount: phase.monthlyAmountToday,
        funding: phase.funding === "cash" ? "Cash-funded" : "Income-withheld",
        indexing: percent.format(phase.indexingRate),
        source: `${sourceLabel(details.sourceType)}${compatibilityFallback ? " · Compatibility fallback" : ""}`,
        effectiveDate: details.effectiveDate ?? context.baseline.dataThrough,
      };
    }),
  );
}

function longIncomeWarnings(context: ExplanationContext): string[] {
  return resolveActiveScenarioWarnings(context.baseline, context.inputs)
    .filter(
    (warning) => warning.code === "long_live_baseline_income",
    )
    .map((warning) => warning.message);
}

function commonAssumptions(context: ExplanationContext) {
  const baseline = context.baseline.projectionInputs;
  const assumptions = [
    inputAssumption(
      context,
      "Retirement age",
      context.inputs.person.retirementAge,
      baseline.person.retirementAge,
      "person.retirementAge",
      String,
    ),
    inputAssumption(
      context,
      "CPP start age",
      context.inputs.person.cpp.startAge,
      baseline.person.cpp.startAge,
      "person.cpp.startAge",
      String,
    ),
    inputAssumption(
      context,
      "OAS start age",
      context.inputs.person.oas.startAge,
      baseline.person.oas.startAge,
      "person.oas.startAge",
      String,
    ),
    inputAssumption(
      context,
      "Projection end age",
      context.inputs.endAge,
      baseline.endAge,
      "endAge",
      String,
    ),
    inputAssumption(
      context,
      "Inflation",
      context.inputs.annualInflation,
      baseline.annualInflation,
      "annualInflation",
      percent.format,
    ),
    inputAssumption(
      context,
      "Essential monthly spending",
      context.inputs.monthlyEssentialSpendingToday,
      baseline.monthlyEssentialSpendingToday,
      "monthlyEssentialSpendingToday",
      exactCurrency.format,
    ),
    inputAssumption(
      context,
      "Discretionary monthly spending",
      context.inputs.monthlyDiscretionarySpendingToday,
      baseline.monthlyDiscretionarySpendingToday,
      "monthlyDiscretionarySpendingToday",
      exactCurrency.format,
    ),
    inputAssumption(
      context,
      "Simplified retirement tax rate",
      context.inputs.tax.effectiveTaxRate,
      baseline.tax.effectiveTaxRate,
      "tax.effectiveTaxRate",
      percent.format,
    ),
  ];

  for (const account of context.inputs.accounts) {
    const refreshed = baseline.accounts.find((item) => item.id === account.id);
    if (!refreshed) continue;
    assumptions.push(
      inputAssumption(
        context,
        `${account.label} annual return`,
        account.annualReturn,
        refreshed.annualReturn,
        `accounts.${account.id}.annualReturn`,
        percent.format,
      ),
    );
    for (const phase of account.contributionPhases) {
      const refreshedPhase = refreshed.contributionPhases.find(
        (item) => item.id === phase.id,
      );
      assumptions.push(
        inputAssumption(
          context,
          `${account.label} · ${phase.label} monthly contribution`,
          phase.monthlyAmountToday,
          refreshedPhase?.monthlyAmountToday ?? phase.monthlyAmountToday,
          `accounts.${account.id}.contributionPhases.${phase.id}.monthlyAmountToday`,
          exactCurrency.format,
        ),
      );
    }
  }
  for (const phase of context.inputs.person.employmentIncomePhases) {
    const refreshed = baseline.person.employmentIncomePhases.find(
      (item) => item.id === phase.id,
    );
    assumptions.push(
      inputAssumption(
        context,
        `${phase.label} annual net cash`,
        phase.annualNetCashToday,
        refreshed?.annualNetCashToday ?? phase.annualNetCashToday,
        `person.employmentIncomePhases.${phase.id}.annualNetCashToday`,
        exactCurrency.format,
      ),
      inputAssumption(
        context,
        `${phase.label} annual growth`,
        phase.annualGrowth,
        refreshed?.annualGrowth ?? phase.annualGrowth,
        `person.employmentIncomePhases.${phase.id}.annualGrowth`,
        percent.format,
      ),
    );
  }
  const eventsProvenance = context.baseline.provenance.events;
  assumptions.push({
    label: "Future events",
    value: `${context.inputs.events.length} configured`,
    sourceType: sourceType(eventsProvenance),
    sourceDescription: eventsProvenance?.sourceDescription,
    effectiveDate: eventsProvenance?.effectiveDate,
  });
  return assumptions;
}

function period(context: ExplanationContext): string {
  return `${context.inputs.startDate} to ${context.projection.annual.at(-1)?.calendarYear ?? "unavailable"}`;
}

function modeLabel(context: ExplanationContext): string {
  return context.displayMode === "real" ? "Today’s dollars" : "Future dollars";
}

function matched(calculatedValue: number, displayedValue: number) {
  return {
    matched: sameValue(calculatedValue, displayedValue),
    calculatedValue: round(calculatedValue),
    displayedValue: round(displayedValue),
  };
}

function accountSourceLabel(source: "manual" | "plaid" | "cash"): string {
  if (source === "manual") return "Lunch Money manual account";
  if (source === "plaid") return "Lunch Money Plaid account";
  return "Lunch Money cash transactions";
}

function startingFinancialAssetsDocument(context: ExplanationContext): ExplanationDocument {
  const accounts = context.baseline.derived.accountBalances.filter(
    (account) => account.plannerType !== "debt",
  );
  const displayed = startingFinancialAssets(context.baseline.projectionInputs.accounts);
  const calculated = round(accounts.reduce((total, account) => total + account.balance, 0));
  const steps: ExplanationStep[] = accounts.map((account, index) => ({
    label: account.name,
    value: exactCurrency.format(account.balance),
    rawValue: account.balance,
    operation: index === 0 ? "input" : "add",
    sourceType: "lunchmoney",
    sourceDescription: accountSourceLabel(account.source),
    effectiveDate: account.balanceAsOf,
  }));
  steps.push({
    label: "Starting financial assets",
    value: exactCurrency.format(calculated),
    rawValue: calculated,
    operation: "result",
    sourceType: "projection",
  });
  return {
    id: "starting-financial-assets",
    title: "Starting financial assets",
    plainLanguage:
      "Current included cash and investment balances imported from Lunch Money. Debt accounts are excluded from this total.",
    displayedResult: {
      label: "Starting financial assets",
      value: currency.format(displayed),
      period: `Balances as of ${context.baseline.dataThrough}`,
    },
    formula: "Sum of included cash, TFSA, RRSP/RRIF, and non-registered opening balances",
    steps,
    dataSections: [
      {
        title: "Included account balances",
        columns: [
          { key: "account", label: "Account" },
          { key: "plannerType", label: "Planner type" },
          { key: "balance", label: "Imported balance" },
          { key: "balanceAsOf", label: "Balance as of" },
          { key: "source", label: "Source" },
        ],
        rows: accounts.map((account) => ({
          account: account.name,
          plannerType:
            account.plannerType === "debt"
              ? "Liability"
              : accountTypeLabels[account.plannerType],
          balance: account.balance,
          balanceAsOf: account.balanceAsOf,
          source: accountSourceLabel(account.source),
        })),
        initiallyExpanded: true,
      },
    ],
    assumptions: [],
    caveats: [
      "Debt is shown elsewhere in the report but is not added to financial assets.",
      "Balances are point-in-time Lunch Money values and may have different balance-as-of timestamps.",
    ],
    reconciliation: matched(calculated, displayed),
  };
}

function assetsAtRetirementDocument(context: ExplanationContext): ExplanationDocument {
  const retirement = context.projection.retirementSnapshot;
  const balances = retirement.real.balances;
  const calculated = round(
    balances.cash + balances.tfsa + balances.rrspRrif + balances.nonRegistered,
  );
  const result = context.projection.summary.financialAssetsAtRetirementToday;
  const bridge = context.projection.financialAssetsBridge.real;
  const bridgeCalculated =
    bridge.startingFinancialAssets +
    bridge.employmentNetCash +
    bridge.publicBenefitsAndPension +
    bridge.otherInflows +
    bridge.incomeWithheldContributions +
    bridge.investmentReturns -
    bridge.essentialSpending -
    bridge.discretionarySpending -
    bridge.liabilityCashPayments -
    bridge.oneTimeOutflows -
    bridge.taxes;
  const bridgeMatched = sameValue(bridgeCalculated, bridge.endingFinancialAssets);
  const balanceSteps: Array<[string, number]> = [
    ["Cash", balances.cash],
    ["TFSA", balances.tfsa],
    ["RRSP / RRIF", balances.rrspRrif],
    ["Non-registered", balances.nonRegistered],
  ];
  return {
    id: "assets-at-retirement",
    title: "Retirement funding assets",
    plainLanguage:
      "Projected cash and investment balances at the end of the final working month, immediately before the first fully retired month, expressed in today’s dollars.",
    displayedResult: {
      label: "Retirement funding assets",
      value: currency.format(result),
      dollarMode: "real",
      period: `${retirement.calendarDate} · age ${retirement.age}`,
    },
    formula: "Cash + TFSA + RRSP/RRIF + non-registered balances at the retirement snapshot",
    steps: [
      ...balanceSteps.map(([label, value], index): ExplanationStep => ({
        label,
        value: exactCurrency.format(value),
        rawValue: value,
        operation: index === 0 ? "input" : "add",
        sourceType: "projection",
      })),
      {
        label: "Retirement funding assets",
        value: exactCurrency.format(calculated),
        rawValue: calculated,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [
      {
        title: "Retirement snapshot balances",
        columns: [
          { key: "accountType", label: "Account type" },
          { key: "balance", label: "Today’s-dollar balance" },
        ],
        rows: balanceSteps.map(([accountType, balance]) => ({ accountType, balance })),
        initiallyExpanded: true,
      },
      {
        title: "How assets grew from today to retirement",
        description: bridgeMatched
          ? "External cash flows, income-withheld contributions, and actual modelled returns reconcile to the exact retirement snapshot. Cash-funded contributions are internal transfers and do not change total financial assets."
          : "The available bridge evidence does not reconcile, so no success claim is shown.",
        columns: [
          { key: "operation", label: "" },
          { key: "component", label: "Component" },
          { key: "value", label: "Today’s-dollar value" },
          { key: "source", label: "Source" },
        ],
        rows: [
          { operation: "•", component: "Starting financial assets", value: bridge.startingFinancialAssets, source: "Lunch Money" },
          { operation: "+", component: "Employment net cash", value: bridge.employmentNetCash, source: "Projection from phased inputs" },
          { operation: "+", component: "CPP, OAS, and pension", value: bridge.publicBenefitsAndPension, source: "Projection from resolved benefit inputs" },
          { operation: "+", component: "Other inflows", value: bridge.otherInflows, source: "Projection from future events" },
          { operation: "+", component: "Income-withheld contributions", value: bridge.incomeWithheldContributions, source: "Projection from contribution phases" },
          { operation: "+", component: "Investment returns", value: bridge.investmentReturns, source: "Projection" },
          { operation: "−", component: "Essential spending", value: bridge.essentialSpending, source: "Lunch Money baseline / override" },
          { operation: "−", component: "Discretionary spending", value: bridge.discretionarySpending, source: "Lunch Money baseline / override" },
          { operation: "−", component: "Liability cash payments", value: bridge.liabilityCashPayments, source: "Configured liability schedules" },
          { operation: "−", component: "One-time outflows", value: bridge.oneTimeOutflows, source: "Local configuration" },
          { operation: "−", component: "Taxes", value: bridge.taxes, source: "Projection from local assumptions" },
          { operation: "=", component: "Retirement funding assets", value: bridge.endingFinancialAssets, source: "Exact retirement snapshot" },
          ...(bridgeMatched
            ? [{ operation: "✓", component: "Reconciles to displayed value", value: bridge.endingFinancialAssets, source: "Projection" }]
            : []),
        ],
        initiallyExpanded: true,
      },
      {
        title: "Employment income path",
        description: "These are the resolved phases consumed directly by the monthly projection.",
        columns: [
          { key: "phase", label: "Phase" },
          { key: "startAge", label: "Start age" },
          { key: "endAge", label: "End age" },
          { key: "annualNetCashToday", label: "Annual net cash (today’s dollars)" },
          { key: "annualGrowth", label: "Annual growth" },
          { key: "source", label: "Source" },
          { key: "effectiveDate", label: "Effective date" },
        ],
        rows: employmentPhaseRows(context),
        initiallyExpanded: true,
      },
      {
        title: "Contribution path",
        description: "Each row is a resolved account phase used directly by the monthly projection.",
        columns: [
          { key: "account", label: "Account" },
          { key: "phase", label: "Phase" },
          { key: "startAge", label: "Start age" },
          { key: "endAge", label: "End age" },
          { key: "monthlyAmount", label: "Monthly amount" },
          { key: "funding", label: "Funding" },
          { key: "indexing", label: "Indexing" },
          { key: "source", label: "Source" },
          { key: "effectiveDate", label: "Effective date" },
        ],
        rows: contributionPhaseRows(context),
        initiallyExpanded: true,
      },
      {
        title: "Future events used by the projection",
        columns: [
          { key: "label", label: "Event" },
          { key: "year", label: "Year" },
          { key: "month", label: "Month" },
          { key: "direction", label: "Direction" },
          { key: "amount", label: "Today’s-dollar amount" },
        ],
        rows: context.inputs.events.map((event) => ({
          label: event.label,
          year: event.calendarYear,
          month: event.month,
          direction: event.direction,
          amount: event.amountToday,
        })),
      },
    ],
    assumptions: [
      {
        label: "Starting financial assets",
        value: exactCurrency.format(startingFinancialAssets(context.baseline.projectionInputs.accounts)),
        sourceType: "lunchmoney",
        sourceDescription: "Included opening balances imported from Lunch Money",
        effectiveDate: context.baseline.dataThrough,
      },
      ...commonAssumptions(context),
    ],
    caveats: [
      "This card always uses today’s dollars, even when the charts are showing future dollars.",
      "The retirement snapshot is the end of the final working month, not the following December snapshot.",
      "Cash-funded contributions move money between financial accounts and therefore do not appear as an external inflow or outflow in the total-assets bridge.",
      ...longIncomeWarnings(context),
      "This is a deterministic projection, not a guarantee of future returns or balances.",
    ],
    reconciliation: {
      matched: sameValue(calculated, result) && bridgeMatched,
      calculatedValue: round(bridgeCalculated),
      displayedValue: round(result),
    },
  };
}

function annualSnapshotLabel(context: ExplanationContext, year: number): string {
  return buildAnnualLedgerData(context.inputs, context.projection, context.displayMode)
    .find((row) => row.year === year)?.periodLabel ?? String(year);
}

function goalDocument(context: ExplanationContext): ExplanationDocument {
  const displayed = context.projection.summary.retirementGoalToday;
  const goalEvidence = evidence(
    context,
    "retirementGoalToday",
    context.inputs.retirementGoalToday,
    context.baseline.projectionInputs.retirementGoalToday,
  );
  return {
    id: "retirement-goal",
    title: "Goal",
    plainLanguage:
      "The financial-asset target used to compare the projected retirement snapshot with the amount you want available.",
    displayedResult: {
      label: "Retirement goal",
      value: currency.format(displayed),
      dollarMode: "real",
    },
    formula: "Active retirement-goal input",
    steps: [
      ...(goalEvidence.sourceType === "override"
        ? [{
            label: "Refreshed YAML goal",
            value: exactCurrency.format(context.baseline.projectionInputs.retirementGoalToday),
            rawValue: context.baseline.projectionInputs.retirementGoalToday,
            operation: "input" as const,
            sourceType: "configuration" as const,
          }]
        : []),
      {
        label: "Goal used by projection",
        value: exactCurrency.format(displayed),
        rawValue: displayed,
        operation: "result",
        ...goalEvidence,
      },
    ],
    dataSections: [],
    assumptions: [],
    caveats: [
      "The goal comparison includes financial assets only.",
      "The primary residence is included in total net worth but is not available for retirement withdrawals or the retirement goal.",
    ],
    reconciliation: matched(context.inputs.retirementGoalToday, displayed),
  };
}

function goalGapDocument(context: ExplanationContext): ExplanationDocument {
  const assets = context.projection.summary.financialAssetsAtRetirementToday;
  const goal = context.projection.summary.retirementGoalToday;
  const calculated = round(assets - goal);
  const displayed = context.projection.summary.goalGapToday;
  return {
    id: "goal-gap",
    title: "Goal gap",
    plainLanguage:
      displayed >= 0
        ? "Projected financial assets at retirement are above the retirement goal by this amount."
        : "Projected financial assets at retirement are below the retirement goal by this amount.",
    displayedResult: {
      label: "Goal gap",
      value: currency.format(displayed),
      dollarMode: "real",
    },
    formula: "Retirement funding assets − retirement goal = goal gap",
    steps: [
      {
        label: "Retirement funding assets",
        value: exactCurrency.format(assets),
        rawValue: assets,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Retirement goal",
        value: exactCurrency.format(goal),
        rawValue: goal,
        operation: "subtract",
        ...evidence(
          context,
          "retirementGoalToday",
          context.inputs.retirementGoalToday,
          context.baseline.projectionInputs.retirementGoalToday,
        ),
      },
      {
        label: "Goal gap",
        value: exactCurrency.format(calculated),
        rawValue: calculated,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [],
    assumptions: [],
    caveats: [
      "A positive gap is above the goal; a negative gap is below it.",
      "Both values are expressed in today’s dollars and include financial assets only.",
    ],
    reconciliation: matched(calculated, displayed),
  };
}

function durationDocument(context: ExplanationContext): ExplanationDocument {
  const depletionAge = context.projection.summary.financialAssetsDepletionAge;
  const displayed = depletionAge === null
    ? `Past age ${context.inputs.endAge}`
    : `To age ${depletionAge}`;
  const unmetSpending = context.projection.annual.some(
    (point) =>
      point.real.outflows.unmetSpending > 0 || point.nominal.outflows.unmetSpending > 0,
  );
  return {
    id: "financial-assets-duration",
    title: "Financial assets duration",
    plainLanguage:
      depletionAge === null
        ? `Financial assets remain above zero through the configured projection end age of ${context.inputs.endAge}.`
        : `Financial assets first reach zero near age ${depletionAge} in this scenario.`,
    displayedResult: {
      label: "Financial assets",
      value: displayed,
      period: period(context),
    },
    formula: "First projected month when combined financial assets are at or below $0.01",
    steps: [
      {
        label: "Projection end age",
        value: String(context.inputs.endAge),
        rawValue: context.inputs.endAge,
        operation: "input",
        ...evidence(
          context,
          "endAge",
          context.inputs.endAge,
          context.baseline.projectionInputs.endAge,
        ),
      },
      {
        label: "First depletion age",
        value: depletionAge === null ? "None in projection" : String(depletionAge),
        ...(depletionAge === null ? {} : { rawValue: depletionAge }),
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Ending financial assets",
        value: exactCurrency.format(context.projection.summary.endingFinancialAssetsToday),
        rawValue: context.projection.summary.endingFinancialAssetsToday,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Unmet spending occurred",
        value: unmetSpending ? "Yes" : "No",
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [],
    assumptions: commonAssumptions(context),
    caveats: [
      "Past age means the model did not observe depletion before the configured end age; it does not mean assets last forever.",
      ...longIncomeWarnings(context),
      "Deterministic results are not a guarantee and do not model market-sequence uncertainty.",
    ],
  };
}

const auditColumns = [
  { key: "categoryName", label: "Category" },
  { key: "accountName", label: "Account" },
  { key: "transactionCount", label: "Transactions" },
  { key: "trailingTotal", label: "Trailing total" },
  { key: "monthlyAverage", label: "Monthly average" },
];

function activeContributionTotal(context: ExplanationContext): number {
  return monthlyInvestmentContributions(context.inputs);
}

function baselineMetricDocument(
  context: ExplanationContext,
  target:
    | "baseline-income"
    | "baseline-essential"
    | "baseline-discretionary"
    | "baseline-contributions"
    | "baseline-recurring",
): ExplanationDocument {
  const months = context.baseline.transactionWindow.trailingMonths;
  const windowDescription =
    `${context.baseline.transactionWindow.startDate} to ${context.baseline.transactionWindow.endDate}`;

  if (target === "baseline-recurring") {
    const audit = context.baseline.cashFlowAudit.recurringExpenses;
    const calculated = round(audit.items.reduce((total, item) => total + item.monthlyAmount, 0));
    return {
      id: target,
      title: "Recurring expenses",
      plainLanguage:
        "Reviewed recurring essential and discretionary Lunch Money items normalized to monthly amounts.",
      displayedResult: {
        label: "Recurring expenses",
        value: currency.format(audit.monthlyTotal),
        period: `Reviewed as of ${context.baseline.dataThrough}`,
      },
      formula: "Sum of normalized monthly amounts for reviewed recurring items",
      steps: [
        {
          label: "Trailing transaction total",
          value: "Not applicable; recurring items are normalized schedules",
          operation: "input",
          sourceType: "lunchmoney",
        },
        {
          label: "Configured trailing window",
          value: `${months} months`,
          rawValue: months,
          operation: "input",
          sourceType: "configuration",
        },
        {
          label: "Reviewed recurring items",
          value: String(audit.count),
          rawValue: audit.count,
          operation: "input",
          sourceType: "lunchmoney",
        },
        {
          label: "Monthly recurring total",
          value: exactCurrency.format(calculated),
          rawValue: calculated,
          operation: "result",
          sourceType: "lunchmoney",
        },
      ],
      dataSections: [
        {
          title: "Recurring-item audit",
          columns: [
            { key: "description", label: "Description" },
            { key: "classification", label: "Classification" },
            { key: "accountName", label: "Account" },
            { key: "categoryName", label: "Category" },
            { key: "monthlyAmount", label: "Monthly amount" },
          ],
          rows: audit.items,
          initiallyExpanded: true,
        },
      ],
      assumptions: [
        {
          label: "Recurring schedules and amounts",
          value: "Reviewed Lunch Money recurring items",
          sourceType: "lunchmoney",
        },
        {
          label: "Essential/discretionary classification",
          value: "Planner category mappings",
          sourceType: "configuration",
        },
      ],
      caveats: [
        "Suggested or unreviewed recurring items are excluded.",
        "Recurring items are audit context and are not added a second time to transaction-derived spending.",
      ],
      reconciliation: matched(calculated, audit.monthlyTotal),
    };
  }

  if (target === "baseline-contributions") {
    const audit = context.baseline.cashFlowAudit.investmentContributions;
    const displayed = activeContributionTotal(context);
    const activeRows = context.inputs.accounts.flatMap((account) => {
      const phase = account.contributionPhases.find(
        (item) =>
          context.inputs.person.currentAge >= item.startAge &&
          context.inputs.person.currentAge < item.endAge,
      );
      if (!phase) return [];
      const refreshedPhase = context.baseline.projectionInputs.accounts
        .find((item) => item.id === account.id)
        ?.contributionPhases.find((item) => item.id === phase.id);
      const details = evidence(
        context,
        `accounts.${account.id}.contributionPhases.${phase.id}.monthlyAmountToday`,
        phase.monthlyAmountToday,
        refreshedPhase?.monthlyAmountToday,
      );
      const accountAudit = audit.accounts.find((item) => item.accountId === account.id);
      return [{
        account: account.label,
        phase: phase.label,
        refreshedMonthlyAverage:
          refreshedPhase?.monthlyAmountToday ?? accountAudit?.monthlyAverage ?? 0,
        activeMonthlyAverage: phase.monthlyAmountToday,
        funding: phase.funding === "cash" ? "Cash-funded" : "Income-withheld",
        source: sourceLabel(details.sourceType),
      }];
    });
    const calculated = round(
      activeRows.reduce((total, row) => total + Number(row.activeMonthlyAverage), 0),
    );
    return {
      id: target,
      title: "Investment contributions",
      plainLanguage:
        "Monthly additions to included investment accounts. Transaction-derived and manually configured contributions are kept distinct.",
      displayedResult: {
        label: "Investment contributions",
        value: currency.format(displayed),
        period: windowDescription,
      },
      formula: "Sum of active monthly contribution values for included investment accounts",
      steps: [
        {
          label: "Resolved trailing-window equivalent",
          value: exactCurrency.format(audit.trailingTotal),
          rawValue: audit.trailingTotal,
          operation: "input",
          sourceType: "projection",
          sourceDescription:
            "Transaction-derived totals plus configured monthly amounts multiplied by the configured window",
        },
        {
          label: "Mapped contribution transactions",
          value: String(audit.transactionCount),
          rawValue: audit.transactionCount,
          operation: "input",
          sourceType: "lunchmoney",
        },
        {
          label: "Configured trailing window",
          value: `${months} months`,
          rawValue: months,
          operation: "input",
          sourceType: "configuration",
        },
        ...activeRows.map((row, index): ExplanationStep => ({
          label: row.account,
          value: exactCurrency.format(Number(row.activeMonthlyAverage)),
          rawValue: Number(row.activeMonthlyAverage),
          operation: index === 0 ? "input" : "add",
          sourceType:
            row.source === "Temporary override"
              ? "override"
              : row.source === "Local configuration"
                ? "configuration"
                : "lunchmoney",
          sourceDescription: `${row.source}; ${row.funding}`,
          effectiveDate: context.baseline.dataThrough,
        })),
        {
          label: "Active monthly contributions",
          value: exactCurrency.format(calculated),
          rawValue: calculated,
          operation: "result",
          sourceType: "projection",
        },
      ],
      dataSections: [
        {
          title: "Contribution account audit",
          columns: [
            { key: "account", label: "Account" },
            { key: "phase", label: "Active phase" },
            { key: "refreshedMonthlyAverage", label: "Refreshed monthly" },
            { key: "activeMonthlyAverage", label: "Active monthly" },
            { key: "funding", label: "Funding" },
            { key: "source", label: "Source" },
          ],
          rows: activeRows,
          initiallyExpanded: true,
        },
        {
          title: "Full contribution path",
          description: "Current and future resolved contribution phases consumed by the projection.",
          columns: [
            { key: "account", label: "Account" },
            { key: "phase", label: "Phase" },
            { key: "startAge", label: "Start age" },
            { key: "endAge", label: "End age" },
            { key: "monthlyAmount", label: "Monthly amount" },
            { key: "funding", label: "Funding" },
            { key: "indexing", label: "Indexing" },
            { key: "source", label: "Source" },
          ],
          rows: contributionPhaseRows(context),
        },
      ],
      assumptions: [],
      caveats: [
        `${audit.transactionCount} mapped contribution transactions were found in the ${months}-month window.`,
        "Income-withheld contributions increase investment balances but do not reduce deposited cash a second time.",
        "Cash-funded contributions increase investment balances and appear as projected cash outflows.",
      ],
      reconciliation: matched(calculated, displayed),
    };
  }

  const currentEmploymentPhase = context.inputs.person.employmentIncomePhases.find(
    (phase) =>
      context.inputs.person.currentAge >= phase.startAge &&
      context.inputs.person.currentAge < phase.endAge,
  );
  const definitions = {
    "baseline-income": {
      title: "Monthly employment income",
      audit: context.baseline.cashFlowAudit.income,
      displayed: monthlyEmploymentNetCash(context.inputs),
      refreshed: context.baseline.cashFlowAudit.income.monthlyAverage,
      provenanceKey: currentEmploymentPhase
        ? `person.employmentIncomePhases.${currentEmploymentPhase.id}.annualNetCashToday`
        : "person.employmentIncomePhases",
      plainLanguage:
        "The current Lunch Money-derived net employment cash average. Future projection income may change across the configured employment phases shown below.",
      caveat: "Employment income is already net deposited cash, so the projection does not apply the simplified tax a second time.",
    },
    "baseline-essential": {
      title: "Essential spending",
      audit: context.baseline.cashFlowAudit.essentialSpending,
      displayed: context.inputs.monthlyEssentialSpendingToday,
      refreshed: context.baseline.cashFlowAudit.essentialSpending.monthlyAverage,
      provenanceKey: "monthlyEssentialSpendingToday",
      plainLanguage:
        "Required spending from categories mapped as essential, averaged across the trailing Lunch Money window.",
      caveat: "Refunds and reversals reduce the trailing spending total.",
    },
    "baseline-discretionary": {
      title: "Discretionary spending",
      audit: context.baseline.cashFlowAudit.discretionarySpending,
      displayed: context.inputs.monthlyDiscretionarySpendingToday,
      refreshed: context.baseline.cashFlowAudit.discretionarySpending.monthlyAverage,
      provenanceKey: "monthlyDiscretionarySpendingToday",
      plainLanguage:
        "Optional spending from categories mapped as discretionary, averaged across the trailing Lunch Money window.",
      caveat: "Transfers, excluded categories, and excluded accounts are not counted.",
    },
  } as const;
  const definition = definitions[target];
  const activeEvidence = evidence(
    context,
    definition.provenanceKey,
    definition.displayed,
    definition.refreshed,
  );
  const calculatedBaseline = round(definition.audit.trailingTotal / months);
  const calculatedActive = activeEvidence.sourceType === "override"
    ? round(definition.displayed)
    : calculatedBaseline;
  return {
    id: target,
    title: definition.title,
    plainLanguage: definition.plainLanguage,
    displayedResult: {
      label: definition.title,
      value: currency.format(definition.displayed),
      period: windowDescription,
    },
    formula:
      activeEvidence.sourceType === "override"
        ? "Temporary override replaces trailing total ÷ trailing months"
        : "Trailing mapped transaction total ÷ trailing months",
    steps: [
      {
        label: "Trailing transaction total",
        value: exactCurrency.format(definition.audit.trailingTotal),
        rawValue: definition.audit.trailingTotal,
        operation: "input",
        sourceType: "lunchmoney",
        effectiveDate: context.baseline.dataThrough,
      },
      {
        label: "Trailing months",
        value: String(months),
        rawValue: months,
        operation: "input",
        sourceType: "configuration",
        sourceDescription: "Configured transaction window",
      },
      {
        label: "Refreshed monthly average",
        value: exactCurrency.format(calculatedBaseline),
        rawValue: calculatedBaseline,
        operation: "result",
        sourceType: "lunchmoney",
      },
      ...(activeEvidence.sourceType === "override"
        ? [{
            label: "Active temporary override",
            value: exactCurrency.format(definition.displayed),
            rawValue: definition.displayed,
            operation: "result" as const,
            ...activeEvidence,
          }]
        : []),
    ],
    dataSections: [
      {
        title: "Category and account audit",
        description: `${definition.audit.transactionCount} mapped transactions in the configured window.`,
        columns: auditColumns,
        rows: definition.audit.breakdown,
        initiallyExpanded: true,
      },
      ...(target === "baseline-income"
        ? [{
            title: "Employment income path",
            description: "The current row is a trailing Lunch Money baseline; these resolved phases define the full future scenario.",
            columns: [
              { key: "phase", label: "Phase" },
              { key: "startAge", label: "Start age" },
              { key: "endAge", label: "End age" },
              { key: "annualNetCashToday", label: "Annual net cash" },
              { key: "annualGrowth", label: "Annual growth" },
              { key: "source", label: "Source" },
              { key: "effectiveDate", label: "Effective date" },
            ],
            rows: employmentPhaseRows(context),
          }]
        : []),
    ],
    assumptions: [],
    caveats: [
      definition.caveat,
      "The final audit row may absorb a one-cent rounding remainder so row averages reconcile to the model’s monthly value.",
      ...(target === "baseline-income" ? longIncomeWarnings(context) : []),
    ],
    reconciliation: matched(calculatedActive, definition.displayed),
  };
}

function chartCaveats(context: ExplanationContext): string[] {
  return [
    `The active chart view is ${modeLabel(context)}.`,
    "The first and final rows may be partial calendar years because the projection starts in the live data-through month and ends at the configured age.",
    "The chart and this table consume the same annual projection result.",
  ];
}

function spendingChartDocument(context: ExplanationContext): ExplanationDocument {
  const rows = buildAnnualChartData(context.inputs, context.projection, context.displayMode);
  return {
    id: "annual-spending",
    title: "Annual spending projection",
    plainLanguage:
      "The live Lunch Money essential and discretionary monthly baselines are adjusted by the active lifestyle phase, then indexed with inflation for each projected month.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Live monthly baseline × active lifestyle multiplier × inflation factor",
    steps: [
      {
        label: "Active essential monthly spending",
        value: exactCurrency.format(context.inputs.monthlyEssentialSpendingToday),
        rawValue: context.inputs.monthlyEssentialSpendingToday,
        operation: "input",
        ...evidence(
          context,
          "monthlyEssentialSpendingToday",
          context.inputs.monthlyEssentialSpendingToday,
          context.baseline.projectionInputs.monthlyEssentialSpendingToday,
        ),
      },
      {
        label: "Active discretionary monthly spending",
        value: exactCurrency.format(context.inputs.monthlyDiscretionarySpendingToday),
        rawValue: context.inputs.monthlyDiscretionarySpendingToday,
        operation: "input",
        ...evidence(
          context,
          "monthlyDiscretionarySpendingToday",
          context.inputs.monthlyDiscretionarySpendingToday,
          context.baseline.projectionInputs.monthlyDiscretionarySpendingToday,
        ),
      },
      {
        label: "Resolved lifestyle phases",
        value: String(context.inputs.spendingPhases.length),
        operation: "input",
        sourceType: "configuration",
        sourceDescription:
          context.inputs.spendingPhases[0]?.source === "compatibility_default"
            ? "Backward-compatible full-projection normalization"
            : "Explicit spendingPhases configuration",
      },
    ],
    dataSections: [
      {
        title: "Lifestyle spending phases",
        description:
          "Multipliers apply independently to the observed live baselines. A multiplier of 1 keeps the baseline; 0.60 uses 60% of it.",
        columns: [
          { key: "label", label: "Phase" },
          { key: "startAge", label: "Start age (included)" },
          { key: "endAge", label: "End age (excluded)" },
          { key: "essentialMultiplier", label: "Essential multiplier" },
          {
            key: "discretionaryMultiplier",
            label: "Discretionary multiplier",
          },
          { key: "source", label: "Source" },
        ],
        rows: context.inputs.spendingPhases.map((phase) => ({
          label: phase.label,
          startAge: phase.startAge,
          endAge: phase.endAge,
          essentialMultiplier: phase.essentialMultiplier,
          discretionaryMultiplier: phase.discretionaryMultiplier,
          source:
            phase.source === "explicit_configuration"
              ? "Configured lifestyle phase"
              : "Compatibility default (unchanged baseline)",
        })),
        initiallyExpanded: true,
      },
      {
        title: "Data behind this chart",
        description: "These are the exact essential and discretionary series supplied to the chart.",
        columns: [
          { key: "periodLabel", label: "Period" },
          { key: "age", label: "Age" },
          { key: "essential", label: "Essential" },
          { key: "discretionary", label: "Discretionary" },
        ],
        rows: rows.map(({ periodLabel, age, essential, discretionary }) => ({
          periodLabel,
          age,
          essential,
          discretionary,
        })),
        initiallyExpanded: true,
      },
      {
        title: "Essential transaction audit",
        description: `${context.baseline.transactionWindow.startDate} to ${context.baseline.transactionWindow.endDate}`,
        columns: auditColumns,
        rows: context.baseline.cashFlowAudit.essentialSpending.breakdown,
      },
      {
        title: "Discretionary transaction audit",
        description: `${context.baseline.transactionWindow.startDate} to ${context.baseline.transactionWindow.endDate}`,
        columns: auditColumns,
        rows: context.baseline.cashFlowAudit.discretionarySpending.breakdown,
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "Essential and discretionary labels come from local category mappings; the transaction amounts come from Lunch Money.",
      "Lifestyle phases are independent of employment-income phases and do not infer retirement or other life events.",
      "The global inflation assumption continues to index both categories after applying each phase multiplier.",
      `Refreshed monthly averages use ${context.baseline.transactionWindow.trailingMonths} trailing months.`,
      ...chartCaveats(context),
    ],
  };
}

function fundingChartDocument(context: ExplanationContext): ExplanationDocument {
  const rows = buildAnnualChartData(context.inputs, context.projection, context.displayMode);
  return {
    id: "annual-funding",
    title: "How each year is funded",
    plainLanguage:
      "Income arrives first; any remaining cash shortfall is filled from accounts in configured withdrawal-priority order.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Employment + CPP + OAS + pension + account withdrawals; simplified retirement tax is shown as the line",
    steps: context.inputs.accounts
      .sort((left, right) => left.withdrawalPriority - right.withdrawalPriority)
      .map((account): ExplanationStep => ({
        label: `${account.withdrawalPriority}. ${account.label}`,
        value: accountTypeLabels[account.type],
        operation: "input",
        sourceType: "configuration",
        sourceDescription: "Withdrawal priority from local planner configuration",
      })),
    dataSections: [
      {
        title: "Series calculations",
        columns: [
          { key: "series", label: "Series" },
          { key: "calculation", label: "How it is calculated" },
        ],
        rows: [
          {
            series: "Employment",
            calculation:
              "Net deposited employment cash from the phase active in each working month. Today-dollar employment amounts and related RRSP room-generation inputs grow from the projection start, not from the phase start.",
          },
          {
            series: "CPP",
            calculation:
              "Resolved amount at age 65 × the exact claim-age factor, paid from the configured boundary and nominally indexed.",
          },
          {
            series: "OAS",
            calculation:
              "Resolved full amount × explicit eligibility × delayed-claim factor, with nominal indexing and the 10% increase beginning after age 75. Recovery tax is shown in the tax line.",
          },
          {
            series: "Pension",
            calculation:
              "Configured pension income after its start age, prorated for the period and indexed.",
          },
          {
            series: "Cash / non-registered / RRSP-RRIF / TFSA",
            calculation:
              "Withdrawals needed after income, processed in configured account-priority order.",
          },
          {
            series: "Simplified retirement tax",
            calculation:
              "Configured effective rate applied to gross retirement income and taxable RRSP/RRIF withdrawals.",
          },
        ],
      },
      {
        title: "Data behind this chart",
        description: "These are the exact stacked funding series and tax line supplied to the chart.",
        columns: [
          { key: "periodLabel", label: "Period" },
          { key: "employmentPhase", label: "Employment phase" },
          { key: "employmentNetCash", label: "Employment" },
          { key: "cpp", label: "CPP" },
          { key: "oas", label: "OAS" },
          { key: "pension", label: "Pension" },
          { key: "cashWithdrawal", label: "Cash" },
          { key: "nonRegisteredWithdrawal", label: "Non-registered" },
          { key: "rrspWithdrawal", label: "RRSP / RRIF" },
          { key: "tfsaWithdrawal", label: "TFSA" },
          { key: "tax", label: "Simplified tax" },
        ],
        rows: rows.map((row) => ({
          periodLabel: row.periodLabel,
          employmentPhase: row.employmentPhase || "Retired",
          employmentNetCash: row.employmentNetCash,
          cpp: row.cpp,
          oas: row.oas,
          pension: row.pension,
          cashWithdrawal: row.cashWithdrawal,
          nonRegisteredWithdrawal: row.nonRegisteredWithdrawal,
          rrspWithdrawal: row.rrspWithdrawal,
          tfsaWithdrawal: row.tfsaWithdrawal,
          tax: row.tax,
        })),
        initiallyExpanded: true,
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "A labelled annual period can contain an employment transition; the phase column preserves the active labels in order.",
      "Employment disappears after the exact retirement boundary because the model stops net employment cash after the final working month.",
      "CPP and OAS begin at their configured start ages using the same calculation summaries shown in their dedicated explanations.",
      "The tax line applies the simplified rate to gross retirement income and taxable RRSP/RRIF withdrawals, not to net employment deposits.",
      ...chartCaveats(context),
    ],
  };
}

function outflowChartDocument(context: ExplanationContext): ExplanationDocument {
  const rows = buildAnnualChartData(context.inputs, context.projection, context.displayMode);
  const contributionAccounts = context.inputs.accounts.filter(
    (account) => ["tfsa", "rrsp_rrif", "non_registered"].includes(account.type),
  );
  const activeContributionPhases = contributionAccounts.flatMap((account) => {
    const phase = account.contributionPhases.find(
      (item) =>
        context.inputs.person.currentAge >= item.startAge &&
        context.inputs.person.currentAge < item.endAge &&
        item.monthlyAmountToday > 0,
    );
    return phase ? [{ account, phase }] : [];
  });
  return {
    id: "annual-outflows",
    title: "Spending, liability payments, taxes, and contributions",
    plainLanguage:
      "Cash leaving the projected budget for non-debt spending, configured liability payments, one-time events, simplified retirement tax, and cash-funded contributions.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Essential + discretionary + liability cash payments + one-time events + simplified tax + cash-funded contributions",
    steps: [
      {
        label: "Cash-funded contribution accounts",
        value: String(
          activeContributionPhases.filter(
            ({ phase }) => phase.funding === "cash",
          ).length,
        ),
        operation: "input",
        sourceType: "configuration",
      },
      {
        label: "Income-withheld contribution accounts",
        value: String(
          activeContributionPhases.filter(
            ({ phase }) => phase.funding === "income_withheld",
          ).length,
        ),
        operation: "input",
        sourceType: "configuration",
      },
    ],
    dataSections: [
      {
        title: "Series calculations",
        columns: [
          { key: "series", label: "Series" },
          { key: "calculation", label: "How it is calculated" },
        ],
        rows: [
          {
            series: "Essential spending",
            calculation:
              "Active monthly essential spending multiplied by months in the period and indexed in future dollars.",
          },
          {
            series: "Discretionary spending",
            calculation:
              "Active monthly discretionary spending multiplied by months in the period and indexed in future dollars.",
          },
          {
            series: "One-time events",
            calculation:
              "Configured outflow events assigned to the period containing their date.",
          },
          {
            series: "Liability payments",
            calculation:
              "Regular principal-and-interest payments plus dated lump-sum principal from the resolved liability schedules.",
          },
          {
            series: "Simplified retirement tax",
            calculation:
              "Tax calculated on retirement income and taxable RRSP/RRIF withdrawals for the period.",
          },
          {
            series: "Cash-funded contributions",
            calculation:
              "Cash-funded monthly contributions prorated for the period; income-withheld contributions are excluded.",
          },
        ],
      },
      {
        title: "Data behind this chart",
        description: "These are the exact stacked outflow series supplied to the chart.",
        columns: [
          { key: "periodLabel", label: "Period" },
          { key: "contributionPhases", label: "Active contribution phases" },
          { key: "essential", label: "Essential" },
          { key: "discretionary", label: "Discretionary" },
          { key: "liabilityCashPayment", label: "Liability payments" },
          { key: "oneTime", label: "One-time events" },
          { key: "tax", label: "Simplified tax" },
          { key: "contributions", label: "Cash-funded contributions" },
        ],
        rows: rows.map(
          ({
            periodLabel,
            contributionPhases,
            essential,
            discretionary,
            liabilityCashPayment,
            oneTime,
            tax,
            contributions,
          }) => ({
            periodLabel,
            contributionPhases: contributionPhases || "No active contribution phase",
            essential,
            discretionary,
            liabilityCashPayment,
            oneTime,
            tax,
            contributions,
          }),
        ),
        initiallyExpanded: true,
      },
      {
        title: "Contribution phase amounts by period",
        description: "Exact account-level contributions produced by the active phase in each annual period.",
        columns: [
          { key: "periodLabel", label: "Period" },
          ...contributionAccounts.map((account, index) => ({
            key: `account${index}`,
            label: account.label,
          })),
        ],
        rows: rows.map((row) => ({
          periodLabel: row.periodLabel,
          ...Object.fromEntries(
            contributionAccounts.map((account, index) => [
              `account${index}`,
              row[`contribution:${account.id}`] ?? 0,
            ]),
          ),
        })),
      },
      {
        title: "Active contribution funding",
        description: "Only investment accounts with a positive contribution in the phase active at the baseline age are included.",
        columns: [
          { key: "account", label: "Account" },
          { key: "phase", label: "Active phase" },
          { key: "monthlyContribution", label: "Active monthly contribution" },
          { key: "funding", label: "Funding" },
        ],
        rows: activeContributionPhases.map(({ account, phase }) => ({
          account: account.label,
          phase: phase.label,
          monthlyContribution: phase.monthlyAmountToday,
          funding:
            phase.funding === "income_withheld" ? "Income-withheld" : "Cash-funded",
        })),
      },
      {
        title: "Resolved contribution path",
        columns: [
          { key: "account", label: "Account" },
          { key: "phase", label: "Phase" },
          { key: "startAge", label: "Start age" },
          { key: "endAge", label: "End age" },
          { key: "monthlyAmount", label: "Monthly amount" },
          { key: "funding", label: "Funding" },
          { key: "indexing", label: "Indexing" },
          { key: "source", label: "Source" },
        ],
        rows: contributionPhaseRows(context),
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "The full liability payment reduces cash. Principal is not consumption because it also reduces the liability; interest reduces net worth.",
      "Income-withheld contributions increase investment balances but do not appear as cash outflows because they were withheld before income reached Lunch Money.",
      "Only cash-funded contributions appear in the contribution series.",
      ...chartCaveats(context),
    ],
  };
}

function accountDetailsRows(context: ExplanationContext) {
  return context.inputs.accounts.map((account) => {
    const baselineAccount = context.baseline.derived.accountBalances.find(
      (item) => item.id === account.id,
    );
    const activeContributionPhase = account.contributionPhases.find(
      (phase) =>
        context.inputs.person.currentAge >= phase.startAge &&
        context.inputs.person.currentAge < phase.endAge,
    );
    return {
      account: account.label,
      origin:
        account.origin === "lunchmoney"
          ? "Imported Lunch Money account"
          : "Projection-only configuration",
      plannerType: accountTypeLabels[account.type],
      financialAssetsTreatment: "Included",
      openingBalance: account.openingBalance,
      openingBalanceSource:
        account.origin === "lunchmoney"
          ? `Imported balance through ${baselineAccount?.balanceAsOf ?? context.baseline.dataThrough}`
          : "Fixed at zero through projection configuration; not imported",
      balanceDate:
        account.origin === "lunchmoney"
          ? baselineAccount?.balanceAsOf ?? context.baseline.dataThrough
          : "Not applicable",
      annualReturn: percent.format(account.annualReturn),
      monthlyContribution: activeContributionPhase?.monthlyAmountToday ?? 0,
      contributionFunding:
        activeContributionPhase?.funding === "income_withheld"
          ? "Income-withheld"
          : activeContributionPhase?.funding === "cash"
            ? "Cash-funded"
            : "None",
      contributionIndexing: activeContributionPhase
        ? percent.format(activeContributionPhase.indexingRate)
        : "None",
      withdrawalPriority: account.withdrawalPriority,
      allocation:
        `${percent.format(account.allocation.cash)} cash · ` +
        `${percent.format(account.allocation.fixedIncome)} fixed income · ` +
        `${percent.format(account.allocation.equity)} equity`,
    };
  });
}

function burndownDocument(context: ExplanationContext): ExplanationDocument {
  const chartRows = buildAnnualChartData(context.inputs, context.projection, context.displayMode);
  const accounts = context.inputs.accounts;
  const accountColumns = accounts.map((account, index) => ({
    key: `account${index}`,
    label: account.label,
  }));
  return {
    id: "account-burndown",
    title: "Account-level burndown",
    plainLanguage:
      "Projected end-of-period balances for every included financial account, plus total financial assets and the goal line.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Each ending account balance = previous balance + return + contributions − withdrawals; financial assets = sum of cash and investment balances",
    steps: accounts.map((account): ExplanationStep => ({
      label: account.label,
      value: exactCurrency.format(account.openingBalance),
      rawValue: account.openingBalance,
      operation: "input",
      sourceType: "lunchmoney",
      effectiveDate:
        context.baseline.derived.accountBalances.find((item) => item.id === account.id)
          ?.balanceAsOf,
    })),
    dataSections: [
      {
        title: "Account assumptions",
        columns: [
          { key: "account", label: "Account" },
          { key: "plannerType", label: "Type" },
          { key: "openingBalance", label: "Opening balance" },
          { key: "balanceDate", label: "Balance date" },
          { key: "annualReturn", label: "Annual return" },
          { key: "monthlyContribution", label: "Monthly contribution" },
          { key: "contributionFunding", label: "Contribution funding" },
          { key: "contributionIndexing", label: "Contribution indexing" },
          { key: "withdrawalPriority", label: "Withdrawal priority" },
          { key: "allocation", label: "Allocation" },
        ],
        rows: accountDetailsRows(context),
      },
      {
        title: "Data behind this chart",
        description: "Exact annual account balances, financial-assets line, and goal line supplied to the chart.",
        columns: [
          { key: "periodLabel", label: "Period" },
          ...accountColumns,
          { key: "financialAssets", label: "Financial assets" },
          { key: "goal", label: "Goal" },
        ],
        rows: chartRows.map((row) => ({
          periodLabel: row.periodLabel,
          ...Object.fromEntries(
            accounts.map((account, index) => [
              `account${index}`,
              row[`account:${account.id}`],
            ]),
          ),
          financialAssets: row.financialAssets,
          goal: row.goal,
        })),
        initiallyExpanded: true,
      },
      {
        title: "Contribution phases by account",
        description: "All resolved contribution phases used by the account-level projection.",
        columns: [
          { key: "account", label: "Account" },
          { key: "phase", label: "Phase" },
          { key: "startAge", label: "Start age" },
          { key: "endAge", label: "End age" },
          { key: "monthlyAmount", label: "Monthly amount" },
          { key: "funding", label: "Funding" },
          { key: "indexing", label: "Indexing" },
          { key: "source", label: "Source" },
        ],
        rows: contributionPhaseRows(context),
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "Balances are end-of-period snapshots; annual flows occur throughout each labelled period.",
      "Debt is excluded from every account area and from the financial-assets line.",
      "The goal line is inflation-adjusted only in future-dollar mode.",
      ...chartCaveats(context),
    ],
  };
}

function allocationDocument(context: ExplanationContext): ExplanationDocument {
  const point = closestAnnualPoint(
    context.projection.annual,
    context.selectedAllocationYear,
  );
  if (!point) {
    return {
      id: "asset-allocation",
      title: "Asset allocation",
      plainLanguage: "No projection year is available for the selected allocation explanation.",
      steps: [],
      dataSections: [],
      assumptions: commonAssumptions(context),
      caveats: ["No allocation values were invented."],
      unavailableEvidence: ["Selected annual projection row"],
    };
  }
  const view = point[context.displayMode];
  const allocation = view.allocation;
  const total = view.balances.financialAssets;
  const calculated = round(allocation.cash + allocation.fixedIncome + allocation.equity);
  const components = [
    { component: "Cash", value: allocation.cash },
    { component: "Fixed income", value: allocation.fixedIncome },
    { component: "Equity", value: allocation.equity },
  ].map((item) => ({
    ...item,
    percentage: total > 0 ? round((item.value / total) * 100) : 0,
  }));
  return {
    id: "asset-allocation",
    title: `Asset allocation in ${point.calendarYear}`,
    plainLanguage:
      "The modelled mix of cash, fixed income, and equity at the selected annual snapshot.",
    displayedResult: {
      label: "Selected year",
      value: String(point.calendarYear),
      dollarMode: context.displayMode,
      period: annualSnapshotLabel(context, point.calendarYear),
    },
    formula: "Cash allocation + fixed-income allocation + equity allocation = financial assets",
    steps: [
      ...components.map((item, index): ExplanationStep => ({
        label: item.component,
        value: `${exactCurrency.format(item.value)} (${item.percentage.toFixed(1)}%)`,
        rawValue: item.value,
        operation: index === 0 ? "input" : "add",
        sourceType: "projection",
      })),
      {
        label: "Financial assets",
        value: exactCurrency.format(calculated),
        rawValue: calculated,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [
      {
        title: "Selected-year allocation",
        columns: [
          { key: "component", label: "Component" },
          { key: "value", label: "Value" },
          { key: "percentage", label: "Percentage" },
        ],
        rows: components,
        initiallyExpanded: true,
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "Allocation uses local planner assumptions applied to account balances; it is not derived from security-level holdings in Lunch Money.",
      "Percentages are zero when financial assets are zero.",
      ...chartCaveats(context),
    ],
    reconciliation: matched(calculated, total),
  };
}

function ledgerDocument(context: ExplanationContext): ExplanationDocument {
  const simple = context.inputs.savingsPolicy.mode === "simple";
  const sweeping =
    context.inputs.savingsPolicy.mode === "simple" &&
    context.inputs.savingsPolicy.unplannedCash === "sweep_above_targets";
  const rows = buildAnnualLedgerData(
    context.inputs,
    context.projection,
    context.displayMode,
  );
  return {
    id: "annual-ledger",
    title: "Inspectable projection ledger",
    plainLanguage:
      "The annual projection rows shared by the report charts, showing period flows, ending financial assets, and milestones.",
    displayedResult: {
      label: "Ledger view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    steps: [],
    dataSections: [
      {
        title: "Column meanings",
        columns: [
          { key: "column", label: "Column" },
          { key: "meaning", label: "Meaning" },
        ],
        rows: [
          { column: "Year", meaning: "Labelled calendar period; partial months are shown in parentheses." },
          { column: "Age", meaning: "Age at the end of the projection period." },
          { column: "Income", meaning: "Employment, CPP, OAS, pension, and one-time inflows during the period." },
          { column: "Withdrawals", meaning: "Gross amounts withdrawn from financial accounts during the period." },
          { column: "Tax", meaning: "Simplified retirement and RRSP/RRIF withdrawal tax during the period." },
          { column: "Spending", meaning: "Essential, discretionary, and one-time spending during the period." },
          { column: "Liability payment", meaning: "Required scheduled cash payment, split into interest and principal." },
          {
            column: "Actual contributions",
            meaning: simple
              ? "All investment deposits from personal, workplace, and reserve-building plans."
              : "All investment deposits, including planned-route and surplus-funded deposits.",
          },
          {
            column: simple ? "Reserve-plan investing" : "Surplus funded",
            meaning: simple
              ? "The funded reserve-building amount redirected to investments after the reserve target."
              : "Cash-funded investment deposits originating from the surplus waterfall.",
          },
          { column: "Surplus generated", meaning: "Positive unassigned monthly cash generated during the period after targeted inflows are isolated." },
          { column: "Reserve refill", meaning: "Policy-generated surplus used to close the indexed reserve shortfall." },
          { column: "Retained as cash", meaning: "Policy-generated surplus deposited into the reserve refill account." },
          { column: "Redirected", meaning: "Policy-generated surplus deposited into the configured non-registered destination." },
          { column: "Reserve target", meaning: "Active indexed reserve target at the period boundary." },
          { column: "Positive cash available", meaning: "Positive cash available to explicit cash-funded plans in simple mode." },
          { column: "Personal plan", meaning: "Explicit personal planned, invested, and unallocated amounts." },
          { column: "Reserve-building plan", meaning: "Explicit reserve planned, funded, retained, redirected, and unfunded amounts." },
          { column: "Workplace plan", meaning: "Explicit income-withheld workplace planned, invested, and unallocated amounts." },
          { column: "Target funding retained", meaning: "Cash retained to close the indexed operating and combined reserve shortfalls without double-counting overlapping roles." },
          { column: "Unplanned cash retained", meaning: sweeping ? "Unplanned positive cash retained to close an operating or combined reserve shortfall." : "Remaining positive cash retained in operating cash rather than invested." },
          { column: "Unplanned cash swept", meaning: "Unplanned positive cash above both applicable targets invested through TFSA, personal RRSP, then taxable." },
          { column: "Total investment deposits", meaning: "All actual personal, workplace, reserve-plan, and unplanned-sweep investment deposits." },
          { column: "Financial assets", meaning: "End-of-period cash and investment balance snapshot; debt excluded." },
          { column: "Total net worth", meaning: "End-of-period total assets minus total liabilities." },
          { column: "Milestones", meaning: "Events crossed during the period: retirement, CPP, OAS, or RRIF conversion." },
        ],
      },
      {
        title: "Displayed ledger data",
        description: "These are the exact values displayed in the annual ledger.",
        columns: [
          { key: "periodLabel", label: "Year" },
          { key: "age", label: "Age" },
          { key: "income", label: "Income" },
          { key: "withdrawals", label: "Withdrawals" },
          { key: "tax", label: "Tax" },
          { key: "spending", label: "Spending" },
          { key: "liabilityCashPayment", label: "Liability payment" },
          { key: "liabilityInterest", label: "Liability interest" },
          { key: "liabilityPrincipal", label: "Liability principal" },
          { key: "liabilityLumpSumPrincipal", label: "Liability lump sums" },
          { key: "actualContributions", label: "Actual contributions" },
          {
            key: "surplusFundedContributions",
            label: simple ? "Reserve-plan investing" : "Surplus funded",
          },
          { key: "surplusGenerated", label: "Surplus generated" },
          { key: "surplusReserveRefill", label: "Reserve refill" },
          { key: "surplusRetainedAsCash", label: "Retained as cash" },
          { key: "surplusRedirected", label: "Redirected" },
          { key: "surplusReserveTarget", label: "Reserve target" },
          { key: "positiveCashAvailable", label: "Positive cash available" },
          { key: "personalPlanAmount", label: "Personal planned" },
          { key: "personalPlanAllowed", label: "Personal invested" },
          { key: "personalPlanUnallocated", label: "Personal unallocated" },
          { key: "reserveBuildingPlanAmount", label: "Reserve planned" },
          { key: "reserveBuildingFunded", label: "Reserve funded" },
          { key: "reserveCashRetained", label: "Reserve cash retained" },
          { key: "reservePlanRedirected", label: "Reserve invested" },
          { key: "reservePlanUnfunded", label: "Reserve unfunded" },
          { key: "workplacePlanned", label: "Workplace planned" },
          { key: "workplaceAllowed", label: "Workplace invested" },
          { key: "workplaceUnallocated", label: "Workplace unallocated" },
          { key: "operatingCashTarget", label: "Operating target" },
          { key: "operatingCashBalance", label: "Operating balance" },
          { key: "combinedReserveTarget", label: "Combined reserve target" },
          { key: "combinedReserveBalance", label: "Combined reserve balance" },
          { key: "targetFundingRetained", label: "Target funding retained" },
          { key: "unplannedCashRetained", label: "Unplanned cash retained" },
          { key: "unplannedCashSwept", label: "Unplanned cash swept" },
          { key: "operatingTargetUnfunded", label: "Operating target unfunded" },
          { key: "reserveTargetUnfunded", label: "Reserve target unfunded" },
          { key: "totalInvestmentDeposits", label: "Investment deposits" },
          { key: "financialAssets", label: "Financial assets" },
          { key: "totalNonFinancialAssets", label: "Non-financial assets" },
          { key: "totalLiabilities", label: "Total liabilities" },
          { key: "homeEquity", label: "Home equity" },
          { key: "totalNetWorth", label: "Total net worth" },
          { key: "milestones", label: "Milestones" },
        ],
        rows,
        initiallyExpanded: true,
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "Flows cover the labelled period; balances are end-of-period snapshots.",
      "Milestones are assigned when the model crosses their configured age during a period.",
      ...chartCaveats(context),
    ],
  };
}

function accountsDocument(context: ExplanationContext): ExplanationDocument {
  const rows = accountDetailsRows(context);
  const importedRows = rows.filter(
    (_, index) => context.inputs.accounts[index]?.origin === "lunchmoney",
  );
  const projectionRows = rows.filter(
    (_, index) =>
      context.inputs.accounts[index]?.origin === "projection_configuration",
  );
  const totalIncludedAccounts = rows.length;
  const calculatedTotal = rows.length;
  return {
    id: "lunchmoney-accounts",
    title: "Financial accounts",
    plainLanguage:
      "Imported Lunch Money balances and projection-only configured accounts remain distinct. Projection-only accounts always open at zero and are never described as imported or synced balances.",
    displayedResult: {
      label: "Included accounts",
      value: String(totalIncludedAccounts),
      period: `Balances through ${context.baseline.dataThrough}`,
    },
    formula: "Imported financial accounts + projection-only financial accounts = total included accounts",
    steps: [
      {
        label: "Financial-asset accounts",
        value: String(importedRows.length),
        rawValue: importedRows.length,
        operation: "input",
        sourceType: "lunchmoney",
      },
      {
        label: "Projection-only financial accounts",
        value: String(projectionRows.length),
        rawValue: projectionRows.length,
        operation: "add",
        sourceType: "configuration",
      },
      {
        label: "Total included accounts",
        value: String(calculatedTotal),
        rawValue: calculatedTotal,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [
      {
        title: "Imported Lunch Money account mapping and assumptions",
        columns: [
          { key: "account", label: "Account" },
          { key: "origin", label: "Origin" },
          { key: "plannerType", label: "Mapping type" },
          { key: "financialAssetsTreatment", label: "Financial-assets treatment" },
          { key: "openingBalance", label: "Opening balance" },
          { key: "openingBalanceSource", label: "Opening-balance source" },
          { key: "balanceDate", label: "Balance as of" },
          { key: "annualReturn", label: "Return" },
          { key: "monthlyContribution", label: "Monthly contribution" },
          { key: "contributionFunding", label: "Contribution behavior" },
          { key: "withdrawalPriority", label: "Withdrawal priority" },
          { key: "allocation", label: "Allocation" },
        ],
        rows: importedRows,
        initiallyExpanded: true,
      },
      ...(projectionRows.length === 0
        ? []
        : [
            {
              title: "Projection-only configured accounts",
              description:
                "These accounts are appended after imported accounts with an opening balance fixed at zero.",
              columns: [
                { key: "account", label: "Account" },
                { key: "origin", label: "Origin" },
                { key: "plannerType", label: "Planner type" },
                { key: "openingBalance", label: "Opening balance" },
                {
                  key: "openingBalanceSource",
                  label: "Opening-balance source",
                },
                { key: "annualReturn", label: "Return" },
                {
                  key: "withdrawalPriority",
                  label: "Withdrawal priority",
                },
                { key: "allocation", label: "Allocation" },
              ],
              rows: projectionRows,
              initiallyExpanded: true,
            },
          ]),
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "No raw transactions are included in this explanation.",
      "Liabilities are modelled separately from these financial accounts.",
      "Projection-only opening balances are fixed at zero in configuration and never come from Lunch Money.",
    ],
    reconciliation: matched(calculatedTotal, totalIncludedAccounts),
  };
}

function accountOriginLabel(account: FinancialAccountInput): string {
  return account.origin === "lunchmoney"
    ? "Lunch Money"
    : "Projection-only configuration";
}

function surplusAllocationDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const simple = context.inputs.savingsPolicy.mode === "simple";
  const preview = buildSavingsPolicyPreview(context.inputs);
  const result = context.projection.surplusAllocation;
  const totals = result.throughRetirement[context.displayMode];
  const savingsTotals =
    context.projection.savingsPolicy.throughRetirement[
      context.displayMode
    ];
  const reserveAccounts = result.policy.reserveAccountIds.map(
    (accountId) =>
      context.inputs.accounts.find((account) => account.id === accountId)!,
  );
  const reserveRefillAccount = context.inputs.accounts.find(
    (account) => account.id === result.policy.reserveRefillAccountId,
  )!;
  const reserveAccountLabels = reserveAccounts
    .map((account) => account.label)
    .join(", ");
  const destinationAccountId =
    result.policy.destinationAccountId ??
    (context.inputs.savingsPolicy.mode === "simple"
      ? context.inputs.savingsPolicy.taxableAccountId
      : null);
  const destination = destinationAccountId
    ? context.inputs.accounts.find(
        (account) => account.id === destinationAccountId,
      )!
    : null;
  const retirementView =
    context.projection.retirementSnapshot[context.displayMode];
  const accountAllocationTotal = Object.values(
    totals.accountAllocations,
  ).reduce((sum, value) => sum + value, 0);
  const routedTotal = totals.retainedAsCash + totals.redirected;
  const routedDifference = routedTotal - totals.generated;
  const accountAllocationDifference =
    accountAllocationTotal - totals.generated;
  const policySource =
    context.baseline.provenance[
      simple ? "savingsPolicy.unplannedCash" : "surplusAllocation.excess.mode"
    ];
  const annualRows = buildAnnualChartData(
    context.inputs,
    context.projection,
    context.displayMode,
  ).map((row) => ({
    period: row.periodLabel,
    generated: row.surplusGenerated,
    reserveRefill: row.surplusReserveRefill,
    retainedAsCash: row.surplusRetainedAsCash,
    redirected: row.surplusRedirected,
    reserveTarget: row.surplusReserveTarget,
    positiveCashAvailable: row.positiveCashAvailable,
    personalPlanned: row.personalPlanAmount,
    personalAllowed: row.personalPlanAllowed,
    personalUnallocated: row.personalPlanUnallocated,
    reservePlanned: row.reserveBuildingPlanAmount,
    reserveFunded: row.reserveBuildingFunded,
    reserveRetainedAsCash: row.reserveCashRetained,
    reserveRedirected: row.reservePlanRedirected,
    reserveUnfunded: row.reservePlanUnfunded,
    workplacePlanned: row.workplacePlanned,
    workplaceAllowed: row.workplaceAllowed,
    workplaceUnallocated: row.workplaceUnallocated,
    operatingCashTarget: row.operatingCashTarget,
    operatingCashBalance: row.operatingCashBalance,
    combinedReserveTarget: row.combinedReserveTarget,
    combinedReserveBalance: row.combinedReserveBalance,
    targetFundingRetained: row.targetFundingRetained,
    unplannedCashRetained: row.unplannedCashRetained,
    unplannedCashSwept: row.unplannedCashSwept,
    operatingTargetUnfunded: row.operatingTargetUnfunded,
    reserveTargetUnfunded: row.reserveTargetUnfunded,
    totalInvestmentDeposits: row.totalInvestmentDeposits,
  }));
  return {
    id: "surplus-allocation",
    title: simple ? "Explicit savings and retained cash" : "Surplus allocation",
    plainLanguage:
      simple
        ? `Only configured savings plans are invested. ${preview.workplacePriority}; ${preview.workplaceOverflow}. ${preview.personalOrder}. ${preview.reserveTransition}. ${preview.unplannedCash}.`
        : result.policy.excessMode === "retain_as_cash"
        ? `Positive unassigned monthly cash first compares the combined balance of ${reserveAccountLabels} with the indexed target. Any shortfall and all remaining excess go to ${reserveRefillAccount.label}.`
        : result.policy.excessMode === "allocate_to_account"
          ? `Positive unassigned monthly cash first compares the combined balance of ${reserveAccountLabels} with the indexed target. Any shortfall goes to ${reserveRefillAccount.label}, then remaining excess goes to ${destination!.label}.`
          : `Positive unassigned monthly cash first compares the combined reserve balance with the indexed target, then follows the configured advanced contribution waterfall.`,
    displayedResult: {
      label: simple
        ? "Unplanned cash handled through retirement"
        : "Surplus generated through retirement",
      value: exactCurrency.format(
        simple
          ? context.projection.savingsPolicy.throughRetirement[
              context.displayMode
            ].unplannedCashRetained +
            context.projection.savingsPolicy.throughRetirement[
              context.displayMode
            ].unplannedCashSwept
          : totals.generated,
      ),
      dollarMode: context.displayMode,
      period: `Through ${context.projection.retirementSnapshot.calendarDate}`,
    },
    formula:
      "Generated surplus = retained as cash + redirected = sum of policy deposits by account",
    steps: [
      {
        label: "Generated surplus",
        value: exactCurrency.format(totals.generated),
        rawValue: totals.generated,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Reserve refill",
        value: exactCurrency.format(totals.reserveRefill),
        rawValue: totals.reserveRefill,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Retained as cash",
        value: exactCurrency.format(totals.retainedAsCash),
        rawValue: totals.retainedAsCash,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Redirected",
        value: exactCurrency.format(totals.redirected),
        rawValue: totals.redirected,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Retained plus redirected",
        value: exactCurrency.format(routedTotal),
        rawValue: routedTotal,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Routed difference from generated",
        value: exactCurrency.format(routedDifference),
        rawValue: routedDifference,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Policy account-deposit total",
        value: exactCurrency.format(accountAllocationTotal),
        rawValue: accountAllocationTotal,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Account-deposit difference from generated",
        value: exactCurrency.format(accountAllocationDifference),
        rawValue: accountAllocationDifference,
        operation: "subtract",
        sourceType: "projection",
      },
    ],
    dataSections: [
      ...(simple
        ? [
            {
              title: "Resolved simple policy preview",
              description:
                "Shared resolved policy wording used by the dashboard and this explanation.",
              columns: [
                { key: "concept", label: "Owner intent" },
                { key: "resolved", label: "Resolved behavior" },
              ],
              rows: [
                { concept: "Configuration mode", resolved: preview.mode },
                {
                  concept: "Reserve members",
                  resolved: preview.reserveAccounts.join(", "),
                },
                {
                  concept: "Reserve refill",
                  resolved: preview.reserveRefillAccount,
                },
                {
                  concept: "Operating cash",
                  resolved: preview.operatingCashAccount ?? "Not applicable",
                },
                {
                  concept: "Operating target today",
                  resolved:
                    preview.operatingTargetToday === null
                      ? "Not configured (retain compatibility)"
                      : exactCurrency.format(preview.operatingTargetToday),
                },
                {
                  concept: "Operating target indexing",
                  resolved:
                    preview.operatingIndexingRate === null
                      ? "Not configured"
                      : percent.format(preview.operatingIndexingRate),
                },
                {
                  concept: "Operating cash in combined reserve",
                  resolved: preview.operatingCashIsReserveMember
                    ? "Yes; overlapping targets are not added"
                    : "No; operating and combined reserve targets are independent",
                },
                {
                  concept: "Workplace priority",
                  resolved: preview.workplacePriority,
                },
                {
                  concept: "Workplace overflow",
                  resolved: preview.workplaceOverflow,
                },
                { concept: "Personal order", resolved: preview.personalOrder },
                {
                  concept: "Taxable destination",
                  resolved: preview.taxableDestination
                    ? `${preview.taxableDestination} (${preview.taxableDestinationKind})`
                    : "Not applicable",
                },
                {
                  concept: "Reserve transition",
                  resolved: preview.reserveTransition,
                },
                { concept: "Unplanned cash", resolved: preview.unplannedCash },
              ],
              initiallyExpanded: true,
            },
          ]
        : []),
      {
        title: simple
          ? "Annual explicit savings and retained cash"
          : "Annual surplus allocation",
        description:
          "Exact shared annual presentation rows used by the dashboard chart.",
        columns: [
          { key: "period", label: "Period" },
          { key: "generated", label: "Generated surplus" },
          { key: "reserveRefill", label: "Reserve refill" },
          { key: "retainedAsCash", label: "Retained as cash" },
          { key: "redirected", label: "Redirected" },
          { key: "reserveTarget", label: "Reserve target" },
          ...(simple
            ? [
                { key: "positiveCashAvailable", label: "Positive cash available" },
                { key: "personalPlanned", label: "Personal planned" },
                { key: "personalAllowed", label: "Personal invested" },
                { key: "personalUnallocated", label: "Personal unallocated" },
                { key: "reservePlanned", label: "Reserve planned" },
                { key: "reserveFunded", label: "Reserve funded" },
                { key: "reserveRetainedAsCash", label: "Reserve cash retained" },
                { key: "reserveRedirected", label: "Reserve invested" },
                { key: "reserveUnfunded", label: "Reserve unfunded" },
                { key: "workplacePlanned", label: "Workplace planned" },
                { key: "workplaceAllowed", label: "Workplace invested" },
                { key: "workplaceUnallocated", label: "Workplace unallocated" },
                { key: "operatingCashTarget", label: "Operating target" },
                { key: "operatingCashBalance", label: "Operating balance" },
                { key: "combinedReserveTarget", label: "Combined reserve target" },
                { key: "combinedReserveBalance", label: "Combined reserve balance" },
                { key: "targetFundingRetained", label: "Target-funding cash retained" },
                { key: "unplannedCashRetained", label: "Unplanned cash retained" },
                { key: "unplannedCashSwept", label: "Unplanned cash swept" },
                { key: "operatingTargetUnfunded", label: "Operating target unfunded" },
                { key: "reserveTargetUnfunded", label: "Reserve target unfunded" },
                { key: "totalInvestmentDeposits", label: "Total investment deposits" },
              ]
            : []),
        ],
        rows: annualRows,
        initiallyExpanded: true,
      },
      ...(simple
        ? [
            {
              title: "Unplanned sweep deposits by destination account",
              columns: [
                { key: "account", label: "Account" },
                { key: "origin", label: "Origin" },
                { key: "amount", label: "Through retirement" },
              ],
              rows: Object.entries(
                savingsTotals.accountSweepAllocations,
              ).map(([accountId, amount]) => {
                const account = context.inputs.accounts.find(
                  (item) => item.id === accountId,
                )!;
                return {
                  account: account.label,
                  origin: accountOriginLabel(account),
                  amount,
                };
              }),
            },
          ]
        : []),
      {
        title: "Policy deposits by destination account",
        columns: [
          { key: "account", label: "Account" },
          { key: "origin", label: "Origin" },
          { key: "amount", label: "Through retirement" },
        ],
        rows: Object.entries(totals.accountAllocations).map(
          ([accountId, amount]) => {
            const account = context.inputs.accounts.find(
              (item) => item.id === accountId,
            )!;
            return {
              account: account.label,
              origin: accountOriginLabel(account),
              amount,
            };
          },
        ),
      },
      {
        title: "Retirement asset composition",
        description:
          "Internal routing changes account composition immediately; account-specific returns can then change future total assets.",
        columns: [
          { key: "item", label: "Item" },
          { key: "value", label: modeLabel(context) },
        ],
        rows: [
          {
            item: "Combined reserve-account balance",
            value:
              result.reserveAccountsBalanceAtRetirement[
                context.displayMode
              ],
          },
          ...(destination
            ? [
                {
                  item: `${destination.label} balance`,
                  value:
                    result.destinationAccountBalanceAtRetirement?.[
                      context.displayMode
                    ] ??
                    retirementView.accountBalances[destination.id] ??
                    0,
                },
              ]
            : []),
          {
            item: "Cash allocation",
            value: retirementView.allocation.cash,
          },
          {
            item: "Fixed-income allocation",
            value: retirementView.allocation.fixedIncome,
          },
          {
            item: "Equity allocation",
            value: retirementView.allocation.equity,
          },
        ],
      },
    ],
    assumptions: [
      {
        label: "Reserve accounts and origins",
        value: reserveAccounts
          .map(
            (account) =>
              `${account.label} · ${accountOriginLabel(account)}`,
          )
          .join("; "),
        sourceType: "configuration",
        sourceDescription:
          context.baseline.provenance[
            "surplusAllocation.reserveAccountIds"
          ]?.sourceDescription,
        effectiveDate:
          context.baseline.provenance[
            "surplusAllocation.reserveAccountIds"
          ]?.effectiveDate,
      },
      {
        label: "Reserve refill account and origin",
        value: `${reserveRefillAccount.label} · ${accountOriginLabel(reserveRefillAccount)}`,
        sourceType: "configuration",
        sourceDescription:
          context.baseline.provenance[
            "surplusAllocation.reserveRefillAccountId"
          ]?.sourceDescription,
        effectiveDate:
          context.baseline.provenance[
            "surplusAllocation.reserveRefillAccountId"
          ]?.effectiveDate,
      },
      inputAssumption(
        context,
        "Target reserve today",
        context.inputs.surplusAllocation.targetCashReserveToday,
        context.baseline.projectionInputs.surplusAllocation
          .targetCashReserveToday,
        simple
          ? "savingsPolicy.reserveBuilding.targetToday"
          : "surplusAllocation.targetCashReserveToday",
        exactCurrency.format,
      ),
      inputAssumption(
        context,
        "Reserve indexing",
        context.inputs.surplusAllocation.reserveIndexingRate,
        context.baseline.projectionInputs.surplusAllocation
          .reserveIndexingRate,
        simple
          ? "savingsPolicy.reserveBuilding.indexingRate"
          : "surplusAllocation.reserveIndexingRate",
        percent.format,
      ),
      ...(simple &&
      context.inputs.savingsPolicy.mode === "simple" &&
      context.inputs.savingsPolicy.operatingCashTarget &&
      context.baseline.projectionInputs.savingsPolicy.mode === "simple" &&
      context.baseline.projectionInputs.savingsPolicy.operatingCashTarget
        ? [
            inputAssumption(
              context,
              "Operating cash target today",
              context.inputs.savingsPolicy.operatingCashTarget.targetToday,
              context.baseline.projectionInputs.savingsPolicy
                .operatingCashTarget.targetToday,
              "savingsPolicy.operatingCash.targetToday",
              exactCurrency.format,
            ),
            inputAssumption(
              context,
              "Operating cash indexing",
              context.inputs.savingsPolicy.operatingCashTarget.indexingRate,
              context.baseline.projectionInputs.savingsPolicy
                .operatingCashTarget.indexingRate,
              "savingsPolicy.operatingCash.indexingRate",
              percent.format,
            ),
          ]
        : []),
      {
        label: "Reserve target at retirement",
        value: exactCurrency.format(
          result.reserveTargetAtRetirement[context.displayMode],
        ),
        sourceType: "projection",
      },
      {
        label: "Excess strategy",
        value:
          simple
            ? `Explicit reserve-building savings redirect through personal investing after the target; ${preview.unplannedCash}`
            : result.policy.excessMode === "retain_as_cash"
            ? "Retain as cash"
            : result.policy.excessMode === "allocate_to_account"
              ? "Allocate to non-registered account"
              : "Allocate through advanced contribution waterfall",
        sourceType: sourceType(policySource),
        sourceDescription: policySource?.sourceDescription,
        effectiveDate: policySource?.effectiveDate,
      },
      ...(destination
        ? [
            {
              label: "Destination and origin",
              value: `${destination.label} · ${accountOriginLabel(destination)}`,
              sourceType: "configuration" as const,
              sourceDescription:
                context.baseline.provenance[
                  simple
                    ? "savingsPolicy.taxableAccountId"
                    : "surplusAllocation.excess.destinationAccountId"
                ]?.sourceDescription,
              effectiveDate:
                context.baseline.provenance[
                  simple
                    ? "savingsPolicy.taxableAccountId"
                    : "surplusAllocation.excess.destinationAccountId"
                ]?.effectiveDate,
            },
          ]
        : []),
    ],
    caveats: [
      ...(simple
        ? [
            preview.unplannedCash,
            "Workplace RRSP has first claim on the global RRSP room pool, overflow is unallocated, and personal cash never uses the workplace RRSP.",
            "Personal investing follows TFSA → personal RRSP → taxable. The taxable destination may be an imported account or a zero-balance projection-only account.",
          ]
        : [
            "Advanced mode preserves its explicitly configured surplus-routing behavior, with registered-account room constraining TFSA and RRSP/RRIF destinations.",
          ]),
      "Targeted event inflows go only to their explicit target and are excluded from policy-generated surplus.",
      "Surplus routing is an internal allocation of external net cash already represented by income and outflow bridge terms; it does not change total financial assets at the allocation moment.",
      "Different account returns can change future total assets after the allocation moment.",
      `Generated surplus and retained plus redirected differ by ${exactCurrency.format(routedDifference)}; account deposits differ from generated by ${exactCurrency.format(accountAllocationDifference)}.`,
    ],
    reconciliation: {
      ...matched(routedTotal, totals.generated),
      matched:
        sameValue(routedTotal, totals.generated) &&
        sameValue(accountAllocationTotal, totals.generated),
    },
  };
}

function benefitWarningMessages(
  context: ExplanationContext,
  codes: string[],
): string[] {
  return context.baseline.warnings
    .filter((warning) => codes.includes(warning.code))
    .map((warning) => warning.message);
}

function claimAgeEvidence(
  context: ExplanationContext,
  benefit: "cpp" | "oas",
): ReturnType<typeof evidence> {
  const active = context.inputs.person[benefit].startAge;
  const refreshed = context.baseline.projectionInputs.person[benefit].startAge;
  const details = evidence(
    context,
    `person.${benefit}.startAge`,
    active,
    refreshed,
  );
  return details.sourceType === "override"
    ? {
        ...details,
        sourceDescription: `Temporary override; refreshed claim age was ${refreshed}`,
      }
    : details;
}

function cppBenefitDocument(context: ExplanationContext): ExplanationDocument {
  const result = context.projection.governmentBenefits.cpp;
  const amount = context.baseline.provenance[
    "person.cpp.monthlyAmountAt65Today"
  ];
  const rule = context.baseline.provenance[
    "person.cpp.claimAdjustmentRule"
  ];
  const claimMonthOffset = projectionMonthOffset(result.claimAge, 65);
  if (claimMonthOffset === null) {
    throw new Error("CPP claim age is not aligned to a projection month");
  }
  const claimMonths = Math.abs(claimMonthOffset);
  const claimMonthLabel = `${claimMonths} ${claimMonths === 1 ? "month" : "months"}`;
  const adjustmentRate = result.claimAge < 65 ? 0.006 : 0.007;
  const direction =
    result.claimAge < 65 ? "reduction" : result.claimAge > 65 ? "increase" : "no adjustment";
  const calculated =
    result.baseMonthlyAmountAt65Today * result.claimFactor;
  return {
    id: "cpp-benefit",
    title: "Canada Pension Plan (CPP)",
    plainLanguage:
      "The planner applies the statutory CPP claim-age adjustment to the configured or referenced monthly amount at age 65. It does not calculate personal entitlement from contribution history.",
    displayedResult: {
      label: "Monthly amount at claim",
      value: exactCurrency.format(result.monthlyAmountAtClaimToday),
      dollarMode: "real",
      period: `Claim age ${result.claimAge}`,
    },
    formula:
      result.claimAge < 65
        ? `Base amount × [1 − (${claimMonthLabel} × 0.006)]`
        : result.claimAge > 65
          ? `Base amount × [1 + (${claimMonthLabel} × 0.007)]`
          : "Base amount × 1",
    steps: [
      {
        label: "Monthly amount at age 65",
        value: exactCurrency.format(result.baseMonthlyAmountAt65Today),
        rawValue: result.baseMonthlyAmountAt65Today,
        operation: "input",
        sourceType: sourceType(amount),
        sourceDescription: amount?.sourceDescription,
        effectiveDate: amount?.effectiveDate,
      },
      {
        label: `Claim-age ${direction}`,
        value:
          result.claimAge === 65
            ? "0 months"
            : `${claimMonthLabel} × ${percent.format(adjustmentRate)}`,
        operation: result.claimAge === 65 ? "input" : "multiply",
        sourceType: sourceType(rule),
        sourceDescription: rule?.sourceDescription,
        effectiveDate: rule?.effectiveDate,
      },
      {
        label: "Claim factor",
        value: result.claimFactor.toFixed(4),
        rawValue: result.claimFactor,
        operation: "multiply",
        sourceType: "projection",
      },
      {
        label: "Monthly amount at claim",
        value: exactCurrency.format(result.monthlyAmountAtClaimToday),
        rawValue: result.monthlyAmountAtClaimToday,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Annual amount at claim",
        value: exactCurrency.format(result.annualAmountAtClaimToday),
        rawValue: result.annualAmountAtClaimToday,
        operation: "result",
        sourceType: "projection",
        sourceDescription: "Monthly amount at claim × 12",
      },
    ],
    dataSections: [
      {
        title: "Source and rule metadata",
        columns: [
          { key: "item", label: "Item" },
          { key: "description", label: "Description" },
          { key: "effectiveDate", label: "Effective date" },
          { key: "referenceUrl", label: "Public reference" },
        ],
        rows: [
          {
            item: "Amount at age 65",
            description: amount?.sourceDescription ?? "Evidence unavailable",
            effectiveDate: amount?.effectiveDate ?? "Unavailable",
            referenceUrl: amount?.referenceUrl ?? "Private configuration (no document metadata stored)",
          },
          {
            item: "Claim-age rule",
            description: rule?.sourceDescription ?? "Evidence unavailable",
            effectiveDate: rule?.effectiveDate ?? "Unavailable",
            referenceUrl: rule?.referenceUrl ?? "Unavailable",
          },
        ],
      },
    ],
    assumptions: [
      {
        label: "CPP claim age",
        value: String(result.claimAge),
        ...claimAgeEvidence(context, "cpp"),
      },
      {
        label: "CPP indexing",
        value: percent.format(context.inputs.person.cpp.indexingRate),
        ...evidence(context, "person.cpp.indexingRate"),
      },
    ],
    caveats: [
      ...benefitWarningMessages(context, [
        "cpp_canadian_reference_in_use",
        "legacy_zero_cpp_amount",
      ]),
      "A generic Canadian average is never a personal CPP estimate or entitlement.",
      "The planner does not calculate CPP entitlement from contribution history.",
      "Projected retirement tax is simplified and does not model progressive federal or provincial brackets.",
    ],
    reconciliation: matched(calculated, result.monthlyAmountAtClaimToday),
  };
}

function oasBenefitDocument(context: ExplanationContext): ExplanationDocument {
  const result = context.projection.governmentBenefits.oas;
  const amount = context.baseline.provenance[
    "person.oas.fullMonthlyAmountAt65Today"
  ];
  const eligibility = context.baseline.provenance[
    "person.oas.eligibility.fraction"
  ];
  const claimRule = context.baseline.provenance[
    "person.oas.delayedClaimRule"
  ];
  const age75Rule = context.baseline.provenance[
    "person.oas.age75IncreaseRule"
  ];
  const claimMonths = projectionMonthOffset(result.claimAge, 65);
  if (claimMonths === null) {
    throw new Error("OAS claim age is not aligned to a projection month");
  }
  const claimMonthLabel = `${claimMonths} ${claimMonths === 1 ? "month" : "months"}`;
  const calculated =
    result.fullBaseMonthlyAmountAt65Today *
    result.eligibilityFraction *
    result.claimFactor;
  return {
    id: "oas-benefit",
    title: "Old Age Security (OAS)",
    plainLanguage:
      "The planner applies explicit residence eligibility and the statutory delayed-claim factor to the dated full OAS amount, then applies the permanent age-75 increase at its model boundary.",
    displayedResult: {
      label: "Monthly amount at claim",
      value: exactCurrency.format(result.monthlyAmountAtClaimToday),
      dollarMode: "real",
      period: `Claim age ${result.claimAge}`,
    },
    formula:
      `Full amount at 65 × eligibility fraction × [1 + (${claimMonthLabel} × 0.006)]`,
    steps: [
      {
        label: "Full monthly amount at age 65",
        value: exactCurrency.format(result.fullBaseMonthlyAmountAt65Today),
        rawValue: result.fullBaseMonthlyAmountAt65Today,
        operation: "input",
        sourceType: sourceType(amount),
        sourceDescription: amount?.sourceDescription,
        effectiveDate: amount?.effectiveDate,
      },
      ...(result.eligibilityMode === "partial"
        ? [{
            label: "Partial eligibility",
            value: `${result.qualifyingResidenceYearsAfter18} ÷ 40 = ${percent.format(result.eligibilityFraction)}`,
            rawValue: result.eligibilityFraction,
            operation: "multiply" as const,
            sourceType: sourceType(eligibility),
            sourceDescription: eligibility?.sourceDescription,
            effectiveDate: eligibility?.effectiveDate,
          }]
        : [{
            label: `${result.eligibilityMode === "full" ? "Full" : "No"} eligibility`,
            value: percent.format(result.eligibilityFraction),
            rawValue: result.eligibilityFraction,
            operation: "multiply" as const,
            sourceType: sourceType(eligibility),
            sourceDescription: eligibility?.sourceDescription,
            effectiveDate: eligibility?.effectiveDate,
          }]),
      {
        label: "Delayed-claim adjustment",
        value: `${claimMonthLabel} × ${percent.format(0.006)}`,
        operation: "multiply",
        sourceType: sourceType(claimRule),
        sourceDescription: claimRule?.sourceDescription,
        effectiveDate: claimRule?.effectiveDate,
      },
      {
        label: "Claim factor",
        value: result.claimFactor.toFixed(4),
        rawValue: result.claimFactor,
        operation: "multiply",
        sourceType: "projection",
      },
      {
        label: "Monthly amount at claim",
        value: exactCurrency.format(result.monthlyAmountAtClaimToday),
        rawValue: result.monthlyAmountAtClaimToday,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Annual amount at claim",
        value: exactCurrency.format(result.annualAmountAtClaimToday),
        rawValue: result.annualAmountAtClaimToday,
        operation: "result",
        sourceType: "projection",
        sourceDescription: "Monthly amount at claim × 12",
      },
      {
        label: "Monthly amount after age-75 increase",
        value: exactCurrency.format(
          result.monthlyAmountAfterAge75IncreaseToday,
        ),
        rawValue: result.monthlyAmountAfterAge75IncreaseToday,
        operation: "result",
        sourceType: sourceType(age75Rule),
        sourceDescription:
          "Monthly amount at claim × 1.10 beginning in the first modelled month after the age-75 boundary",
        effectiveDate: age75Rule?.effectiveDate,
      },
    ],
    dataSections: [
      {
        title: "Source and rule metadata",
        columns: [
          { key: "item", label: "Item" },
          { key: "description", label: "Description" },
          { key: "effectiveDate", label: "Effective date" },
          { key: "referenceUrl", label: "Public reference" },
        ],
        rows: [
          {
            item: "Full amount at age 65",
            description: amount?.sourceDescription ?? "Evidence unavailable",
            effectiveDate: amount?.effectiveDate ?? "Unavailable",
            referenceUrl: amount?.referenceUrl ?? "Private configuration (no document metadata stored)",
          },
          {
            item: "Delayed-claim rule",
            description: claimRule?.sourceDescription ?? "Evidence unavailable",
            effectiveDate: claimRule?.effectiveDate ?? "Unavailable",
            referenceUrl: claimRule?.referenceUrl ?? "Unavailable",
          },
          {
            item: "Age-75 increase",
            description: age75Rule?.sourceDescription ?? "Evidence unavailable",
            effectiveDate: age75Rule?.effectiveDate ?? "Unavailable",
            referenceUrl: age75Rule?.referenceUrl ?? "Unavailable",
          },
        ],
      },
    ],
    assumptions: [
      {
        label: "OAS claim age",
        value: String(result.claimAge),
        ...claimAgeEvidence(context, "oas"),
      },
      {
        label: "OAS eligibility",
        value: `${result.eligibilityMode} · ${percent.format(result.eligibilityFraction)}`,
        ...evidence(context, "person.oas.eligibility.fraction"),
      },
      {
        label: "OAS indexing",
        value: percent.format(context.inputs.person.oas.indexingRate),
        ...evidence(context, "person.oas.indexingRate"),
      },
      {
        label: "Permanent increase after age 75",
        value: percent.format(result.age75IncreaseRate),
        ...evidence(context, "person.oas.age75IncreaseRate"),
      },
    ],
    caveats: [
      ...benefitWarningMessages(context, [
        "oas_canadian_reference_in_use",
        "legacy_zero_oas_amount",
      ]),
      "For partial eligibility, the configured residence years are an explicit assertion. Special residence rules and international social-security agreements are not independently evaluated.",
      "The planner does not infer OAS eligibility from age, citizenship, location, accounts, or other personal information.",
      "Retirement tax and OAS recovery tax are simplified; not all future taxable-withdrawal cases are modelled.",
    ],
    reconciliation: matched(calculated, result.monthlyAmountAtClaimToday),
  };
}

function registeredAccountRoomDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const simple = context.inputs.savingsPolicy.mode === "simple";
  const preview = buildSavingsPolicyPreview(context.inputs);
  const room = context.inputs.registeredAccountRoom;
  if (!room) {
    return {
      id: "registered-account-room",
      title: "Registered-account room and contribution routing",
      plainLanguage:
        "Registered-account room is not applicable to this resolved scenario.",
      steps: [],
      dataSections: [],
      assumptions: [],
      caveats: [
        "No positive registered contribution or registered surplus destination is active.",
      ],
    };
  }
  const rows = buildAnnualChartData(
    context.inputs,
    context.projection,
    context.displayMode,
  );
  const displayedViews = context.projection.annual.map(
    (point) => point[context.displayMode],
  );
  const contributionReconciliation =
    buildContributionReconciliation(
      context.projection,
      context.displayMode,
    );
  const {
    planned,
    allowed,
    surplusFunded,
    actual,
    unallocated,
    cashFunded,
    incomeWithheld,
    accountDeposits,
  } = contributionReconciliation.totals;
  const plannedDifference =
    contributionReconciliation.equations.planned.aggregateDifference;
  const totalDifference =
    contributionReconciliation.equations.totalActual
      .aggregateDifference;
  const fundingDifference =
    contributionReconciliation.equations.fundingSplit
      .aggregateDifference;
  const accountDepositDifference =
    contributionReconciliation.equations.accountDeposits
      .aggregateDifference;
  const maximumDifference =
    contributionReconciliation.maximumDifference;
  const first = context.projection.annual[0]?.[context.displayMode];
  const last = context.projection.annual.at(-1)?.[context.displayMode];
  return {
    id: "registered-account-room",
    title: "Registered-account room and contribution routing",
    plainLanguage:
      simple
        ? `Every TFSA shares one TFSA room pool and every RRSP/RRIF shares one RRSP deduction-room pool. ${preview.workplacePriority}; ${preview.workplaceOverflow}. ${preview.personalOrder}; personal cash never uses the workplace RRSP. Only explicit plans are invested unless the explicit sweep policy applies. ${preview.unplannedCash}.`
        : "Every TFSA account shares one TFSA room pool and every RRSP/RRIF account shares one RRSP deduction-room pool. Planned routes run in configured order before additional surplus savings.",
    displayedResult: {
      label: "Closing registered room at projection end",
      value: `${exactCurrency.format(last?.registeredAccountRoom.tfsa.closingRoom ?? 0)} TFSA · ${exactCurrency.format(last?.registeredAccountRoom.rrsp.closingRoom ?? 0)} RRSP`,
      period: "Nominal regulatory dollars",
    },
    formula:
      simple
        ? "Personal planned = allowed + unallocated; workplace planned = allowed + unallocated; funded reserve plan = cash retained + investment deposits; total actual investments = personal allowed + workplace allowed + reserve-plan investment deposits + unplanned sweep deposits = cash funded + income withheld = sum of account deposits; positive cash = personal allowed + reserve funded + unplanned retained cash + unplanned swept cash; closing room = opening + new + restored withdrawals − room-consuming contributions"
        : "Planned = allowed + unallocated; total actual = allowed + surplus funded = cash funded + income withheld = sum of account deposits; each source and destination route reconciles; closing room = opening + new + restored withdrawals − room-consuming contributions",
    steps: [
      {
        label: "Starting TFSA room",
        value: exactCurrency.format(room.tfsa.startingAvailableRoom.amount),
        rawValue: room.tfsa.startingAvailableRoom.amount,
        operation: "input",
        sourceType:
          context.overrides[
            simple
              ? "registeredRoom.tfsa.availableAtStart"
              : "registeredAccountRoom.tfsa.startingAvailableRoom.amount"
          ] !== undefined
            ? "override"
            : "configuration",
        sourceDescription: room.tfsa.startingAvailableRoom.sourceDescription,
        effectiveDate: room.tfsa.startingAvailableRoom.effectiveDate,
      },
      {
        label: "Starting RRSP deduction room",
        value: exactCurrency.format(
          room.rrsp.startingAvailableDeductionRoom.amount,
        ),
        rawValue: room.rrsp.startingAvailableDeductionRoom.amount,
        operation: "input",
        sourceType:
          context.overrides[
            simple
              ? "registeredRoom.rrsp.availableAtStart"
              : "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount"
          ] !== undefined
            ? "override"
            : "configuration",
        sourceDescription:
          room.rrsp.startingAvailableDeductionRoom.sourceDescription,
        effectiveDate:
          room.rrsp.startingAvailableDeductionRoom.effectiveDate,
      },
      {
        label: "Statutory RRSP earned-income rate",
        value: percent.format(
          first?.registeredAccountRoom.rrsp.earnedIncomeRate ?? 0.18,
        ),
        rawValue:
          first?.registeredAccountRoom.rrsp.earnedIncomeRate ?? 0.18,
        operation: "multiply",
        sourceType: "canadian_reference",
      },
      {
        label: "Pre-projection eligible earned income",
        value: exactCurrency.format(
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .eligibleEarnedIncome,
        ),
        rawValue:
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .eligibleEarnedIncome,
        operation: "input",
        sourceType: "configuration",
      },
      {
        label: "Pre-projection pension adjustment",
        value: exactCurrency.format(
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .pensionAdjustment,
        ),
        rawValue:
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .pensionAdjustment,
        operation: "subtract",
        sourceType: "configuration",
      },
      {
        label: "Pre-projection other room reduction",
        value: exactCurrency.format(
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .otherRoomReduction,
        ),
        rawValue:
          room.rrsp.newRoom.startYearBeforeProjectionMonth
            .otherRoomReduction,
        operation: "subtract",
        sourceType: "configuration",
      },
      {
        label: "Planned contributions",
        value: exactCurrency.format(planned),
        rawValue: planned,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Allowed from planned routes",
        value: exactCurrency.format(allowed),
        rawValue: allowed,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: simple
          ? "Reserve-plan investment deposits"
          : "Surplus-funded deposits",
        value: exactCurrency.format(surplusFunded),
        rawValue: surplusFunded,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Total actual deposited contributions",
        value: exactCurrency.format(actual),
        rawValue: actual,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Unallocated contributions",
        value: exactCurrency.format(unallocated),
        rawValue: unallocated,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Cash-funded actual deposits",
        value: exactCurrency.format(cashFunded),
        rawValue: cashFunded,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Income-withheld actual deposits",
        value: exactCurrency.format(incomeWithheld),
        rawValue: incomeWithheld,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Sum of account deposits",
        value: exactCurrency.format(accountDeposits),
        rawValue: accountDeposits,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Planned-routing difference",
        value: exactCurrency.format(plannedDifference),
        rawValue: plannedDifference,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Planned-routing maximum annual difference",
        value: exactCurrency.format(
          contributionReconciliation.equations.planned
            .maximumPeriodDifference,
        ),
        rawValue:
          contributionReconciliation.equations.planned
            .maximumPeriodDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Total-actual difference",
        value: exactCurrency.format(totalDifference),
        rawValue: totalDifference,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Total-actual maximum annual difference",
        value: exactCurrency.format(
          contributionReconciliation.equations.totalActual
            .maximumPeriodDifference,
        ),
        rawValue:
          contributionReconciliation.equations.totalActual
            .maximumPeriodDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Total-actual annual rounding carry",
        value: exactCurrency.format(
          contributionReconciliation.equations.totalActual
            .rawAggregateDifference,
        ),
        rawValue:
          contributionReconciliation.equations.totalActual
            .rawAggregateDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Funding-split difference",
        value: exactCurrency.format(fundingDifference),
        rawValue: fundingDifference,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Funding-split maximum annual difference",
        value: exactCurrency.format(
          contributionReconciliation.equations.fundingSplit
            .maximumPeriodDifference,
        ),
        rawValue:
          contributionReconciliation.equations.fundingSplit
            .maximumPeriodDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Account-deposit difference",
        value: exactCurrency.format(accountDepositDifference),
        rawValue: accountDepositDifference,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Account-deposit maximum annual difference",
        value: exactCurrency.format(
          contributionReconciliation.equations.accountDeposits
            .maximumPeriodDifference,
        ),
        rawValue:
          contributionReconciliation.equations.accountDeposits
            .maximumPeriodDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Account-level maximum difference",
        value: exactCurrency.format(
          contributionReconciliation.maximumAccountDifference,
        ),
        rawValue:
          contributionReconciliation.maximumAccountDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Room-ledger maximum difference",
        value: exactCurrency.format(
          contributionReconciliation.maximumRoomDifference,
        ),
        rawValue: contributionReconciliation.maximumRoomDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Savings-policy maximum difference",
        value: exactCurrency.format(
          contributionReconciliation.maximumSavingsPolicyDifference,
        ),
        rawValue:
          contributionReconciliation.maximumSavingsPolicyDifference,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Largest reconciliation difference",
        value: exactCurrency.format(maximumDifference),
        rawValue: maximumDifference,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [
      {
        title: "Annual registered room and routing",
        description:
          "Shared nominal-regulatory room rows and display-mode contribution flows used by the dashboard and exports.",
        columns: [
          { key: "period", label: "Period" },
          { key: "planned", label: "Planned" },
          { key: "allowed", label: "Allowed from planned routes" },
          {
            key: "surplusFunded",
            label: simple ? "Reserve-plan investing" : "Surplus funded",
          },
          { key: "actual", label: "Total actual" },
          { key: "cashFunded", label: "Cash funded" },
          { key: "incomeWithheld", label: "Income withheld" },
          { key: "accountDeposits", label: "Account deposits" },
          { key: "redirected", label: "Redirected" },
          { key: "unallocated", label: "Unallocated" },
          { key: "tfsaOpening", label: "TFSA opening" },
          { key: "tfsaNew", label: "TFSA new" },
          { key: "tfsaRestored", label: "TFSA withdrawal restored" },
          { key: "tfsaClosing", label: "TFSA closing" },
          { key: "tfsaAllowed", label: "TFSA allowed" },
          { key: "rrspOpening", label: "RRSP opening" },
          { key: "rrspPriorIncome", label: "RRSP prior eligible income" },
          { key: "rrspRate", label: "RRSP earned-income rate" },
          { key: "rrspCap", label: "RRSP annual cap" },
          { key: "rrspPensionAdjustment", label: "Pension adjustment" },
          { key: "rrspOtherReduction", label: "Other reduction" },
          { key: "rrspGross", label: "Gross generated" },
          { key: "rrspNew", label: "RRSP new" },
          { key: "rrspAllowed", label: "RRSP allowed" },
          { key: "rrspClosing", label: "RRSP closing" },
          { key: "tfsaRoomDifference", label: "TFSA room difference" },
          { key: "rrspRoomDifference", label: "RRSP room difference" },
          ...(simple
            ? [
                { key: "positiveCashAvailable", label: "Positive cash available" },
                { key: "personalPlanned", label: "Personal planned" },
                { key: "personalAllowed", label: "Personal invested" },
                { key: "personalUnallocated", label: "Personal unallocated" },
                { key: "reservePlanned", label: "Reserve planned" },
                { key: "reserveFunded", label: "Reserve funded" },
                { key: "reserveRetained", label: "Reserve cash retained" },
                { key: "reserveRedirected", label: "Reserve invested" },
                { key: "reserveUnfunded", label: "Reserve unfunded" },
                { key: "workplacePlanned", label: "Workplace planned" },
                { key: "workplaceAllowed", label: "Workplace invested" },
                { key: "workplaceUnallocated", label: "Workplace unallocated" },
                { key: "unplannedCashRetained", label: "Unplanned cash retained" },
                { key: "totalInvestmentDeposits", label: "Investment deposits" },
              ]
            : []),
        ],
        rows: rows.map((row, index) => {
          const view = displayedViews[index]!;
          const tfsa = view.registeredAccountRoom.tfsa;
          const rrsp = view.registeredAccountRoom.rrsp;
          return {
            period: row.periodLabel,
            planned: row.plannedContributions,
            allowed: row.allowedContributions,
            surplusFunded: row.surplusFundedContributions,
            actual: row.actualContributions,
            cashFunded: row.cashFundedContributions,
            incomeWithheld: row.incomeWithheldContributions,
            accountDeposits: Object.values(
              view.accountContributionDetails,
            ).reduce(
              (total, detail) => total + detail.depositedIntoAccount,
              0,
            ),
            redirected: row.redirectedContributions,
            unallocated: row.unallocatedContributions,
            tfsaOpening: row.tfsaRoomOpening,
            tfsaNew: row.tfsaRoomNew,
            tfsaRestored: row.tfsaRoomWithdrawalRestored,
            tfsaClosing: row.tfsaRoomClosing,
            tfsaAllowed: row.tfsaAllowedContributions,
            rrspOpening: row.rrspRoomOpening,
            rrspPriorIncome: row.rrspPreviousYearEligibleEarnedIncome,
            rrspRate: row.rrspEarnedIncomeRate,
            rrspCap: row.rrspAnnualCap,
            rrspPensionAdjustment: row.rrspPensionAdjustment,
            rrspOtherReduction: row.rrspOtherRoomReduction,
            rrspGross: row.rrspGrossGeneratedRoom,
            rrspNew: row.rrspRoomNew,
            rrspAllowed: row.rrspAllowedContributions,
            rrspClosing: row.rrspRoomClosing,
            tfsaRoomDifference:
              tfsa.openingRoom +
              tfsa.annualNewRoom +
              tfsa.withdrawalRoomRestored -
              tfsa.allowedContributions -
              tfsa.closingRoom,
            rrspRoomDifference:
              rrsp.openingRoom +
              rrsp.annualNewRoom -
              rrsp.allowedContributions -
              rrsp.closingRoom,
            ...(simple
              ? {
                  positiveCashAvailable: row.positiveCashAvailable,
                  personalPlanned: row.personalPlanAmount,
                  personalAllowed: row.personalPlanAllowed,
                  personalUnallocated: row.personalPlanUnallocated,
                  reservePlanned: row.reserveBuildingPlanAmount,
                  reserveFunded: row.reserveBuildingFunded,
                  reserveRetained: row.reserveCashRetained,
                  reserveRedirected: row.reservePlanRedirected,
                  reserveUnfunded: row.reservePlanUnfunded,
                  workplacePlanned: row.workplacePlanned,
                  workplaceAllowed: row.workplaceAllowed,
                  workplaceUnallocated: row.workplaceUnallocated,
                  unplannedCashRetained: row.unplannedCashRetained,
                  totalInvestmentDeposits: row.totalInvestmentDeposits,
                }
              : {}),
          };
        }),
      },
      {
        title: simple ? "Resolved policy order" : "Configured route order",
        description: simple
          ? "Account references were compiled from owner-facing roles; raw route IDs are not required in simple configuration."
          : undefined,
        columns: [
          { key: "priority", label: "Priority" },
          { key: "source", label: "Source" },
          { key: "destinations", label: "Ordered destinations" },
        ],
        rows: context.inputs.contributionWaterfall.routes.map(
          (route, index) => ({
            priority: index + 1,
            source:
              context.inputs.accounts.find(
                (account) => account.id === route.sourceAccountId,
              )?.label ?? route.sourceAccountId,
            destinations: route.destinationAccountIds
              .map(
                (id) =>
                  context.inputs.accounts.find(
                    (account) => account.id === id,
                  )?.label ?? id,
              )
              .join(" → "),
          }),
        ),
      },
      {
        title: "Canadian reference basis",
        columns: [
          { key: "program", label: "Program" },
          { key: "year", label: "Year" },
          { key: "amount", label: "Published amount" },
          { key: "sourceKind", label: "Source kind" },
          { key: "referenceUrl", label: "Public reference" },
        ],
        rows: [
          {
            program: "TFSA",
            year:
              context.projection.registeredAccountRoom.references
                .tfsaAnnualLimit.calendarYear,
            amount:
              context.projection.registeredAccountRoom.references
                .tfsaAnnualLimit.amount,
            sourceKind: "Published reference; later years use configured indexing and rounding forecasts",
            referenceUrl:
              context.projection.registeredAccountRoom.references
                .tfsaAnnualLimit.referenceUrl,
          },
          ...context.projection.registeredAccountRoom.references.rrspAnnualCaps.map(
            (reference) => ({
              program: "RRSP",
              year: reference.calendarYear,
              amount: reference.amount,
              sourceKind:
                "Published reference; later years use configured growth and rounding forecasts",
              referenceUrl: reference.referenceUrl,
            }),
          ),
        ],
      },
      {
        title: "Annual account contribution routing",
        columns: [
          { key: "period", label: "Period" },
          { key: "account", label: "Account" },
          { key: "planned", label: "Planned from source" },
          { key: "deposited", label: "Deposited" },
          { key: "redirectedIn", label: "Redirected in" },
          { key: "redirectedOut", label: "Redirected out" },
          {
            key: "surplus",
            label: simple ? "Reserve-plan investing" : "Surplus funded",
          },
          { key: "cashFunded", label: "Cash funded" },
          { key: "incomeWithheld", label: "Income withheld" },
          { key: "unallocated", label: "Unallocated" },
          { key: "sourceDifference", label: "Source difference" },
          { key: "destinationDifference", label: "Destination difference" },
        ],
        rows: context.projection.annual.flatMap((point) =>
          Object.entries(
            point[context.displayMode].accountContributionDetails,
          ).map(([accountId, detail]) => ({
            period: annualPeriodLabel(context.inputs, point.calendarYear),
            account:
              context.inputs.accounts.find(
                (account) => account.id === accountId,
              )?.label ?? accountId,
            planned: detail.plannedFromAccount,
            deposited: detail.depositedIntoAccount,
            redirectedIn: detail.redirectedIn,
            redirectedOut: detail.redirectedOut,
            surplus: detail.surplusFundedDeposit,
            cashFunded: detail.cashFunded,
            incomeWithheld: detail.incomeWithheld,
            unallocated: detail.unallocatedFromAccount,
            sourceDifference:
              detail.plannedFromAccount -
              detail.sourceAccountDeposit -
              detail.redirectedOut -
              detail.unallocatedFromAccount,
            destinationDifference:
              detail.depositedIntoAccount -
              detail.sourceAccountDeposit -
              detail.redirectedIn -
              detail.surplusFundedDeposit,
          })),
        ),
      },
    ],
    assumptions: [
      {
        label: "TFSA carry-forward",
        value: room.tfsa.carryForwardUnusedRoom ? "Enabled" : "Disabled scenario",
        sourceType: "configuration",
      },
      {
        label: "TFSA withdrawal restoration",
        value: "Next calendar year",
        sourceType: "canadian_reference",
      },
      {
        label: "RRSP carry-forward",
        value: room.rrsp.carryForwardUnusedRoom ? "Enabled" : "Disabled scenario",
        sourceType: "configuration",
      },
      {
        label: "Partial start year",
        value: "Starting room already includes the current-year position",
        sourceType: "configuration",
      },
      ...context.inputs.person.employmentIncomePhases.flatMap((phase) =>
        phase.rrspRoomGeneration
          ? [
              {
                label: `${phase.label} RRSP-eligible earned income`,
                value: exactCurrency.format(
                  phase.rrspRoomGeneration
                    .annualEligibleEarnedIncomeToday,
                ),
                sourceType: (context.overrides[
                  `employmentPhase.${phase.id}.rrspRoomGeneration.annualEligibleEarnedIncomeToday`
                ] !== undefined
                  ? "override"
                  : "configuration") as ExplanationSourceType,
              },
              {
                label: `${phase.label} pension adjustment`,
                value: exactCurrency.format(
                  phase.rrspRoomGeneration
                    .annualPensionAdjustmentToday,
                ),
                sourceType: (context.overrides[
                  `employmentPhase.${phase.id}.rrspRoomGeneration.annualPensionAdjustmentToday`
                ] !== undefined
                  ? "override"
                  : "configuration") as ExplanationSourceType,
              },
              {
                label: `${phase.label} other room reduction`,
                value: exactCurrency.format(
                  phase.rrspRoomGeneration
                    .annualOtherRoomReductionToday,
                ),
                sourceType: (context.overrides[
                  `employmentPhase.${phase.id}.rrspRoomGeneration.annualOtherRoomReductionToday`
                ] !== undefined
                  ? "override"
                  : "configuration") as ExplanationSourceType,
              },
            ]
          : [],
      ),
    ],
    caveats: [
      ...(simple
        ? [
            preview.unplannedCash,
            "Workplace RRSP contributions consume the global RRSP room pool first. Workplace overflow is visibly unallocated and is not redirected or deposited as cash.",
            "Personal investing follows TFSA → personal RRSP → taxable and never uses the workplace RRSP account.",
            "Reserve-building savings stay in reserve until the combined indexed target is reached; any crossing amount follows the personal order in the same month.",
            `The taxable destination is ${preview.taxableDestination}.`,
          ]
        : [
            "Advanced compatibility mode preserves owner-authored route order and surplus behavior.",
          ]),
      "Registered-room ledgers, annual limits, caps, adjustments, reductions, and room-consuming contributions are nominal regulatory dollars. They are not deflated by the Today’s/Future dollar toggle.",
      "Net deposited employment cash is never treated as RRSP-eligible earned income; room generation uses the explicit nested employment-phase inputs.",
      "TFSA withdrawals restore room only at the next January boundary. RRSP withdrawals do not restore room.",
      "Cash-funded unallocated contributions remain in monthly cash; income-withheld unallocated amounts enter neither cash nor financial assets.",
      "Contribution reconciliation uses integer cents at each annual boundary. A one-cent annual presentation residual is normalized before aggregation, while every annual, account, room, and savings-policy equation must independently remain within one cent so opposite-sign errors cannot cancel.",
      "Published limits are distinguished from deterministic configured forecasts.",
      "RRSP first-60-days elections, unused undeducted contributions, spousal rules, HBP/LLP repayments, detailed pension adjustments, CRA reassessments, tax refunds, and RRIF minimum withdrawals are not modelled.",
    ],
    reconciliation: {
      matched: contributionReconciliation.matched,
      calculatedValue:
        contributionReconciliation.calculatedTotalActual,
      displayedValue:
        contributionReconciliation.displayedAccountDeposits,
    },
  };
}

function homeEquityAtRetirementDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const snapshot =
    context.projection.retirementSnapshot[context.displayMode];
  const balances = snapshot.balances;
  const calculatedHomeEquity =
    balances.residenceValue - balances.mortgageBalance;
  const hasResidence = context.inputs.nonFinancialAssets.some(
    (asset) => asset.type === "primary_residence",
  );
  return {
    id: "home-equity-at-retirement",
    title: "Home equity at retirement",
    plainLanguage:
      "Home equity is the projected residence value at retirement minus the linked mortgage balance at retirement. It contributes to total net worth but is not available to fund retirement unless a future sale or conversion is explicitly modelled.",
    displayedResult: {
      label: "Home equity at retirement",
      value: currency.format(balances.homeEquity),
      dollarMode: context.displayMode,
      period: `${context.projection.retirementSnapshot.calendarDate} · age ${context.projection.retirementSnapshot.age}`,
    },
    formula:
      "Residence value at retirement − linked mortgage at retirement = home equity at retirement",
    steps: [
      {
        label: "Residence value at retirement",
        value: exactCurrency.format(balances.residenceValue),
        rawValue: balances.residenceValue,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Linked mortgage at retirement",
        value: exactCurrency.format(balances.mortgageBalance),
        rawValue: balances.mortgageBalance,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Home equity at retirement",
        value: exactCurrency.format(balances.homeEquity),
        rawValue: balances.homeEquity,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [],
    assumptions: [],
    caveats: [
      "Home equity is unavailable to retirement withdrawals unless a future explicit sale or conversion is modelled.",
      "This explanation does not model a sale, downsizing, HELOC, or reverse mortgage.",
      ...(hasResidence
        ? []
        : ["No primary residence is configured, so this explanation is not normally reachable."]),
    ],
    reconciliation: matched(calculatedHomeEquity, balances.homeEquity),
  };
}

function liabilitiesAtRetirementDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const snapshot =
    context.projection.retirementSnapshot[context.displayMode];
  const balances = snapshot.balances;
  const calculatedLiabilities =
    balances.mortgageBalance + balances.otherLiabilities;
  return {
    id: "liabilities-at-retirement",
    title: "Total liabilities at retirement",
    plainLanguage:
      "This is the total outstanding debt projected at retirement. It is separate from retirement-funding assets and is subtracted when calculating total net worth.",
    displayedResult: {
      label: "Total liabilities at retirement",
      value: currency.format(balances.totalLiabilities),
      dollarMode: context.displayMode,
      period: `${context.projection.retirementSnapshot.calendarDate} · age ${context.projection.retirementSnapshot.age}`,
    },
    formula:
      "Mortgage balance at retirement + other liabilities at retirement = total liabilities at retirement",
    steps: [
      {
        label: "Mortgage balance at retirement",
        value: exactCurrency.format(balances.mortgageBalance),
        rawValue: balances.mortgageBalance,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Other liabilities at retirement",
        value: exactCurrency.format(balances.otherLiabilities),
        rawValue: balances.otherLiabilities,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Total liabilities at retirement",
        value: exactCurrency.format(balances.totalLiabilities),
        rawValue: balances.totalLiabilities,
        operation: "result",
        sourceType: "projection",
      },
    ],
    dataSections: [],
    assumptions: [],
    caveats: [
      "Total liabilities are separate from retirement-funding assets and reduce total net worth.",
      "Open Mortgage and debt schedule from the liabilities and home equity chart for the full amortization detail.",
    ],
    reconciliation: matched(
      calculatedLiabilities,
      balances.totalLiabilities,
    ),
  };
}

function totalNetWorthDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const snapshot =
    context.projection.retirementSnapshot[context.displayMode];
  const balances = snapshot.balances;
  const reconciliation = buildBalanceSheetReconciliation(
    context.projection,
    context.displayMode,
  );
  const bridge = context.projection.netWorthBridge[context.displayMode];
  const endingDisplayed = balances.totalNetWorth;
  return {
    id: "total-net-worth",
    title: "Total net worth",
    plainLanguage:
      "Total net worth includes cash and investments, the primary residence, and all modelled liabilities. Retirement funding assets remain the separate amount available to fund retirement.",
    displayedResult: {
      label: "Total net worth at retirement",
      value: currency.format(balances.totalNetWorth),
      dollarMode: context.displayMode,
      period: `${context.projection.retirementSnapshot.calendarDate} · age ${context.projection.retirementSnapshot.age}`,
    },
    formula:
      "Financial assets + non-financial assets − total liabilities = total net worth",
    steps: [
      {
        label: "Retirement funding financial assets",
        value: exactCurrency.format(balances.retirementFundingAssets),
        rawValue: balances.retirementFundingAssets,
        operation: "input",
        sourceType: "projection",
      },
      {
        label: "Non-financial assets",
        value: exactCurrency.format(balances.totalNonFinancialAssets),
        rawValue: balances.totalNonFinancialAssets,
        operation: "add",
        sourceType: "projection",
      },
      {
        label: "Liabilities",
        value: exactCurrency.format(balances.totalLiabilities),
        rawValue: balances.totalLiabilities,
        operation: "subtract",
        sourceType: "projection",
      },
      {
        label: "Total net worth",
        value: exactCurrency.format(balances.totalNetWorth),
        rawValue: balances.totalNetWorth,
        operation: "result",
        sourceType: "projection",
      },
      {
        label: "Maximum annual balance-sheet difference",
        value: exactCurrency.format(
          reconciliation.maximumBalanceSheetDifference,
        ),
        rawValue: reconciliation.maximumBalanceSheetDifference,
        sourceType: "projection",
      },
      {
        label: "Net-worth bridge difference",
        value: exactCurrency.format(reconciliation.netWorthBridgeDifference),
        rawValue: reconciliation.netWorthBridgeDifference,
        sourceType: "projection",
      },
    ],
    dataSections: [
      {
        title: "Annual balance sheet",
        columns: [
          { key: "period", label: "Period" },
          { key: "financialAssets", label: "Financial assets" },
          { key: "nonFinancialAssets", label: "Non-financial assets" },
          { key: "totalAssets", label: "Total assets" },
          { key: "liabilities", label: "Liabilities" },
          { key: "homeEquity", label: "Home equity" },
          { key: "netWorth", label: "Total net worth" },
        ],
        rows: context.projection.annual.map((point) => {
          const annualBalances = point[context.displayMode].balances;
          return {
            period: annualPeriodLabel(context.inputs, point.calendarYear),
            financialAssets: annualBalances.financialAssets,
            nonFinancialAssets: annualBalances.totalNonFinancialAssets,
            totalAssets: annualBalances.totalAssets,
            liabilities: annualBalances.totalLiabilities,
            homeEquity: annualBalances.homeEquity,
            netWorth: annualBalances.totalNetWorth,
          };
        }),
        initiallyExpanded: true,
      },
      {
        title: "Net-worth bridge through retirement",
        columns: [
          { key: "operation", label: "" },
          { key: "component", label: "Component" },
          { key: "value", label: modeLabel(context) },
        ],
        rows: [
          { operation: "+", component: "Starting financial assets", value: bridge.startingFinancialAssets },
          { operation: "+", component: "Starting non-financial assets", value: bridge.startingNonFinancialAssets },
          { operation: "−", component: "Starting liabilities", value: bridge.startingLiabilities },
          { operation: "+", component: "External net cash inflows", value: bridge.externalNetCashInflows },
          { operation: "+", component: "Income-withheld contributions", value: bridge.incomeWithheldContributions },
          { operation: "+", component: "Investment returns", value: bridge.investmentReturns },
          { operation: "+", component: "Non-financial-asset appreciation", value: bridge.nonFinancialAssetAppreciation },
          { operation: "−", component: "Non-debt essential spending", value: bridge.nonDebtEssentialSpending },
          { operation: "−", component: "Discretionary spending", value: bridge.discretionarySpending },
          { operation: "−", component: "Liability interest", value: bridge.liabilityInterest },
          { operation: "−", component: "Taxes", value: bridge.taxes },
          { operation: "−", component: "One-time consumption outflows", value: bridge.oneTimeConsumptionOutflows },
          { operation: "±", component: "Principal payment / liability reduction", value: bridge.liabilityPrincipalReduction - bridge.liabilityPrincipalPayments },
          { operation: "=", component: "Total net worth at retirement", value: bridge.endingNetWorth },
        ],
      },
    ],
    assumptions: context.inputs.nonFinancialAssets.map((asset) => {
      const provenanceKey =
        asset.origin === "lunchmoney"
          ? `nonFinancialAssets.${asset.id}.openingValue`
          : "nonFinancialAssets.primaryResidence.openingValue";
      const provenance = context.baseline.provenance[provenanceKey];
      return {
        label: asset.label,
        value: `${exactCurrency.format(asset.openingValue)} valued ${asset.valueAsOf}; ${percent.format(asset.annualAppreciation)} annual appreciation; ${asset.origin === "lunchmoney" ? "imported Lunch Money residence" : "configured residence fallback"}`,
        sourceType:
          asset.origin === "lunchmoney"
            ? ("lunchmoney" as const)
            : ("configuration" as const),
        sourceDescription:
          provenance?.sourceDescription ??
          (asset.origin === "lunchmoney"
            ? "Imported Lunch Money primary-residence value with a configured appreciation assumption"
            : "Owner-supplied non-financial-asset valuation and appreciation assumption"),
        effectiveDate: provenance?.effectiveDate ?? asset.valueAsOf,
      };
    }),
    caveats: [
      "Home equity is included in total net worth but is not available to retirement withdrawals. A future explicit sale or conversion capability would be required.",
      "Mortgage principal repayment lowers financial assets and liabilities together, so it has no direct net-worth effect. Interest is consumption and reduces net worth.",
      `The net-worth bridge starts with financial assets, non-financial assets, and liabilities, then reconciles to ${modeLabel(context).toLowerCase()} ending net worth.`,
    ],
    reconciliation: {
      matched: reconciliation.matched,
      calculatedValue: round(bridge.endingNetWorth),
      displayedValue: round(endingDisplayed),
    },
  };
}

function liabilityScheduleDocument(
  context: ExplanationContext,
): ExplanationDocument {
  const reconciliation = buildBalanceSheetReconciliation(
    context.projection,
    context.displayMode,
  );
  const liabilities = context.inputs.liabilities;
  const scheduledLiabilities = liabilities.filter(
    (liability) => liability.openingBalance > 0,
  );
  const annualRows = context.projection.annual.flatMap((point) =>
    scheduledLiabilities.map((liability) => {
      const schedule =
        point[context.displayMode].liabilitySchedules[liability.id];
      return {
        period: annualPeriodLabel(context.inputs, point.calendarYear),
        liability: liability.label,
        openingPrincipal: schedule?.openingBalance ?? 0,
        interest: schedule?.interest ?? 0,
        regularPayment: schedule?.regularPayment ?? 0,
        principal: schedule?.principal ?? 0,
        lumpSums: schedule?.lumpSumPrincipal ?? 0,
        closingBalance: schedule?.closingBalance ?? 0,
      };
    }),
  );
  const finalView =
    context.projection.annual.at(-1)?.[context.displayMode];
  const calculatedClosing = liabilities.reduce(
    (total, liability) =>
      total + (finalView?.liabilityBalances[liability.id] ?? 0),
    0,
  );
  const displayedClosing =
    finalView?.balances.totalLiabilities ?? 0;
  const liabilityFundingComplete = context.projection.annual.every(
    (point) =>
      point.nominal.outflows.unmetRequiredOutflow <= 0.01 &&
      point.real.outflows.unmetRequiredOutflow <= 0.01,
  );
  const historicalHandlingLabel = (
    handling: (typeof liabilities)[number]["historicalPaymentHandling"],
  ): string => {
    if (handling === "payee_and_source_account") {
      return "Matched by configured payee and source account";
    }
    if (handling === "category_mapped") {
      return "Matched through a dedicated debt-payment category";
    }
    if (handling === "already_excluded_or_transfer") {
      return "Already excluded or represented as a transfer";
    }
    return "Not applicable";
  };
  const liabilitySteps = liabilities.map((liability) => {
    const treatment = liability.treatment;
    const payoffDate =
      context.projection.liabilityPayoffDates[liability.id];
    if (
      liability.openingBalance === 0 ||
      treatment.mode === "zero_balance"
    ) {
      return {
        label: liability.label,
        value: "Zero balance at projection start",
        operation: "input" as const,
        sourceType: "lunchmoney" as const,
        effectiveDate: liability.balanceAsOf,
      };
    }
    if (treatment.mode === "payoff_at_projection_start") {
      return {
        label: liability.label,
        value: "Paid in the first projected month",
        operation: "input" as const,
        sourceType: "lunchmoney" as const,
        effectiveDate: liability.balanceAsOf,
        details: [
          {
            label: "Opening balance",
            value: exactCurrency.format(liability.openingBalance),
            sourceType: "lunchmoney" as const,
            effectiveDate: liability.balanceAsOf,
          },
          {
            label: "Treatment",
            value: "Paid in the first projected month",
            sourceType: "configuration" as const,
          },
          {
            label: "Projected payoff date",
            value: payoffDate ?? "Not paid off within the projection",
            sourceType: "projection" as const,
          },
        ],
      };
    }
    return {
      label: liability.label,
      value: "Amortizing payment schedule",
      operation: "input" as const,
      sourceType: "lunchmoney" as const,
      effectiveDate: liability.balanceAsOf,
      details: [
        {
          label: "Opening principal",
          value: exactCurrency.format(liability.openingBalance),
          sourceType: "lunchmoney" as const,
          effectiveDate: liability.balanceAsOf,
        },
        {
          label: "Annual interest rate",
          value: percent.format(treatment.annualInterestRate),
          sourceType: (context.overrides[
            `liability.${liability.id}.annualInterestRate`
          ] !== undefined
            ? "override"
            : "configuration") as ExplanationSourceType,
        },
        {
          label: "Interest-rate convention",
          value: liabilityInterestRateConventionLabel(
            treatment.interestRateConvention,
          ),
          sourceType: "configuration" as const,
        },
        {
          label: "Entered regular payment",
          value: `${exactCurrency.format(treatment.regularPayment.amount)} ${treatment.regularPayment.frequency}`,
          sourceType: (context.overrides[
            `liability.${liability.id}.regularPayment.amount`
          ] !== undefined
            ? "override"
            : "configuration") as ExplanationSourceType,
        },
        {
          label: "Monthly equivalent",
          value: exactCurrency.format(
            treatment.regularPayment.monthlyEquivalent,
          ),
          sourceType: "projection" as const,
        },
        {
          label: "Current schedule effective date",
          value: treatment.scheduleStartDate,
          sourceType: "configuration" as const,
          effectiveDate: treatment.scheduleStartDate,
        },
        {
          label: "Historical payment handling",
          value: historicalHandlingLabel(
            liability.historicalPaymentHandling,
          ),
          sourceType: "configuration" as const,
        },
        {
          label: "Historical monthly average",
          value: exactCurrency.format(
            liability.historicalMonthlyAverage,
          ),
          sourceType: "lunchmoney" as const,
        },
        {
          label: "Projected payoff date",
          value: payoffDate ?? "Not paid off within the projection",
          sourceType: "projection" as const,
        },
      ],
    };
  });
  return {
    id: "liability-schedule",
    title: "Mortgage and debt schedule",
    plainLanguage:
      liabilities.length === 0
        ? "No liability schedule is active in this projection."
        : "Each required liability payment is funded before ordinary spending or cash-funded saving, then split between interest and principal. Principal reduces both cash and the liability; payments stop automatically when the balance reaches zero.",
    displayedResult: {
      label: "Ending liabilities",
      value: currency.format(displayedClosing),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Opening principal + interest − funded regular payment − funded lump-sum principal = closing principal",
    steps: [
      ...(scheduledLiabilities.length > 0
        ? [
            {
              label: "Required liability payment funding",
              value: liabilityFundingComplete
                ? "All required liability payments in the projection were fully funded"
                : "At least one required liability payment in the projection was not fully funded",
              sourceType: "projection" as const,
            },
          ]
        : []),
      ...liabilitySteps,
    ],
    dataSections: [
      {
        title: "Annual liability schedule",
        columns: [
          { key: "period", label: "Period" },
          { key: "liability", label: "Liability" },
          { key: "openingPrincipal", label: "Opening principal" },
          { key: "interest", label: "Interest" },
          { key: "regularPayment", label: "Funded regular payment" },
          { key: "principal", label: "Regular principal" },
          { key: "lumpSums", label: "Funded lump sums" },
          { key: "closingBalance", label: "Closing balance" },
        ],
        rows: annualRows,
        initiallyExpanded: true,
      },
      {
        title: "Historical payment replacement evidence",
        description:
          "Matched historical debt payments are aggregate audit evidence only; the configured schedule replaces them in the projection.",
        columns: [
          { key: "metric", label: "Metric" },
          { key: "value", label: "Value" },
        ],
        rows: [
          {
            metric: "Historical monthly average",
            value: context.baseline.cashFlowAudit.debtPayments.monthlyAverage,
          },
          {
            metric: "Historical transactions",
            value: context.baseline.cashFlowAudit.debtPayments.transactionCount,
          },
          {
            metric: "Liabilities with schedule replacement",
            value:
              context.baseline.cashFlowAudit.debtPayments.liabilities.filter(
                (liability) => liability.scheduleReplaced,
              ).length,
          },
        ],
      },
    ],
    assumptions: [],
    caveats: [
      "Historical payment activity does not infer the future interest rate, payment, or amortization terms.",
      "The final regular payment is reduced to the exact principal plus interest; no payment occurs after payoff.",
      "The schedule effective date must be on or before projection start. The imported opening balance remains authoritative; historical amortization is not replayed.",
      "A configured lump sum that exceeds the remaining balance or falls after projected payoff is rejected instead of being silently ignored.",
      "Rate renewals, refinancing, variable-rate trigger payments, HELOC draws, and home sale or conversion are not modelled.",
      "Home equity is not used to fund retirement withdrawals.",
    ],
    reconciliation: {
      matched: reconciliation.matched,
      calculatedValue: round(calculatedClosing),
      displayedValue: round(displayedClosing),
    },
  };
}

export function buildExplanation(
  target: ExplanationTarget,
  context: ExplanationContext,
): ExplanationDocument {
  if (target === "starting-financial-assets") return startingFinancialAssetsDocument(context);
  if (target === "assets-at-retirement") return assetsAtRetirementDocument(context);
  if (target === "retirement-goal") return goalDocument(context);
  if (target === "goal-gap") return goalGapDocument(context);
  if (target === "financial-assets-duration") return durationDocument(context);
  if (target === "annual-spending") return spendingChartDocument(context);
  if (target === "annual-funding") return fundingChartDocument(context);
  if (target === "annual-outflows") return outflowChartDocument(context);
  if (target === "account-burndown") return burndownDocument(context);
  if (target === "asset-allocation") return allocationDocument(context);
  if (target === "annual-ledger") return ledgerDocument(context);
  if (target === "cpp-benefit") return cppBenefitDocument(context);
  if (target === "oas-benefit") return oasBenefitDocument(context);
  if (target === "surplus-allocation") {
    return surplusAllocationDocument(context);
  }
  if (target === "registered-account-room") {
    return registeredAccountRoomDocument(context);
  }
  if (target === "home-equity-at-retirement") {
    return homeEquityAtRetirementDocument(context);
  }
  if (target === "liabilities-at-retirement") {
    return liabilitiesAtRetirementDocument(context);
  }
  if (target === "total-net-worth") {
    return totalNetWorthDocument(context);
  }
  if (target === "liability-schedule") {
    return liabilityScheduleDocument(context);
  }
  if (
    target === "baseline-income" ||
    target === "baseline-essential" ||
    target === "baseline-discretionary" ||
    target === "baseline-contributions" ||
    target === "baseline-recurring"
  ) {
    return baselineMetricDocument(context, target);
  }
  return accountsDocument(context);
}
