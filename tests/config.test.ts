import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_PATH,
  loadPlannerConfig,
  validatePlannerConfig,
} from "@/src/config/loader";
import type { PlannerConfig } from "@/src/config/types";

const EXAMPLE_CONFIG_PATH = "config/planner.example.yaml";
const OPERATING_CASH_ID = "manual:synthetic-operating-cash";
const RESERVE_REFILL_ID = "manual:synthetic-reserve-refill";
const PERSONAL_TFSA_ID = "plaid:synthetic-personal-tfsa";
const PERSONAL_RRSP_ID = "plaid:synthetic-personal-rrsp";
const WORKPLACE_RRSP_ID = "plaid:synthetic-workplace-rrsp";
const PRIMARY_RESIDENCE_ID = "manual:synthetic-primary-residence";
const FUTURE_TAXABLE_ID = "projection:future-taxable";

describe("private planner configuration", () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), "planner-config-"));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  async function exampleContents(): Promise<string> {
    return readFile(EXAMPLE_CONFIG_PATH, "utf8");
  }

  async function temporaryConfig(name: string, contents?: string): Promise<string> {
    const path = join(temporaryDirectory, name);
    await writeFile(path, contents ?? (await exampleContents()), "utf8");
    return path;
  }

  async function advancedConfig(): Promise<PlannerConfig> {
    const value = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    delete value.configurationMode;
    delete value.registeredRoom;
    delete value.savingsPolicy;
    delete value.primaryResidence;

    const mappings = value.accountMappings as Record<
      string,
      Record<string, unknown>
    >;
    for (const mapping of Object.values(mappings)) {
      delete mapping.roles;
    }
    delete mappings[PRIMARY_RESIDENCE_ID];
    delete mappings["manual:synthetic-primary-mortgage"];
    delete (value.categoryMappings as Record<string, unknown>)[
      "synthetic-home-auto-category"
    ];
    mappings[PERSONAL_TFSA_ID]!.contributionPhases = [
      {
        id: "current-saving",
        label: "Current saving",
        startAge: 38,
        endAge: 41,
        monthlyAmountToday: "live_baseline",
        funding: "cash",
        indexingRate: 0,
      },
      {
        id: "future-saving",
        label: "Future saving",
        startAge: 41,
        endAge: 62,
        monthlyAmountToday: 500,
        funding: "income_withheld",
        indexingRate: 0.02,
      },
    ];

    const employmentPhases = value.employmentIncomePhases as Array<
      Record<string, unknown>
    >;
    for (const phase of employmentPhases) {
      const simpleRoom = phase.rrspRoom as Record<string, unknown>;
      phase.rrspRoomGeneration = {
        annualEligibleEarnedIncomeToday:
          simpleRoom.eligibleEarnedIncomeToday,
        annualPensionAdjustmentToday:
          simpleRoom.pensionAdjustmentToday,
        annualOtherRoomReductionToday:
          simpleRoom.otherReductionToday,
        annualGrowth: simpleRoom.annualGrowth,
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
      routes: [
        {
          sourceAccountId: PERSONAL_TFSA_ID,
          destinationAccountIds: [PERSONAL_TFSA_ID, FUTURE_TAXABLE_ID],
        },
      ],
      surplusDestinationAccountIds: [PERSONAL_TFSA_ID, FUTURE_TAXABLE_ID],
    };
    (value.categoryMappings as Record<string, unknown>)[
      "synthetic-investment-transfer-category"
    ] = {
      classification: "investment_contribution",
      contributionAccountId: PERSONAL_TFSA_ID,
      contributionDirection: "debit",
    };

    return validatePlannerConfig(value);
  }

  it("parses and validates the committed commented YAML example", async () => {
    const contents = await exampleContents();
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);

    expect(contents).toContain("# Everyday chequing or cash");
    expect(contents).toContain("For example, groceries");
    expect(contents).toContain(
      "Only amounts listed in these plans are deliberately saved or invested",
    );
    expect(contents).toContain(
      "quoted key is a Lunch Money account ID",
    );
    expect(contents).toContain("Find available RRSP contribution room");
    expect(contents).toContain("Do not add a current-year");
    expect(contents).toContain("not your personal entitlement");
    expect(contents).toContain("qualifying years");
    expect(contents).not.toMatch(/^cppStartAge:|^oasStartAge:/m);
    expect(config.transactionTrailingMonths).toBe(12);
    expect(config.governmentBenefits).toEqual({
      cpp: {
        startAge: 65,
        indexingRate: 0.02,
        amountAt65: { source: "canadian_reference" },
      },
      oas: {
        startAge: 65,
        indexingRate: 0.02,
        fullAmountAt65: { source: "canadian_reference" },
        eligibility: { mode: "full" },
      },
    });
    expect(config).not.toHaveProperty("cppStartAge");
    expect(config.assumptions).not.toHaveProperty("cppIndexing");
    expect(config.configurationMode).toBe("simple");
    expect(config.accountMappings).toHaveProperty(OPERATING_CASH_ID);
    expect(config.employmentIncomePhases).toEqual([
      expect.objectContaining({
        id: "current-income",
        annualNetCashToday: "live_baseline",
      }),
      expect.objectContaining({
        id: "future-income",
        annualNetCashToday: 72000,
      }),
    ]);
    expect(config.accountMappings[PERSONAL_TFSA_ID]!.roles).toEqual([
      "personal_tfsa",
    ]);
    expect(config.savingsPolicy?.personalInvesting.phases).toHaveLength(2);
    expect(config).not.toHaveProperty("projectionAccounts");
    expect(config).not.toHaveProperty("surplusAllocation");
    expect(config).not.toHaveProperty("contributionWaterfall");
    for (const id of [
      RESERVE_REFILL_ID,
      PERSONAL_TFSA_ID,
      PERSONAL_RRSP_ID,
      WORKPLACE_RRSP_ID,
    ]) {
      expect(contents.match(new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
    }
    expect(
      contents.match(
        new RegExp(
          OPERATING_CASH_ID.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          ),
          "g",
        ),
      ),
    ).toHaveLength(2);
  });

  it("uses plain-language, actionable instructions in the primary example", async () => {
    const contents = await exampleContents();
    const comments = contents
      .split("\n")
      .flatMap((line) => {
        const marker = line.indexOf("#");
        return marker === -1 ? [] : [line.slice(marker + 1)];
      })
      .join("\n");

    expect(comments).toContain("You can also find it as `id`");
    expect(comments).toContain("Find year-to-date gross income");
    expect(comments).toContain("Box 52 of a T4");
    expect(comments).toContain("CRA My Account");
    expect(comments).toContain("0.02 is 2%");
    expect(comments).not.toMatch(
      /\b(owner-facing|routing reference|resolved input|compile|compiler|canonical|projection-only origin|configuration discriminator|contribution source graph|compatibility normalization|account-role resolution|generated room ledger|explicit-zero semantics)\b/i,
    );
  });

  it("parses the residence and amortizing mortgage without investment-only debt knobs", async () => {
    const contents = await exampleContents();
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const mortgage = Object.values(config.accountMappings).find(
      (mapping) => mapping.roles?.includes("primary_mortgage"),
    )!;

    expect(config.primaryResidence).toBeUndefined();
    expect(config.accountMappings[PRIMARY_RESIDENCE_ID]).toEqual({
      include: true,
      type: "real_estate",
      roles: ["primary_residence"],
      annualAppreciation: 0.02,
    });
    expect(mortgage).toMatchObject({
      include: true,
      type: "debt",
      roles: ["primary_mortgage"],
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: {
          amount: 1200,
          frequency: "biweekly",
        },
        scheduleStartDate: "2026-01-15",
        lumpSumPayments: [],
        historicalPayment: {
          mode: "payee_and_source_account",
          sourceAccountId: OPERATING_CASH_ID,
          payee: "Synthetic mortgage payment",
        },
      },
    });
    expect(mortgage).not.toHaveProperty("annualReturn");
    expect(mortgage).not.toHaveProperty("allocation");
    expect(mortgage).not.toHaveProperty("withdrawalPriority");
    expect(config.assumptions).not.toHaveProperty("debtReturn");
    expect(config.assumptions.allocations).not.toHaveProperty("debt");
    expect(contents).toContain("not available for retirement withdrawals");
    expect(contents).toContain("principal reduces cash and debt together");
    expect(contents).toContain("interest is consumption");
  });

  it("accepts a mortgage-free imported residence and rejects duplicate or invalid mortgage roles", async () => {
    const mortgageFree = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const mappings = mortgageFree.accountMappings as Record<
      string,
      Record<string, unknown>
    >;
    delete mappings["manual:synthetic-primary-mortgage"];
    expect(
      validatePlannerConfig(mortgageFree).accountMappings[
        PRIMARY_RESIDENCE_ID
      ],
    ).toBeDefined();

    const duplicate = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const duplicateMappings = duplicate.accountMappings as Record<
      string,
      Record<string, unknown>
    >;
    duplicateMappings["manual:synthetic-second-mortgage"] = {
      include: true,
      type: "debt",
      roles: ["primary_mortgage"],
      liability: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
        regularPayment: { amount: 1000, frequency: "monthly" },
        scheduleStartDate: "2026-01-15",
        lumpSumPayments: [],
        historicalPayment: {
          mode: "already_excluded_or_transfer",
        },
      },
    };
    expect(() => validatePlannerConfig(duplicate)).toThrow(
      "at most one included primary_mortgage role",
    );

    const wrongType = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      (wrongType.accountMappings as Record<string, Record<string, unknown>>)[
        "manual:synthetic-primary-mortgage"
      ]!
    ).type = "cash";
    expect(() => validatePlannerConfig(wrongType)).toThrow(
      "liability may be configured only for an included debt account",
    );
  });

  it("accepts the manual residence fallback or no residence, but not both", async () => {
    const fallback = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    delete (
      fallback.accountMappings as Record<string, unknown>
    )[PRIMARY_RESIDENCE_ID];
    fallback.primaryResidence = {
      currentValue: 400000,
      asOf: "2026-07-01",
      annualAppreciation: 0.01,
    };
    expect(validatePlannerConfig(fallback).primaryResidence).toEqual({
      currentValue: 400000,
      asOf: "2026-07-01",
      annualAppreciation: 0.01,
    });

    const noResidence = structuredClone(fallback);
    delete noResidence.primaryResidence;
    delete (
      noResidence.accountMappings as Record<string, unknown>
    )["manual:synthetic-primary-mortgage"];
    expect(validatePlannerConfig(noResidence).primaryResidence).toBeUndefined();
  });

  it("rejects duplicate residence sources and invalid real-estate fields", async () => {
    const duplicate = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    duplicate.primaryResidence = {
      currentValue: 400000,
      asOf: "2026-07-01",
      annualAppreciation: 0.01,
    };
    expect(() => validatePlannerConfig(duplicate)).toThrow(
      "Configure exactly one primary-residence source",
    );

    const extraImported = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      extraImported.accountMappings as Record<
        string,
        Record<string, unknown>
      >
    )["manual:synthetic-second-residence"] = {
      include: true,
      type: "real_estate",
      roles: ["primary_residence"],
      annualAppreciation: 0.01,
    };
    expect(() => validatePlannerConfig(extraImported)).toThrow(
      "at most one included primary_residence role",
    );

    const missingAppreciation = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    delete (
      (
        missingAppreciation.accountMappings as Record<
          string,
          Record<string, unknown>
        >
      )[PRIMARY_RESIDENCE_ID]!
    ).annualAppreciation;
    expect(() => validatePlannerConfig(missingAppreciation)).toThrow(
      "annualAppreciation is required",
    );

    const wrongRole = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      (
        wrongRole.accountMappings as Record<
          string,
          Record<string, unknown>
        >
      )[PRIMARY_RESIDENCE_ID]!
    ).roles = ["reserve_member"];
    expect(() => validatePlannerConfig(wrongRole)).toThrow(
      "must use exactly roles: [primary_residence]",
    );

    for (const [field, value] of [
      ["annualReturn", 0.02],
      ["withdrawalPriority", 6],
      ["allocation", { cash: 0, fixedIncome: 0, equity: 1 }],
      ["monthlyContribution", 100],
      [
        "liability",
        {
          mode: "payoff_at_projection_start",
          historicalPayment: {
            mode: "already_excluded_or_transfer",
          },
        },
      ],
    ] as const) {
      const invalid = structuredClone(
        await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
      ) as unknown as Record<string, unknown>;
      (
        (
          invalid.accountMappings as Record<
            string,
            Record<string, unknown>
          >
        )[PRIMARY_RESIDENCE_ID]!
      )[field] = value;
      expect(() => validatePlannerConfig(invalid)).toThrow();
    }
  });

  it("rejects non-positive mortgage payments and non-zero legacy debt investment assumptions", async () => {
    const payment = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const mapping = (
      payment.accountMappings as Record<string, Record<string, unknown>>
    )["manual:synthetic-primary-mortgage"]!;
    (
      (mapping.liability as Record<string, unknown>)
        .regularPayment as Record<string, unknown>
    ).amount = 0;
    expect(() => validatePlannerConfig(payment)).toThrow(
      "regularPayment.amount must be at least",
    );

    const debtReturn = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (debtReturn.assumptions as Record<string, unknown>).debtReturn = 0.01;
    expect(() => validatePlannerConfig(debtReturn)).toThrow(
      "assumptions.debtReturn must be removed",
    );

    const debtAllocation = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      (debtAllocation.assumptions as Record<string, unknown>)
        .allocations as Record<string, unknown>
    ).debt = { cash: 0, fixedIncome: 0, equity: 1 };
    expect(() => validatePlannerConfig(debtAllocation)).toThrow(
      "assumptions.allocations.debt must be removed",
    );
  });

  it("requires an explicit supported liability interest-rate convention", async () => {
    const missing = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const missingLiability = (
      (
        missing.accountMappings as Record<
          string,
          Record<string, unknown>
        >
      )["manual:synthetic-primary-mortgage"]!
        .liability as Record<string, unknown>
    );
    delete missingLiability.interestRateConvention;
    expect(() => validatePlannerConfig(missing)).toThrow(
      "interestRateConvention must be canadian_mortgage or effective_annual",
    );

    const invalid = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const invalidLiability = (
      (
        invalid.accountMappings as Record<
          string,
          Record<string, unknown>
        >
      )["manual:synthetic-primary-mortgage"]!
        .liability as Record<string, unknown>
    );
    invalidLiability.interestRateConvention = "synthetic_invalid";
    expect(() => validatePlannerConfig(invalid)).toThrow(
      "interestRateConvention must be canadian_mortgage or effective_annual",
    );
  });

  it("rejects conflicting historical mortgage-payment handling", async () => {
    const categoryConflict = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      categoryConflict.categoryMappings as Record<string, unknown>
    )["synthetic-dedicated-mortgage"] = {
      classification: "debt_payment",
      liabilityRole: "primary_mortgage",
    };
    expect(() => validatePlannerConfig(categoryConflict)).toThrow(
      "exactly one historical-payment handling source",
    );

    const legacyConflict = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const liability = (
      (
        legacyConflict.accountMappings as Record<
          string,
          Record<string, unknown>
        >
      )["manual:synthetic-primary-mortgage"]!
        .liability as Record<string, unknown>
    );
    liability.historicalPaymentHandling =
      "already_excluded_or_transfer";
    expect(() => validatePlannerConfig(legacyConflict)).toThrow(
      "cannot combine historicalPayment with the legacy historicalPaymentHandling",
    );

    const invalidMatcher = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    (
      (
        (
          invalidMatcher.accountMappings as Record<
            string,
            Record<string, unknown>
          >
        )["manual:synthetic-primary-mortgage"]!
          .liability as Record<string, unknown>
      ).historicalPayment as Record<string, unknown>
    ).payee = "   ";
    expect(() => validatePlannerConfig(invalidMatcher)).toThrow(
      "historicalPayment.payee must be a non-empty string",
    );
  });

  it("accepts only the documented zero-valued legacy debt investment knobs", async () => {
    const legacy = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const mapping = (
      legacy.accountMappings as Record<string, Record<string, unknown>>
    )["manual:synthetic-primary-mortgage"]!;
    mapping.annualReturn = 0;
    mapping.allocation = { cash: 0, fixedIncome: 0, equity: 0 };
    mapping.withdrawalPriority = 99;
    (legacy.assumptions as Record<string, unknown>).debtReturn = 0;
    (
      (legacy.assumptions as Record<string, unknown>)
        .allocations as Record<string, unknown>
    ).debt = { cash: 0, fixedIncome: 0, equity: 0 };

    const parsed = validatePlannerConfig(legacy);

    expect(
      parsed.accountMappings["manual:synthetic-primary-mortgage"],
    ).toMatchObject({
      annualReturn: 0,
      allocation: { cash: 0, fixedIncome: 0, equity: 0 },
      withdrawalPriority: 99,
    });
    expect(parsed.assumptions.debtReturn).toBe(0);
    expect(parsed.assumptions.allocations.debt).toEqual({
      cash: 0,
      fixedIncome: 0,
      equity: 0,
    });
  });

  it("blocks the old advanced static-positive-debt path with a migration error", async () => {
    const advanced = (await advancedConfig()) as unknown as Record<
      string,
      unknown
    >;
    (
      advanced.accountMappings as Record<string, Record<string, unknown>>
    )["manual:synthetic-legacy-debt"] = {
      include: true,
      type: "debt",
    };

    expect(() => validatePlannerConfig(advanced)).toThrow(
      "Advanced static debt accounts are no longer supported",
    );
  });

  it("rejects the old simple RRSP pre-start field with a migration message", async () => {
    const config = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const room = config.registeredRoom as {
      rrsp: Record<string, unknown>;
    };
    room.rrsp.beforeProjectionStart =
      room.rrsp.currentYearBeforePlanStart;
    delete room.rrsp.currentYearBeforePlanStart;

    expect(() => validatePlannerConfig(config)).toThrow(
      "registeredRoom.rrsp.beforeProjectionStart was renamed to registeredRoom.rrsp.currentYearBeforePlanStart",
    );
  });

  it("ignores YAML comments without changing configuration values", async () => {
    const withComments = await temporaryConfig("with-comments.yaml");
    const withoutComments = await temporaryConfig(
      "without-comments.yaml",
      (await exampleContents()).replace(/#.*$/gm, ""),
    );

    expect(await loadPlannerConfig(withComments)).toEqual(
      await loadPlannerConfig(withoutComments),
    );
  });

  it("preserves a quoted numeric category ID as a string key", async () => {
    const contents = (await exampleContents()).replace(
      '"synthetic-essential-category": essential',
      '"123456": essential',
    );
    const config = await loadPlannerConfig(await temporaryConfig("numeric-category.yaml", contents));

    expect(Object.keys(config.categoryMappings)).toContain("123456");
    expect(config.categoryMappings["123456"]).toBe("essential");
  });

  it("preserves quoted manual and Plaid account IDs exactly", async () => {
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);

    expect(Object.keys(config.accountMappings)).toEqual(
      expect.arrayContaining([
        OPERATING_CASH_ID,
        PERSONAL_TFSA_ID,
      ]),
    );
  });

  it("produces the same validated shape from equivalent YAML and JSON", async () => {
    const yamlConfig = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const jsonPath = await temporaryConfig(
      "equivalent.json",
      JSON.stringify(yamlConfig, null, 2),
    );

    expect(await loadPlannerConfig(jsonPath)).toEqual(yamlConfig);
  });

  it("accepts the .yml extension", async () => {
    const config = await loadPlannerConfig(await temporaryConfig("planner.yml"));

    expect(config.currentAge).toBe(38);
  });

  it("continues to accept JSON when explicitly configured", async () => {
    const yamlConfig = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const jsonPath = await temporaryConfig("planner.json", JSON.stringify(yamlConfig));

    expect(await loadPlannerConfig(jsonPath)).toEqual(yamlConfig);
  });

  it("validates every canonical CPP source and OAS eligibility mode", async () => {
    const base = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    for (const amountAt65 of [
      {
        source: "official_estimate",
        monthlyAmountToday: 1234.56,
        effectiveDate: "2026-06-30",
      },
      {
        source: "configured_amount",
        monthlyAmountToday: 900,
        effectiveDate: "2026-06-30",
      },
      { source: "canadian_reference" },
      { source: "explicit_zero" },
    ]) {
      const value = structuredClone(base) as unknown as Record<string, unknown>;
      const benefits = value.governmentBenefits as Record<string, Record<string, unknown>>;
      benefits.cpp!.amountAt65 = amountAt65;
      expect(() => validatePlannerConfig(value)).not.toThrow();
    }
    for (const eligibility of [
      { mode: "full" },
      { mode: "partial", qualifyingResidenceYearsAfter18: 20 },
      { mode: "none" },
    ]) {
      const value = structuredClone(base) as unknown as Record<string, unknown>;
      const benefits = value.governmentBenefits as Record<string, Record<string, unknown>>;
      benefits.oas!.eligibility = eligibility;
      expect(() => validatePlannerConfig(value)).not.toThrow();
    }
    const configuredOas = structuredClone(base) as unknown as Record<
      string,
      unknown
    >;
    const configuredOasBenefits = configuredOas.governmentBenefits as Record<
      string,
      Record<string, unknown>
    >;
    configuredOasBenefits.oas!.fullAmountAt65 = {
      source: "configured_amount",
      monthlyAmountToday: 750,
      effectiveDate: "2026-07-01",
    };
    expect(() => validatePlannerConfig(configuredOas)).not.toThrow();
  });

  it("requires canonical benefit claim ages to align to projection months", async () => {
    const cppInvalid = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    cppInvalid.governmentBenefits!.cpp.startAge = 65.1;
    expect(() => validatePlannerConfig(cppInvalid)).toThrow(
      "governmentBenefits.cpp.startAge must align to a projection month",
    );

    const oasInvalid = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    oasInvalid.governmentBenefits!.oas.startAge = 65.1;
    expect(() => validatePlannerConfig(oasInvalid)).toThrow(
      "governmentBenefits.oas.startAge must align to a projection month",
    );

    const aligned = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    aligned.governmentBenefits!.cpp.startAge = 65 + 1 / 12;
    aligned.governmentBenefits!.oas.startAge = 65.5;
    expect(() => validatePlannerConfig(aligned)).not.toThrow();
  });

  it("rejects mixed, incomplete, and invalid government-benefit configuration", async () => {
    const mixed = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    mixed.cppStartAge = 65;
    expect(() => validatePlannerConfig(mixed)).toThrow(
      "cannot be combined with legacy CPP or OAS fields",
    );

    const missing = structuredClone(mixed);
    delete missing.governmentBenefits;
    expect(() => validatePlannerConfig(missing)).toThrow(
      "complete legacy CPP and OAS scalar configuration",
    );

    const badReference = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const referenceBenefits = badReference.governmentBenefits as Record<
      string,
      Record<string, unknown>
    >;
    referenceBenefits.cpp!.amountAt65 = {
      source: "canadian_reference",
      monthlyAmountToday: 999,
    };
    expect(() => validatePlannerConfig(badReference)).toThrow(
      "does not accept monthlyAmountToday",
    );

    const badDate = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const badDateBenefits = badDate.governmentBenefits as Record<
      string,
      Record<string, unknown>
    >;
    badDateBenefits.cpp!.amountAt65 = {
      source: "official_estimate",
      monthlyAmountToday: 1000,
      effectiveDate: "2026-02-30",
    };
    expect(() => validatePlannerConfig(badDate)).toThrow(
      "valid ISO calendar date",
    );

    const unknownCpp = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    const unknownCppBenefits = unknownCpp.governmentBenefits as Record<
      string,
      Record<string, unknown>
    >;
    unknownCppBenefits.cpp!.amountAt65 = { source: "personal_entitlement" };
    expect(() => validatePlannerConfig(unknownCpp)).toThrow(
      "official_estimate, configured_amount, canadian_reference, or explicit_zero",
    );

    for (const eligibility of [
      { mode: "partial" },
      { mode: "partial", qualifyingResidenceYearsAfter18: 0 },
      { mode: "partial", qualifyingResidenceYearsAfter18: 20.5 },
      { mode: "partial", qualifyingResidenceYearsAfter18: 40 },
      { mode: "full", qualifyingResidenceYearsAfter18: 20 },
      { mode: "unknown" },
    ]) {
      const value = structuredClone(
        await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
      ) as unknown as Record<string, unknown>;
      const benefits = value.governmentBenefits as Record<
        string,
        Record<string, unknown>
      >;
      benefits.oas!.eligibility = eligibility;
      expect(() => validatePlannerConfig(value)).toThrow();
    }
  });

  it("accepts a complete legacy benefit configuration deterministically", async () => {
    const legacy = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    delete legacy.governmentBenefits;
    Object.assign(legacy, {
      cppStartAge: 65,
      oasStartAge: 67,
      cppMonthlyAmountAt65: 1000,
      oasMonthlyAmountAt65: 700,
    });
    const legacyAssumptions = legacy.assumptions as Record<string, unknown>;
    legacyAssumptions.cppIndexing = 0.02;
    legacyAssumptions.oasIndexing = 0.02;

    const resolved = validatePlannerConfig(legacy);
    expect(resolved.cppMonthlyAmountAt65).toBe(1000);
    expect(resolved.governmentBenefits).toBeUndefined();
  });

  it("rejects unsupported configuration extensions clearly", async () => {
    const path = join(temporaryDirectory, "planner.toml");

    await expect(loadPlannerConfig(path)).rejects.toMatchObject({
      code: "invalid_planner_config",
      message: expect.stringContaining('unsupported extension (".toml")'),
    });
  });

  it("reports malformed YAML clearly", async () => {
    const path = await temporaryConfig("malformed.yaml", "accountMappings: [");

    await expect(loadPlannerConfig(path)).rejects.toMatchObject({
      code: "invalid_planner_config",
      message: expect.stringContaining("not valid YAML"),
    });
  });

  it("uses YAML as the default and references the canonical local file when missing", async () => {
    const missingPath = join(temporaryDirectory, DEFAULT_CONFIG_PATH);

    expect(DEFAULT_CONFIG_PATH).toBe("config/planner.local.yaml");
    await expect(loadPlannerConfig(missingPath)).rejects.toMatchObject({
      code: "planner_config_missing",
      message: expect.stringContaining(
        "Copy config/planner.example.yaml to config/planner.local.yaml",
      ),
    });
  });

  it("requires an explicit funding choice for every manual monthly contribution", async () => {
    const config = await advancedConfig();
    const mapping = config.accountMappings[PERSONAL_TFSA_ID]!;
    delete mapping.contributionPhases;
    mapping.monthlyContribution = 100;

    expect(() => validatePlannerConfig(config)).toThrow(
      "contributionFunding must be cash or income_withheld",
    );
  });

  it("validates contiguous ordered employment phases and month-aligned boundaries", async () => {
    const gap = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    gap.employmentIncomePhases![1]!.startAge = 42;
    expect(() => validatePlannerConfig(gap)).toThrow("have a gap");

    const overlap = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    overlap.employmentIncomePhases![1]!.startAge = 40;
    expect(() => validatePlannerConfig(overlap)).toThrow("overlap");

    const nonAligned = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    nonAligned.employmentIncomePhases![0]!.endAge = 41.01;
    expect(() => validatePlannerConfig(nonAligned)).toThrow(
      "must align to a projection month",
    );
  });

  it("rejects duplicate phase ids and phase ranges outside working ages", async () => {
    const duplicate = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    duplicate.employmentIncomePhases![1]!.id =
      duplicate.employmentIncomePhases![0]!.id;
    expect(() => validatePlannerConfig(duplicate)).toThrow("duplicate phase id");

    const outside = await advancedConfig();
    outside.accountMappings[PERSONAL_TFSA_ID]!.contributionPhases![0]!.startAge = 37;
    expect(() => validatePlannerConfig(outside)).toThrow(
      "must stay within currentAge and retirementAge",
    );

    const duplicateContribution = await advancedConfig();
    const contributionPhases =
      duplicateContribution.accountMappings[PERSONAL_TFSA_ID]!
        .contributionPhases!;
    contributionPhases[1]!.id = contributionPhases[0]!.id;
    expect(() => validatePlannerConfig(duplicateContribution)).toThrow(
      "duplicates contribution phase id",
    );

    const overlappingContribution = await advancedConfig();
    overlappingContribution.accountMappings[
      PERSONAL_TFSA_ID
    ]!.contributionPhases![1]!.startAge = 40;
    expect(() => validatePlannerConfig(overlappingContribution)).toThrow(
      "overlaps contribution phase",
    );
  });

  it("rejects phased contributions on non-investment accounts and ambiguous legacy fields", async () => {
    const config = await advancedConfig();
    const cash = config.accountMappings[OPERATING_CASH_ID]!;
    cash.contributionPhases = structuredClone(
      config.accountMappings[PERSONAL_TFSA_ID]!
        .contributionPhases,
    );
    expect(() => validatePlannerConfig(config)).toThrow(
      "may only be configured for a TFSA, RRSP/RRIF, or non-registered account",
    );

    const ambiguous = await advancedConfig();
    ambiguous.accountMappings[PERSONAL_TFSA_ID]!.monthlyContribution = 100;
    expect(() => validatePlannerConfig(ambiguous)).toThrow(
      "cannot combine contributionPhases",
    );
  });

  it("rejects invalid live-baseline source strings and negative phase amounts", async () => {
    const invalidSource = JSON.parse(
      JSON.stringify(await loadPlannerConfig(EXAMPLE_CONFIG_PATH)),
    ) as Record<string, unknown>;
    (
      invalidSource.employmentIncomePhases as Array<Record<string, unknown>>
    )[0]!.annualNetCashToday = "current_income";
    expect(() => validatePlannerConfig(invalidSource)).toThrow(
      "exact string live_baseline",
    );

    const negative = JSON.parse(
      JSON.stringify(await advancedConfig()),
    ) as Record<string, unknown>;
    const mappings = negative.accountMappings as Record<
      string,
      Record<string, unknown>
    >;
    (
      mappings[PERSONAL_TFSA_ID]!
        .contributionPhases as Array<Record<string, unknown>>
    )[0]!.monthlyAmountToday = -1;
    expect(() => validatePlannerConfig(negative)).toThrow(
      "must be at least 0",
    );

    const invalidGrowth = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    invalidGrowth.employmentIncomePhases![0]!.annualGrowth = 0.75;
    expect(() => validatePlannerConfig(invalidGrowth)).toThrow(
      "must be no greater than 0.5",
    );

    const invalidIndexing = await advancedConfig();
    invalidIndexing.accountMappings[
      PERSONAL_TFSA_ID
    ]!.contributionPhases![0]!.indexingRate = -0.3;
    expect(() => validatePlannerConfig(invalidIndexing)).toThrow(
      "must be at least -0.2",
    );
  });

  it("ignores all supported private local filenames in Git and Docker contexts", async () => {
    for (const ignoreFile of [".gitignore", ".dockerignore"]) {
      const contents = await readFile(ignoreFile, "utf8");
      expect(contents).toContain("config/planner.local.yaml");
      expect(contents).toContain("config/planner.local.yml");
      expect(contents).toContain("config/planner.local.json");
    }
  });

  it("requires an explicit surplus allocation policy", async () => {
    const value = structuredClone(
      await advancedConfig(),
    ) as unknown as Record<string, unknown>;
    delete value.surplusAllocation;

    expect(() => validatePlannerConfig(value)).toThrow(
      "surplusAllocation is required",
    );
  });

  it("validates retain-as-cash and allocate-to-account discriminator fields", async () => {
    const retain = structuredClone(
      await advancedConfig(),
    ) as unknown as Record<string, unknown>;
    retain.surplusAllocation = {
      reserveAccountIds: [RESERVE_REFILL_ID],
      reserveRefillAccountId: RESERVE_REFILL_ID,
      targetCashReserveToday: 10000,
      reserveIndexingRate: 0.02,
      excess: { mode: "retain_as_cash" },
    };
    expect(() => validatePlannerConfig(retain)).not.toThrow();

    const retainWithDestination = structuredClone(retain);
    (
      (retainWithDestination.surplusAllocation as Record<string, unknown>)
        .excess as Record<string, unknown>
    ).destinationAccountId = "projection:destination";
    expect(() => validatePlannerConfig(retainWithDestination)).toThrow(
      "not allowed when mode is retain_as_cash",
    );

    const missingDestination = structuredClone(retain);
    (
      missingDestination.surplusAllocation as Record<string, unknown>
    ).excess = { mode: "allocate_to_account" };
    expect(() => validatePlannerConfig(missingDestination)).toThrow(
      "destinationAccountId must be a non-empty string",
    );
  });

  it("requires an explicit unique reserve-account set and a refill account within it", async () => {
    const valid = structuredClone(
      await advancedConfig(),
    ) as unknown as Record<string, unknown>;

    const missingSet = structuredClone(valid);
    delete (
      missingSet.surplusAllocation as Record<string, unknown>
    ).reserveAccountIds;
    expect(() => validatePlannerConfig(missingSet)).toThrow(
      "reserveAccountIds must be a non-empty array",
    );

    const duplicate = structuredClone(valid);
    (
      duplicate.surplusAllocation as Record<string, unknown>
    ).reserveAccountIds = [RESERVE_REFILL_ID, RESERVE_REFILL_ID];
    expect(() => validatePlannerConfig(duplicate)).toThrow(
      "must not contain duplicate accounts",
    );

    const refillOutsideSet = structuredClone(valid);
    const policy = refillOutsideSet.surplusAllocation as Record<
      string,
      unknown
    >;
    policy.reserveAccountIds = [RESERVE_REFILL_ID];
    policy.reserveRefillAccountId = OPERATING_CASH_ID;
    expect(() => validatePlannerConfig(refillOutsideSet)).toThrow(
      "reserveRefillAccountId must be included in reserveAccountIds",
    );
  });

  it("requires explicit projection-only account assumptions and projection-prefixed ids", async () => {
    const valid = await advancedConfig();
    expect(valid.projectionAccounts?.[FUTURE_TAXABLE_ID]).toEqual({
      label: "Future taxable investment account",
      type: "non_registered",
      annualReturn: 0.05,
      withdrawalPriority: 6,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    });

    const badPrefix = structuredClone(valid) as unknown as Record<
      string,
      unknown
    >;
    const accounts = badPrefix.projectionAccounts as Record<string, unknown>;
    accounts["future-taxable"] = accounts[FUTURE_TAXABLE_ID];
    delete accounts[FUTURE_TAXABLE_ID];
    expect(() => validatePlannerConfig(badPrefix)).toThrow(
      "must begin with projection:",
    );

    for (const field of [
      "label",
      "annualReturn",
      "withdrawalPriority",
      "allocation",
      "contributionPhases",
    ]) {
      const missing = structuredClone(valid) as unknown as Record<
        string,
        unknown
      >;
      delete (
        (missing.projectionAccounts as Record<string, Record<string, unknown>>)[
          FUTURE_TAXABLE_ID
        ]!
      )[field];
      expect(() => validatePlannerConfig(missing)).toThrow();
    }

    const openingBalance = structuredClone(valid) as unknown as Record<
      string,
      unknown
    >;
    (
      (openingBalance.projectionAccounts as Record<
        string,
        Record<string, unknown>
      >)[FUTURE_TAXABLE_ID]!
    ).openingBalance = 1;
    expect(() => validatePlannerConfig(openingBalance)).toThrow(
      "openingBalance is not configurable",
    );
  });

  it("rejects projection-only debt, duplicate ids, and unresolved live-baseline contributions", async () => {
    const debt = structuredClone(
      await advancedConfig(),
    );
    debt.projectionAccounts![FUTURE_TAXABLE_ID]!.type =
      "debt" as never;
    expect(() => validatePlannerConfig(debt)).toThrow(
      "debt and exclude are not supported",
    );

    const collision = structuredClone(
      await advancedConfig(),
    );
    collision.accountMappings[FUTURE_TAXABLE_ID] = {
      include: false,
      type: "exclude",
    };
    expect(() => validatePlannerConfig(collision)).toThrow(
      "cannot appear in both",
    );

    const live = structuredClone(
      await advancedConfig(),
    );
    live.projectionAccounts![FUTURE_TAXABLE_ID]!
      .contributionPhases = [
      {
        id: "invalid-live",
        label: "Invalid live phase",
        startAge: 38,
        endAge: 41,
        monthlyAmountToday: "live_baseline",
        funding: "cash",
        indexingRate: 0,
      },
    ];
    expect(() => validatePlannerConfig(live)).toThrow(
      "no imported contribution baseline",
    );
  });

  it("validates every starting-room source without treating Canadian limits as personal room", async () => {
    const base = await advancedConfig();
    for (const startingAvailableRoom of [
      {
        source: "official_estimate",
        amount: 12345,
        sourceDescription: "Synthetic owner-supplied estimate",
        effectiveDate: "2026-06-30",
      },
      {
        source: "configured_amount",
        amount: 6789,
        sourceDescription: "Synthetic configured amount",
        effectiveDate: "2026-06-30",
      },
      { source: "explicit_zero" },
    ]) {
      const value = structuredClone(base) as unknown as Record<
        string,
        unknown
      >;
      const room = value.registeredAccountRoom as Record<
        string,
        Record<string, unknown>
      >;
      room.tfsa!.startingAvailableRoom = startingAvailableRoom;
      expect(() => validatePlannerConfig(value)).not.toThrow();
    }

    const invalid = structuredClone(base) as unknown as Record<
      string,
      unknown
    >;
    const room = invalid.registeredAccountRoom as Record<
      string,
      Record<string, unknown>
    >;
    room.tfsa!.startingAvailableRoom = {
      source: "official_estimate",
      amount: 1000,
      effectiveDate: "2026-06-30",
    };
    expect(() => validatePlannerConfig(invalid)).toThrow(
      "sourceDescription must be a non-empty string",
    );
  });

  it("requires explicit numeric RRSP room-generation inputs and accepts surplus waterfall mode", async () => {
    const valid = await advancedConfig();
    expect(valid.surplusAllocation!.excess).toEqual({
      mode: "allocate_through_contribution_waterfall",
    });
    expect(valid.employmentIncomePhases?.every(
      (phase) => phase.rrspRoomGeneration !== undefined,
    )).toBe(true);

    const liveBaseline = structuredClone(valid) as unknown as Record<
      string,
      unknown
    >;
    const phases = liveBaseline.employmentIncomePhases as Array<
      Record<string, unknown>
    >;
    (
      phases[0]!.rrspRoomGeneration as Record<string, unknown>
    ).annualEligibleEarnedIncomeToday = "live_baseline";
    expect(() => validatePlannerConfig(liveBaseline)).toThrow(
      "must be a finite number",
    );

    const destinationField = structuredClone(valid) as unknown as Record<
      string,
      unknown
    >;
    (
      (destinationField.surplusAllocation as Record<string, unknown>)
        .excess as Record<string, unknown>
    ).destinationAccountId = "projection:future-taxable";
    expect(() => validatePlannerConfig(destinationField)).toThrow(
      "does not accept destinationAccountId",
    );
  });

  it("requires RRSP generation for overflow and active surplus destinations", async () => {
    const withRrsp = await advancedConfig();
    withRrsp.projectionAccounts!["projection:future-rrsp"] = {
      label: "Synthetic future RRSP",
      type: "rrsp",
      annualReturn: 0.05,
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    };
    for (const phase of withRrsp.employmentIncomePhases!) {
      delete phase.rrspRoomGeneration;
    }

    const overflow = structuredClone(withRrsp);
    overflow.contributionWaterfall!.routes[0]!.destinationAccountIds.splice(
      1,
      0,
      "projection:future-rrsp",
    );
    expect(() => validatePlannerConfig(overflow)).toThrow(
      "requires explicit rrspRoomGeneration",
    );

    const surplus = structuredClone(withRrsp);
    surplus.contributionWaterfall!.surplusDestinationAccountIds = [
      "projection:future-rrsp",
      "projection:future-taxable",
    ];
    expect(() => validatePlannerConfig(surplus)).toThrow(
      "requires explicit rrspRoomGeneration",
    );
  });

  it("accepts explicit zero RRSP generation and omits irrelevant generation", async () => {
    const explicitZero = await advancedConfig();
    explicitZero.projectionAccounts!["projection:future-rrsp"] = {
      label: "Synthetic future RRSP",
      type: "rrsp",
      annualReturn: 0.05,
      withdrawalPriority: 3,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    };
    explicitZero.contributionWaterfall!.routes[0]!.destinationAccountIds.splice(
      1,
      0,
      "projection:future-rrsp",
    );
    for (const phase of explicitZero.employmentIncomePhases!) {
      phase.rrspRoomGeneration = {
        annualEligibleEarnedIncomeToday: 0,
        annualPensionAdjustmentToday: 0,
        annualOtherRoomReductionToday: 0,
        annualGrowth: 0,
      };
    }
    expect(() => validatePlannerConfig(explicitZero)).not.toThrow();

    const unreachable = await advancedConfig();
    for (const phase of unreachable.employmentIncomePhases!) {
      delete phase.rrspRoomGeneration;
    }
    expect(() => validatePlannerConfig(unreachable)).not.toThrow();
  });

  it("validates the simple role contract and blocks duplicate or mistyped singleton roles", async () => {
    const valid = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    expect(valid.configurationMode).toBe("simple");
    expect(valid.accountMappings[OPERATING_CASH_ID]!.roles).toEqual([
      "operating_cash",
      "reserve_member",
    ]);

    const duplicateOperating = structuredClone(valid);
    duplicateOperating.accountMappings[RESERVE_REFILL_ID]!.roles!.push(
      "operating_cash",
    );
    expect(() => validatePlannerConfig(duplicateOperating)).toThrow(
      "exactly one included operating_cash role",
    );

    const refillNotReserve = structuredClone(valid);
    refillNotReserve.accountMappings[RESERVE_REFILL_ID]!.roles = [
      "reserve_refill",
    ];
    expect(() => validatePlannerConfig(refillNotReserve)).toThrow(
      "reserve_refill account must also have the reserve_member role",
    );

    const wrongType = structuredClone(valid);
    wrongType.accountMappings[PERSONAL_TFSA_ID]!.type = "cash";
    expect(() => validatePlannerConfig(wrongType)).toThrow(
      "Account role personal_tfsa requires planner type tfsa",
    );

    const conflictingRrsp = structuredClone(valid);
    conflictingRrsp.accountMappings[WORKPLACE_RRSP_ID]!.roles = [];
    conflictingRrsp.accountMappings[PERSONAL_RRSP_ID]!.roles!.push(
      "workplace_rrsp",
    );
    expect(() => validatePlannerConfig(conflictingRrsp)).toThrow(
      "must be different accounts",
    );

    const excluded = structuredClone(valid);
    excluded.accountMappings["manual:synthetic-excluded-account"]!.roles = [
      "reserve_member",
    ];
    expect(() => validatePlannerConfig(excluded)).toThrow(
      "excluded and cannot hold active roles",
    );
  });

  it("accepts an optional real taxable role and rejects duplicate taxable roles", async () => {
    const valid = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    valid.accountMappings["plaid:synthetic-taxable"] = {
      include: true,
      type: "non_registered",
      roles: ["personal_taxable"],
      withdrawalPriority: 6,
    };
    expect(() => validatePlannerConfig(valid)).not.toThrow();

    valid.accountMappings["plaid:synthetic-taxable-two"] = {
      include: true,
      type: "non_registered",
      roles: ["personal_taxable"],
      withdrawalPriority: 7,
    };
    expect(() => validatePlannerConfig(valid)).toThrow(
      "at most one included personal_taxable role",
    );
  });

  it("rejects simple and advanced configuration in one clear conflict", async () => {
    const mixedRouting = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    mixedRouting.surplusAllocation = {
      reserveAccountIds: [OPERATING_CASH_ID, RESERVE_REFILL_ID],
      reserveRefillAccountId: RESERVE_REFILL_ID,
      targetCashReserveToday: 40000,
      reserveIndexingRate: 0.02,
      excess: { mode: "retain_as_cash" },
    };
    expect(() => validatePlannerConfig(mixedRouting)).toThrow(
      "Simple planner configuration cannot be mixed with advanced",
    );

    const mixedContributionReference = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    mixedContributionReference.categoryMappings[
      "synthetic-investment-transfer-category"
    ] = {
      classification: "investment_contribution",
      contributionAccountId: PERSONAL_TFSA_ID,
      contributionDirection: "debit",
    };
    expect(() => validatePlannerConfig(mixedContributionReference)).toThrow(
      "Simple planner configuration cannot be mixed with advanced",
    );

    const mixedTargetedEvent = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    mixedTargetedEvent.futureEvents = [
      {
        id: "synthetic-targeted-event",
        label: "Synthetic targeted event",
        calendarYear: 2030,
        month: 6,
        amountToday: 1000,
        direction: "inflow",
        targetAccountId: PERSONAL_TFSA_ID,
      },
    ];
    expect(() => validatePlannerConfig(mixedTargetedEvent)).toThrow(
      "Simple planner configuration cannot be mixed with advanced",
    );
  });

  it("requires simple RRSP assumptions on every employment phase and accepts explicit zeros", async () => {
    const explicitZeros = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    for (const phase of explicitZeros.employmentIncomePhases!) {
      phase.rrspRoom = {
        eligibleEarnedIncomeToday: 0,
        pensionAdjustmentToday: 0,
        otherReductionToday: 0,
        annualGrowth: 0,
      };
    }
    expect(() => validatePlannerConfig(explicitZeros)).not.toThrow();

    const missing = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    delete missing.employmentIncomePhases![0]!.rrspRoom;
    expect(() => validatePlannerConfig(missing)).toThrow(
      "rrspRoom is required in simple mode",
    );
  });
});
