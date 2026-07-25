import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseAndValidatePlannerConfig } from "@/src/config/loader";
import {
  buildControls,
  humanScenarioSourceLabel,
} from "@/src/domain/scenario/controls";
import { projectionFixture } from "./fixtures/projection";

describe("scenario control persistence inventory", () => {
  it("requires every constructed control to resolve an explicit classification", async () => {
    const contents = await readFile("config/planner.example.yaml", "utf8");
    const config = parseAndValidatePlannerConfig(contents, "YAML");
    const controls = buildControls(structuredClone(projectionFixture));

    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control).toHaveProperty("persistence");
      expect(typeof control.persistence).toBe("function");
      const classification = control.persistence(config);
      expect([
        "config",
        "live_baseline_conversion",
        "scenario_only",
      ]).toContain(classification.kind);
      if (classification.kind === "scenario_only") {
        expect(classification.reason.trim().length).toBeGreaterThan(0);
      } else {
        expect(classification.targets.length).toBeGreaterThan(0);
      }
    }
  });

  it("resolves simple and advanced reserve bindings without positional inference", async () => {
    const contents = await readFile("config/planner.example.yaml", "utf8");
    const simpleConfig = parseAndValidatePlannerConfig(contents, "YAML");
    const simpleInputs = structuredClone(projectionFixture);
    simpleInputs.savingsPolicy = {
      mode: "simple",
      operatingCashAccountId: "manual:1",
      reserveAccountIds: ["manual:1"],
      reserveRefillAccountId: "manual:1",
      personalTfsaAccountId: "manual:2",
      personalRrspAccountId: "manual:2",
      workplaceRrspAccountId: null,
      taxableAccountId: "manual:2",
      taxableAccountOrigin: "lunchmoney",
      reserveBuildingPhases: [],
      operatingCashTarget: { targetToday: 10000, indexingRate: 0.02 },
      unplannedCash: "retain_in_operating_cash",
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
      workplaceRoomPriority: "first",
      workplaceOverflow: "unallocated",
      reserveAfterTarget: "personal_investing",
    };
    const simpleControl = buildControls(simpleInputs).find(
      (control) => control.key === "savingsPolicy.reserveBuilding.targetToday",
    )!;
    expect(simpleControl.persistence(simpleConfig)).toEqual({
      kind: "config",
      targets: [{
        segments: ["savingsPolicy", "reserveBuilding", "targetToday"],
      }],
    });

    const advancedControl = buildControls(projectionFixture).find(
      (control) => control.key === "surplusAllocation.targetCashReserveToday",
    )!;
    expect(advancedControl.persistence({
      ...simpleConfig,
      configurationMode: "advanced",
    })).toEqual({
      kind: "config",
      targets: [{
        segments: ["surplusAllocation", "targetCashReserveToday"],
      }],
    });
  });

  it("uses human-readable provenance labels", () => {
    const control = { sourceKey: "person.employmentIncomePhases.current.annualNetCashToday" };
    expect(humanScenarioSourceLabel({
      value: 100000,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Live annualized net income",
      effectiveDate: "2026-07-01",
    }, control)).toBe("Source: Live Lunch Money baseline (live_baseline)");
    expect(humanScenarioSourceLabel({
      value: 0.05,
      sourceType: "local_configuration",
      sourceDescription: "Configured return",
      effectiveDate: "2026-07-01",
    }, { sourceKey: "accounts.synthetic.annualReturn" })).toBe(
      "Source: planner.local.yaml",
    );
    expect(humanScenarioSourceLabel({
      value: 0.1,
      sourceType: "canadian_reference",
      sourceDescription: "Published value",
      effectiveDate: "2026-07-01",
    }, { sourceKey: "person.cpp.rule" })).toBe(
      "Source: Canadian reference",
    );
    expect(humanScenarioSourceLabel({
      value: 600000,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Imported balance",
      effectiveDate: "2026-07-01",
    }, { sourceKey: "nonFinancialAssets.home.openingValue" })).toBe(
      "Source: Live Lunch Money account value",
    );
  });
});
