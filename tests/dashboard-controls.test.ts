import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildControls,
  materializeInputs,
} from "@/components/planner-dashboard";
import { projectionFixture } from "./fixtures/projection";

function simpleControlFixture() {
  const inputs = structuredClone(projectionFixture);
  inputs.accounts[1] = {
    ...inputs.accounts[1]!,
    id: "plaid:personal-tfsa",
    label: "Personal TFSA",
    type: "tfsa",
    contributionPhases: [
      {
        id: "personal-plan",
        label: "Personal plan",
        startAge: 40,
        endAge: 65,
        monthlyAmountToday: 1000,
        funding: "cash",
        indexingRate: 0,
      },
    ],
  };
  inputs.accounts.push({
    ...structuredClone(inputs.accounts[1]!),
    id: "plaid:personal-rrsp",
    label: "Personal RRSP",
    type: "rrsp_rrif",
    contributionPhases: [],
    withdrawalPriority: 3,
  });
  inputs.accounts.push({
    ...structuredClone(inputs.accounts[1]!),
    id: "plaid:workplace-rrsp",
    label: "Workplace RRSP",
    type: "rrsp_rrif",
    contributionPhases: [
      {
        id: "workplace-plan",
        label: "Workplace plan",
        startAge: 40,
        endAge: 65,
        monthlyAmountToday: 1800,
        funding: "income_withheld",
        indexingRate: 0,
      },
    ],
    withdrawalPriority: 4,
  });
  inputs.accounts.push({
    ...structuredClone(inputs.accounts[1]!),
    id: "projection:future-taxable",
    label: "Future taxable",
    origin: "projection_configuration",
    type: "non_registered",
    contributionPhases: [],
    withdrawalPriority: 5,
  });
  inputs.savingsPolicy = {
    mode: "simple",
    operatingCashAccountId: "manual:1",
    reserveAccountIds: ["manual:1"],
    reserveRefillAccountId: "manual:1",
    personalTfsaAccountId: "plaid:personal-tfsa",
    personalRrspAccountId: "plaid:personal-rrsp",
    workplaceRrspAccountId: "plaid:workplace-rrsp",
    taxableAccountId: "projection:future-taxable",
    taxableAccountOrigin: "projection_configuration",
    reserveBuildingPhases: [
      {
        id: "reserve-plan",
        label: "Reserve plan",
        startAge: 40,
        endAge: 50,
        monthlyAmountToday: 1500,
        indexingRate: 0.02,
      },
    ],
    operatingCashTarget: { targetToday: 10000, indexingRate: 0.02 },
    unplannedCash: "retain_in_operating_cash",
    personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
    workplaceRoomPriority: "first",
    workplaceOverflow: "unallocated",
    reserveAfterTarget: "personal_investing",
  };
  return inputs;
}

