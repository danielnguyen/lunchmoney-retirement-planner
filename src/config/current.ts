import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
  parseAndValidatePlannerConfig,
  plannerConfigPath,
} from "@/src/config/loader";
import { PlannerRuntimeError } from "@/src/runtime/errors";

export type CurrentPlannerConfig = {
  contents: string;
  displayPath: string;
  writeEnabled: boolean;
  version: string;
};

export function plannerConfigWriteEnabled(): boolean {
  return process.env.PLANNER_CONFIG_WRITE_ENABLED === "true";
}

export function plannerConfigVersion(contents: string): string {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function activeYamlPath(): string {
  const path = plannerConfigPath();
  const extension = extname(path).toLowerCase();
  if (extension !== ".yaml" && extension !== ".yml") {
    throw new PlannerRuntimeError(
      "planner_config_editor_unavailable",
      "The planner config editor is available only when the active configuration is YAML.",
      422,
    );
  }
  return path;
}

async function readActiveContents(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new PlannerRuntimeError(
      "planner_config_missing",
      "The active planner configuration file could not be read.",
      422,
    );
  }
}

export async function readCurrentPlannerConfig(): Promise<CurrentPlannerConfig> {
  const path = activeYamlPath();
  const contents = await readActiveContents(path);
  return {
    contents,
    displayPath: basename(path),
    writeEnabled: plannerConfigWriteEnabled(),
    version: plannerConfigVersion(contents),
  };
}

export function validateCurrentPlannerConfig(contents: string): void {
  parseAndValidatePlannerConfig(contents, "YAML", "provided to the editor");
}

async function atomicWrite(path: string, contents: string, mode: number): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode,
    });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

export async function saveCurrentPlannerConfig(
  contents: string,
  expectedVersion: string,
): Promise<{ version: string }> {
  if (!plannerConfigWriteEnabled()) {
    throw new PlannerRuntimeError(
      "planner_config_write_disabled",
      "Saving planner configuration is disabled. Set PLANNER_CONFIG_WRITE_ENABLED=true and restart the application to enable it.",
      403,
    );
  }

  validateCurrentPlannerConfig(contents);
  const path = activeYamlPath();
  const existingContents = await readActiveContents(path);
  if (plannerConfigVersion(existingContents) !== expectedVersion) {
    throw new PlannerRuntimeError(
      "planner_config_conflict",
      "The planner configuration changed on disk. Revert changes to load the latest contents before saving again.",
      409,
    );
  }

  const existingStat = await stat(path);
  const backupPath = `${path}.bak`;
  const existingMode = existingStat.mode & 0o777;
  await atomicWrite(backupPath, existingContents, existingMode);

  // Re-read immediately before the replace so an edit during validation or
  // backup creation is not silently overwritten.
  const latestContents = await readActiveContents(path);
  if (plannerConfigVersion(latestContents) !== expectedVersion) {
    throw new PlannerRuntimeError(
      "planner_config_conflict",
      "The planner configuration changed on disk. Revert changes to load the latest contents before saving again.",
      409,
    );
  }

  await atomicWrite(path, contents, existingMode);
  return { version: plannerConfigVersion(contents) };
}
