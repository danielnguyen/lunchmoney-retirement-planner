import { describe, expect, it } from "vitest";
import {
  cloneNonRegisteredSimulationState,
  commitNonRegisteredDisposition,
  createNonRegisteredSimulationState,
  depositNonRegistered,
  nonRegisteredAnnualAggregate,
  previewNonRegisteredDisposition,
  recordNonRegisteredReturn,
} from "@/src/domain/projection/non-registered-taxation";
import type {
  FinancialAccountInput,
  NonRegisteredTaxationAssumptions,
} from "@/src/domain/projection/types";

const account: FinancialAccountInput = {
  id: "synthetic-taxable",
  label: "Synthetic taxable portfolio",
  origin: "projection_configuration",
  type: "non_registered",
  openingBalance: 1_000,
  annualReturn: 0.06,
  contributionPhases: [],
  withdrawalPriority: 1,
  allocation: { cash: 0, fixedIncome: 0.4, equity: 0.6 },
};

const assumptions: NonRegisteredTaxationAssumptions = {
  mode: "simplified_canadian",
  source: "explicit_configuration",
  accounts: [
    {
      accountId: account.id,
      openingAdjustedCostBase: {
        amount: 800,
        effectiveDate: "2026-01-01",
        sourceDescription: "Synthetic opening ACB",
        source: "explicit_configuration",
      },
      annualDistributionYields: {
        interest: 0.01,
        eligibleCanadianDividends: 0.02,
        foreignIncome: 0.01,
        capitalGains: 0,
      },
    },
  ],
  limitations: [],
};

function state() {
  return createNonRegisteredSimulationState({
    assumptions,
    accounts: [account],
  });
}

