import { describe, expect, it } from "vitest";
import { resolveActiveScenarioWarnings } from "@/src/domain/baseline/scenario-warnings";
import { buildExplanation } from "@/src/domain/explanations/build";
import {
  explanationTargets,
  type ExplanationContext,
  type ExplanationDocument,
} from "@/src/domain/explanations/types";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  buildAnnualChartData,
  buildAnnualLedgerData,
  buildContributionReconciliation,
} from "@/src/domain/projection/presentation";
import type {
  FinancialAccountInput,
  ProjectionInputs,
} from "@/src/domain/projection/types";
import {
  currentBaselineFixture,
  projectionFixture,
} from "./fixtures/projection";

function context(
  mutate?: (value: ExplanationContext) => void,
): ExplanationContext {
  const inputs = structuredClone(projectionFixture);
  const value: ExplanationContext = {
    baseline: structuredClone(currentBaselineFixture),
    inputs,
    overrides: {},
    projection: calculateProjection(inputs),
    displayMode: "real",
    selectedAllocationYear: 2046,
  };
  mutate?.(value);
  return value;
}

function simpleContext(): ExplanationContext {
  const value = context();
  const inputs = structuredClone(projectionFixture);
  const endAge = 40 + 1 / 12;
  inputs.startDate = "2026-01-15";
  inputs.person.currentAge = 40;
  inputs.person.retirementAge = endAge;
  inputs.endAge = endAge;
  inputs.annualInflation = 0;
  inputs.monthlyEssentialSpendingToday = 0;
  inputs.monthlyDiscretionarySpendingToday = 0;
  inputs.tax.effectiveTaxRate = 0;
  inputs.tax.oasRecoveryRate = 0;
  inputs.person.employmentIncomePhases = [
    {
      id: "working",
      label: "Working",
      startAge: 40,
      endAge,
      annualNetCashToday: 60000,
      annualGrowth: 0,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      },
    },
  ];
  const account = (
    id: string,
    label: string,
    type: FinancialAccountInput["type"],
    contributionPhases: FinancialAccountInput["contributionPhases"] = [],
    origin: FinancialAccountInput["origin"] = "lunchmoney",
  ): FinancialAccountInput => ({
    id,
    label,
    origin,
    type,
    openingBalance: 0,
    annualReturn: 0,
    contributionPhases,
    withdrawalPriority: 1,
    allocation:
      type === "cash"
        ? { cash: 1, fixedIncome: 0, equity: 0 }
        : { cash: 0, fixedIncome: 0.2, equity: 0.8 },
  });
  inputs.accounts = [
    account("manual:operating", "Operating cash", "cash"),
    account("manual:reserve", "Reserve refill", "cash"),
    account("plaid:tfsa", "Personal TFSA", "tfsa", [
      {
        id: "personal",
        label: "Personal saving",
        startAge: 40,
        endAge,
        monthlyAmountToday: 1000,
        funding: "cash",
        indexingRate: 0,
      },
    ]),
    account("plaid:personal-rrsp", "Personal RRSP", "rrsp_rrif"),
    account("plaid:workplace-rrsp", "Workplace RRSP", "rrsp_rrif", [
      {
        id: "workplace",
        label: "Workplace saving",
        startAge: 40,
        endAge,
        monthlyAmountToday: 1800,
        funding: "income_withheld",
        indexingRate: 0,
      },
    ]),
    account(
      "projection:future-taxable",
      "Future taxable",
      "non_registered",
      [],
      "projection_configuration",
    ),
  ];
  inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 500;
  inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
    2000;
  inputs.registeredAccountRoom!.rrsp.newRoom.startYearBeforeProjectionMonth = {
    calendarYear: 2026,
    eligibleEarnedIncome: 0,
    pensionAdjustment: 0,
    otherRoomReduction: 0,
  };
  inputs.contributionWaterfall = {
    mode: "simple_policy",
    routes: [
      {
        sourceAccountId: "plaid:workplace-rrsp",
        destinationAccountIds: ["plaid:workplace-rrsp"],
      },
      {
        sourceAccountId: "plaid:tfsa",
        destinationAccountIds: [
          "plaid:tfsa",
          "plaid:personal-rrsp",
          "projection:future-taxable",
        ],
      },
    ],
    surplusDestinationAccountIds: [
      "plaid:tfsa",
      "plaid:personal-rrsp",
      "projection:future-taxable",
    ],
  };
  inputs.surplusAllocation = {
    reserveAccountIds: ["manual:operating", "manual:reserve"],
    reserveRefillAccountId: "manual:reserve",
    targetCashReserveToday: 400,
    reserveIndexingRate: 0,
    excess: { mode: "allocate_through_contribution_waterfall" },
  };
  inputs.savingsPolicy = {
    mode: "simple",
    operatingCashAccountId: "manual:operating",
    reserveAccountIds: ["manual:operating", "manual:reserve"],
    reserveRefillAccountId: "manual:reserve",
    personalTfsaAccountId: "plaid:tfsa",
    personalRrspAccountId: "plaid:personal-rrsp",
    workplaceRrspAccountId: "plaid:workplace-rrsp",
    taxableAccountId: "projection:future-taxable",
    taxableAccountOrigin: "projection_configuration",
    reserveBuildingPhases: [
      {
        id: "reserve",
        label: "Reserve saving",
        startAge: 40,
        endAge,
        monthlyAmountToday: 1500,
        indexingRate: 0,
      },
    ],
    operatingCashTarget: null,
    unplannedCash: "retain_in_operating_cash",
    personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
    workplaceRoomPriority: "first",
    workplaceOverflow: "unallocated",
    reserveAfterTarget: "personal_investing",
  };
  inputs.events = [];
  value.inputs = inputs satisfies ProjectionInputs;
  value.baseline.projectionInputs = structuredClone(inputs);
  value.projection = calculateProjection(inputs);
  value.displayMode = "real";
  return value;
}

function longHorizonSimpleContext(
  displayMode: ExplanationContext["displayMode"] = "real",
): ExplanationContext {
  const value = simpleContext();
  const inputs = value.inputs;
  const endAge = 55;
  inputs.startDate = "2026-07-01";
  inputs.person.currentAge = 39;
  inputs.person.retirementAge = endAge;
  inputs.person.rrifConversionAge = 71;
  inputs.endAge = endAge;
  inputs.annualInflation = 0.021;
  inputs.monthlyEssentialSpendingToday = 2800;
  inputs.monthlyDiscretionarySpendingToday = 1200;
  inputs.person.employmentIncomePhases = [
    {
      id: "synthetic-long-work",
      label: "Synthetic long employment",
      startAge: 39,
      endAge,
      annualNetCashToday: 126000,
      annualGrowth: 0.017,
      rrspRoomGeneration: {
        annualEligibleEarnedIncomeToday: 165000,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0.019,
      },
    },
  ];
  for (const account of inputs.accounts) {
    if (account.type !== "cash") account.annualReturn = 0.047;
  }
  inputs.accounts.find(
    (account) => account.id === "manual:operating",
  )!.openingBalance = 14000;
  inputs.accounts.find(
    (account) => account.id === "manual:reserve",
  )!.openingBalance = 19000;
  const personal = inputs.accounts.find(
    (account) => account.id === "plaid:tfsa",
  )!.contributionPhases[0]!;
  personal.startAge = 39;
  personal.endAge = endAge;
  personal.monthlyAmountToday = 1111.11;
  personal.indexingRate = 0.017;
  const workplace = inputs.accounts.find(
    (account) => account.id === "plaid:workplace-rrsp",
  )!.contributionPhases[0]!;
  workplace.startAge = 39;
  workplace.endAge = endAge;
  workplace.monthlyAmountToday = 2888.88;
  workplace.indexingRate = 0.009;
  if (inputs.savingsPolicy.mode === "simple") {
    Object.assign(inputs.savingsPolicy.reserveBuildingPhases[0]!, {
      startAge: 39,
      endAge,
      monthlyAmountToday: 1777.77,
      indexingRate: 0.011,
    });
  }
  inputs.surplusAllocation.targetCashReserveToday = 48000;
  inputs.surplusAllocation.reserveIndexingRate = 0.02;
  inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 9000;
  inputs.registeredAccountRoom!.rrsp
    .startingAvailableDeductionRoom.amount = 24000;
  inputs.registeredAccountRoom!.rrsp.newRoom
    .startYearBeforeProjectionMonth = {
      calendarYear: 2026,
      eligibleEarnedIncome: 78000,
      pensionAdjustment: 0,
      otherRoomReduction: 0,
    };
  value.baseline.projectionInputs = structuredClone(inputs);
  value.projection = calculateProjection(inputs);
  value.displayMode = displayMode;
  value.selectedAllocationYear =
    value.projection.annual[0]!.calendarYear;
  return value;
}

