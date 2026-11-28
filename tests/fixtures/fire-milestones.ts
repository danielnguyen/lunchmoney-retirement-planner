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
