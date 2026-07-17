import type { BaselineValue } from "@/src/domain/defaults/types";
import { resolveActiveScenarioWarnings } from "@/src/domain/baseline/scenario-warnings";
import {
  buildAnnualChartData,
  buildAnnualLedgerData,
  closestAnnualPoint,
  monthlyEmploymentNetCash,
  monthlyInvestmentContributions,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import type { FinancialAccountInput } from "@/src/domain/projection/types";
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
  debt: "Debt",
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
          plannerType: accountTypeLabels[account.plannerType],
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
    title: "Assets at retirement",
    plainLanguage:
      "Projected cash and investment balances at the end of the final working month, immediately before the first fully retired month, expressed in today’s dollars.",
    displayedResult: {
      label: "Assets at retirement",
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
        label: "Assets at retirement",
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
          { operation: "+", component: "CPP, OAS, and pension", value: bridge.publicBenefitsAndPension, source: "Projection from local configuration" },
          { operation: "+", component: "Other inflows", value: bridge.otherInflows, source: "Projection from future events" },
          { operation: "+", component: "Income-withheld contributions", value: bridge.incomeWithheldContributions, source: "Projection from contribution phases" },
          { operation: "+", component: "Investment returns", value: bridge.investmentReturns, source: "Projection" },
          { operation: "−", component: "Essential spending", value: bridge.essentialSpending, source: "Lunch Money baseline / override" },
          { operation: "−", component: "Discretionary spending", value: bridge.discretionarySpending, source: "Lunch Money baseline / override" },
          { operation: "−", component: "One-time outflows", value: bridge.oneTimeOutflows, source: "Local configuration" },
          { operation: "−", component: "Taxes", value: bridge.taxes, source: "Projection from local assumptions" },
          { operation: "=", component: "Assets at retirement", value: bridge.endingFinancialAssets, source: "Exact retirement snapshot" },
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
      "Real property and other non-financial assets are not included.",
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
    formula: "Assets at retirement − retirement goal = goal gap",
    steps: [
      {
        label: "Assets at retirement",
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
      "Essential and discretionary spending projected for every labelled period using the active scenario and dollar view.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Active monthly spending × months in each period, indexed by inflation in future-dollar mode",
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
    ],
    dataSections: [
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
      .filter((account) => account.type !== "debt")
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
              "Net deposited employment cash from the phase active in each working month, with growth measured from that phase’s start.",
          },
          {
            series: "CPP",
            calculation:
              "Configured CPP after its start age, prorated for the period and indexed.",
          },
          {
            series: "OAS",
            calculation:
              "Configured OAS after its start age, prorated, indexed, and reduced by any recovery tax.",
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
      "CPP, OAS, and pension begin at their configured start ages.",
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
    title: "Spending, taxes, and contributions",
    plainLanguage:
      "Cash leaving the projected budget for spending, one-time events, simplified retirement tax, and cash-funded contributions.",
    displayedResult: {
      label: "Chart view",
      value: modeLabel(context),
      dollarMode: context.displayMode,
      period: period(context),
    },
    formula:
      "Essential + discretionary + one-time events + simplified tax + cash-funded contributions",
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
            oneTime,
            tax,
            contributions,
          }) => ({
            periodLabel,
            contributionPhases: contributionPhases || "No active contribution phase",
            essential,
            discretionary,
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
      plannerType: accountTypeLabels[account.type],
      financialAssetsTreatment:
        account.type === "debt" ? "Excluded — debt" : "Included",
      openingBalance: account.openingBalance,
      balanceDate: baselineAccount?.balanceAsOf ?? context.baseline.dataThrough,
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
  const accounts = context.inputs.accounts.filter((account) => account.type !== "debt");
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
      "Each ending account balance = previous balance + return + contributions − withdrawals; financial assets = sum of non-debt balances",
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
        rows: accountDetailsRows(context).filter((row) => row.plannerType !== "Debt"),
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
          { column: "Financial assets", meaning: "End-of-period cash and investment balance snapshot; debt excluded." },
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
          { key: "financialAssets", label: "Financial assets" },
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
  const financialAssets = rows.filter((row) => row.plannerType !== "Debt");
  const debt = rows.filter((row) => row.plannerType === "Debt");
  const totalIncludedAccounts = rows.length;
  const calculatedTotal = financialAssets.length + debt.length;
  return {
    id: "lunchmoney-accounts",
    title: "Lunch Money accounts",
    plainLanguage:
      "Included account balances come from Lunch Money; planner type, returns, contributions, withdrawal priority, and allocation come from the local configuration unless temporarily overridden.",
    displayedResult: {
      label: "Included accounts",
      value: String(totalIncludedAccounts),
      period: `Balances through ${context.baseline.dataThrough}`,
    },
    formula: "Financial-asset accounts + debt accounts = total included accounts",
    steps: [
      {
        label: "Financial-asset accounts",
        value: String(financialAssets.length),
        rawValue: financialAssets.length,
        operation: "input",
        sourceType: "lunchmoney",
      },
      {
        label: "Debt accounts excluded from financial assets",
        value: String(debt.length),
        rawValue: debt.length,
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
        title: "Included account mapping and assumptions",
        columns: [
          { key: "account", label: "Account" },
          { key: "plannerType", label: "Mapping type" },
          { key: "financialAssetsTreatment", label: "Financial-assets treatment" },
          { key: "openingBalance", label: "Opening balance" },
          { key: "balanceDate", label: "Balance as of" },
          { key: "annualReturn", label: "Return" },
          { key: "monthlyContribution", label: "Monthly contribution" },
          { key: "contributionFunding", label: "Contribution behavior" },
          { key: "withdrawalPriority", label: "Withdrawal priority" },
          { key: "allocation", label: "Allocation" },
        ],
        rows,
        initiallyExpanded: true,
      },
    ],
    assumptions: commonAssumptions(context),
    caveats: [
      "No raw transactions are included in this explanation.",
      "Debt balances reduce net worth but are not part of the financial-assets total.",
    ],
    reconciliation: matched(calculatedTotal, totalIncludedAccounts),
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
