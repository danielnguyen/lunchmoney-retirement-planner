import type { BaselineValue } from "@/src/domain/defaults/types";
import type { ProjectionInputs, ProjectionResult } from "./types";

export type ProjectionSnapshot = {
  schemaVersion: "1.0";
  generatedAt: string;
  inputs: ProjectionInputs;
  inputSources: Partial<Record<keyof ProjectionInputs, BaselineValue<number>>>;
  projection: ProjectionResult;
};

export function createProjectionSnapshot(
  projection: ProjectionResult,
  inputSources: Partial<Record<keyof ProjectionInputs, BaselineValue<number>>> = {},
  generatedAt = new Date().toISOString(),
): ProjectionSnapshot {
  return {
    schemaVersion: "1.0",
    generatedAt,
    inputs: projection.inputs,
    inputSources,
    projection,
  };
}
