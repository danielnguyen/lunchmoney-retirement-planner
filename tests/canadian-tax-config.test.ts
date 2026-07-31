import { describe, expect, it } from "vitest";
import {
  loadPlannerConfig,
  validatePlannerConfig,
} from "@/src/config/loader";
import {
  buildControls,
  materializeInputs,
} from "@/src/domain/scenario/controls";
import { projectionFixture } from "@/tests/fixtures/projection";

const EXAMPLE = "config/planner.example.yaml";

describe("Canadian annual tax configuration", () => {
  it("normalizes an omitted tax block to visible flat compatibility", async () => {
    const config = await loadPlannerConfig(EXAMPLE);
    const omitted = structuredClone(config) as unknown as Record<string, unknown>;
    delete omitted.tax;

    expect(validatePlannerConfig(omitted).tax).toEqual({
      mode: "flat_compatibility",
      source: "compatibility_default",
    });
  });

  it("accepts explicit Ontario annual tax inputs and rejects unsupported provinces", async () => {
    const config = await loadPlannerConfig(EXAMPLE);
    const raw = structuredClone(config) as unknown as Record<string, unknown>;
    raw.tax = {
      mode: "canadian_annual",
      province: "ON",
      referenceYear: 2026,
      futureIndexingRate: 0.021,
      pensionIncomeCreditEligible: true,
      openingTaxYearBeforeProjectionMonth: {
        calendarYear: 2026,
        throughMonth: 6,
        income: {
          employment: 50_000,
          cpp: 0,
          oas: 0,
          pension: 0,
          rrspWithdrawals: 0,
          rrifWithdrawals: 0,
          otherTaxableIncome: 0,
        },
      },
    };

    expect(validatePlannerConfig(raw).tax).toMatchObject({
      mode: "canadian_annual",
      province: "ON",
      referenceYear: 2026,
      source: "explicit_configuration",
    });
    (raw.tax as Record<string, unknown>).province = "BC";
    expect(() => validatePlannerConfig(raw)).toThrow(/Ontario.*only/i);
  });

  it("requires taxable employment income for every Canadian-mode phase", async () => {
    const config = await loadPlannerConfig(EXAMPLE);
    const raw = structuredClone(config) as unknown as Record<string, unknown>;
    raw.tax = {
      mode: "canadian_annual",
      province: "ON",
      referenceYear: 2026,
      futureIndexingRate: 0.02,
      pensionIncomeCreditEligible: false,
    };
    const phases = raw.employmentIncomePhases as Array<Record<string, unknown>>;
    delete phases[0]!.annualTaxableEmploymentIncomeToday;

    expect(() => validatePlannerConfig(raw)).toThrow(
      /requires annualTaxableEmploymentIncomeToday/i,
    );
  });

  it("exposes guided taxable-employment and tax-indexing overrides without mutating the baseline", () => {
    const baseline = structuredClone(projectionFixture);
    baseline.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
      province: "ON",
      referenceYear: 2026,
      futureIndexingRate: 0.02,
      openingTaxYearBeforeProjectionMonth: {
        calendarYear: 2026,
        throughMonth: 6,
        income: {
          employment: 0,
          cpp: 0,
          oas: 0,
          pension: 0,
          rrspWithdrawals: 0,
          rrifWithdrawals: 0,
          otherTaxableIncome: 0,
        },
        source: "explicit_configuration",
      },
      limitations: [
        "rrif_minimum_withdrawals_not_modelled",
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    baseline.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      100_000;
    const controls = buildControls(baseline);
    expect(controls.map((control) => control.key)).toEqual(
      expect.arrayContaining([
        "tax.futureIndexingRate",
        "employmentPhase.current-income.annualTaxableEmploymentIncomeToday",
      ]),
    );

    const active = materializeInputs(baseline, controls, {
      "tax.futureIndexingRate": 0.025,
      "employmentPhase.current-income.annualTaxableEmploymentIncomeToday":
        123_456.78,
    });
    expect(active.tax.mode).toBe("canadian_annual");
    if (active.tax.mode !== "canadian_annual") throw new Error("expected Canadian tax");
    expect(active.tax.futureIndexingRate).toBe(0.025);
    expect(
      active.person.employmentIncomePhases[0]!
        .annualTaxableEmploymentIncomeToday,
    ).toBe(123_456.78);
    expect(
      baseline.person.employmentIncomePhases[0]!
        .annualTaxableEmploymentIncomeToday,
    ).toBe(100_000);
  });

  it("classifies tax controls against the current YAML draft structure", async () => {
    const baseline = structuredClone(projectionFixture);
    baseline.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
      province: "ON",
      referenceYear: 2026,
      futureIndexingRate: 0.02,
      openingTaxYearBeforeProjectionMonth: {
        calendarYear: 2026,
        throughMonth: 6,
        income: {
          employment: 0,
          cpp: 0,
          oas: 0,
          pension: 0,
          rrspWithdrawals: 0,
          rrifWithdrawals: 0,
          otherTaxableIncome: 0,
        },
        source: "explicit_configuration",
      },
      limitations: [
        "rrif_minimum_withdrawals_not_modelled",
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    baseline.person.employmentIncomePhases[0]!.annualTaxableEmploymentIncomeToday =
      100_000;
    const controls = buildControls(baseline);
    const taxable = controls.find((control) =>
      control.key.endsWith("annualTaxableEmploymentIncomeToday"),
    )!;
    const indexing = controls.find(
      (control) => control.key === "tax.futureIndexingRate",
    )!;
    const draft = await loadPlannerConfig(EXAMPLE);
    expect(taxable.persistence(draft).kind).toBe("config");
    const missing = structuredClone(draft);
    delete missing.employmentIncomePhases![0]!
      .annualTaxableEmploymentIncomeToday;
    expect(taxable.persistence(missing)).toMatchObject({
      kind: "scenario_only",
      reason: expect.stringMatching(/no configured scalar destination/i),
    });
    expect(indexing.persistence(draft)).toMatchObject({
      kind: "scenario_only",
      reason: expect.stringMatching(/does not use Canadian annual tax mode/i),
    });
  });
});
