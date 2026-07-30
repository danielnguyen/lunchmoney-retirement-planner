import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as scenarioDraftRoute } from "@/app/api/v1/config/current/scenario-draft/route";
import { plannerConfigVersion } from "@/src/config/current";
import { parseAndValidatePlannerConfig } from "@/src/config/loader";
import {
  applyScenarioDraft,
  canonicalPlannerNumber,
  previewScenarioDraft,
} from "@/src/config/scenario-draft";
import { validateProjectionInputs } from "@/src/domain/projection/types";
import { buildControls } from "@/src/domain/scenario/controls";
import { projectionFixture } from "./fixtures/projection";

const EXAMPLE_CONFIG_PATH = "config/planner.example.yaml";
const OPERATING_CASH_ID = "manual:synthetic-operating-cash";
const RESERVE_REFILL_ID = "manual:synthetic-reserve-refill";
const PERSONAL_TFSA_ID = "plaid:synthetic-personal-tfsa";
const PRIMARY_RESIDENCE_ID = "manual:synthetic-primary-residence";
const FUTURE_TAXABLE_ID = "projection:future-taxable";

function advancedContents(simpleContents: string): string {
  const value = structuredClone(
    parseAndValidatePlannerConfig(simpleContents, "YAML"),
  ) as unknown as Record<string, unknown>;
  delete value.configurationMode;
  delete value.registeredRoom;
  delete value.savingsPolicy;
  delete value.primaryResidence;
  delete (value.retirementRequirement as Record<string, unknown>).source;

  const mappings = value.accountMappings as Record<string, Record<string, unknown>>;
  for (const mapping of Object.values(mappings)) delete mapping.roles;
  delete mappings[PRIMARY_RESIDENCE_ID];
  delete mappings["manual:synthetic-primary-mortgage"];
  delete (value.categoryMappings as Record<string, unknown>)["synthetic-home-auto-category"];
  mappings[PERSONAL_TFSA_ID]!.contributionPhases = [{
    id: "current-saving",
    label: "Current saving",
    startAge: 38,
    endAge: 62,
    monthlyAmountToday: "live_baseline",
    funding: "cash",
    indexingRate: 0.02,
  }];

  for (const phase of value.employmentIncomePhases as Array<Record<string, unknown>>) {
    const room = phase.rrspRoom as Record<string, unknown>;
    phase.rrspRoomGeneration = {
      annualEligibleEarnedIncomeToday: room.eligibleEarnedIncomeToday,
      annualPensionAdjustmentToday: room.pensionAdjustmentToday,
      annualOtherRoomReductionToday: room.otherReductionToday,
      annualGrowth: room.annualGrowth,
    };
    delete phase.rrspRoom;
  }
  value.projectionAccounts = {
    [FUTURE_TAXABLE_ID]: {
      label: "Future taxable investment account",
      type: "non_registered",
      annualReturn: 0.05,
      withdrawalPriority: 6,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    },
  };
  value.surplusAllocation = {
    reserveAccountIds: [OPERATING_CASH_ID, RESERVE_REFILL_ID],
    reserveRefillAccountId: RESERVE_REFILL_ID,
    targetCashReserveToday: 50000,
    reserveIndexingRate: 0.02,
    excess: { mode: "allocate_through_contribution_waterfall" },
  };
  value.registeredAccountRoom = {
    tfsa: {
      startingAvailableRoom: {
        source: "configured_amount",
        amount: 10000,
        sourceDescription: "Synthetic configured TFSA starting room",
        effectiveDate: "2026-01-01",
      },
      annualNewRoom: {
        source: "canadian_reference",
        futureIndexingRate: 0.02,
        roundingIncrement: 500,
      },
      carryForwardUnusedRoom: true,
      withdrawalRoomRecredit: "next_calendar_year",
    },
    rrsp: {
      startingAvailableDeductionRoom: { source: "explicit_zero" },
      carryForwardUnusedRoom: true,
      newRoom: {
        source: "earned_income",
        annualCap: {
          source: "canadian_reference",
          futureGrowthRate: 0.03,
          futureRoundingIncrement: 10,
        },
        startYearBeforeProjectionMonth: {
          calendarYear: 2026,
          eligibleEarnedIncome: 50000,
          pensionAdjustment: 0,
          otherRoomReduction: 0,
        },
      },
    },
  };
  value.contributionWaterfall = {
    routes: [{
      sourceAccountId: PERSONAL_TFSA_ID,
      destinationAccountIds: [PERSONAL_TFSA_ID, FUTURE_TAXABLE_ID],
    }],
    surplusDestinationAccountIds: [PERSONAL_TFSA_ID, FUTURE_TAXABLE_ID],
  };
  (value.categoryMappings as Record<string, unknown>)[
    "synthetic-investment-transfer-category"
  ] = {
    classification: "investment_contribution",
    contributionAccountId: PERSONAL_TFSA_ID,
    contributionDirection: "debit",
  };
  const result = stringify(value);
  parseAndValidatePlannerConfig(result, "YAML");
  return result;
}

