import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
  parseAndValidatePlannerConfig,
  plannerConfigPath,
} from "@/src/config/loader";
import { PlannerRuntimeError } from "@/src/runtime/errors";

export type ConfigFileOperations = {
  readUtf8: (path: string) => Promise<string>;
  writeExclusive: (path: string, contents: string, mode: number) => Promise<void>;
  rename: (from: string, to: string) => Promise<void>;
  statMode: (path: string) => Promise<number>;
  unlinkIfPresent: (path: string) => Promise<void>;
};

export const nodeConfigFileOperations: ConfigFileOperations = {
  readUtf8: (path) => readFile(path, "utf8"),
  writeExclusive: async (path, contents, mode) => {
    await writeFile(path, contents, {
      encoding: "utf8",
      flag: "wx",
      mode,
    });
  },
  rename,
  statMode: async (path) => (await stat(path)).mode & 0o777,
  unlinkIfPresent: async (path) => {
    await unlink(path).catch(() => undefined);
  },
};

export type ConfigSaveOptions = {
  fileOperations?: ConfigFileOperations;
  beforeFinalVersionCheck?: () => Promise<void>;
};

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

async function readActiveContents(
  path: string,
  fileOperations = nodeConfigFileOperations,
): Promise<string> {
  try {
    return await fileOperations.readUtf8(path);
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

async function prepareAtomicWrite(
  path: string,
  contents: string,
  mode: number,
  fileOperations: ConfigFileOperations,
): Promise<string> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await fileOperations.writeExclusive(temporaryPath, contents, mode);
    return temporaryPath;
  } catch (error) {
    await fileOperations.unlinkIfPresent(temporaryPath);
    throw error;
  }
}

export async function saveCurrentPlannerConfig(
  contents: string,
  expectedVersion: string,
  options: ConfigSaveOptions = {},
): Promise<{ version: string }> {
  if (!plannerConfigWriteEnabled()) {
    throw new PlannerRuntimeError(
      "planner_config_write_disabled",
      "Saving planner configuration is disabled. Set PLANNER_CONFIG_WRITE_ENABLED=true and restart the application to enable it.",
      403,
    );
  }

  validateCurrentPlannerConfig(contents);
  const fileOperations = options.fileOperations ?? nodeConfigFileOperations;
  const path = activeYamlPath();
  const existingContents = await readActiveContents(path, fileOperations);
  if (plannerConfigVersion(existingContents) !== expectedVersion) {
    throw new PlannerRuntimeError(
      "planner_config_conflict",
      "The planner configuration changed on disk. Revert changes to load the latest contents before saving again.",
      409,
    );
  }

  const backupPath = `${path}.bak`;
  const existingMode = await fileOperations.statMode(path);
  let preparedConfigPath: string | undefined;
  let preparedBackupPath: string | undefined;

  try {
    try {
      preparedConfigPath = await prepareAtomicWrite(
        path,
        contents,
        existingMode,
        fileOperations,
      );
    } catch {
      throw new PlannerRuntimeError(
        "planner_config_save_failed",
        "The planner configuration could not be prepared for saving. The active file and backup were not changed.",
        500,
      );
    }
    try {
      preparedBackupPath = await prepareAtomicWrite(
        backupPath,
        existingContents,
        existingMode,
        fileOperations,
      );
    } catch {
      throw new PlannerRuntimeError(
        "planner_config_backup_failed",
        "The planner configuration backup could not be prepared. The active file and backup were not changed.",
        500,
      );
    }

    await options.beforeFinalVersionCheck?.();
    const latestContents = await readActiveContents(path, fileOperations);
    if (plannerConfigVersion(latestContents) !== expectedVersion) {
      throw new PlannerRuntimeError(
        "planner_config_conflict",
        "The planner configuration changed on disk. Revert changes to load the latest contents before saving again.",
        409,
      );
    }

    try {
      await fileOperations.rename(preparedBackupPath, backupPath);
      preparedBackupPath = undefined;
    } catch {
      throw new PlannerRuntimeError(
        "planner_config_backup_failed",
        "The planner configuration backup could not be replaced. The active file was not changed.",
        500,
      );
    }

    try {
      await fileOperations.rename(preparedConfigPath, path);
      preparedConfigPath = undefined;
    } catch {
      throw new PlannerRuntimeError(
        "planner_config_save_failed",
        "The backup contains the previous configuration, but the active file replacement failed. Restore from the backup if recovery is needed.",
        500,
      );
    }
    return { version: plannerConfigVersion(contents) };
  } finally {
    if (preparedConfigPath) {
      await fileOperations.unlinkIfPresent(preparedConfigPath);
    }
    if (preparedBackupPath) {
      await fileOperations.unlinkIfPresent(preparedBackupPath);
    }
  }
}