describe("simple savings dashboard controls", () => {
  it("uses owner-facing labels and simple override keys", () => {
    const inputs = simpleControlFixture();
    const controls = buildControls(inputs);

    expect(controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "registeredRoom.tfsa.availableAtStart",
          label: "Starting TFSA room",
        }),
        expect.objectContaining({
          key: "registeredRoom.rrsp.availableAtStart",
          label: "Starting RRSP deduction room",
        }),
        expect.objectContaining({
          key: "savingsPolicy.operatingCash.targetToday",
          label: "Operating cash target today",
        }),
        expect.objectContaining({
          key: "savingsPolicy.operatingCash.indexingRate",
          label: "Operating cash indexing rate",
        }),
        expect.objectContaining({
          key: "savingsPolicy.reserveBuilding.targetToday",
          label: "Target cash reserve today",
        }),
        expect.objectContaining({
          key: "savingsPolicy.reserveBuilding.indexingRate",
          label: "Reserve indexing rate",
        }),
        expect.objectContaining({
          key: "contributionPhase.plaid:personal-tfsa.personal-plan.monthlyAmountToday",
          label: "Personal saving · Personal plan monthly amount",
        }),
        expect.objectContaining({
          key: "contributionPhase.plaid:workplace-rrsp.workplace-plan.monthlyAmountToday",
          label: "Workplace RRSP saving · Workplace plan monthly amount",
        }),
        expect.objectContaining({
          key: "reserveBuildingPhase.reserve-plan.monthlyAmountToday",
          label: "Reserve building · Reserve plan monthly amount",
        }),
      ]),
    );
  });

  it("materializes overrides without mutating the refreshed baseline and reset restores it", () => {
    const baseline = simpleControlFixture();
    const controls = buildControls(baseline);
    const active = materializeInputs(baseline, controls, {
      "registeredRoom.tfsa.availableAtStart": 12345,
      "savingsPolicy.operatingCash.targetToday": 12000,
      "savingsPolicy.operatingCash.indexingRate": 0.03,
      "savingsPolicy.reserveBuilding.targetToday": 55000,
      "reserveBuildingPhase.reserve-plan.monthlyAmountToday": 900,
    });

    expect(
      active.registeredAccountRoom!.tfsa.startingAvailableRoom.amount,
    ).toBe(12345);
    expect(active.surplusAllocation.targetCashReserveToday).toBe(55000);
    expect(
      active.savingsPolicy.mode === "simple" &&
        active.savingsPolicy.operatingCashTarget?.targetToday,
    ).toBe(12000);
    expect(
      active.savingsPolicy.mode === "simple" &&
        active.savingsPolicy.operatingCashTarget?.indexingRate,
    ).toBe(0.03);
    expect(
      active.savingsPolicy.mode === "simple" &&
        active.savingsPolicy.reserveBuildingPhases[0]!.monthlyAmountToday,
    ).toBe(900);
    expect(
      baseline.registeredAccountRoom!.tfsa.startingAvailableRoom.amount,
    ).not.toBe(12345);
    expect(baseline.surplusAllocation.targetCashReserveToday).not.toBe(
      55000,
    );
    expect(materializeInputs(baseline, controls, {})).toEqual(baseline);
  });

  it("clears every override when the live baseline refreshes", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    const refreshBody = dashboard.slice(
      dashboard.indexOf("const refresh = useCallback"),
      dashboard.indexOf("useEffect(() =>", dashboard.indexOf("const refresh = useCallback")),
    );
    expect(refreshBody).toContain("setOverrides({})");
  });

  it("overrides residence value, appreciation, mortgage rate, and entered payment through shared inputs", () => {
    const baseline = simpleControlFixture();
    baseline.nonFinancialAssets = [
      {
        id: "manual:synthetic-residence",
        label: "Synthetic residence",
        origin: "lunchmoney",
        type: "primary_residence",
        openingValue: 500000,
        valueAsOf: "2026-07-14",
        annualAppreciation: 0.02,
        availableForWithdrawals: false,
      },
    ];
    baseline.liabilities = [
      {
        id: "synthetic:mortgage",
        label: "Synthetic mortgage",
        origin: "lunchmoney",
        openingBalance: 100000,
        balanceAsOf: "2026-07-14",
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0.04,
          interestRateConvention: "canadian_mortgage",
          regularPayment: {
            amount: 1200,
            frequency: "biweekly",
            monthlyEquivalent: 2600,
          },
          scheduleStartDate: "2026-07-01",
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "category_mapped",
        historicalMonthlyAverage: 2600,
      },
    ];
    const controls = buildControls(baseline);

    expect(controls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "primaryResidence.currentValue",
          sourceKey:
            "nonFinancialAssets.manual:synthetic-residence.openingValue",
          label: "Primary residence value",
        }),
        expect.objectContaining({
          key: "primaryResidence.annualAppreciation",
          sourceKey:
            "nonFinancialAssets.manual:synthetic-residence.annualAppreciation",
          label: "Residence annual appreciation",
        }),
        expect.objectContaining({
          key: "liability.synthetic:mortgage.annualInterestRate",
        }),
        expect.objectContaining({
          key: "liability.synthetic:mortgage.regularPayment.amount",
        }),
      ]),
    );

    const active = materializeInputs(baseline, controls, {
      "primaryResidence.currentValue": 525000,
      "primaryResidence.annualAppreciation": 0.03,
      "liability.synthetic:mortgage.annualInterestRate": 0.05,
      "liability.synthetic:mortgage.regularPayment.amount": 1300,
    });
    const treatment = active.liabilities[0]!.treatment;
    expect(active.nonFinancialAssets[0]).toMatchObject({
      openingValue: 525000,
      annualAppreciation: 0.03,
    });
    expect(treatment).toMatchObject({
      mode: "amortizing",
      annualInterestRate: 0.05,
      regularPayment: {
        amount: 1300,
        frequency: "biweekly",
        monthlyEquivalent: (1300 * 26) / 12,
      },
    });
    expect(baseline.nonFinancialAssets[0]!.openingValue).toBe(500000);
    expect(
      baseline.liabilities[0]!.treatment.mode === "amortizing" &&
        baseline.liabilities[0]!.treatment.regularPayment.amount,
    ).toBe(1200);
    expect(materializeInputs(baseline, controls, {})).toEqual(baseline);
  });
});
