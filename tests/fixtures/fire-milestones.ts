import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import type { FireMilestoneRequest } from "@/src/domain/projection/fire-milestones";
import { careerPreset } from "@/src/domain/scenario/career";
import { ZERO_CANADIAN_TAX_INCOME } from "@/src/domain/projection/canadian-tax";
import { projectionFixture } from "./projection";

export function fireInputs(): ProjectionInputsWithReturnPaths {
  const p = structuredClone(projectionFixture);
  p.startDate = "2026-01-01";
  p.person.retirementAge = 42;
  p.endAge = 44;
  p.person.employmentIncomePhases[0].endAge = 42;
  p.person.employmentIncomePhases[0].annualGrowth = 0;
  p.spendingPhases[0].endAge = 44;
  p.accounts[1].contributionPhases[0].endAge = 42;
  p.accounts[1].contributionPhases[0].monthlyAmountToday = 0;
  p.accounts.forEach(a => { a.annualReturn = 0; });
  p.accounts[0].openingBalance = 20000;
  p.accounts[1].openingBalance = 100000;
  p.accounts[1].type = "tfsa";
  p.annualInflation = 0;
  p.monthlyEssentialSpendingToday = 1000;
  p.monthlyDiscretionarySpendingToday = 0;
  p.events = [];
  p.surplusAllocation.targetCashReserveToday = 0;
  return p;
}
export function fireRequest(p = fireInputs()): FireMilestoneRequest {
  return { retirementAge: 42, stepMonths: 12, fullCppBenefitMultiplier: 1,
    coast: careerPreset(p, "coast").careerTransition!, barista: careerPreset(p, "barista").careerTransition! };
}

// Synthetic acceptance cases from PR #51: ordinary flows must be preserved.
export function constrainedSavingInputs(mode: "room" | "cash" | "reserve") {
  const p = fireInputs();
  p.surplusAllocation.targetCashReserveToday = 10000;
  p.surplusAllocation.reserveIndexingRate = 0;
  p.retirementRequirement.minimumEndingFinancialAssetsToday = 90000;
  p.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 0;
  p.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount = 0;
  p.accounts[1].contributionPhases[0].monthlyAmountToday = mode === "reserve" ? 0 : 1000;
  p.accounts[1].contributionPhases[0].indexingRate = 0;
  if (mode === "reserve") p.accounts[0].openingBalance = 0;
  if (mode === "cash") {
    p.accounts[0].openingBalance = 50000;
    p.accounts[1].contributionPhases[0].monthlyAmountToday = 8000;
    p.accounts.push(
      { ...structuredClone(p.accounts[1]), id: "synthetic:rrsp", type: "rrsp_rrif", openingBalance: 0, contributionPhases: [] },
      { ...structuredClone(p.accounts[1]), id: "synthetic:taxable", type: "non_registered", openingBalance: 0, contributionPhases: [] },
    );
    const destinations = [p.accounts[1].id, "synthetic:rrsp", "synthetic:taxable"];
    p.contributionWaterfall = { mode: "simple_policy", routes: [{ sourceAccountId: p.accounts[1].id, destinationAccountIds: destinations }], surplusDestinationAccountIds: destinations };
    p.savingsPolicy = {
      mode: "simple", operatingCashAccountId: p.accounts[0].id, reserveAccountIds: [p.accounts[0].id],
      reserveRefillAccountId: p.accounts[0].id, personalTfsaAccountId: p.accounts[1].id,
      personalRrspAccountId: "synthetic:rrsp", workplaceRrspAccountId: null,
      taxableAccountId: "synthetic:taxable", taxableAccountOrigin: "lunchmoney",
      reserveBuildingPhases: [], operatingCashTarget: null, unplannedCash: "retain_in_operating_cash",
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"], workplaceRoomPriority: "first",
      workplaceOverflow: "unallocated", reserveAfterTarget: "personal_investing",
    };
  }
  return p;
}

/** Synthetic long-horizon acceptance plan; no private configuration. */
export function annualTaxCareerInputs(): ProjectionInputsWithReturnPaths {
  const p = structuredClone(projectionFixture);
  p.startDate = "2026-01-01";
  p.events = [];
  p.person.employmentIncomePhases[0].annualTaxableEmploymentIncomeToday = 110000;
  p.tax = { ...p.tax, mode: "canadian_annual", source: "explicit_configuration", province: "ON", referenceYear: 2026,
    futureIndexingRate: .02, limitations: ["full_tax_return_deductions_and_refundable_credits_not_modelled"],
    openingTaxYearBeforeProjectionMonth: { source: "explicit_configuration", calendarYear: 2026, throughMonth: 0,
      income: { ...ZERO_CANADIAN_TAX_INCOME } } };
  p.rrifMinimumWithdrawals = { mode: "statutory", source: "explicit_configuration", ageBasis: "owner_age", settlementTiming: "december_true_up", supportedRrifClass: "all_other_rrifs" };
  p.accounts.push(
    { ...structuredClone(p.accounts[1]), id: "synthetic-tfsa", type: "tfsa", contributionPhases: [], openingBalance: 100000, withdrawalPriority: 3 },
    { ...structuredClone(p.accounts[1]), id: "synthetic-taxable", type: "non_registered", contributionPhases: [], openingBalance: 50000, withdrawalPriority: 4 },
  );
  p.nonRegisteredTaxation = { mode: "simplified_canadian", source: "explicit_configuration", limitations: [], accounts: [{
    accountId: "synthetic-taxable", openingAdjustedCostBase: { amount: 40000, effectiveDate: p.startDate, sourceDescription: "Synthetic ACB", source: "explicit_configuration" },
    annualDistributionYields: { interest: .005, eligibleCanadianDividends: .01, foreignIncome: .005, capitalGains: 0 },
  }] };
  p.surplusAllocation.excess = { mode: "allocate_to_account", destinationAccountId: "synthetic-taxable" };
  p.spendingPhases = [
    { ...p.spendingPhases[0], id: "early", endAge: 50 },
    { ...p.spendingPhases[0], id: "later", startAge: 50, endAge: 65, discretionaryMultiplier: 1.3 },
    { ...p.spendingPhases[0], id: "retirement", startAge: 65, essentialMultiplier: .9 },
  ];
  p.nonFinancialAssets = [{ id: "synthetic-home", label: "Synthetic home", origin: "lunchmoney", type: "primary_residence", valueAsOf: p.startDate, openingValue: 400000, annualAppreciation: .02, availableForWithdrawals: false }];
  p.liabilities = [{ id: "synthetic-mortgage", label: "Synthetic mortgage", origin: "lunchmoney", openingBalance: 100000,
    balanceAsOf: p.startDate, role: "primary_mortgage", historicalPaymentHandling: "already_excluded_or_transfer", historicalMonthlyAverage: 0,
    treatment: { mode: "amortizing", annualInterestRate: .04, interestRateConvention: "canadian_mortgage",
      regularPayment: { amount: 1000, frequency: "monthly", monthlyEquivalent: 1000 }, scheduleStartDate: p.startDate, lumpSumPayments: [] } }];
  return p;
}
