import { describe, expect, it } from "vitest";
import { demoInputs, demoSources } from "@/src/demo/baseline";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot, projectionToCsv } from "@/src/domain/projection/export";

describe("portable projection exports", () => {
  it("exports assumptions, annual details, and provenance without credentials", () => {
    const projection = calculateProjection(demoInputs);
    const snapshot = createProjectionSnapshot(
      projection,
      demoSources,
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("2.0");
    expect(snapshot.projection.annual[0]?.nominal.income).toBeDefined();
    expect(snapshot.projection.annual[0]?.nominal.balances).toBeDefined();
    expect(serialized).not.toContain("LUNCHMONEY_API_TOKEN");
    expect(serialized).not.toContain("PLANNER_API_READ_TOKEN");
  });

  it("exports an inspectable annual CSV ledger", () => {
    const csv = projectionToCsv(calculateProjection(demoInputs), "real");

    expect(csv).toContain("calendarYear,primaryAge,phase");
    expect(csv).toContain("cppIncome");
    expect(csv).toContain("rrspRrifBalance");
    expect(csv.split("\n").length).toBeGreaterThan(40);
  });
});
