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
  previewScenarioDraft,
} from "@/src/config/scenario-draft";
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
      .replace("  inflation: 0.02", "  inflation: &shared_rate 0.02")
      .replace("  cashReturn: 0.02", "  cashReturn: *shared_rate");

    expect(() => applyScenarioDraft({
      contents: withAlias,
      baseline: projectionFixture,
      overrides: { "return.cash": 0.025 },
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
