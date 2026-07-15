import { describe, expect, it } from "vitest";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
  projectionToCsv,
} from "@/src/domain/projection/export";
import { baselineContextFixture, projectionFixture } from "./fixtures/projection";

describe("live projection exports", () => {
  it("exports the live baseline, provenance, warnings, overrides, and projection without credentials", () => {
    const projection = calculateProjection(projectionFixture);
    const snapshot = createProjectionSnapshot(
      projection,
      baselineContextFixture,
      { retirementAge: 64 },
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);
    expect(snapshot.schemaVersion).toBe("3.0");
    expect(snapshot.dataThrough).toBe("2026-07-14");
    expect(snapshot.resolvedBaseline).toEqual(projectionFixture);
    expect(snapshot.provenance.monthlyEssentialSpendingToday).toBeDefined();
    expect(snapshot.warnings).toHaveLength(1);
    expect(snapshot.activeOverrides.retirementAge).toBe(64);
    expect(snapshot.calculationBasis.employmentIncome).toBe(
      "net_deposited_cash_no_additional_tax",
    );
    expect(serialized).not.toContain("LUNCHMONEY_API_TOKEN");
    expect(serialized).not.toContain("authorization");
  });

  it("exports an inspectable account-level annual CSV ledger", () => {
    const csv = projectionToCsv(calculateProjection(projectionFixture), "real");
    expect(csv).toContain("calendarYear,age,phase");
    expect(csv).toContain("cppIncome");
    expect(csv).toContain("employmentNetCash");
    expect(csv).toContain("cashFundedContributions");
    expect(csv).toContain("account:manual:1");
    expect(csv.split("\n").length).toBeGreaterThan(40);
  });

  it("includes baseline metadata, provenance, warnings, and overrides in CSV", () => {
    const snapshot = createProjectionSnapshot(
      calculateProjection(projectionFixture),
      baselineContextFixture,
      { annualInflation: 0.03 },
      "2026-07-14T00:00:00.000Z",
    );
    const csv = projectionSnapshotToCsv(snapshot);
    expect(csv).toContain("metadata,dataThrough,2026-07-14");
    expect(csv).toContain("metadata,calculationBasis");
    expect(csv).toContain("resolvedBaseline,projectionInputs");
    expect(csv).toContain("provenance,monthlyEssentialSpendingToday");
    expect(csv).toContain("warning,0");
    expect(csv).toContain("override,annualInflation,0.03");
  });
});
