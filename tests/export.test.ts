import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { demoInputs } from "@/src/demo/baseline";

describe("createProjectionSnapshot", () => {
  it("creates a versioned portable snapshot without credentials", () => {
    const generatedAt = "2026-07-14T00:00:00.000Z";
    const snapshot = createProjectionSnapshot(calculateProjection(demoInputs), {}, generatedAt);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("1.0");
    expect(snapshot.generatedAt).toBe(generatedAt);
    expect(serialized).not.toContain("LUNCHMONEY_API_TOKEN");
    expect(serialized).not.toContain("PLANNER_API_READ_TOKEN");
  });
});
