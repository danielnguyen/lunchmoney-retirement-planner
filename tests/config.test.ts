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
    expect(config.transactionTrailingMonths).toBe(12);
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
});
