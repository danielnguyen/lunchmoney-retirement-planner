import { describe, expect, it } from "vitest";
import {
  annualPeriodLabel,
  buildAnnualChartData,
  buildAnnualLedgerData,
  buildSavingsPolicyPreview,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { projectionFixture } from "./fixtures/projection";

describe("projection presentation metadata", () => {
  it("sums all included non-debt opening balances as starting financial assets", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.accounts.push(
      {
        ...inputs.accounts[1]!,
        id: "tfsa",
        type: "tfsa",
        openingBalance: 30000,
      },
      {
        ...inputs.accounts[1]!,
        id: "non-registered",
        type: "non_registered",
        openingBalance: 40000,
      },
    );

    expect(startingFinancialAssets(inputs.accounts)).toBe(270000);
  });

  it("keeps liabilities outside the starting-financial-assets input", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.liabilities.push({
      id: "liability:one",
      label: "Synthetic liability",
      origin: "lunchmoney",
      openingBalance: 75000,
      balanceAsOf: inputs.startDate,
      role: null,
      treatment: { mode: "payoff_at_projection_start" },
      historicalPaymentHandling: "already_excluded_or_transfer",
      historicalMonthlyAverage: 0,
    });

    expect(startingFinancialAssets(inputs.accounts)).toBe(200000);
  });

  it("labels a July-start first row with its partial calendar period", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-07-14";

    expect(annualPeriodLabel(inputs, 2026)).toBe("2026 (Jul–Dec)");
  });

  it("leaves a full January-start calendar year compact", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-01-14";

    expect(annualPeriodLabel(inputs, 2026)).toBe("2026");
  });

  it("labels the calculated partial final year", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-07-14";
    inputs.person.currentAge = 40;
    inputs.person.retirementAge = 42;
    inputs.endAge = 42;

    expect(annualPeriodLabel(inputs, 2028)).toBe("2028 (Jan–Jun)");
  });

  it("copies every annual projection age directly into chart rows, including partial and retirement years", () => {
    const projection = calculateProjection(projectionFixture);
    const chart = buildAnnualChartData(
      projectionFixture,
      projection,
      "real",
    );

    expect(chart.map((row) => row.age)).toEqual(
      projection.annual.map((point) => point.age),
    );
    expect(chart[0]!.age).toBe(projection.annual[0]!.age);
    expect(chart[0]!.age).toBe(40.5);

    const retirementYear = Number(
      projection.retirementSnapshot.calendarDate.slice(0, 4),
    );
    const retirementRow = chart.find((row) => row.year === retirementYear);
    const retirementPoint = projection.annual.find(
      (point) => point.calendarYear === retirementYear,
    );
    expect(retirementRow?.age).toBe(retirementPoint?.age);
    expect(retirementRow?.age).toBe(65.5);
  });

  it("carries surplus flows, reserve target, and per-account allocations through shared presentation data", () => {
    const projection = calculateProjection(projectionFixture);
    const chart = buildAnnualChartData(
      projectionFixture,
      projection,
      "real",
    );
    const ledger = buildAnnualLedgerData(
      projectionFixture,
      projection,
      "real",
    );

    expect(chart[0]).toMatchObject({
      allowedContributions:
        projection.annual[0]!.real.contributions.allowed,
      surplusFundedContributions:
        projection.annual[0]!.real.contributions.surplusFunded,
      actualContributions:
        projection.annual[0]!.real.contributions.total,
      surplusGenerated: projection.annual[0]!.real.surplusAllocation
        .generated,
      surplusReserveRefill: projection.annual[0]!.real.surplusAllocation
        .reserveRefill,
      surplusRetainedAsCash: projection.annual[0]!.real.surplusAllocation
        .retainedAsCash,
      surplusRedirected: projection.annual[0]!.real.surplusAllocation
        .redirected,
      surplusReserveTarget: projection.annual[0]!.real.surplusAllocation
        .reserveTarget,
    });
    expect(chart[0]).toHaveProperty("surplusAllocation:manual:1");
    expect(ledger[0]).toMatchObject({
      actualContributions: chart[0]!.actualContributions,
      surplusFundedContributions:
        chart[0]!.surplusFundedContributions,
      surplusGenerated: chart[0]!.surplusGenerated,
      surplusReserveRefill: chart[0]!.surplusReserveRefill,
      surplusRetainedAsCash: chart[0]!.surplusRetainedAsCash,
      surplusRedirected: chart[0]!.surplusRedirected,
      surplusReserveTarget: chart[0]!.surplusReserveTarget,
    });
  });

  it("builds the owner-facing simple policy preview from resolved account references", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.accounts = [
      { ...inputs.accounts[0]!, id: "cash:operating", label: "Operating" },
      { ...inputs.accounts[0]!, id: "cash:reserve", label: "Reserve refill" },
      {
        ...inputs.accounts[1]!,
        id: "tfsa:personal",
        label: "Personal TFSA",
        type: "tfsa",
      },
      {
        ...inputs.accounts[1]!,
        id: "rrsp:personal",
        label: "Personal RRSP",
      },
      {
        ...inputs.accounts[1]!,
        id: "rrsp:workplace",
        label: "Workplace RRSP",
      },
      {
        ...inputs.accounts[1]!,
        id: "projection:taxable",
        label: "Future taxable",
        origin: "projection_configuration",
        type: "non_registered",
      },
    ];
    inputs.surplusAllocation.reserveAccountIds = [
      "cash:operating",
      "cash:reserve",
    ];
    inputs.surplusAllocation.reserveRefillAccountId = "cash:reserve";
    inputs.savingsPolicy = {
      mode: "simple",
      operatingCashAccountId: "cash:operating",
      reserveAccountIds: ["cash:operating", "cash:reserve"],
      reserveRefillAccountId: "cash:reserve",
      personalTfsaAccountId: "tfsa:personal",
      personalRrspAccountId: "rrsp:personal",
      workplaceRrspAccountId: "rrsp:workplace",
      taxableAccountId: "projection:taxable",
      taxableAccountOrigin: "projection_configuration",
      reserveBuildingPhases: [],
      operatingCashTarget: null,
      unplannedCash: "retain_in_operating_cash",
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
      workplaceRoomPriority: "first",
      workplaceOverflow: "unallocated",
      reserveAfterTarget: "personal_investing",
    };

    expect(buildSavingsPolicyPreview(inputs)).toEqual({
      mode: "simple",
      reserveAccounts: ["Operating", "Reserve refill"],
      reserveRefillAccount: "Reserve refill",
      operatingCashAccount: "Operating",
      operatingTargetToday: null,
      operatingIndexingRate: null,
      operatingCashIsReserveMember: true,
      workplacePriority:
        "Workplace RRSP gets first claim on global RRSP room",
      workplaceOverflow: "Workplace RRSP overflow is unallocated",
      personalOrder: "Personal TFSA → personal RRSP → taxable",
      taxableDestination: "Future taxable",
      taxableDestinationKind: "projection-only",
      reserveTransition:
        "Reserve-building savings redirect through the personal order after the indexed target",
      unplannedCash:
        "Unplanned positive cash is retained in operating cash and is not swept into investments",
    });

    if (inputs.savingsPolicy.mode !== "simple") throw new Error("fixture");
    inputs.savingsPolicy.operatingCashTarget = {
      targetToday: 8000,
      indexingRate: 0.02,
    };
    inputs.savingsPolicy.unplannedCash = "sweep_above_targets";
    expect(buildSavingsPolicyPreview(inputs)).toMatchObject({
      operatingTargetToday: 8000,
      operatingIndexingRate: 0.02,
      operatingCashIsReserveMember: true,
      unplannedCash: expect.stringContaining("personal investment order"),
    });
  });
});
