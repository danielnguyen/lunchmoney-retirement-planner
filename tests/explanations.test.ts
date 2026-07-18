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
} from "@/src/domain/projection/presentation";
import type { FinancialAccountInput } from "@/src/domain/projection/types";
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

function section(document: ExplanationDocument, title: string) {
  return document.dataSections.find((item) => item.title === title)!;
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
      draft.baseline.projectionInputs.accounts.push({
        id: "manual:debt",
        label: "Synthetic debt",
        origin: "lunchmoney",
        type: "debt",
        openingBalance: 50000,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 999,
        allocation: { cash: 0, fixedIncome: 0, equity: 0 },
      });
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
    const accounts = value.inputs.accounts.filter((account) => account.type !== "debt");

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

  it("reconciles multiple financial and debt accounts to the total included-account count", () => {
    const debtAccounts: FinancialAccountInput[] = [
      {
        id: "manual:debt-1",
        label: "Synthetic debt one",
        origin: "lunchmoney",
        type: "debt",
        openingBalance: 10000,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 98,
        allocation: { cash: 0, fixedIncome: 0, equity: 0 },
      },
      {
        id: "manual:debt-2",
        label: "Synthetic debt two",
        origin: "lunchmoney",
        type: "debt",
        openingBalance: 20000,
        annualReturn: 0,
        contributionPhases: [],
        withdrawalPriority: 99,
        allocation: { cash: 0, fixedIncome: 0, equity: 0 },
      },
    ];
    const value = context((draft) => {
      draft.inputs.accounts.push(...structuredClone(debtAccounts));
      draft.baseline.projectionInputs.accounts.push(...structuredClone(debtAccounts));
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
        rawValue: 2,
      },
      {
        label: "Debt accounts excluded from financial assets",
        operation: "add",
        rawValue: 2,
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
});
