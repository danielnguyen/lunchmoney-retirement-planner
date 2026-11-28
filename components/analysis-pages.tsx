"use client";

import type { ComparisonScenarioConfig } from "@/src/config/types";
import type { ProjectionInputsWithReturnPaths } from "@/src/domain/projection/return-path-model";
import type { FireMilestoneResult } from "@/src/domain/projection/fire-milestones";
import { EmploymentIncomeView, useEmploymentIncome } from "./employment-income";
import { FireMilestonesView, useFireMilestones } from "./fire-milestones";
import { SpendingCapacityView, useSpendingCapacity } from "./spending-capacity";

// Keep temporary analysis state beside the shared active inputs. Navigation only
// swaps views; it neither stores financial values nor submits new calculations.
export function AnalysisPages({ page, inputs, definitions, onResult }: {
  page: string;
  inputs: ProjectionInputsWithReturnPaths;
  definitions: ComparisonScenarioConfig[];
  onResult: (key: string, result: FireMilestoneResult | null) => void;
}) {
  const income = useEmploymentIncome({ inputs, definitions });
  const fire = useFireMilestones({ inputs, definitions, onResult });
  const capacity = useSpendingCapacity({ inputs });
  if (page === "career-independence") return <EmploymentIncomeView inputs={inputs} definitions={definitions} state={income} />;
  if (page === "fire-milestones") return <FireMilestonesView inputs={inputs} definitions={definitions} state={fire} />;
  if (page === "spending-capacity") return <SpendingCapacityView state={capacity} />;
  return null;
}
