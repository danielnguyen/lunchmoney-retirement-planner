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
    expect(config.transactionTrailingMonths).toBe(12);
    expect(config.accountMappings).toHaveProperty("manual:replace-with-cash-account-id");
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

    expect(config.currentAge).toBe(40);
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
    delete config.accountMappings["plaid:replace-with-investment-account-id"]
      .contributionFunding;

    expect(() => validatePlannerConfig(config)).toThrow(
      "contributionFunding must be cash or income_withheld",
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
