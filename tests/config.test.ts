import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG_PATH,
  loadPlannerConfig,
  validatePlannerConfig,
} from "@/src/config/loader";

const EXAMPLE_CONFIG_PATH = "config/planner.example.yaml";

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

  it("parses and validates the committed commented YAML example", async () => {
    const contents = await exampleContents();
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);

    expect(contents).toContain("# Daily chequing account");
    expect(contents).toContain("# Groceries");
    expect(contents).toContain(
      "Inside an explicit contribution phase, live_baseline resolves only",
    );
    expect(contents).toContain(
      "Legacy account-level contribution fields are a separate compatibility",
    );
    expect(contents).not.toContain(
      "mapped contribution transactions or the",
    );
    expect(contents).toContain("not a");
    expect(contents).toContain("personal estimate or entitlement");
    expect(contents).toContain("qualifyingResidenceYearsAfter18");
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
    expect(config.accountMappings).toHaveProperty("manual:replace-with-cash-account-id");
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
    expect(
      config.accountMappings["plaid:replace-with-investment-account-id"]
        .contributionPhases,
    ).toHaveLength(2);
    expect(
      config.accountMappings["plaid:replace-with-investment-account-id"],
    ).not.toHaveProperty("monthlyContribution");
    expect(
      config.accountMappings["plaid:replace-with-investment-account-id"],
    ).not.toHaveProperty("contributionFunding");
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
      '"replace-with-essential-category-id": essential',
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
        "manual:replace-with-cash-account-id",
        "plaid:replace-with-investment-account-id",
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
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const mapping = config.accountMappings["plaid:replace-with-investment-account-id"];
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

    const outside = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    outside.accountMappings[
      "plaid:replace-with-investment-account-id"
    ]!.contributionPhases![0]!.startAge = 37;
    expect(() => validatePlannerConfig(outside)).toThrow(
      "must stay within currentAge and retirementAge",
    );

    const duplicateContribution = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const contributionPhases =
      duplicateContribution.accountMappings[
        "plaid:replace-with-investment-account-id"
      ]!.contributionPhases!;
    contributionPhases[1]!.id = contributionPhases[0]!.id;
    expect(() => validatePlannerConfig(duplicateContribution)).toThrow(
      "duplicates contribution phase id",
    );

    const overlappingContribution = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    overlappingContribution.accountMappings[
      "plaid:replace-with-investment-account-id"
    ]!.contributionPhases![1]!.startAge = 40;
    expect(() => validatePlannerConfig(overlappingContribution)).toThrow(
      "overlaps contribution phase",
    );
  });

  it("rejects phased contributions on non-investment accounts and ambiguous legacy fields", async () => {
    const config = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    const cash = config.accountMappings["manual:replace-with-cash-account-id"]!;
    cash.contributionPhases = structuredClone(
      config.accountMappings["plaid:replace-with-investment-account-id"]!
        .contributionPhases,
    );
    expect(() => validatePlannerConfig(config)).toThrow(
      "may only be configured for a TFSA, RRSP/RRIF, or non-registered account",
    );

    const ambiguous = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    ambiguous.accountMappings[
      "plaid:replace-with-investment-account-id"
    ]!.monthlyContribution = 100;
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
      JSON.stringify(await loadPlannerConfig(EXAMPLE_CONFIG_PATH)),
    ) as Record<string, unknown>;
    const mappings = negative.accountMappings as Record<
      string,
      Record<string, unknown>
    >;
    (
      mappings["plaid:replace-with-investment-account-id"]!
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

    const invalidIndexing = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    invalidIndexing.accountMappings[
      "plaid:replace-with-investment-account-id"
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
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    delete value.surplusAllocation;

    expect(() => validatePlannerConfig(value)).toThrow(
      "surplusAllocation is required",
    );
  });

  it("validates retain-as-cash and allocate-to-account discriminator fields", async () => {
    const retain = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    ) as unknown as Record<string, unknown>;
    retain.surplusAllocation = {
      reserveAccountId: "manual:reserve",
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

  it("requires explicit projection-only account assumptions and projection-prefixed ids", async () => {
    const valid = await loadPlannerConfig(EXAMPLE_CONFIG_PATH);
    expect(valid.projectionAccounts?.["projection:future-taxable"]).toEqual({
      label: "Future taxable investment account",
      type: "non_registered",
      annualReturn: 0.05,
      withdrawalPriority: 4,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
      contributionPhases: [],
    });

    const badPrefix = structuredClone(valid) as unknown as Record<
      string,
      unknown
    >;
    const accounts = badPrefix.projectionAccounts as Record<string, unknown>;
    accounts["future-taxable"] = accounts["projection:future-taxable"];
    delete accounts["projection:future-taxable"];
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
          "projection:future-taxable"
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
      >)["projection:future-taxable"]!
    ).openingBalance = 1;
    expect(() => validatePlannerConfig(openingBalance)).toThrow(
      "openingBalance is not configurable",
    );
  });

  it("rejects projection-only debt, duplicate ids, and unresolved live-baseline contributions", async () => {
    const debt = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    debt.projectionAccounts!["projection:future-taxable"]!.type =
      "debt" as never;
    expect(() => validatePlannerConfig(debt)).toThrow(
      "debt and exclude are not supported",
    );

    const collision = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    collision.accountMappings["projection:future-taxable"] = {
      include: false,
      type: "exclude",
    };
    expect(() => validatePlannerConfig(collision)).toThrow(
      "cannot appear in both",
    );

    const live = structuredClone(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
    live.projectionAccounts!["projection:future-taxable"]!
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
});