function modifiedConfigContents(
  sourceContents: string,
  mutate: (value: Record<string, unknown>) => void,
): string {
  const value = structuredClone(
    parseAndValidatePlannerConfig(sourceContents, "YAML"),
  ) as unknown as Record<string, unknown>;
  delete value.configurationMode;
  delete (value.retirementRequirement as Record<string, unknown>).source;
  mutate(value);
  const result = stringify(value);
  parseAndValidatePlannerConfig(result, "YAML");
  return result;
}

function baselineWithFutureIncome() {
  const baseline = structuredClone(projectionFixture);
  baseline.person.employmentIncomePhases[0] = {
    ...baseline.person.employmentIncomePhases[0]!,
    id: "future-income",
    label: "Expected future income",
    annualNetCashToday: 72000,
  };
  return baseline;
}

function simpleBaseline() {
  const baseline = structuredClone(projectionFixture);
  const cash = baseline.accounts[0]!;
  const investment = baseline.accounts[1]!;
  baseline.accounts = [
    {
      ...cash,
      id: OPERATING_CASH_ID,
      label: "Synthetic operating cash",
      withdrawalPriority: 1,
    },
    {
      ...structuredClone(cash),
      id: RESERVE_REFILL_ID,
      label: "Synthetic reserve cash",
      withdrawalPriority: 2,
    },
    {
      ...structuredClone(investment),
      id: PERSONAL_TFSA_ID,
      label: "Synthetic personal TFSA",
      type: "tfsa",
      contributionPhases: [
        {
          id: "current-personal-saving",
          label: "Current personal saving",
          startAge: 40,
          endAge: 41,
          monthlyAmountToday: 1000,
          funding: "cash",
          indexingRate: 0,
        },
        {
          id: "future-personal-saving",
          label: "Future personal saving",
          startAge: 41,
          endAge: 62,
          monthlyAmountToday: 1250,
          funding: "cash",
          indexingRate: 0.02,
        },
      ],
      withdrawalPriority: 3,
    },
    {
      ...structuredClone(investment),
      id: "plaid:synthetic-personal-rrsp",
      label: "Synthetic personal RRSP",
      contributionPhases: [],
      withdrawalPriority: 4,
    },
    {
      ...structuredClone(investment),
      id: "plaid:synthetic-workplace-rrsp",
      label: "Synthetic workplace RRSP",
      contributionPhases: [{
        id: "workplace-saving",
        label: "Workplace RRSP saving",
        startAge: 40,
        endAge: 62,
        monthlyAmountToday: 800,
        funding: "income_withheld",
        indexingRate: 0.02,
      }],
      withdrawalPriority: 5,
    },
    {
      ...structuredClone(investment),
      id: FUTURE_TAXABLE_ID,
      label: "Synthetic future taxable",
      origin: "projection_configuration",
      type: "non_registered",
      openingBalance: 0,
      contributionPhases: [],
      withdrawalPriority: 6,
    },
  ];
  baseline.contributionWaterfall = {
    mode: "simple_policy",
    routes: [
      {
        sourceAccountId: "plaid:synthetic-workplace-rrsp",
        destinationAccountIds: ["plaid:synthetic-workplace-rrsp"],
      },
      {
        sourceAccountId: PERSONAL_TFSA_ID,
        destinationAccountIds: [
          PERSONAL_TFSA_ID,
          "plaid:synthetic-personal-rrsp",
          FUTURE_TAXABLE_ID,
        ],
      },
    ],
    surplusDestinationAccountIds: [
      PERSONAL_TFSA_ID,
      "plaid:synthetic-personal-rrsp",
      FUTURE_TAXABLE_ID,
    ],
  };
  baseline.surplusAllocation = {
    reserveAccountIds: [OPERATING_CASH_ID, RESERVE_REFILL_ID],
    reserveRefillAccountId: RESERVE_REFILL_ID,
    targetCashReserveToday: 40000,
    reserveIndexingRate: 0.02,
    excess: { mode: "allocate_through_contribution_waterfall" },
  };
  baseline.savingsPolicy = {
    mode: "simple",
    operatingCashAccountId: OPERATING_CASH_ID,
    reserveAccountIds: [OPERATING_CASH_ID, RESERVE_REFILL_ID],
    reserveRefillAccountId: RESERVE_REFILL_ID,
    personalTfsaAccountId: PERSONAL_TFSA_ID,
    personalRrspAccountId: "plaid:synthetic-personal-rrsp",
    workplaceRrspAccountId: "plaid:synthetic-workplace-rrsp",
    taxableAccountId: FUTURE_TAXABLE_ID,
    taxableAccountOrigin: "projection_configuration",
    reserveBuildingPhases: [{
      id: "reserve-building",
      label: "Emergency reserve building",
      startAge: 40,
      endAge: 45,
      monthlyAmountToday: 500,
      indexingRate: 0,
    }],
    operatingCashTarget: { targetToday: 10000, indexingRate: 0.02 },
    unplannedCash: "sweep_above_targets",
    personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
    workplaceRoomPriority: "first",
    workplaceOverflow: "unallocated",
    reserveAfterTarget: "personal_investing",
  };
  return validateProjectionInputs(baseline);
}

