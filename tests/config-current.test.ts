import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST, PUT } from "@/app/api/v1/config/current/route";
import {
  plannerConfigVersion,
  readCurrentPlannerConfig,
  saveCurrentPlannerConfig,
  validateCurrentPlannerConfig,
} from "@/src/config/current";
import { loadPlannerConfig } from "@/src/config/loader";

const EXAMPLE_CONFIG_PATH = "config/planner.example.yaml";

describe.sequential("current planner config API", () => {
  let temporaryDirectory: string;
  let configPath: string;
  let originalConfigPath: string | undefined;
  let originalWriteEnabled: string | undefined;
  let validYaml: string;

  beforeEach(async () => {
    originalConfigPath = process.env.PLANNER_CONFIG_PATH;
    originalWriteEnabled = process.env.PLANNER_CONFIG_WRITE_ENABLED;
    temporaryDirectory = await mkdtemp(join(tmpdir(), "planner-current-config-"));
    configPath = join(temporaryDirectory, "planner.local.yaml");
    validYaml = await readFile(EXAMPLE_CONFIG_PATH, "utf8");
    await writeFile(configPath, validYaml, "utf8");
    process.env.PLANNER_CONFIG_PATH = configPath;
    delete process.env.PLANNER_CONFIG_WRITE_ENABLED;
  });

  afterEach(async () => {
    if (originalConfigPath === undefined) delete process.env.PLANNER_CONFIG_PATH;
    else process.env.PLANNER_CONFIG_PATH = originalConfigPath;
    if (originalWriteEnabled === undefined) {
      delete process.env.PLANNER_CONFIG_WRITE_ENABLED;
    } else {
      process.env.PLANNER_CONFIG_WRITE_ENABLED = originalWriteEnabled;
    }
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it("loads raw YAML with a safe filename, write capability, and content version", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({
      contents: validYaml,
      displayPath: "planner.local.yaml",
      writeEnabled: false,
      version: plannerConfigVersion(validYaml),
    });
    expect(JSON.stringify(body)).not.toContain(temporaryDirectory);
  });

  it("uses normal loading and editor validation through one parser and validator", async () => {
    expect(() => validateCurrentPlannerConfig(validYaml)).not.toThrow();
    expect(await loadPlannerConfig(configPath)).toEqual(
      await loadPlannerConfig(EXAMPLE_CONFIG_PATH),
    );
  });

  it("returns a specific malformed-YAML error without modifying the file", async () => {
    const before = await readFile(configPath, "utf8");
    const response = await POST(
      new Request("http://localhost/api/v1/config/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: "accountMappings: [" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "invalid_planner_config",
      message: expect.stringContaining("not valid YAML"),
    });
    expect(await readFile(configPath, "utf8")).toBe(before);
  });

  it("validates complete YAML through the API without modifying the file", async () => {
    const response = await POST(
      new Request("http://localhost/api/v1/config/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: validYaml }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ valid: true });
    expect(await readFile(configPath, "utf8")).toBe(validYaml);
  });

  it("returns the existing structural validation error without modifying the file", async () => {
    const invalid = validYaml.replace("currentAge: 38", "currentAge: nope");
    const response = await POST(
      new Request("http://localhost/api/v1/config/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: invalid }),
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: "invalid_planner_config",
      message: "currentAge must be a finite number.",
    });
    expect(await readFile(configPath, "utf8")).toBe(validYaml);
  });

  it("rejects saving unless writing is explicitly enabled", async () => {
    const current = await readCurrentPlannerConfig();
    const response = await PUT(
      new Request("http://localhost/api/v1/config/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: `${validYaml}\n# unsaved synthetic comment\n`,
          expectedVersion: current.version,
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(await readFile(configPath, "utf8")).toBe(validYaml);
  });

  it("atomically saves exact valid text, replaces the backup, and returns a new version", async () => {
    process.env.PLANNER_CONFIG_WRITE_ENABLED = "true";
    await writeFile(`${configPath}.bak`, "old backup", "utf8");
    const submitted = `${validYaml}\n# preserved synthetic comment\n`;
    const result = await saveCurrentPlannerConfig(
      submitted,
      plannerConfigVersion(validYaml),
    );

    expect(await readFile(configPath, "utf8")).toBe(submitted);
    expect(await readFile(`${configPath}.bak`, "utf8")).toBe(validYaml);
    expect(result.version).toBe(plannerConfigVersion(submitted));
    await expect(loadPlannerConfig(configPath)).resolves.toBeDefined();
  });

  it("saves valid YAML through PUT when explicitly enabled", async () => {
    process.env.PLANNER_CONFIG_WRITE_ENABLED = "true";
    const submitted = `${validYaml}\n# exact submitted API text\n`;
    const response = await PUT(
      new Request("http://localhost/api/v1/config/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: submitted,
          expectedVersion: plannerConfigVersion(validYaml),
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: plannerConfigVersion(submitted),
    });
    expect(await readFile(configPath, "utf8")).toBe(submitted);
    expect(await readFile(`${configPath}.bak`, "utf8")).toBe(validYaml);
  });

  it.each([
    ["malformed YAML", "accountMappings: [", "not valid YAML"],
    [
      "invalid planner structure",
      () => validYaml.replace("currentAge: 38", "currentAge: nope"),
      "currentAge must be a finite number",
    ],
  ])("does not alter the file for %s", async (_label, candidate, message) => {
    process.env.PLANNER_CONFIG_WRITE_ENABLED = "true";
    const contents = typeof candidate === "function" ? candidate() : candidate;
    await expect(
      saveCurrentPlannerConfig(contents, plannerConfigVersion(validYaml)),
    ).rejects.toThrow(message);
    expect(await readFile(configPath, "utf8")).toBe(validYaml);
    await expect(readFile(`${configPath}.bak`, "utf8")).rejects.toThrow();
  });

  it("returns 409 and preserves unsaved text when the expected version is stale", async () => {
    process.env.PLANNER_CONFIG_WRITE_ENABLED = "true";
    const external = `${validYaml}\n# external synthetic edit\n`;
    await writeFile(configPath, external, "utf8");
    const response = await PUT(
      new Request("http://localhost/api/v1/config/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: `${validYaml}\n# editor synthetic edit\n`,
          expectedVersion: plannerConfigVersion(validYaml),
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "planner_config_conflict" });
    expect(await readFile(configPath, "utf8")).toBe(external);
  });

  it("rejects arbitrary target-path fields and never modifies either file", async () => {
    process.env.PLANNER_CONFIG_WRITE_ENABLED = "true";
    const otherPath = join(temporaryDirectory, "other.yaml");
    await writeFile(otherPath, "untouched", "utf8");
    const response = await PUT(
      new Request("http://localhost/api/v1/config/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: validYaml,
          expectedVersion: plannerConfigVersion(validYaml),
          path: otherPath,
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await readFile(configPath, "utf8")).toBe(validYaml);
    expect(await readFile(otherPath, "utf8")).toBe("untouched");
  });
});