describe("pooled non-registered adjusted cost base", () => {
  it("adds actual reinvested distributions to ACB and keeps unrealized return separate", () => {
    const current = state();
    recordNonRegisteredReturn({
      state: current,
      accountId: account.id,
      calendarYear: 2026,
      inflationFactor: 1,
      totalReturnAmount: 60,
      distributions: {
        interest: 10,
        eligibleCanadianDividends: 20,
        foreignIncome: 10,
        capitalGains: 0,
      },
    });
    const result = nonRegisteredAnnualAggregate({
      state: current,
      calendarYear: 2026,
      closingInflationFactor: 1,
      periodStatus: "complete_calendar_year",
    });
    expect(result.closingMarketValue).toBe(1_060);
    expect(result.closingAdjustedCostBase).toBe(840);
    expect(result.totalDistributions).toBe(40);
    expect(result.unrealizedChange).toBe(20);
    expect(result.reconciled).toBe(true);
  });

  it("adds external deposits to both market value and ACB", () => {
    const current = state();
    depositNonRegistered({
      state: current,
      accountId: account.id,
      calendarYear: 2026,
      inflationFactor: 1,
      amount: 250,
    });
    const entry = current.accounts.get(account.id)!;
    expect(entry.currentMarketValue).toBe(1_250);
    expect(entry.currentAdjustedCostBase).toBe(1_050);
  });

  it("uses proportional pooled ACB for a partial gain disposition", () => {
    const current = state();
    const preview = previewNonRegisteredDisposition({
      state: current,
      accountId: account.id,
      grossProceeds: 250,
    });
    expect(preview.fractionDisposed).toBe(0.25);
    expect(preview.adjustedCostBaseDisposed).toBe(200);
    expect(preview.realizedCapitalGain).toBe(50);
    expect(preview.realizedCapitalLoss).toBe(0);
    commitNonRegisteredDisposition({
      state: current,
      preview,
      calendarYear: 2026,
      inflationFactor: 1,
    });
    expect(current.accounts.get(account.id)).toMatchObject({
      currentMarketValue: 750,
      currentAdjustedCostBase: 600,
    });
  });

  it("recognizes loss and consumes all ACB on full disposition", () => {
    const current = createNonRegisteredSimulationState({
      assumptions: {
        ...assumptions,
        accounts: [
          {
            ...assumptions.accounts[0]!,
            openingAdjustedCostBase: {
              ...assumptions.accounts[0]!.openingAdjustedCostBase,
              amount: 1_200,
            },
          },
        ],
      },
      accounts: [account],
    });
    const preview = previewNonRegisteredDisposition({
      state: current,
      accountId: account.id,
      grossProceeds: 1_000,
    });
    expect(preview.realizedCapitalLoss).toBe(200);
    commitNonRegisteredDisposition({
      state: current,
      preview,
      calendarYear: 2026,
      inflationFactor: 1,
    });
    expect(current.accounts.get(account.id)).toMatchObject({
      currentMarketValue: 0,
      currentAdjustedCostBase: 0,
    });
  });

  it("clones state without sharing mutable annual records", () => {
    const original = state();
    const clone = cloneNonRegisteredSimulationState(original);
    depositNonRegistered({
      state: clone,
      accountId: account.id,
      calendarYear: 2026,
      inflationFactor: 1,
      amount: 100,
    });
    expect(original.accounts.get(account.id)!.currentAdjustedCostBase).toBe(800);
    expect(clone.accounts.get(account.id)!.currentAdjustedCostBase).toBe(900);
  });

  it("keeps multiple accounts independent without accumulating cent artifacts", () => {
    const secondAccount: FinancialAccountInput = {
      ...account,
      id: "synthetic-taxable-two",
      label: "Synthetic taxable portfolio two",
      openingBalance: 693.75,
      withdrawalPriority: 2,
    };
    const current = createNonRegisteredSimulationState({
      assumptions: {
        ...assumptions,
        accounts: [
          assumptions.accounts[0]!,
          {
            ...assumptions.accounts[0]!,
            accountId: secondAccount.id,
            openingAdjustedCostBase: {
              ...assumptions.accounts[0]!.openingAdjustedCostBase,
              amount: 600,
            },
          },
        ],
      },
      accounts: [account, secondAccount],
    });
    const firstPreview = previewNonRegisteredDisposition({
      state: current,
      accountId: account.id,
      grossProceeds: 250.01,
    });
    const secondPreview = previewNonRegisteredDisposition({
      state: current,
      accountId: secondAccount.id,
      grossProceeds: 36.63,
    });
    commitNonRegisteredDisposition({
      state: current,
      preview: firstPreview,
      calendarYear: 2026,
      inflationFactor: 1,
    });
    commitNonRegisteredDisposition({
      state: current,
      preview: secondPreview,
      calendarYear: 2026,
      inflationFactor: 1,
    });

    expect(firstPreview.adjustedCostBaseDisposed).toBeCloseTo(200.008, 9);
    expect(secondPreview.adjustedCostBaseDisposed).toBeCloseTo(
      31.68,
      9,
    );
    expect(current.accounts.get(account.id)).toMatchObject({
      currentMarketValue: 749.99,
      currentAdjustedCostBase: expect.closeTo(599.992, 9),
    });
    expect(current.accounts.get(secondAccount.id)).toMatchObject({
      currentMarketValue: 657.12,
      currentAdjustedCostBase: expect.closeTo(568.32, 9),
    });
  });

  it("starts a new annual ledger without resetting pooled ACB", () => {
    const current = state();
    depositNonRegistered({
      state: current,
      accountId: account.id,
      calendarYear: 2026,
      inflationFactor: 1,
      amount: 100,
    });
    recordNonRegisteredReturn({
      state: current,
      accountId: account.id,
      calendarYear: 2027,
      inflationFactor: 1.02,
      openingInflationFactor: 1.01,
      totalReturnAmount: 10,
      distributions: {
        interest: 2,
        eligibleCanadianDividends: 0,
        foreignIncome: 0,
        capitalGains: 0,
      },
    });
    const nextYear = nonRegisteredAnnualAggregate({
      state: current,
      calendarYear: 2027,
      closingInflationFactor: 1.02,
      periodStatus: "complete_calendar_year",
    });
    expect(nextYear.openingMarketValue).toBe(1_100);
    expect(nextYear.openingAdjustedCostBase).toBe(900);
    expect(nextYear.openingMarketValueToday).toBe(
      Math.round((1_100 / 1.01) * 100) / 100,
    );
    expect(nextYear.openingAdjustedCostBaseToday).toBe(
      Math.round((900 / 1.01) * 100) / 100,
    );
    expect(nextYear.contributions).toBe(0);
    expect(nextYear.interestDistributions).toBe(2);
    expect(nextYear.closingAdjustedCostBase).toBe(902);
  });
});