function baselineWithLiability() {
  const baseline = structuredClone(projectionFixture);
  baseline.liabilities = [
    {
      id: "manual:synthetic-primary-mortgage",
      label: "Synthetic mortgage",
      origin: "lunchmoney",
      openingBalance: 200000,
      balanceAsOf: "2026-07-01",
      role: null,
      treatment: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: {
          amount: 1200,
          frequency: "biweekly",
          monthlyEquivalent: 2600,
        },
        scheduleStartDate: "2026-01-15",
        lumpSumPayments: [],
      },
      historicalPaymentHandling: "payee_and_source_account",
      historicalMonthlyAverage: 2600,
    },
  ];
  return baseline;
}

function baselineWithResidence() {
  const baseline = structuredClone(projectionFixture);
  baseline.nonFinancialAssets = [
    {
      id: "manual:synthetic-primary-residence",
      label: "Synthetic residence",
      origin: "lunchmoney",
      type: "primary_residence",
      openingValue: 600000,
      valueAsOf: "2026-07-01",
      annualAppreciation: 0.02,
      availableForWithdrawals: false,
    },
  ];
  return baseline;
}

describe("planner YAML number canonicalization", () => {
  it.each([
    [5.8 / 100, "0.058"],
    [5.6 / 100, "0.056"],
    [5.9 / 100, "0.059"],
    [4.1 / 100, "0.041"],
    [5.15 / 100, "0.0515"],
    [5.257 / 100, "0.05257"],
    [381.05, "381.05"],
    [-0.05257, "-0.05257"],
    [-0, "0"],
    [0.00000001, "0.00000001"],
    [1e-7, "0.0000001"],
  ])("serializes %s as %s", (value, expected) => {
    expect(canonicalPlannerNumber(value)).toBe(expected);
  });

  it("removes binary tails without coarsening meaningful precision", () => {
    const values = [5.8 / 100, 5.6 / 100, 5.9 / 100, 4.1 / 100];
    for (const value of values) {
      const serialized = canonicalPlannerNumber(value);
      expect(serialized).not.toMatch(/999999999999|000000000004/);
      expect(Number(serialized)).toBeCloseTo(value, 15);
    }
    expect(canonicalPlannerNumber(0.052571234567891)).toBe(
      "0.052571234567891",
    );
  });
});