function sweepContext(): ExplanationContext {
  const value = simpleContext();
  if (value.inputs.savingsPolicy.mode !== "simple") {
    throw new Error("fixture");
  }
  value.inputs.savingsPolicy.operatingCashTarget = {
    targetToday: 100,
    indexingRate: 0,
  };
  value.inputs.savingsPolicy.unplannedCash = "sweep_above_targets";
  value.baseline.projectionInputs = structuredClone(value.inputs);
  value.projection = calculateProjection(value.inputs);
  return value;
}

function section(document: ExplanationDocument, title: string) {
  return document.dataSections.find((item) => item.title === title)!;
}

function balanceSheetContext(
  mode: "real" | "nominal" = "nominal",
): ExplanationContext {
  return context((draft) => {
    draft.displayMode = mode;
    draft.inputs.nonFinancialAssets = [
      {
        id: "non_financial:primary_residence",
        label: "Synthetic residence",
        origin: "projection_configuration",
        type: "primary_residence",
        openingValue: 500000,
        valueAsOf: "2026-07-14",
        annualAppreciation: 0.02,
        availableForWithdrawals: false,
      },
    ];
    draft.inputs.liabilities = [
      {
        id: "synthetic:mortgage",
        label: "Synthetic mortgage",
        origin: "lunchmoney",
        openingBalance: 20000,
        balanceAsOf: "2026-07-14",
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0.04,
          interestRateConvention: "canadian_mortgage",
          regularPayment: {
            amount: 1000,
            frequency: "monthly",
            monthlyEquivalent: 1000,
          },
          scheduleStartDate: "2026-07-01",
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "category_mapped",
        historicalMonthlyAverage: 1000,
      },
    ];
    draft.baseline.projectionInputs = structuredClone(draft.inputs);
    draft.baseline.cashFlowAudit.debtPayments = {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
      breakdown: [],
      liabilities: [
        {
          liabilityId: "synthetic:mortgage",
          liabilityRole: "primary_mortgage",
          monthlyAverage: 1000,
          scheduleReplaced: true,
        },
      ],
    };
    draft.baseline.derived.debtPayments = {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
    };
    draft.projection = calculateProjection(draft.inputs);
  });
}

function finiteNumbers(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteNumbers);
  if (value && typeof value === "object") {
    return Object.values(value).every(finiteNumbers);
  }
  return true;
}

