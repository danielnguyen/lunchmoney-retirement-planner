import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import type { FireMilestoneRequest } from "@/src/domain/projection/fire-milestones";
import { careerPreset } from "@/src/domain/scenario/career";
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