describe("scenario draft classification and YAML patching", () => {
  let contents: string;

  beforeEach(async () => {
    contents = await readFile(EXAMPLE_CONFIG_PATH, "utf8");
  });

  it("classifies direct, live-baseline, and scenario-only overrides", () => {
    const preview = previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        annualInflation: 0.0525,
        "employmentPhase.current-income.annualNetCashToday": 125000,
        monthlyEssentialSpendingToday: 3810.55,
      },
    });

    expect(preview.directChanges.map((change) => change.key)).toEqual([
      "annualInflation",
    ]);
    expect(preview.liveBaselineConversions).toEqual([
      expect.objectContaining({
        key: "employmentPhase.current-income.annualNetCashToday",
        source: "Live Lunch Money baseline (live_baseline)",
        consequence: expect.stringContaining("no longer update"),
      }),
    ]);
    expect(preview.scenarioOnlyChanges).toEqual([
      expect.objectContaining({
        key: "monthlyEssentialSpendingToday",
        consequence: expect.stringContaining("spending-phase multipliers"),
      }),
    ]);
  });

  it("rejects unknown, non-finite, and out-of-range overrides", () => {
    expect(() => previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { unknown: 1 },
    })).toThrow("Unknown scenario control key");
    expect(() => previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { annualInflation: Number.NaN },
    })).toThrow("must be a finite number");
    expect(() => previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { annualInflation: 0.11 },
    })).toThrow("must be between 0 and 0.1");
  });

  it("applies percentage domain values without reformatting unrelated YAML", () => {
    const result = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { annualInflation: 0.0525 },
    });

    expect(result.contents).toBe(
      contents.replace("  inflation: 0.02", "  inflation: 0.0525"),
    );
    expect(result.appliedChanges).toEqual([
      expect.objectContaining({ key: "annualInflation", kind: "config" }),
    ]);
  });

  it("previews and applies the guided terminal-balance value without saving", () => {
    const overrideKey =
      "retirementRequirement.minimumEndingFinancialAssetsToday";
    const preview = previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { [overrideKey]: 25_000.25 },
    });

    expect(preview.directChanges).toEqual([
      expect.objectContaining({
        key: overrideKey,
        formattedScenarioValue: "$25,000.25",
      }),
    ]);
    const result = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { [overrideKey]: 25_000.25 },
    });
    expect(result.contents).toBe(
      contents.replace(
        "  minimumEndingFinancialAssetsToday: 0",
        "  minimumEndingFinancialAssetsToday: 25000.25",
      ),
    );
    expect(result.appliedChanges).toEqual([
      expect.objectContaining({ key: overrideKey, kind: "config" }),
    ]);
  });

  it("keeps a guided terminal value scenario-only when the YAML block is omitted", () => {
    const overrideKey =
      "retirementRequirement.minimumEndingFinancialAssetsToday";
    const withoutRequirement = contents.replace(
      "retirementRequirement:\n  minimumEndingFinancialAssetsToday: 0\n",
      "",
    );
    const preview = previewScenarioDraft({
      contents: withoutRequirement,
      baseline: projectionFixture,
      overrides: { [overrideKey]: 12_345.67 },
    });

    expect(preview.directChanges).toEqual([]);
    expect(preview.scenarioOnlyChanges).toEqual([
      expect.objectContaining({
        key: overrideKey,
        consequence: expect.stringContaining("Add retirementRequirement"),
      }),
    ]);

    const result = applyScenarioDraft({
      contents: withoutRequirement,
      baseline: projectionFixture,
      overrides: { [overrideKey]: 12_345.67 },
    });
    expect(result.contents).toBe(withoutRequirement);
    expect(result.appliedChanges).toEqual([]);
    expect(result.skippedChanges).toEqual([
      expect.objectContaining({
        key: overrideKey,
        kind: "scenario_only",
      }),
    ]);
  });

  it.each([
    [5.8 / 100, "0.058"],
    [5.6 / 100, "0.056"],
    [5.9 / 100, "0.059"],
    [4.1 / 100, "0.041"],
    [5.15 / 100, "0.0515"],
    [5.257 / 100, "0.05257"],
    [0.00000001, "0.00000001"],
    [1e-7, "0.0000001"],
  ])("patches a domain rate as exact YAML %s", (value, expected) => {
    const result = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { annualInflation: value },
    });

    expect(result.contents).toBe(
      contents.replace("  inflation: 0.02", `  inflation: ${expected}`),
    );
    expect(result.contents).not.toMatch(/999999999999|000000000004/);
    expect(() => parseAndValidatePlannerConfig(result.contents, "YAML"))
      .not.toThrow();
  });

  it("patches precise cents, negative rates, and negative zero canonically", () => {
    const payment = applyScenarioDraft({
      contents,
      baseline: baselineWithLiability(),
      overrides: {
        "liability.manual:synthetic-primary-mortgage.regularPayment.amount": 381.05,
      },
    });
    expect(payment.contents).toContain("        amount: 381.05");
    expect(() => parseAndValidatePlannerConfig(payment.contents, "YAML"))
      .not.toThrow();

    const advanced = advancedContents(contents);
    const negative = applyScenarioDraft({
      contents: advanced,
      baseline: projectionFixture,
      overrides: { "surplusAllocation.reserveIndexingRate": -0.05257 },
    });
    expect(negative.contents).toContain("reserveIndexingRate: -0.05257");
    expect(() => parseAndValidatePlannerConfig(negative.contents, "YAML"))
      .not.toThrow();

    const negativeZero = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { annualInflation: -0 },
    });
    expect(negativeZero.contents).toContain("  inflation: 0\n");
    expect(() => parseAndValidatePlannerConfig(negativeZero.contents, "YAML"))
      .not.toThrow();
  });

  it("applies an advanced reserve binding to its deterministic scalar", () => {
    const advanced = advancedContents(contents);
    const result = applyScenarioDraft({
      contents: advanced,
      baseline: projectionFixture,
      overrides: { "surplusAllocation.targetCashReserveToday": 54321.09 },
    });

    expect(result.contents).toContain("targetCashReserveToday: 54321.09");
    expect(result.contents).not.toContain("targetCashReserveToday: 50000");
    expect(result.appliedChanges).toEqual([
      expect.objectContaining({
        key: "surplusAllocation.targetCashReserveToday",
        kind: "config",
      }),
    ]);
  });

  it("rejects a scalar destination represented by a YAML alias", () => {
    const withAlias = contents
      .replace("retirementGoal: 0", "retirementGoal: &shared_rate 0.02")
      .replace("  inflation: 0.02", "  inflation: *shared_rate");

    expect(() => applyScenarioDraft({
      contents: withAlias,
      baseline: projectionFixture,
      overrides: { annualInflation: 0.025 },
    })).toThrow("YAML alias or construct that cannot be edited safely");
  });

  it("applies a configured currency by employment phase id", () => {
    const result = applyScenarioDraft({
      contents,
      baseline: baselineWithFutureIncome(),
      overrides: {
        "employmentPhase.future-income.annualNetCashToday": 68123.45,
      },
    });

    expect(result.contents).toContain("annualNetCashToday: 68123.45");
    expect(result.contents).not.toContain("annualNetCashToday: 72000");
  });

  it("applies an age as a configuration-domain number", () => {
    const result = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: { cppStartAge: 68 },
    });

    expect(result.contents).toBe(
      contents.replace("    startAge: 65", "    startAge: 68"),
    );
  });

  it("resolves a liability payment by stable identity and preserves quoted keys", () => {
    const result = applyScenarioDraft({
      contents,
      baseline: baselineWithLiability(),
      overrides: {
        "liability.manual:synthetic-primary-mortgage.regularPayment.amount": 1234.56,
      },
    });

    expect(result.contents).toContain(
      '"manual:synthetic-primary-mortgage":',
    );
    expect(result.contents).toContain("        amount: 1234.56");
    expect(result.contents).toBe(
      contents.replace("        amount: 1200", "        amount: 1234.56"),
    );
  });

  it("preserves inline comments while replacing live_baseline", () => {
    const commented = contents.replace(
      "annualNetCashToday: live_baseline",
      "annualNetCashToday: live_baseline # follows Lunch Money",
    );
    const result = applyScenarioDraft({
      contents: commented,
      baseline: projectionFixture,
      overrides: {
        "employmentPhase.current-income.annualNetCashToday": 125000,
      },
      liveBaselineAction: "replace",
    });

    expect(result.contents).toContain(
      "annualNetCashToday: 125000 # follows Lunch Money",
    );
    expect(result.appliedChanges[0]).toMatchObject({
      kind: "live_baseline_conversion",
    });
  });

  it("keeps live values and applies ordinary changes in one operation", () => {
    const result = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        annualInflation: 0.03,
        "employmentPhase.current-income.annualNetCashToday": 125000,
      },
      liveBaselineAction: "keep",
    });

    expect(result.contents).toContain("  inflation: 0.03");
    expect(result.contents).toContain("annualNetCashToday: live_baseline");
    expect(result.skippedChanges).toEqual([
      expect.objectContaining({ kind: "live_baseline_kept" }),
    ]);
  });

  it("never writes scenario-only spending or a Lunch Money residence balance", () => {
    const spending = applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        monthlyEssentialSpendingToday: 4000,
        monthlyDiscretionarySpendingToday: 1000,
      },
    });
    expect(spending.contents).toBe(contents);
    expect(spending.skippedChanges).toHaveLength(2);

    const residence = applyScenarioDraft({
      contents,
      baseline: baselineWithResidence(),
      overrides: { "primaryResidence.currentValue": 650000 },
    });
    expect(residence.contents).toBe(contents);
    expect(residence.skippedChanges[0]).toMatchObject({
      kind: "scenario_only",
      consequence: expect.stringContaining("Lunch Money manual asset"),
    });
  });

  it("classifies mode-specific controls against the YAML draft mode", () => {
    const simpleAgainstAdvanced = previewScenarioDraft({
      contents: advancedContents(contents),
      baseline: simpleBaseline(),
      overrides: {
        "savingsPolicy.reserveBuilding.targetToday": 41000,
        "return.tfsa": 0.055,
      },
    });
    expect(simpleAgainstAdvanced.scenarioOnlyChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "savingsPolicy.reserveBuilding.targetToday",
          consequence: expect.stringContaining("advanced mode"),
        }),
        expect.objectContaining({
          key: "return.tfsa",
          consequence: expect.stringContaining("advanced mode"),
        }),
      ]),
    );

    const advancedAgainstSimple = previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        "surplusAllocation.targetCashReserveToday": 21000,
        "return.rrsp_rrif": 0.055,
      },
    });
    expect(advancedAgainstSimple.scenarioOnlyChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "surplusAllocation.targetCashReserveToday",
          consequence: expect.stringContaining("simple mode"),
        }),
        expect.objectContaining({
          key: "return.rrsp_rrif",
          consequence: expect.stringContaining("simple mode"),
        }),
      ]),
    );
  });

  it("classifies removed optional blocks and changed stable identities as scenario-only", () => {
    const withoutOperatingCash = modifiedConfigContents(contents, (value) => {
      const policy = value.savingsPolicy as Record<string, unknown>;
      delete policy.operatingCash;
      policy.unplannedCash = "retain_in_operating_cash";
    });
    const operating = previewScenarioDraft({
      contents: withoutOperatingCash,
      baseline: simpleBaseline(),
      overrides: { "savingsPolicy.operatingCash.targetToday": 12000 },
    });
    expect(operating.scenarioOnlyChanges[0]).toMatchObject({
      consequence: expect.stringContaining("operatingCash is not configured"),
    });

    const changedContributionId = contents.replace(
      "id: current-personal-saving",
      "id: renamed-personal-saving",
    );
    expect(() => parseAndValidatePlannerConfig(changedContributionId, "YAML"))
      .not.toThrow();
    const contribution = previewScenarioDraft({
      contents: changedContributionId,
      baseline: simpleBaseline(),
      overrides: {
        [`contributionPhase.${PERSONAL_TFSA_ID}.current-personal-saving.monthlyAmountToday`]: 1100,
      },
    });
    expect(contribution.scenarioOnlyChanges[0]).toMatchObject({
      consequence: expect.stringContaining("no unique configured phase id"),
    });

    const withoutLiability = modifiedConfigContents(contents, (value) => {
      delete (value.accountMappings as Record<string, unknown>)[
        "manual:synthetic-primary-mortgage"
      ];
    });
    const liability = previewScenarioDraft({
      contents: withoutLiability,
      baseline: baselineWithLiability(),
      overrides: {
        "liability.manual:synthetic-primary-mortgage.annualInterestRate": 0.05,
      },
    });
    expect(liability.scenarioOnlyChanges[0]).toMatchObject({
      consequence: expect.stringContaining("no matching amortizing liability identity"),
    });
  });

  it("classifies incompatible room sources and missing residence assumptions as scenario-only", () => {
    const advanced = advancedContents(contents);
    const room = previewScenarioDraft({
      contents: advanced,
      baseline: projectionFixture,
      overrides: {
        "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount": 5000,
      },
    });
    expect(room.scenarioOnlyChanges[0]).toMatchObject({
      consequence: expect.stringContaining("configured_amount source"),
    });

    const withoutAppreciation = modifiedConfigContents(contents, (value) => {
      const mappings = value.accountMappings as Record<
        string,
        Record<string, unknown>
      >;
      delete mappings[PRIMARY_RESIDENCE_ID];
      delete mappings["manual:synthetic-primary-mortgage"];
    });
    const residence = previewScenarioDraft({
      contents: withoutAppreciation,
      baseline: baselineWithResidence(),
      overrides: { "primaryResidence.annualAppreciation": 0.03 },
    });
    expect(residence.scenarioOnlyChanges[0]).toMatchObject({
      consequence: expect.stringContaining("no configured appreciation scalar"),
    });
  });

  it("reports active, draft, and scenario values from the actual YAML scalar", () => {
    const dirty = contents.replace("  inflation: 0.02", "  inflation: 0.03");
    const preview = previewScenarioDraft({
      contents: dirty,
      baseline: projectionFixture,
      overrides: { annualInflation: 0.025 },
    });
    expect(preview.directChanges[0]).toMatchObject({
      formattedActiveBaselineValue: "2%",
      formattedScenarioValue: "2.5%",
      destinationCount: 1,
      draftDestinations: [{
        displayName: "Inflation",
        formattedCurrentValue: "3%",
        sourceKind: "number",
      }],
    });
    const applied = applyScenarioDraft({
      contents: dirty,
      baseline: projectionFixture,
      overrides: { annualInflation: 0.025 },
    });
    expect(applied.appliedChanges[0]).toMatchObject(
      preview.directChanges[0]!,
    );
    expect(applied.contents).toContain("  inflation: 0.025");
  });

  it("distinguishes fixed draft income from a true live_baseline conversion", () => {
    const fixed = contents.replace(
      "annualNetCashToday: live_baseline",
      "annualNetCashToday: 90000",
    );
    const fixedPreview = previewScenarioDraft({
      contents: fixed,
      baseline: projectionFixture,
      overrides: {
        "employmentPhase.current-income.annualNetCashToday": 85000,
      },
    });
    expect(fixedPreview.liveBaselineConversions).toHaveLength(0);
    expect(fixedPreview.directChanges[0]).toMatchObject({
      formattedActiveBaselineValue: "$84,000.00",
      draftDestinations: [{
        formattedCurrentValue: "$90,000.00",
        sourceKind: "number",
      }],
      formattedScenarioValue: "$85,000.00",
    });

    const livePreview = previewScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        "employmentPhase.current-income.annualNetCashToday": 85000,
      },
    });
    expect(livePreview.liveBaselineConversions[0]).toMatchObject({
      formattedActiveBaselineValue: "$84,000.00",
      draftDestinations: [{
        formattedCurrentValue: "live_baseline",
        sourceKind: "live_baseline",
      }],
      formattedScenarioValue: "$85,000.00",
    });
  });

  it.each([
    [0.05, 0.05, ["5%", "5%", "5%"]],
    [0.04, 0.06, ["5%", "4%", "6%"]],
  ])("reports every safe return destination (%s, %s)", (mapped, projected, expected) => {
    const advanced = modifiedConfigContents(advancedContents(contents), (value) => {
      const mappings = value.accountMappings as Record<
        string,
        Record<string, unknown>
      >;
      mappings["plaid:synthetic-personal-rrsp"]!.annualReturn = mapped;
      const accounts = value.projectionAccounts as Record<
        string,
        Record<string, unknown>
      >;
      accounts["projection:synthetic-second-rrsp"] = {
        label: "Synthetic second RRSP",
        type: "rrsp",
        annualReturn: projected,
        withdrawalPriority: 7,
        allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
        contributionPhases: [],
      };
    });
    const preview = previewScenarioDraft({
      contents: advanced,
      baseline: projectionFixture,
      overrides: { "return.rrsp_rrif": 0.055 },
    });
    const item = preview.directChanges[0]!;
    expect(item.destinationCount).toBe(3);
    expect(item.draftDestinations.map((destination) =>
      destination.formattedCurrentValue)).toEqual(expected);
    expect(item.draftDestinations.map((destination) =>
      destination.displayName)).toEqual([
      "RRSP / RRIF return default assumption",
      "RRSP / RRIF return account override 1",
      "RRSP / RRIF return account override 2",
    ]);
    expect(JSON.stringify(item)).not.toContain("plaid:synthetic");
  });

  it("can apply every previewed direct or replaceable item against the same draft", () => {
    for (const [draft, baseline] of [
      [contents, simpleBaseline()],
      [advancedContents(contents), projectionFixture],
    ] as const) {
      const overrides = Object.fromEntries(
        buildControls(baseline).map((control) => [
          control.key,
          control.get(baseline),
        ]),
      );
      const preview = previewScenarioDraft({
        contents: draft,
        baseline,
        overrides,
      });
      const applicableKeys = [
        ...preview.directChanges,
        ...preview.liveBaselineConversions,
      ].map((item) => item.key);
      expect(() => applyScenarioDraft({
        contents: draft,
        baseline,
        overrides: Object.fromEntries(
          Object.entries(overrides).filter(([key]) => applicableKeys.includes(key)),
        ),
        liveBaselineAction: "replace",
      })).not.toThrow();
    }
  });

  it("requires an explicit decision before converting live values", () => {
    expect(() => applyScenarioDraft({
      contents,
      baseline: projectionFixture,
      overrides: {
        "employmentPhase.current-income.annualNetCashToday": 125000,
      },
    })).toThrow("Choose whether to keep live baseline values");
  });
});