describe("calculation explanations", () => {
  it("reconciles starting financial-asset account rows and excludes debt", () => {
    const value = context((draft) => {
      draft.baseline.derived.accountBalances.push({
        id: "manual:debt",
        lunchMoneyId: 99,
        source: "manual",
        name: "Synthetic debt",
        plannerType: "debt",
        balance: 50000,
        balanceAsOf: "2026-07-14",
        monthlyContribution: 0,
        contributionSource: "lunchmoney_derived",
        contributionFunding: undefined,
      });
    });
    const document = buildExplanation("starting-financial-assets", value);
    const rows = section(document, "Included account balances").rows;

    expect(rows.map((row) => row.account)).not.toContain("Synthetic debt");
    expect(rows.reduce((total, row) => total + Number(row.balance), 0)).toBe(200000);
    expect(document.reconciliation).toMatchObject({ matched: true, displayedValue: 200000 });
  });

  it("reconciles retirement account-type balances to assets at retirement", () => {
    const document = buildExplanation("assets-at-retirement", context());
    const rows = section(document, "Retirement snapshot balances").rows;
    const sum = rows.reduce((total, row) => total + Number(row.balance), 0);

    expect(document.reconciliation?.matched).toBe(true);
    expect(sum).toBe(document.reconciliation?.displayedValue);
  });

  it("reconciles goal gap as assets at retirement minus goal", () => {
    const document = buildExplanation("goal-gap", context());
    const [assets, goal, result] = document.steps.map((step) => step.rawValue!);

    expect(Math.round((assets - goal) * 100) / 100).toBe(result);
    expect(document.reconciliation?.matched).toBe(true);
  });

  it("explains both depletion and no-depletion duration outcomes", () => {
    const noDepletion = context((draft) => {
      draft.inputs.monthlyEssentialSpendingToday = 0;
      draft.inputs.monthlyDiscretionarySpendingToday = 0;
      draft.projection = calculateProjection(draft.inputs);
    });
    const depletion = context((draft) => {
      draft.inputs.monthlyEssentialSpendingToday = 25000;
      draft.inputs.monthlyDiscretionarySpendingToday = 5000;
      draft.projection = calculateProjection(draft.inputs);
    });

    expect(buildExplanation("financial-assets-duration", noDepletion).displayedResult?.value)
      .toBe("Past age 95");
    expect(buildExplanation("financial-assets-duration", depletion).displayedResult?.value)
      .toMatch(/^To age /);
    expect(
      buildExplanation("financial-assets-duration", depletion).steps
        .find((step) => step.label === "Unmet spending occurred")?.value,
    ).toBe("Yes");
  });

  it("uses the exact plotted chart dataset in real and nominal explanations", () => {
    const real = context();
    const nominal = context((draft) => {
      draft.displayMode = "nominal";
    });
    const realDocument = buildExplanation("annual-spending", real);
    const nominalDocument = buildExplanation("annual-spending", nominal);
    const realRows = section(realDocument, "Data behind this chart").rows;
    const nominalRows = section(nominalDocument, "Data behind this chart").rows;
    const expectedReal = buildAnnualChartData(real.inputs, real.projection, "real");

    expect(realRows).toEqual(
      expectedReal.map(({ periodLabel, age, essential, discretionary }) => ({
        periodLabel,
        age,
        essential,
        discretionary,
      })),
    );
    expect(realRows[1]?.essential).not.toBe(nominalRows[1]?.essential);
    expect(realDocument.displayedResult?.value).toBe("Today’s dollars");
    expect(nominalDocument.displayedResult?.value).toBe("Future dollars");
    expect(realRows[0]?.periodLabel).toBe("2026 (Jul–Dec)");
  });

  it("uses the shared plotted rows for every annual chart and the ledger", () => {
    const value = context();
    const plotted = buildAnnualChartData(value.inputs, value.projection, "real");
    const funding = section(
      buildExplanation("annual-funding", value),
      "Data behind this chart",
    ).rows;
    const outflows = section(
      buildExplanation("annual-outflows", value),
      "Data behind this chart",
    ).rows;
    const burndown = section(
      buildExplanation("account-burndown", value),
      "Data behind this chart",
    ).rows;
    const ledger = section(
      buildExplanation("annual-ledger", value),
      "Displayed ledger data",
    ).rows;
    const accounts = value.inputs.accounts;

    expect(funding).toEqual(plotted.map((row) => ({
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
    })));
    expect(outflows).toEqual(plotted.map((row) => ({
      periodLabel: row.periodLabel,
      contributionPhases: row.contributionPhases || "No active contribution phase",
      essential: row.essential,
      discretionary: row.discretionary,
      liabilityCashPayment: row.liabilityCashPayment,
      oneTime: row.oneTime,
      tax: row.tax,
      contributions: row.contributions,
    })));
    expect(burndown).toEqual(plotted.map((row) => ({
      periodLabel: row.periodLabel,
      ...Object.fromEntries(
        accounts.map((account, index) => [
          `account${index}`,
          row[`account:${account.id}`],
        ]),
      ),
      financialAssets: row.financialAssets,
      goal: row.goal,
    })));
    expect(ledger).toEqual(
      buildAnnualLedgerData(value.inputs, value.projection, "real"),
    );
  });

  it("describes employment today-dollar growth from the projection start", () => {
    const document = buildExplanation("annual-funding", context());
    const employment = section(document, "Series calculations").rows.find(
      (row) => row.series === "Employment",
    );

    expect(employment?.calculation).toContain(
      "grow from the projection start",
    );
    expect(employment?.calculation).toContain(
      "related RRSP room-generation inputs",
    );
    expect(employment?.calculation).not.toContain(
      "growth measured from that phase’s start",
    );
  });

  it("reconciles selected-year allocation components to financial assets", () => {
    const document = buildExplanation("asset-allocation", context());
    const rows = section(document, "Selected-year allocation").rows;
    const sum = rows.reduce((total, row) => total + Number(row.value), 0);

    expect(document.title).toContain("2046");
    expect(sum).toBe(document.reconciliation?.calculatedValue);
    expect(document.reconciliation?.matched).toBe(true);
  });

  it("shows the exact retirement bridge and resolved employment and contribution paths", () => {
    const value = context();
    const document = buildExplanation("assets-at-retirement", value);
    const bridge = section(document, "How assets grew from today to retirement");
    const employment = section(document, "Employment income path");
    const contributions = section(document, "Contribution path");

    expect(bridge.rows.at(-1)).toMatchObject({
      component: "Reconciles to displayed value",
    });
    expect(employment.rows).toEqual([
      expect.objectContaining({
        phase: "Current income",
        startAge: 40,
        endAge: 65,
        annualNetCashToday: 84000,
      }),
    ]);
    expect(contributions.rows).toEqual([
      expect.objectContaining({
        account: "Investment account",
        phase: "Current saving",
        monthlyAmount: 1000,
        funding: "Cash-funded",
      }),
    ]);
  });

  it("labels phase overrides and reset values in explanation paths", () => {
    const active = context((draft) => {
      draft.inputs.person.employmentIncomePhases[0]!.annualNetCashToday = 70000;
      draft.inputs.accounts[1]!.contributionPhases[0]!.monthlyAmountToday = 750;
      draft.overrides = {
        "employmentPhase.current-income.annualNetCashToday": 70000,
        "contributionPhase.manual:2.current-saving.monthlyAmountToday": 750,
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    const activeDocument = buildExplanation("assets-at-retirement", active);
    const resetDocument = buildExplanation("assets-at-retirement", context());

    expect(section(activeDocument, "Employment income path").rows[0]?.source).toBe(
      "Temporary override",
    );
    expect(section(activeDocument, "Contribution path").rows[0]?.source).toBe(
      "Temporary override",
    );
    expect(section(resetDocument, "Employment income path").rows[0]?.source).not.toBe(
      "Temporary override",
    );
  });

  it("makes the long live-baseline income warning follow the active scenario", () => {
    const value = context();

    for (const target of [
      "assets-at-retirement",
      "financial-assets-duration",
      "baseline-income",
    ] as const) {
      expect(
        buildExplanation(target, value).caveats.some((caveat) =>
          caveat.includes("assumed to continue for 25 years"),
        ),
      ).toBe(true);
    }

    const amountOverride = context((draft) => {
      draft.inputs.person.employmentIncomePhases[0]!.annualNetCashToday = 70000;
      draft.overrides = {
        "employmentPhase.current-income.annualNetCashToday": 70000,
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    expect(resolveActiveScenarioWarnings(
      amountOverride.baseline,
      amountOverride.inputs,
    ).some((warning) => warning.code === "long_live_baseline_income")).toBe(false);
    for (const target of [
      "assets-at-retirement",
      "financial-assets-duration",
      "baseline-income",
    ] as const) {
      expect(
        buildExplanation(target, amountOverride).caveats.some((caveat) =>
          caveat.includes("Current Lunch Money employment income"),
        ),
      ).toBe(false);
    }

    const growthOnlyOverride = context((draft) => {
      draft.inputs.person.employmentIncomePhases[0]!.annualGrowth = 0.03;
      draft.overrides = {
        "employmentPhase.current-income.annualGrowth": 0.03,
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    expect(resolveActiveScenarioWarnings(
      growthOnlyOverride.baseline,
      growthOnlyOverride.inputs,
    ).some((warning) => warning.code === "long_live_baseline_income")).toBe(true);

    const reset = context();
    expect(resolveActiveScenarioWarnings(
      reset.baseline,
      reset.inputs,
    ).some((warning) => warning.code === "long_live_baseline_income")).toBe(true);

    const configuredNumeric = context((draft) => {
      draft.baseline.provenance[
        "person.employmentIncomePhases.current-income.annualNetCashToday"
      ] = {
        value: 84000,
        sourceType: "local_configuration",
        sourceDescription: "Explicit configured phase amount",
        effectiveDate: "2026-07-14",
      };
      draft.baseline.warnings.push({
        code: "long_live_baseline_income",
        severity: "warning",
        message: "Static refreshed-baseline warning that must be replaced.",
      });
    });
    expect(resolveActiveScenarioWarnings(
      configuredNumeric.baseline,
      configuredNumeric.inputs,
    ).some((warning) => warning.code === "long_live_baseline_income")).toBe(false);
  });

  it("reconciles imported and projection-only financial accounts to the included-account count", () => {
    const additionalAccounts: FinancialAccountInput[] = [
      {
        id: "manual:extra-tfsa",
        label: "Synthetic TFSA",
        origin: "lunchmoney",
        type: "tfsa",
        openingBalance: 10000,
        annualReturn: 0.04,
        contributionPhases: [],
        withdrawalPriority: 3,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      },
      {
        id: "projection:extra-taxable",
        label: "Synthetic future taxable",
        origin: "projection_configuration",
        type: "non_registered",
        openingBalance: 0,
        annualReturn: 0.05,
        contributionPhases: [],
        withdrawalPriority: 4,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      },
    ];
    const value = context((draft) => {
      draft.inputs.accounts.push(...structuredClone(additionalAccounts));
      draft.baseline.projectionInputs.accounts.push(...structuredClone(additionalAccounts));
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("lunchmoney-accounts", value);

    expect(document.displayedResult?.value).toBe("4");
    expect(document.steps.map(({ label, operation, rawValue }) => ({
      label,
      operation,
      rawValue,
    }))).toEqual([
      {
        label: "Financial-asset accounts",
        operation: "input",
        rawValue: 3,
      },
      {
        label: "Projection-only financial accounts",
        operation: "add",
        rawValue: 1,
      },
      {
        label: "Total included accounts",
        operation: "result",
        rawValue: 4,
      },
    ]);
    expect(document.reconciliation).toEqual({
      matched: true,
      calculatedValue: 4,
      displayedValue: 4,
    });
  });

  it("excludes zero-contribution accounts from outflow funding counts and evidence", () => {
    const zeroContributionAccounts: FinancialAccountInput[] = [
      {
        id: "manual:zero-cash",
        label: "Zero cash-funded contribution",
        origin: "lunchmoney",
        type: "tfsa",
        openingBalance: 0,
        annualReturn: 0.05,
        contributionPhases: [{
          id: "zero",
          label: "Zero",
          startAge: 40,
          endAge: 65,
          monthlyAmountToday: 0,
          funding: "cash",
          indexingRate: 0.02,
        }],
        withdrawalPriority: 3,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      },
      {
        id: "manual:zero-withheld",
        label: "Zero income-withheld contribution",
        origin: "lunchmoney",
        type: "non_registered",
        openingBalance: 0,
        annualReturn: 0.05,
        contributionPhases: [{
          id: "zero",
          label: "Zero",
          startAge: 40,
          endAge: 65,
          monthlyAmountToday: 0,
          funding: "income_withheld",
          indexingRate: 0.02,
        }],
        withdrawalPriority: 4,
        allocation: { cash: 0.05, fixedIncome: 0.25, equity: 0.7 },
      },
    ];
    const value = context((draft) => {
      draft.inputs.accounts.push(...structuredClone(zeroContributionAccounts));
      draft.baseline.projectionInputs.accounts.push(
        ...structuredClone(zeroContributionAccounts),
      );
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("annual-outflows", value);
    const rows = section(document, "Active contribution funding").rows;

    expect(
      document.steps.find((step) => step.label === "Cash-funded contribution accounts")
        ?.value,
    ).toBe("1");
    expect(
      document.steps.find(
        (step) => step.label === "Income-withheld contribution accounts",
      )?.value,
    ).toBe("0");
    expect(rows.map((row) => row.account)).toEqual(["Investment account"]);
  });

  it("updates contribution counts and evidence for an active override and its reset", () => {
    const zeroBaselineAccount: FinancialAccountInput = {
      id: "manual:override-contribution",
      label: "Override investment",
      origin: "lunchmoney",
      type: "tfsa",
      openingBalance: 0,
      annualReturn: 0.05,
      contributionPhases: [{
        id: "override-phase",
        label: "Override phase",
        startAge: 40,
        endAge: 65,
        monthlyAmountToday: 0,
        funding: "income_withheld",
        indexingRate: 0.02,
      }],
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    };
    const active = context((draft) => {
      draft.baseline.projectionInputs.accounts.push(
        structuredClone(zeroBaselineAccount),
      );
      draft.inputs.accounts.push({
        ...structuredClone(zeroBaselineAccount),
        contributionPhases: [{
          ...structuredClone(zeroBaselineAccount.contributionPhases[0]!),
          monthlyAmountToday: 750,
        }],
      });
      draft.overrides = {
        "contributionPhase.manual:override-contribution.override-phase.monthlyAmountToday": 750,
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    const reset = context((draft) => {
      draft.baseline.projectionInputs.accounts.push(
        structuredClone(zeroBaselineAccount),
      );
      draft.inputs.accounts.push(structuredClone(zeroBaselineAccount));
      draft.projection = calculateProjection(draft.inputs);
    });
    const activeDocument = buildExplanation("annual-outflows", active);
    const resetDocument = buildExplanation("annual-outflows", reset);

    expect(
      activeDocument.steps.find(
        (step) => step.label === "Income-withheld contribution accounts",
      )?.value,
    ).toBe("1");
    expect(section(activeDocument, "Active contribution funding").rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          account: "Override investment",
          monthlyContribution: 750,
          funding: "Income-withheld",
        }),
      ]),
    );
    expect(
      resetDocument.steps.find(
        (step) => step.label === "Income-withheld contribution accounts",
      )?.value,
    ).toBe("0");
    expect(
      section(resetDocument, "Active contribution funding").rows.some(
        (row) => row.account === "Override investment",
      ),
    ).toBe(false);
  });

  it("labels and uses an active override, then removes override evidence after reset", () => {
    const overridden = context((draft) => {
      draft.inputs.monthlyEssentialSpendingToday = 4100;
      draft.overrides = { monthlyEssentialSpendingToday: 4100 };
      draft.projection = calculateProjection(draft.inputs);
    });
    const activeDocument = buildExplanation("baseline-essential", overridden);
    const resetDocument = buildExplanation("baseline-essential", context());

    expect(activeDocument.displayedResult?.value).toBe("$4,100");
    expect(activeDocument.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Active temporary override",
          sourceType: "override",
          rawValue: 4100,
        }),
      ]),
    );
    expect(
      buildExplanation("annual-spending", overridden).assumptions,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Essential monthly spending",
          sourceType: "override",
        }),
      ]),
    );
    expect(resetDocument.steps.some((step) => step.sourceType === "override")).toBe(false);
  });

  it("reconciles CPP claim arithmetic and updates a claim-age override", () => {
    const reset = buildExplanation("cpp-benefit", context());
    const overridden = context((draft) => {
      draft.inputs.person.cpp.startAge = 70;
      draft.overrides = { cppStartAge: 70 };
      draft.projection = calculateProjection(draft.inputs);
    });
    const active = buildExplanation("cpp-benefit", overridden);

    expect(reset.reconciliation?.matched).toBe(true);
    expect(reset.steps.find((step) => step.label === "Claim factor")?.rawValue)
      .toBe(1);
    expect(active.reconciliation?.matched).toBe(true);
    expect(active.steps.find((step) => step.label === "Claim factor")?.rawValue)
      .toBeCloseTo(1.42);
    expect(active.assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "CPP claim age",
          sourceType: "override",
          value: "70",
        }),
      ]),
    );
    expect(reset.assumptions.some((item) => item.sourceType === "override"))
      .toBe(false);
  });

  it("uses exact aligned adjustment months in fractional-age explanations", () => {
    const value = context((draft) => {
      draft.inputs.person.cpp.startAge = 65 + 1 / 12;
      draft.inputs.person.oas.startAge = 65.5;
      draft.baseline.projectionInputs.person.cpp.startAge = 65 + 1 / 12;
      draft.baseline.projectionInputs.person.oas.startAge = 65.5;
      draft.projection = calculateProjection(draft.inputs);
    });

    const cpp = buildExplanation("cpp-benefit", value);
    const oas = buildExplanation("oas-benefit", value);

    expect(cpp.formula).toBe(
      "Base amount × [1 + (1 month × 0.007)]",
    );
    expect(
      cpp.steps.find((step) => step.label === "Claim-age increase")?.value,
    ).toBe("1 month × 0.7%");
    expect(
      cpp.steps.find((step) => step.label === "Claim factor")?.rawValue,
    ).toBeCloseTo(1.007, 10);
    expect(cpp.reconciliation?.matched).toBe(true);

    expect(oas.formula).toBe(
      "Full amount at 65 × eligibility fraction × [1 + (6 months × 0.006)]",
    );
    expect(
      oas.steps.find((step) => step.label === "Delayed-claim adjustment")
        ?.value,
    ).toBe("6 months × 0.6%");
    expect(
      oas.steps.find((step) => step.label === "Claim factor")?.rawValue,
    ).toBeCloseTo(1.036, 10);
    expect(oas.reconciliation?.matched).toBe(true);
  });

  it("shows OAS partial-residence arithmetic, delayed claim, and age-75 amount", () => {
    const value = context((draft) => {
      draft.inputs.person.oas.startAge = 70;
      draft.inputs.person.oas.fullMonthlyAmountAt65Today = 751.97;
      draft.inputs.person.oas.eligibility = {
        mode: "partial",
        qualifyingResidenceYearsAfter18: 20,
        fraction: 0.5,
      };
      draft.baseline.projectionInputs.person.oas =
        structuredClone(draft.inputs.person.oas);
      draft.baseline.provenance["person.oas.eligibility.fraction"] = {
        value: 0.5,
        sourceType: "local_configuration",
        sourceDescription: "20 qualifying years divided by 40",
        effectiveDate: "2026-07-14",
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("oas-benefit", value);

    expect(document.reconciliation?.matched).toBe(true);
    expect(
      document.steps.find((step) => step.label === "Partial eligibility")
        ?.value,
    ).toContain("20 ÷ 40");
    expect(
      document.steps.find((step) => step.label === "Claim factor")?.rawValue,
    ).toBeCloseTo(1.36);
    expect(
      document.steps.find(
        (step) => step.label === "Monthly amount after age-75 increase",
      )?.rawValue,
    ).toBeCloseTo(751.97 * 0.5 * 1.36 * 1.1);
    expect(document.caveats.join(" ")).toContain(
      "international social-security agreements",
    );
  });

  it("never labels a Canadian CPP reference as a personal entitlement", () => {
    const value = context((draft) => {
      draft.baseline.provenance["person.cpp.monthlyAmountAt65Today"] = {
        value: 877.01,
        sourceType: "canadian_reference",
        sourceDescription:
          "Published average for new CPP beneficiaries at age 65; not a personal estimate or entitlement.",
        effectiveDate: "2026-04-01",
        referenceKind: "population_average",
        referenceUrl:
          "https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html",
      };
      draft.baseline.warnings.push({
        code: "cpp_canadian_reference_in_use",
        severity: "warning",
        message:
          "CPP uses a generic published Canadian average, not a personal estimate or entitlement.",
      });
    });
    const serialized = JSON.stringify(buildExplanation("cpp-benefit", value));

    expect(serialized).toContain("not a personal");
    expect(serialized).not.toMatch(/personal entitlement is|your entitlement/i);
  });

  it("makes a legacy zero benefit and its migration warning visible", () => {
    const value = context((draft) => {
      draft.inputs.person.cpp.monthlyAmountAt65Today = 0;
      draft.baseline.projectionInputs.person.cpp.monthlyAmountAt65Today = 0;
      draft.baseline.warnings.push({
        code: "legacy_zero_cpp_amount",
        severity: "warning",
        message:
          "Legacy CPP amount remains zero; canonical configuration must use explicit_zero.",
      });
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("cpp-benefit", value);

    expect(document.displayedResult?.value).toBe("$0.00");
    expect(document.caveats.join(" ")).toContain("explicit_zero");
    expect(document.reconciliation?.matched).toBe(true);
  });

  it("builds the surplus explanation from the shared result and annual presentation rows", () => {
    const value = context();
    const document = buildExplanation("surplus-allocation", value);
    const chartRows = buildAnnualChartData(
      value.inputs,
      value.projection,
      value.displayMode,
    );
    const rows = section(document, "Annual surplus allocation").rows;

    expect(rows[0]).toMatchObject({
      period: chartRows[0]!.periodLabel,
      generated: chartRows[0]!.surplusGenerated,
      reserveRefill: chartRows[0]!.surplusReserveRefill,
      retainedAsCash: chartRows[0]!.surplusRetainedAsCash,
      redirected: chartRows[0]!.surplusRedirected,
      reserveTarget: chartRows[0]!.surplusReserveTarget,
    });
    expect(document.reconciliation?.matched).toBe(true);
    expect(
      document.assumptions.find(
        (item) => item.label === "Reserve accounts and origins",
      )?.value,
    ).toContain("Cash account");
    expect(
      document.assumptions.find(
        (item) => item.label === "Reserve refill account and origin",
      )?.value,
    ).toContain("Cash account");
    expect(document.caveats.join(" ")).toContain(
      "registered-account room",
    );
    expect(document.caveats.join(" ")).toContain(
      "does not change total financial assets at the allocation moment",
    );
    expect(
      document.steps.find(
        (step) => step.label === "Routed difference from generated",
      )?.rawValue,
    ).toBe(0);
    expect(
      document.steps.find(
        (step) =>
          step.label === "Account-deposit difference from generated",
      )?.rawValue,
    ).toBe(0);
  });

  it("does not reconcile surplus when account deposits differ from generated", () => {
    const value = context((draft) => {
      const totals =
        draft.projection.surplusAllocation.throughRetirement.real;
      const [accountId] = Object.keys(totals.accountAllocations);
      totals.accountAllocations[accountId!] += 1;
    });
    const document = buildExplanation("surplus-allocation", value);

    expect(
      document.steps.find(
        (step) => step.label === "Routed difference from generated",
      )?.rawValue,
    ).toBe(0);
    expect(
      document.steps.find(
        (step) =>
          step.label === "Account-deposit difference from generated",
      )?.rawValue,
    ).toBe(1);
    expect(document.reconciliation?.matched).toBe(false);
  });

  it("does not reconcile surplus when routed totals differ from generated", () => {
    const value = context((draft) => {
      draft.projection.surplusAllocation.throughRetirement.real
        .retainedAsCash += 1;
    });
    const document = buildExplanation("surplus-allocation", value);

    expect(
      document.steps.find(
        (step) => step.label === "Routed difference from generated",
      )?.rawValue,
    ).toBe(1);
    expect(
      document.steps.find(
        (step) =>
          step.label === "Account-deposit difference from generated",
      )?.rawValue,
    ).toBe(0);
    expect(document.reconciliation?.matched).toBe(false);
  });

  it("shows active reserve overrides and reset evidence without duplicating policy formulas", () => {
    const overridden = context((draft) => {
      draft.inputs.surplusAllocation.targetCashReserveToday = 45000;
      draft.inputs.surplusAllocation.reserveIndexingRate = 0.04;
      draft.overrides = {
        "surplusAllocation.targetCashReserveToday": 45000,
        "surplusAllocation.reserveIndexingRate": 0.04,
      };
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("surplus-allocation", overridden);
    expect(
      document.assumptions.find(
        (item) => item.label === "Target reserve today",
      ),
    ).toMatchObject({ sourceType: "override" });
    expect(
      document.assumptions.find(
        (item) => item.label === "Reserve indexing",
      ),
    ).toMatchObject({ sourceType: "override" });
    expect(
      section(document, "Annual surplus allocation").rows[0]
        ?.reserveTarget,
    ).toBe(
      buildAnnualChartData(
        overridden.inputs,
        overridden.projection,
        overridden.displayMode,
      )[0]!.surplusReserveTarget,
    );

    const reset = buildExplanation("surplus-allocation", context());
    expect(
      reset.assumptions.some((item) => item.sourceType === "override"),
    ).toBe(false);
  });

  it("explains simple policy intent from shared preview and annual result rows", () => {
    const value = simpleContext();
    const document = buildExplanation("surplus-allocation", value);
    const rows = section(
      document,
      "Annual explicit savings and retained cash",
    ).rows;
    const chartRows = buildAnnualChartData(
      value.inputs,
      value.projection,
      value.displayMode,
    );

    expect(document.title).toBe("Explicit savings and retained cash");
    expect(document.plainLanguage).toContain(
      "Only configured savings plans are invested",
    );
    expect(document.plainLanguage).toContain(
      "Workplace RRSP gets first claim",
    );
    expect(document.plainLanguage).toContain(
      "Unplanned positive cash is retained",
    );
    expect(
      section(document, "Resolved simple policy preview").rows,
    ).toEqual(
      expect.arrayContaining([
        {
          concept: "Personal order",
          resolved: "Personal TFSA → personal RRSP → taxable",
        },
        {
          concept: "Taxable destination",
          resolved: "Future taxable (projection-only)",
        },
      ]),
    );
    expect(rows[0]).toMatchObject({
      positiveCashAvailable: chartRows[0]!.positiveCashAvailable,
      personalPlanned: chartRows[0]!.personalPlanAmount,
      reservePlanned: chartRows[0]!.reserveBuildingPlanAmount,
      reserveRetainedAsCash: chartRows[0]!.reserveCashRetained,
      reserveRedirected: chartRows[0]!.reservePlanRedirected,
      workplaceUnallocated: chartRows[0]!.workplaceUnallocated,
      unplannedCashRetained: chartRows[0]!.unplannedCashRetained,
      totalInvestmentDeposits: chartRows[0]!.totalInvestmentDeposits,
    });
    expect(document.reconciliation?.matched).toBe(true);
    expect(document.caveats.join(" ")).toContain(
      "personal cash never uses the workplace RRSP",
    );
  });

  it("explains indexed operating targets and unplanned sweeps from shared results", () => {
    const value = sweepContext();
    const document = buildExplanation("surplus-allocation", value);
    const previewRows = section(
      document,
      "Resolved simple policy preview",
    ).rows;
    const annualRows = section(
      document,
      "Annual explicit savings and retained cash",
    ).rows;

    expect(document.plainLanguage).toContain(
      "fills any operating or combined reserve shortfall",
    );
    expect(previewRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          concept: "Operating target today",
        }),
        expect.objectContaining({
          concept: "Operating cash in combined reserve",
          resolved: expect.stringContaining("not added"),
        }),
      ]),
    );
    expect(annualRows[0]).toMatchObject({
      operatingCashTarget:
        value.projection.annual[0]!.real.savingsPolicy.operatingCashTarget,
      combinedReserveTarget:
        value.projection.annual[0]!.real.savingsPolicy.combinedReserveTarget,
      unplannedCashSwept:
        value.projection.annual[0]!.real.savingsPolicy.unplannedCashSwept,
    });
    expect(document.reconciliation?.matched).toBe(true);

    if (value.inputs.savingsPolicy.mode !== "simple") {
      throw new Error("fixture");
    }
    value.inputs.savingsPolicy.operatingCashTarget!.targetToday = 200;
    value.overrides["savingsPolicy.operatingCash.targetToday"] = 200;
    value.projection = calculateProjection(value.inputs);
    const overridden = buildExplanation("surplus-allocation", value);
    expect(
      overridden.assumptions.find(
        (item) => item.label === "Operating cash target today",
      ),
    ).toMatchObject({ sourceType: "override" });

    const mismatch = sweepContext();
    mismatch.projection.annual[0]!.real.accountSweepAllocations[
      "projection:future-taxable"
    ] += 10;
    expect(
      buildExplanation(
        "registered-account-room",
        mismatch,
      ).reconciliation?.matched,
    ).toBe(false);
  });

  it("enforces every simple savings equality in the room explanation", () => {
    const valid = simpleContext();
    const document = buildExplanation("registered-account-room", valid);
    expect(document.reconciliation?.matched).toBe(true);
    expect(document.plainLanguage).toContain(
      "Only explicit plans are invested",
    );
    expect(section(document, "Resolved policy order").description).toContain(
      "compiled from owner-facing roles",
    );

    const reserveMismatch = simpleContext();
    reserveMismatch.projection.annual[0]!.real.savingsPolicy
      .reserveRetainedAsCash += 10;
    expect(
      buildExplanation(
        "registered-account-room",
        reserveMismatch,
      ).reconciliation?.matched,
    ).toBe(false);

    const cashMismatch = simpleContext();
    cashMismatch.projection.annual[0]!.real.savingsPolicy
      .positiveCashAvailable += 10;
    expect(
      buildExplanation(
        "registered-account-room",
        cashMismatch,
      ).reconciliation?.matched,
    ).toBe(false);
  });

  it("keeps projection-only accounts separate with fixed-zero provenance wording", () => {
    const value = context((draft) => {
      const account: FinancialAccountInput = {
        id: "projection:future-taxable",
        label: "Synthetic future taxable",
        origin: "projection_configuration",
        type: "non_registered",
        openingBalance: 0,
        annualReturn: 0.05,
        contributionPhases: [],
        withdrawalPriority: 4,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      };
      draft.inputs.accounts.push(account);
      draft.baseline.projectionInputs.accounts.push(
        structuredClone(account),
      );
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("lunchmoney-accounts", value);
    const projectionRows = section(
      document,
      "Projection-only configured accounts",
    ).rows;
    const importedRows = section(
      document,
      "Imported Lunch Money account mapping and assumptions",
    ).rows;

    expect(projectionRows).toEqual([
      expect.objectContaining({
        account: "Synthetic future taxable",
        origin: "Projection-only configuration",
        openingBalance: 0,
        openingBalanceSource: expect.stringContaining("not imported"),
      }),
    ]);
    expect(
      importedRows.some(
        (row) => row.account === "Synthetic future taxable",
      ),
    ).toBe(false);
  });

  it("returns only finite deterministic evidence and omits credentials", () => {
    const value = context();
    value.baseline.provenance.unused = {
      value: "unused",
      sourceType: "local_configuration",
      sourceDescription: "token=synthetic-secret",
      effectiveDate: "2026-07-14",
    };
    const documents = explanationTargets.map((target) => buildExplanation(target, value));
    const serialized = JSON.stringify(documents);

    expect(finiteNumbers(documents)).toBe(true);
    expect(serialized).not.toContain("synthetic-secret");
    expect(serialized).not.toMatch(/LUNCHMONEY_API_TOKEN|authorization|password/i);
  });

  it("builds registered-room explanations from shared annual presentation rows", () => {
    const value = context();
    const document = buildExplanation("registered-account-room", value);
    const rows = section(
      document,
      "Annual registered room and routing",
    ).rows;
    const chartRows = buildAnnualChartData(
      value.inputs,
      value.projection,
      value.displayMode,
    );

    expect(document.reconciliation?.matched).toBe(true);
    expect(rows[0]).toMatchObject({
      period: chartRows[0]!.periodLabel,
      planned: chartRows[0]!.plannedContributions,
      allowed: chartRows[0]!.allowedContributions,
      surplusFunded: chartRows[0]!.surplusFundedContributions,
      actual: chartRows[0]!.actualContributions,
      unallocated: chartRows[0]!.unallocatedContributions,
      tfsaClosing: chartRows[0]!.tfsaRoomClosing,
      rrspClosing: chartRows[0]!.rrspRoomClosing,
    });
    expect(document.caveats.join(" ")).toContain(
      "Net deposited employment cash is never treated as RRSP-eligible earned income",
    );
    expect(document.caveats.join(" ")).toContain(
      "next January boundary",
    );
    expect(document.caveats.join(" ")).toContain(
      "nominal regulatory dollars",
    );
  });

  it("keeps long-horizon simple contribution reconciliation cent-stable in both modes", () => {
    const nominal = longHorizonSimpleContext("nominal");
    const nominalSummary = buildContributionReconciliation(
      nominal.projection,
      "nominal",
    );
    const realSummary = buildContributionReconciliation(
      nominal.projection,
      "real",
    );
    const cents = (value: number) => Math.round(value * 100);

    expect(nominal.projection.annual.length).toBeGreaterThanOrEqual(16);
    expect(
      nominal.projection.inputs.accounts.find(
        (account) => account.id === "projection:future-taxable",
      ),
    ).toMatchObject({
      origin: "projection_configuration",
      openingBalance: 0,
    });
    expect(
      nominal.projection.annual.some(
        (point) =>
          point.nominal.savingsPolicy.reserveRetainedAsCash > 0,
      ),
    ).toBe(true);
    expect(
      nominal.projection.annual.some(
        (point) => point.nominal.savingsPolicy.reserveRedirected > 0,
      ),
    ).toBe(true);
    expect(
      nominal.projection.annual.some(
        (point) => point.nominal.savingsPolicy.unplannedCashRetained > 0,
      ),
    ).toBe(true);
    expect(
      nominal.projection.annual.some(
        (point) => point.nominal.savingsPolicy.workplaceUnallocated > 0,
      ),
    ).toBe(true);

    for (const mode of ["nominal", "real"] as const) {
      const summary =
        mode === "nominal" ? nominalSummary : realSummary;
      const document = buildExplanation(
        "registered-account-room",
        longHorizonSimpleContext(mode),
      );
      expect(
        Object.values(summary.equations).every(
          (equation) =>
            equation.periodsMatched &&
            equation.maximumPeriodDifference <= 0.01,
        ),
      ).toBe(true);
      expect(summary.matched).toBe(true);
      expect(document.reconciliation?.matched).toBe(true);
      expect(
        cents(document.reconciliation!.calculatedValue),
      ).toBe(cents(document.reconciliation!.displayedValue));
    }

    expect(
      nominalSummary.equations.totalActual.rawAggregateDifference,
    ).toBeGreaterThan(0.01);
    for (const point of nominal.projection.annual) {
      expect(point.real.registeredAccountRoom).toEqual(
        point.nominal.registeredAccountRoom,
      );
    }
  });

  it("rejects one-cent-plus annual mismatches and opposite-sign cancellation", () => {
    const single = longHorizonSimpleContext("nominal");
    single.projection.annual[2]!.nominal.contributions.total += 0.02;
    expect(
      buildExplanation(
        "registered-account-room",
        single,
      ).reconciliation?.matched,
    ).toBe(false);

    const cancelling = longHorizonSimpleContext("nominal");
    const baselineAggregateDifference =
      buildContributionReconciliation(
        cancelling.projection,
        "nominal",
      ).equations.totalActual.rawAggregateDifference;
    cancelling.projection.annual[2]!.nominal.contributions.total +=
      0.02;
    cancelling.projection.annual[3]!.nominal.contributions.total -=
      0.02;
    const summary = buildContributionReconciliation(
      cancelling.projection,
      "nominal",
    );
    expect(
      summary.equations.totalActual.rawAggregateDifference,
    ).toBe(baselineAggregateDifference);
    expect(summary.equations.totalActual.periodsMatched).toBe(false);
    expect(
      buildExplanation(
        "registered-account-room",
        cancelling,
      ).reconciliation?.matched,
    ).toBe(false);
  });

  it("keeps advanced room explanations reconciled with cent-stable totals", () => {
    for (const displayMode of ["nominal", "real"] as const) {
      const value = context((draft) => {
        draft.displayMode = displayMode;
      });
      const summary = buildContributionReconciliation(
        value.projection,
        displayMode,
      );
      expect(summary.matched).toBe(true);
      expect(
        buildExplanation(
          "registered-account-room",
          value,
        ).reconciliation?.matched,
      ).toBe(true);
    }
  });

  it("marks every registered-room contribution and room mismatch unmatched", () => {
    const mutations: Array<(value: ReturnType<typeof context>) => void> = [
      (value) => {
        value.projection.annual[0]!.real.contributions.unallocated += 10;
      },
      (value) => {
        value.projection.annual[0]!.real.contributions.total += 10;
      },
      (value) => {
        value.projection.annual[0]!.real.contributions.surplusFunded += 10;
      },
      (value) => {
        value.projection.annual[0]!.real.contributions.cashFunded += 10;
      },
      (value) => {
        Object.values(
          value.projection.annual[0]!.real.accountContributionDetails,
        )[0]!.depositedIntoAccount += 10;
      },
      (value) => {
        Object.values(
          value.projection.annual[0]!.real.accountContributionDetails,
        )[0]!.redirectedIn += 10;
      },
      (value) => {
        Object.values(
          value.projection.annual[0]!.real.accountContributionDetails,
        )[0]!.redirectedOut += 10;
      },
      (value) => {
        value.projection.annual[0]!.real.registeredAccountRoom.tfsa
          .closingRoom += 10;
      },
    ];

    for (const mutate of mutations) {
      const mismatch = context();
      mutate(mismatch);
      expect(
        buildExplanation(
          "registered-account-room",
          mismatch,
        ).reconciliation?.matched,
      ).toBe(false);
    }
  });

  it("uses the active displayed room rows for reconciliation in both modes", () => {
    const real = context();
    const nominal = context((draft) => {
      draft.displayMode = "nominal";
    });
    const realDocument = buildExplanation("registered-account-room", real);
    const nominalDocument = buildExplanation(
      "registered-account-room",
      nominal,
    );
    const realRows = section(
      realDocument,
      "Annual registered room and routing",
    ).rows;
    const nominalRows = section(
      nominalDocument,
      "Annual registered room and routing",
    ).rows;

    expect(realDocument.reconciliation?.matched).toBe(true);
    expect(nominalDocument.reconciliation?.matched).toBe(true);
    expect(
      realRows.map(
        ({ tfsaOpening, tfsaNew, tfsaClosing, rrspOpening, rrspNew, rrspClosing }) => ({
          tfsaOpening,
          tfsaNew,
          tfsaClosing,
          rrspOpening,
          rrspNew,
          rrspClosing,
        }),
      ),
    ).toEqual(
      nominalRows.map(
        ({ tfsaOpening, tfsaNew, tfsaClosing, rrspOpening, rrspNew, rrspClosing }) => ({
          tfsaOpening,
          tfsaNew,
          tfsaClosing,
          rrspOpening,
          rrspNew,
          rrspClosing,
        }),
      ),
    );
  });

  it("shows active starting-room overrides and reset values deterministically", () => {
    const active = context((draft) => {
      draft.inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount =
        12345;
      draft.overrides[
        "registeredAccountRoom.tfsa.startingAvailableRoom.amount"
      ] = 12345;
      draft.projection = calculateProjection(draft.inputs);
    });
    const document = buildExplanation("registered-account-room", active);
    expect(
      document.steps.find((step) => step.label === "Starting TFSA room"),
    ).toMatchObject({
      rawValue: 12345,
      sourceType: "override",
    });

    const reset = buildExplanation(
      "registered-account-room",
      context(),
    );
    expect(
      reset.steps.find((step) => step.label === "Starting TFSA room")
        ?.sourceType,
    ).toBe("configuration");
  });

  it("explains total net worth and liability schedules from the shared result in both dollar modes", () => {
    for (const mode of ["nominal", "real"] as const) {
      const value = balanceSheetContext(mode);
      const netWorth = buildExplanation("total-net-worth", value);
      const liability = buildExplanation("liability-schedule", value);

      expect(netWorth.formula).toBe(
        "Financial assets + non-financial assets − total liabilities = total net worth",
      );
      expect(netWorth.reconciliation?.matched).toBe(true);
      expect(
        section(netWorth, "Annual balance sheet").rows,
      ).toHaveLength(value.projection.annual.length);
      expect(
        netWorth.caveats.join(" "),
      ).toContain("not available to retirement withdrawals");

      expect(liability.formula).toBe(
        "Opening principal + interest − funded regular payment − funded lump-sum principal = closing principal",
      );
      expect(liability.reconciliation?.matched).toBe(true);
      const mortgageSummary = liability.steps.find(
        (step) => step.label === "Synthetic mortgage",
      );
      expect(
        mortgageSummary?.details?.find(
          (detail) => detail.label === "Interest-rate convention",
        )?.value,
      ).toContain("Canadian mortgage rate");
      expect(
        liability.steps.filter(
          (step) => step.label === "Required liability payment funding",
        ),
      ).toEqual([
        expect.objectContaining({ value: expect.stringContaining("fully funded") }),
      ]);
      expect(
        section(liability, "Annual liability schedule").rows,
      ).toHaveLength(value.projection.annual.length);
      expect(
        section(
          liability,
          "Historical payment replacement evidence",
        ).rows,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metric: "Liabilities with schedule replacement",
            value: 1,
          }),
        ]),
      );
      expect(liability.caveats.join(" ")).toContain(
        "Rate renewals",
      );
      expect(liability.caveats.join(" ")).toContain(
        "after projected payoff is rejected",
      );
    }
  });

  it("explains retirement-date home equity and liabilities from the active display mode", () => {
    for (const mode of ["nominal", "real"] as const) {
      const value = balanceSheetContext(mode);
      const mortgage = value.inputs.liabilities[0]!;
      if (mortgage.treatment.mode !== "amortizing") {
        throw new Error("Synthetic mortgage must be amortizing");
      }
      mortgage.treatment.annualInterestRate = 0;
      mortgage.treatment.regularPayment.amount = 10;
      mortgage.treatment.regularPayment.monthlyEquivalent = 10;
      mortgage.historicalMonthlyAverage = 10;
      value.baseline.projectionInputs = structuredClone(value.inputs);
      value.projection = calculateProjection(value.inputs);
      const snapshot = value.projection.retirementSnapshot[mode];
      const ending = value.projection.annual.at(-1)![mode].balances;
      const retirementPeriod = `${value.projection.retirementSnapshot.calendarDate} · age ${value.projection.retirementSnapshot.age}`;
      const homeEquity = buildExplanation(
        "home-equity-at-retirement",
        value,
      );
      const liabilities = buildExplanation(
        "liabilities-at-retirement",
        value,
      );

      expect(homeEquity).toMatchObject({
        title: "Home equity at retirement",
        displayedResult: {
          label: "Home equity at retirement",
          dollarMode: mode,
          period: retirementPeriod,
        },
        reconciliation: {
          matched: true,
          displayedValue: snapshot.balances.homeEquity,
        },
      });
      expect(homeEquity.formula).toBe(
        "Residence value at retirement − linked mortgage at retirement = home equity at retirement",
      );
      expect(homeEquity.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Residence value at retirement",
            rawValue: snapshot.balances.residenceValue,
          }),
          expect.objectContaining({
            label: "Linked mortgage at retirement",
            rawValue: snapshot.balances.mortgageBalance,
          }),
          expect.objectContaining({
            label: "Home equity at retirement",
            rawValue: snapshot.balances.homeEquity,
          }),
        ]),
      );
      expect(homeEquity.plainLanguage).toContain(
        "not available to fund retirement",
      );
      expect(snapshot.balances.homeEquity).not.toBe(ending.homeEquity);

      expect(liabilities).toMatchObject({
        title: "Total liabilities at retirement",
        displayedResult: {
          label: "Total liabilities at retirement",
          dollarMode: mode,
          period: retirementPeriod,
        },
        reconciliation: {
          matched: true,
          displayedValue: snapshot.balances.totalLiabilities,
        },
      });
      expect(liabilities.formula).toBe(
        "Mortgage balance at retirement + other liabilities at retirement = total liabilities at retirement",
      );
      expect(liabilities.steps).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: "Mortgage balance at retirement",
            rawValue: snapshot.balances.mortgageBalance,
          }),
          expect.objectContaining({
            label: "Other liabilities at retirement",
            rawValue: snapshot.balances.otherLiabilities,
          }),
          expect.objectContaining({
            label: "Total liabilities at retirement",
            rawValue: snapshot.balances.totalLiabilities,
          }),
        ]),
      );
      expect(snapshot.balances.totalLiabilities).not.toBe(
        ending.totalLiabilities,
      );

      const safeDocuments = JSON.stringify([homeEquity, liabilities]);
      expect(safeDocuments).not.toContain("synthetic:mortgage");
      expect(safeDocuments).not.toContain("Synthetic mortgage");
      expect(safeDocuments).not.toContain("non_financial:primary_residence");
      expect(safeDocuments).not.toContain("Synthetic residence");
    }
  });

  it("subtracts a zero linked mortgage for a mortgage-free residence", () => {
    const value = balanceSheetContext("nominal");
    value.inputs.liabilities = [];
    value.baseline.projectionInputs = structuredClone(value.inputs);
    value.baseline.cashFlowAudit.debtPayments = {
      trailingTotal: 0,
      monthlyAverage: 0,
      transactionCount: 0,
      breakdown: [],
      liabilities: [],
    };
    value.baseline.derived.debtPayments = {
      trailingTotal: 0,
      monthlyAverage: 0,
      transactionCount: 0,
    };
    value.projection = calculateProjection(value.inputs);

    const document = buildExplanation(
      "home-equity-at-retirement",
      value,
    );
    expect(
      document.steps.find(
        (step) => step.label === "Linked mortgage at retirement",
      )?.rawValue,
    ).toBe(0);
    expect(document.reconciliation?.matched).toBe(true);
  });

  it("groups zero-balance, payoff-at-start, and amortizing liability summaries", () => {
    const value = balanceSheetContext("nominal");
    const amortizing = value.inputs.liabilities[0]!;
    amortizing.historicalPaymentHandling = "payee_and_source_account";
    value.inputs.liabilities = [
      {
        ...structuredClone(amortizing),
        id: "synthetic:zero-liability",
        label: "Synthetic zero liability",
        openingBalance: 0,
        role: null,
        treatment: { mode: "zero_balance" },
        historicalPaymentHandling: "not_applicable",
        historicalMonthlyAverage: 0,
      },
      {
        ...structuredClone(amortizing),
        id: "synthetic:payoff-liability",
        label: "Synthetic payoff liability",
        openingBalance: 500,
        role: null,
        treatment: { mode: "payoff_at_projection_start" },
        historicalPaymentHandling: "already_excluded_or_transfer",
        historicalMonthlyAverage: 0,
      },
      amortizing,
    ];
    value.baseline.projectionInputs = structuredClone(value.inputs);
    value.projection = calculateProjection(value.inputs);

    const document = buildExplanation("liability-schedule", value);
    const zero = document.steps.filter(
      (step) => step.label === "Synthetic zero liability",
    );
    expect(zero).toEqual([
      expect.objectContaining({
        value: "Zero balance at projection start",
      }),
    ]);
    expect(zero[0]?.details).toBeUndefined();
    expect(JSON.stringify(zero)).not.toContain("funding");
    expect(JSON.stringify(zero)).not.toContain("payoff");

    const payoff = document.steps.find(
      (step) => step.label === "Synthetic payoff liability",
    );
    expect(payoff?.value).toBe("Paid in the first projected month");
    expect(payoff?.details?.map((detail) => detail.label)).toEqual([
      "Opening balance",
      "Treatment",
      "Projected payoff date",
    ]);

    const mortgage = document.steps.find(
      (step) => step.label === "Synthetic mortgage",
    );
    expect(mortgage?.value).toBe("Amortizing payment schedule");
    expect(mortgage?.details?.map((detail) => detail.label)).toEqual([
      "Opening principal",
      "Annual interest rate",
      "Interest-rate convention",
      "Entered regular payment",
      "Monthly equivalent",
      "Current schedule effective date",
      "Historical payment handling",
      "Historical monthly average",
      "Projected payoff date",
    ]);
    expect(
      mortgage?.details?.find(
        (detail) => detail.label === "Historical payment handling",
      )?.value,
    ).toBe("Matched by configured payee and source account");
    expect(
      document.steps.filter(
        (step) => step.label === "Required liability payment funding",
      ),
    ).toHaveLength(1);
    expect(
      section(document, "Annual liability schedule").rows,
    ).toHaveLength(value.projection.annual.length * 2);
    expect(document.reconciliation?.matched).toBe(true);
    expect(JSON.stringify(document)).not.toContain("plaid:synthetic-source");
    expect(JSON.stringify(document)).not.toContain(
      "Synthetic exact mortgage payee",
    );
  });

  it("identifies an imported residence separately from the configured fallback", () => {
    const value = balanceSheetContext("nominal");
    const asset = value.inputs.nonFinancialAssets[0]!;
    asset.id = "manual:synthetic-residence";
    asset.origin = "lunchmoney";
    value.baseline.projectionInputs = structuredClone(value.inputs);
    value.baseline.provenance[
      "nonFinancialAssets.manual:synthetic-residence.openingValue"
    ] = {
      value: asset.openingValue,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Imported Lunch Money primary-residence value",
      effectiveDate: asset.valueAsOf,
    };
    value.projection = calculateProjection(value.inputs);

    const document = buildExplanation("total-net-worth", value);
    expect(document.assumptions[0]).toMatchObject({
      sourceType: "lunchmoney",
    });
    expect(document.assumptions[0]!.value).toContain(
      "imported Lunch Money residence",
    );
  });

  it("marks net-worth and liability explanations unmatched after independent one-cent-plus mutations", () => {
    const netWorthValue = balanceSheetContext("nominal");
    netWorthValue.projection.netWorthBridge.nominal.liabilityInterest +=
      0.02;
    expect(
      buildExplanation("total-net-worth", netWorthValue).reconciliation
        ?.matched,
    ).toBe(false);

    const liabilityValue = balanceSheetContext("nominal");
    liabilityValue.projection.annual[0]!.nominal.liabilitySchedules[
      "synthetic:mortgage"
    ]!.closingBalance += 0.02;
    expect(
      buildExplanation(
        "liability-schedule",
        liabilityValue,
      ).reconciliation?.matched,
    ).toBe(false);
  });
});