describe.sequential("scenario draft API", () => {
  let temporaryDirectory: string;
  let configPath: string;
  let contents: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "planner-scenario-draft-"));
    configPath = join(temporaryDirectory, "planner.local.yaml");
    contents = await readFile(EXAMPLE_CONFIG_PATH, "utf8");
    await writeFile(configPath, contents, "utf8");
    process.env.PLANNER_CONFIG_PATH = configPath;
  });

  afterEach(async () => {
    delete process.env.PLANNER_CONFIG_PATH;
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  function request(
    body: Record<string, unknown>,
  ): Request {
    return new Request(
      "http://localhost/api/v1/config/current/scenario-draft",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          expectedVersion: plannerConfigVersion(contents),
          baseline: projectionFixture,
          overrides: { annualInflation: 0.03 },
          action: "preview",
          ...body,
        }),
      },
    );
  }

  it("previews without changing the supplied YAML or active file", async () => {
    const original = contents;
    const response = await scenarioDraftRoute(request({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      directChanges: [expect.objectContaining({ key: "annualInflation" })],
    });
    expect(contents).toBe(original);
    expect(await readFile(configPath, "utf8")).toBe(original);
  });

  it("applies only to the response and never modifies disk", async () => {
    const response = await scenarioDraftRoute(request({
      action: "apply",
      liveBaselineAction: "keep",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.contents).toContain("  inflation: 0.03");
    expect(await readFile(configPath, "utf8")).toBe(contents);
  });

  it("keeps a missing-block terminal override temporary without modifying disk", async () => {
    const withoutRequirement = contents.replace(
      "retirementRequirement:\n  minimumEndingFinancialAssetsToday: 0\n",
      "",
    );
    const response = await scenarioDraftRoute(
      request({
        contents: withoutRequirement,
        action: "apply",
        liveBaselineAction: "keep",
        overrides: {
          "retirementRequirement.minimumEndingFinancialAssetsToday":
            12_345.67,
        },
      }),
    );
    const body = (await response.json()) as {
      contents: string;
      appliedChanges: unknown[];
      skippedChanges: Array<{ key: string; kind: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.contents).toBe(withoutRequirement);
    expect(body.appliedChanges).toEqual([]);
    expect(body.skippedChanges).toContainEqual(
      expect.objectContaining({
        key: "retirementRequirement.minimumEndingFinancialAssetsToday",
        kind: "scenario_only",
      }),
    );
    expect(await readFile(configPath, "utf8")).toBe(contents);
  });

  it("canonicalizes crafted percentage-domain numbers at the API patch boundary", async () => {
    const response = await scenarioDraftRoute(request({
      action: "apply",
      liveBaselineAction: "keep",
      overrides: { annualInflation: 5.8 / 100 },
    }));
    const body = await response.json() as { contents: string };

    expect(response.status).toBe(200);
    expect(body.contents).toContain("  inflation: 0.058");
    expect(body.contents).not.toContain("0.057999999999999996");
    expect(body.contents).not.toMatch(/999999999999|000000000004/);
    expect(parseAndValidatePlannerConfig(body.contents, "YAML")).toBeDefined();
    expect(await readFile(configPath, "utf8")).toBe(contents);
  });

  it("rejects arbitrary path fields and stale versions", async () => {
    const pathResponse = await scenarioDraftRoute(request({
      path: "/tmp/other.yaml",
    }));
    expect(pathResponse.status).toBe(400);
    expect(await pathResponse.json()).toMatchObject({
      error: "invalid_scenario_draft_request",
    });

    const staleResponse = await scenarioDraftRoute(request({
      expectedVersion: "sha256:stale",
    }));
    expect(staleResponse.status).toBe(409);
    expect(await readFile(configPath, "utf8")).toBe(contents);
  });
});
