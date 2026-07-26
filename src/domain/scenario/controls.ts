import type { PlannerConfig } from "@/src/config/types";
import type { BaselineValue } from "@/src/domain/defaults/types";
import type {
  AccountType,
  ProjectionInputs,
} from "@/src/domain/projection/types";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const exactCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type Overrides = Record<string, number>;

export type ScenarioPathSegment =
  | string
  | { itemId: string };

export type ScenarioConfigTarget = {
  segments: ScenarioPathSegment[];
  displayName?: string;
};

export type ConfigBinding = {
  kind: "config";
  targets: ScenarioConfigTarget[];
};

export type LiveBaselineConversion = {
  kind: "live_baseline_conversion";
  targets: ScenarioConfigTarget[];
  consequence: string;
};

export type ScenarioOnly = {
  kind: "scenario_only";
  reason: string;
};

export type ScenarioPersistence =
  | ConfigBinding
  | LiveBaselineConversion
  | ScenarioOnly;

export type ScenarioPersistenceResolver = (
  config: PlannerConfig,
) => ScenarioPersistence;

export type ControlDefinition = {
  key: string;
  sourceKey: string;
  label: string;
  kind: "age" | "currency" | "percentage" | "number";
  min: (inputs: ProjectionInputs) => number;
  max: (inputs: ProjectionInputs) => number;
  step: number;
  format: (value: number) => string;
  get: (inputs: ProjectionInputs) => number;
  set: (inputs: ProjectionInputs, value: number) => void;
  persistence: ScenarioPersistenceResolver;
};

export function controlInputValue(
  control: ControlDefinition,
  value: number,
): number {
  return control.kind === "percentage" ? value * 100 : value;
}

export function controlDomainValue(
  control: ControlDefinition,
  value: number,
): number {
  return control.kind === "percentage" ? value / 100 : value;
}

type NumericDraftResult =
  | { status: "valid"; value: number }
  | { status: "invalid"; message: string };

const COMPLETE_DECIMAL = /^[+-]?(?:\d+|\d*\.\d+)$/;

export function evaluateNumericDraft(
  draft: string,
  minimum: number,
  maximum: number,
): NumericDraftResult {
  if (!COMPLETE_DECIMAL.test(draft)) {
    return { status: "invalid", message: "Enter a valid number." };
  }
  const value = Number(draft);
  if (!Number.isFinite(value)) {
    return { status: "invalid", message: "Enter a valid number." };
  }
  if (value < minimum || value > maximum) {
    return {
      status: "invalid",
      message: `Enter a value from ${minimum} to ${maximum}.`,
    };
  }
  return { status: "valid", value };
}

function scalar(...segments: ScenarioPathSegment[]): ScenarioConfigTarget {
  return { segments };
}

function namedScalar(
  displayName: string,
  ...segments: ScenarioPathSegment[]
): ScenarioConfigTarget {
  return { segments, displayName };
}

function configBinding(...targets: ScenarioConfigTarget[]): ConfigBinding {
  return { kind: "config", targets };
}

function scenarioOnly(reason: string): ScenarioOnly {
  return { kind: "scenario_only", reason };
}

function liveBaselineConversion(
  target: ScenarioConfigTarget,
  consequence: string,
): LiveBaselineConversion {
  return {
    kind: "live_baseline_conversion",
    targets: [target],
    consequence,
  };
}

function modeMismatch(
  config: PlannerConfig,
  expected: "simple" | "advanced",
  concept: string,
): ScenarioOnly | null {
  return config.configurationMode === expected
    ? null
    : scenarioOnly(
        `${concept} cannot be applied because the YAML draft uses ${config.configurationMode} mode while the active baseline uses ${expected} mode. Save and reload the structural mode change first.`,
      );
}

function fixed(value: number): (inputs: ProjectionInputs) => number {
  return () => value;
}

function monthlyPaymentEquivalent(
  amount: number,
  frequency: "monthly" | "semimonthly" | "biweekly" | "weekly",
): number {
  if (frequency === "monthly") return amount;
  if (frequency === "semimonthly") return amount * 2;
  if (frequency === "biweekly") return (amount * 26) / 12;
  return (amount * 52) / 12;
}

function benefitStartPersistence(
  benefit: "cpp" | "oas",
): ScenarioPersistenceResolver {
  return (config) => {
    if (config.governmentBenefits) {
      return configBinding(
        scalar("governmentBenefits", benefit, "startAge"),
      );
    }
    const legacyField = benefit === "cpp" ? "cppStartAge" : "oasStartAge";
    if (config[legacyField] !== undefined) {
      return configBinding(scalar(legacyField));
    }
    return scenarioOnly(
      `${benefit.toUpperCase()} start age has no configured scalar destination in this YAML draft.`,
    );
  };
}

function employmentPhasePersistence(
  phaseId: string,
  field: "annualNetCashToday" | "annualGrowth",
): ScenarioPersistenceResolver {
  return (config) => {
    const phase = config.employmentIncomePhases?.find(
      (candidate) => candidate.id === phaseId,
    );
    if (!phase) {
      return scenarioOnly(
        "This resolved employment value has no matching configured phase id in the YAML draft.",
      );
    }
    const target = scalar(
      "employmentIncomePhases",
      { itemId: phaseId },
      field,
    );
    if (field === "annualNetCashToday" && phase.annualNetCashToday === "live_baseline") {
      return liveBaselineConversion(
        target,
        "Replacing live_baseline with a fixed configured amount means future Lunch Money income changes will no longer update this field automatically.",
      );
    }
    return configBinding(target);
  };
}

const rrspRoomFieldMap = {
  annualEligibleEarnedIncomeToday: "eligibleEarnedIncomeToday",
  annualPensionAdjustmentToday: "pensionAdjustmentToday",
  annualOtherRoomReductionToday: "otherReductionToday",
} as const;

function employmentRrspPersistence(
  phaseId: string,
  field: keyof typeof rrspRoomFieldMap,
): ScenarioPersistenceResolver {
  return (config) => {
    const phase = config.employmentIncomePhases?.find(
      (candidate) => candidate.id === phaseId,
    );
    if (!phase) {
      return scenarioOnly(
        "This RRSP room assumption has no matching configured employment phase id in the YAML draft.",
      );
    }
    if (phase.rrspRoomGeneration) {
      return configBinding(
        scalar(
          "employmentIncomePhases",
          { itemId: phaseId },
          "rrspRoomGeneration",
          field,
        ),
      );
    }
    if (phase.rrspRoom) {
      return configBinding(
        scalar(
          "employmentIncomePhases",
          { itemId: phaseId },
          "rrspRoom",
          rrspRoomFieldMap[field],
        ),
      );
    }
    return scenarioOnly(
      "This resolved RRSP room value has no configured RRSP room-generation block in the YAML draft.",
    );
  };
}

function contributionPhasePersistence(
  baseline: ProjectionInputs,
  accountId: string,
  phaseId: string,
  field: "monthlyAmountToday" | "indexingRate",
): ScenarioPersistenceResolver {
  return (config) => {
    if (config.configurationMode !== baseline.savingsPolicy.mode) {
      return scenarioOnly(
        "This contribution value cannot be applied because the YAML draft configuration mode differs from the active baseline.",
      );
    }
    let target: ScenarioConfigTarget | null = null;
    let configuredValue: number | "live_baseline" | undefined;
    if (config.configurationMode === "simple" && baseline.savingsPolicy.mode === "simple") {
      if (accountId === baseline.savingsPolicy.personalTfsaAccountId) {
        const phase = config.savingsPolicy?.personalInvesting.phases.find(
          (candidate) => candidate.id === phaseId,
        );
        configuredValue = phase?.[field];
        target = phase
          ? scalar(
              "savingsPolicy",
              "personalInvesting",
              "phases",
              { itemId: phaseId },
              field,
            )
          : null;
      } else if (accountId === baseline.savingsPolicy.workplaceRrspAccountId) {
        const phase = config.savingsPolicy?.workplaceRrsp?.phases.find(
          (candidate) => candidate.id === phaseId,
        );
        configuredValue = phase?.[field];
        target = phase
          ? scalar(
              "savingsPolicy",
              "workplaceRrsp",
              "phases",
              { itemId: phaseId },
              field,
            )
          : null;
      }
    } else {
      const mappedPhase = config.accountMappings[accountId]?.contributionPhases?.find(
        (candidate) => candidate.id === phaseId,
      );
      const projectionPhase = config.projectionAccounts?.[
        accountId
      ]?.contributionPhases.find((candidate) => candidate.id === phaseId);
      if (mappedPhase && projectionPhase) {
        return scenarioOnly(
          "This contribution value is ambiguous because the same account and phase identity appears in both accountMappings and projectionAccounts in the YAML draft.",
        );
      }
      if (mappedPhase) {
        configuredValue = mappedPhase[field];
        target = scalar(
          "accountMappings",
          accountId,
          "contributionPhases",
          { itemId: phaseId },
          field,
        );
      } else if (projectionPhase) {
        configuredValue = projectionPhase[field];
        target = scalar(
          "projectionAccounts",
          accountId,
          "contributionPhases",
          { itemId: phaseId },
          field,
        );
      }
    }
    if (!target) {
      return scenarioOnly(
        "This resolved contribution value has no unique configured phase id and account identity in the YAML draft.",
      );
    }
    if (field === "monthlyAmountToday" && configuredValue === "live_baseline") {
      return liveBaselineConversion(
        target,
        "Replacing live_baseline with a fixed configured amount means future Lunch Money contribution changes will no longer update this field automatically.",
      );
    }
    return configBinding(target);
  };
}

function reservePhasePersistence(
  phaseId: string,
  field: "monthlyAmountToday" | "indexingRate",
): ScenarioPersistenceResolver {
  return (config) => {
    const mismatch = modeMismatch(
      config,
      "simple",
      "This reserve-building value",
    );
    if (mismatch) return mismatch;
    const phase = config.savingsPolicy?.reserveBuilding.phases.find(
      (candidate) => candidate.id === phaseId,
    );
    return phase
      ? configBinding(
          scalar(
            "savingsPolicy",
            "reserveBuilding",
            "phases",
            { itemId: phaseId },
            field,
          ),
        )
      : scenarioOnly(
          "This reserve-building value has no matching configured phase id in the YAML draft.",
        );
  };
}

const returnAssumptionFields: Record<AccountType, string> = {
  cash: "cashReturn",
  tfsa: "tfsaReturn",
  rrsp_rrif: "rrspReturn",
  non_registered: "nonRegisteredReturn",
};

const returnLabels: Record<AccountType, string> = {
  cash: "Cash return",
  tfsa: "TFSA return",
  rrsp_rrif: "RRSP / RRIF return",
  non_registered: "Non-registered return",
};

function plannerAccountTypeMatches(
  plannerType: string,
  accountType: AccountType,
): boolean {
  return plannerType === accountType ||
    (plannerType === "rrsp" && accountType === "rrsp_rrif");
}

function returnPersistence(
  baseline: ProjectionInputs,
  accountType: AccountType,
): ScenarioPersistenceResolver {
  return (config) => {
    const mismatch = modeMismatch(
      config,
      baseline.savingsPolicy.mode,
      `The ${returnLabels[accountType].toLowerCase()} assumption`,
    );
    if (mismatch) return mismatch;

    const targets: ScenarioConfigTarget[] = [
      namedScalar(
        `${returnLabels[accountType]} default assumption`,
        "assumptions",
        returnAssumptionFields[accountType],
      ),
    ];
    let overrideIndex = 0;
    for (const [accountId, mapping] of Object.entries(config.accountMappings)) {
      if (
        !mapping.include ||
        !plannerAccountTypeMatches(mapping.type, accountType) ||
        mapping.annualReturn === undefined
      ) {
        continue;
      }
      overrideIndex += 1;
      targets.push(
        namedScalar(
          `${returnLabels[accountType]} account override ${overrideIndex}`,
          "accountMappings",
          accountId,
          "annualReturn",
        ),
      );
    }
    for (const [accountId, account] of Object.entries(
      config.projectionAccounts ?? {},
    )) {
      if (!plannerAccountTypeMatches(account.type, accountType)) continue;
      overrideIndex += 1;
      targets.push(
        namedScalar(
          `${returnLabels[accountType]} account override ${overrideIndex}`,
          "projectionAccounts",
          accountId,
          "annualReturn",
        ),
      );
    }
    return configBinding(...targets);
  };
}

function reserveTargetPersistence(
  baselineMode: "simple" | "advanced",
  field: "target" | "indexing",
): ScenarioPersistenceResolver {
  return (config) => {
    const mismatch = modeMismatch(
      config,
      baselineMode,
      "The reserve target assumption",
    );
    if (mismatch) return mismatch;
    if (baselineMode === "simple") {
      if (!config.savingsPolicy?.reserveBuilding) {
        return scenarioOnly(
          "The reserve target cannot be applied because savingsPolicy.reserveBuilding is missing from the YAML draft.",
        );
      }
      return configBinding(
        scalar(
          "savingsPolicy",
          "reserveBuilding",
          field === "target" ? "targetToday" : "indexingRate",
        ),
      );
    }
    if (!config.surplusAllocation) {
      return scenarioOnly(
        "The reserve target cannot be applied because surplusAllocation is missing from the YAML draft.",
      );
    }
    return configBinding(
      scalar(
        "surplusAllocation",
        field === "target" ? "targetCashReserveToday" : "reserveIndexingRate",
      ),
    );
  };
}

function operatingCashPersistence(
  field: "targetToday" | "indexingRate",
): ScenarioPersistenceResolver {
  return (config) => {
    const mismatch = modeMismatch(
      config,
      "simple",
      "The operating-cash target",
    );
    if (mismatch) return mismatch;
    if (!config.savingsPolicy?.operatingCash) {
      return scenarioOnly(
        "The operating-cash target cannot be applied because savingsPolicy.operatingCash is not configured in the YAML draft.",
      );
    }
    return configBinding(
      scalar("savingsPolicy", "operatingCash", field),
    );
  };
}

function registeredRoomPersistence(
  baselineMode: "simple" | "advanced",
  account: "tfsa" | "rrsp",
): ScenarioPersistenceResolver {
  return (config) => {
    const label = account === "tfsa" ? "Starting TFSA room" : "Starting RRSP room";
    const mismatch = modeMismatch(config, baselineMode, label);
    if (mismatch) return mismatch;
    if (baselineMode === "simple") {
      const room = account === "tfsa"
        ? config.registeredRoom?.tfsa
        : config.registeredRoom?.rrsp;
      if (!room) {
        return scenarioOnly(
          `${label} cannot be applied because the corresponding registeredRoom block is missing from the YAML draft.`,
        );
      }
      return configBinding(
        scalar("registeredRoom", account, "availableAtStart"),
      );
    }
    const startingRoom = account === "tfsa"
      ? config.registeredAccountRoom?.tfsa.startingAvailableRoom
      : config.registeredAccountRoom?.rrsp.startingAvailableDeductionRoom;
    if (startingRoom?.source !== "configured_amount") {
      return scenarioOnly(
        `${label} is not editable because the YAML draft does not use a configured_amount source.`,
      );
    }
    return configBinding(
      scalar(
        "registeredAccountRoom",
        account,
        account === "tfsa"
          ? "startingAvailableRoom"
          : "startingAvailableDeductionRoom",
        "amount",
      ),
    );
  };
}

export function buildControls(baseline: ProjectionInputs): ControlDefinition[] {
  const simplePolicy = baseline.savingsPolicy.mode === "simple";
  const controls: ControlDefinition[] = [
    {
      key: simplePolicy
        ? "savingsPolicy.reserveBuilding.targetToday"
        : "surplusAllocation.targetCashReserveToday",
      sourceKey: simplePolicy
        ? "savingsPolicy.reserveBuilding.targetToday"
        : "surplusAllocation.targetCashReserveToday",
      label: "Target cash reserve today",
      kind: "currency",
      min: fixed(0),
      max: fixed(
        Math.max(250000, baseline.surplusAllocation.targetCashReserveToday * 3),
      ),
      step: 0.01,
      format: currency.format,
      get: (inputs) => inputs.surplusAllocation.targetCashReserveToday,
      set: (inputs, value) => {
        inputs.surplusAllocation.targetCashReserveToday = value;
      },
      persistence: reserveTargetPersistence(
        simplePolicy ? "simple" : "advanced",
        "target",
      ),
    },
    {
      key: simplePolicy
        ? "savingsPolicy.reserveBuilding.indexingRate"
        : "surplusAllocation.reserveIndexingRate",
      sourceKey: simplePolicy
        ? "savingsPolicy.reserveBuilding.indexingRate"
        : "surplusAllocation.reserveIndexingRate",
      label: "Reserve indexing rate",
      kind: "percentage",
      min: fixed(-0.2),
      max: fixed(0.5),
      step: 0.01,
      format: percent.format,
      get: (inputs) => inputs.surplusAllocation.reserveIndexingRate,
      set: (inputs, value) => {
        inputs.surplusAllocation.reserveIndexingRate = value;
      },
      persistence: reserveTargetPersistence(
        simplePolicy ? "simple" : "advanced",
        "indexing",
      ),
    },
    {
      key: "cppStartAge",
      sourceKey: "person.cpp.startAge",
      label: "CPP start age",
      kind: "age",
      min: fixed(60),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.cpp.startAge,
      set: (inputs, value) => {
        inputs.person.cpp.startAge = value;
      },
      persistence: benefitStartPersistence("cpp"),
    },
    {
      key: "oasStartAge",
      sourceKey: "person.oas.startAge",
      label: "OAS start age",
      kind: "age",
      min: fixed(65),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.oas.startAge,
      set: (inputs, value) => {
        inputs.person.oas.startAge = value;
      },
      persistence: benefitStartPersistence("oas"),
    },
    {
      key: "monthlyEssentialSpendingToday",
      sourceKey: "monthlyEssentialSpendingToday",
      label: "Essential monthly spending",
      kind: "currency",
      min: fixed(0),
      max: fixed(Math.max(20000, baseline.monthlyEssentialSpendingToday * 3)),
      step: 0.01,
      format: currency.format,
      get: (inputs) => inputs.monthlyEssentialSpendingToday,
      set: (inputs, value) => {
        inputs.monthlyEssentialSpendingToday = value;
      },
      persistence: () => scenarioOnly(
        "This value is calculated from Lunch Money transactions. The YAML config adjusts it through spending-phase multipliers, so this absolute scenario value cannot be applied directly.",
      ),
    },
    {
      key: "monthlyDiscretionarySpendingToday",
      sourceKey: "monthlyDiscretionarySpendingToday",
      label: "Discretionary monthly spending",
      kind: "currency",
      min: fixed(0),
      max: fixed(
        Math.max(10000, baseline.monthlyDiscretionarySpendingToday * 3),
      ),
      step: 0.01,
      format: currency.format,
      get: (inputs) => inputs.monthlyDiscretionarySpendingToday,
      set: (inputs, value) => {
        inputs.monthlyDiscretionarySpendingToday = value;
      },
      persistence: () => scenarioOnly(
        "This value is calculated from Lunch Money transactions. The YAML config adjusts it through spending-phase multipliers, so this absolute scenario value cannot be applied directly.",
      ),
    },
    {
      key: "annualInflation",
      sourceKey: "annualInflation",
      label: "Inflation",
      kind: "percentage",
      min: fixed(0),
      max: fixed(0.1),
      step: 0.01,
      format: percent.format,
      get: (inputs) => inputs.annualInflation,
      set: (inputs, value) => {
        inputs.annualInflation = value;
      },
      persistence: () => configBinding(scalar("assumptions", "inflation")),
    },
    {
      key: "endAge",
      sourceKey: "endAge",
      label: "Projection end age",
      kind: "age",
      min: (inputs) => inputs.person.retirementAge,
      max: fixed(120),
      step: 1,
      format: String,
      get: (inputs) => inputs.endAge,
      set: (inputs, value) => {
        inputs.endAge = value;
      },
      persistence: () => configBinding(scalar("projectionEndAge")),
    },
  ];

  if (
    baseline.savingsPolicy.mode === "simple" &&
    baseline.savingsPolicy.operatingCashTarget
  ) {
    controls.unshift(
      {
        key: "savingsPolicy.operatingCash.targetToday",
        sourceKey: "savingsPolicy.operatingCash.targetToday",
        label: "Operating cash target today",
        kind: "currency",
        min: fixed(0),
        max: fixed(
          Math.max(
            100000,
            baseline.savingsPolicy.operatingCashTarget.targetToday * 3,
          ),
        ),
        step: 0.01,
        format: currency.format,
        get: (inputs) =>
          inputs.savingsPolicy.mode === "simple"
            ? inputs.savingsPolicy.operatingCashTarget?.targetToday ?? 0
            : 0,
        set: (inputs, value) => {
          if (
            inputs.savingsPolicy.mode === "simple" &&
            inputs.savingsPolicy.operatingCashTarget
          ) {
            inputs.savingsPolicy.operatingCashTarget.targetToday = value;
          }
        },
        persistence: operatingCashPersistence("targetToday"),
      },
      {
        key: "savingsPolicy.operatingCash.indexingRate",
        sourceKey: "savingsPolicy.operatingCash.indexingRate",
        label: "Operating cash indexing rate",
        kind: "percentage",
        min: fixed(-0.2),
        max: fixed(0.5),
        step: 0.01,
        format: percent.format,
        get: (inputs) =>
          inputs.savingsPolicy.mode === "simple"
            ? inputs.savingsPolicy.operatingCashTarget?.indexingRate ?? 0
            : 0,
        set: (inputs, value) => {
          if (
            inputs.savingsPolicy.mode === "simple" &&
            inputs.savingsPolicy.operatingCashTarget
          ) {
            inputs.savingsPolicy.operatingCashTarget.indexingRate = value;
          }
        },
        persistence: operatingCashPersistence("indexingRate"),
      },
    );
  }

  if (baseline.registeredAccountRoom) {
    const simpleRoom = baseline.savingsPolicy.mode === "simple";
    controls.unshift(
      {
        key: simpleRoom
          ? "registeredRoom.tfsa.availableAtStart"
          : "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
        sourceKey: simpleRoom
          ? "registeredRoom.tfsa.availableAtStart"
          : "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
        label: "Starting TFSA room",
        kind: "currency",
        min: fixed(0),
        max: fixed(
          Math.max(
            250000,
            baseline.registeredAccountRoom.tfsa.startingAvailableRoom.amount * 3,
          ),
        ),
        step: 0.01,
        format: currency.format,
        get: (inputs) =>
          inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount,
        set: (inputs, value) => {
          inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = value;
        },
        persistence: registeredRoomPersistence(
          simpleRoom ? "simple" : "advanced",
          "tfsa",
        ),
      },
      {
        key: simpleRoom
          ? "registeredRoom.rrsp.availableAtStart"
          : "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
        sourceKey: simpleRoom
          ? "registeredRoom.rrsp.availableAtStart"
          : "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
        label: "Starting RRSP deduction room",
        kind: "currency",
        min: fixed(0),
        max: fixed(
          Math.max(
            250000,
            baseline.registeredAccountRoom.rrsp.startingAvailableDeductionRoom
              .amount * 3,
          ),
        ),
        step: 0.01,
        format: currency.format,
        get: (inputs) =>
          inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount,
        set: (inputs, value) => {
          inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
            value;
        },
        persistence: registeredRoomPersistence(
          simpleRoom ? "simple" : "advanced",
          "rrsp",
        ),
      },
    );
  }

  for (const phase of baseline.person.employmentIncomePhases) {
    controls.push(
      {
        key: `employmentPhase.${phase.id}.annualNetCashToday`,
        sourceKey: `person.employmentIncomePhases.${phase.id}.annualNetCashToday`,
        label: `${phase.label} annual net cash`,
        kind: "currency",
        min: fixed(0),
        max: fixed(Math.max(250000, phase.annualNetCashToday * 3)),
        step: 0.01,
        format: currency.format,
        get: (inputs) =>
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualNetCashToday,
        set: (inputs, value) => {
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualNetCashToday = value;
        },
        persistence: employmentPhasePersistence(
          phase.id,
          "annualNetCashToday",
        ),
      },
      {
        key: `employmentPhase.${phase.id}.annualGrowth`,
        sourceKey: `person.employmentIncomePhases.${phase.id}.annualGrowth`,
        label: `${phase.label} annual income growth`,
        kind: "percentage",
        min: fixed(-0.2),
        max: fixed(0.5),
        step: 0.01,
        format: percent.format,
        get: (inputs) =>
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualGrowth,
        set: (inputs, value) => {
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualGrowth = value;
        },
        persistence: employmentPhasePersistence(phase.id, "annualGrowth"),
      },
    );
    if (phase.rrspRoomGeneration) {
      for (const [field, label] of [
        [
          "annualEligibleEarnedIncomeToday",
          "annual RRSP-eligible earned income",
        ],
        ["annualPensionAdjustmentToday", "annual pension adjustment"],
        ["annualOtherRoomReductionToday", "annual other room reduction"],
      ] as const) {
        controls.push({
          key: `employmentPhase.${phase.id}.rrspRoomGeneration.${field}`,
          sourceKey: `person.employmentIncomePhases.${phase.id}.rrspRoomGeneration.${field}`,
          label: `${phase.label} ${label}`,
          kind: "currency",
          min: fixed(0),
          max: fixed(Math.max(250000, phase.rrspRoomGeneration[field] * 3)),
          step: 0.01,
          format: currency.format,
          get: (inputs) =>
            inputs.person.employmentIncomePhases.find(
              (item) => item.id === phase.id,
            )!.rrspRoomGeneration![field],
          set: (inputs, value) => {
            inputs.person.employmentIncomePhases.find(
              (item) => item.id === phase.id,
            )!.rrspRoomGeneration![field] = value;
          },
          persistence: employmentRrspPersistence(phase.id, field),
        });
      }
    }
  }

  for (const account of baseline.accounts) {
    if (!["tfsa", "rrsp_rrif", "non_registered"].includes(account.type)) {
      continue;
    }
    for (const phase of account.contributionPhases) {
      const resolvedSimplePolicy =
        baseline.savingsPolicy.mode === "simple"
          ? baseline.savingsPolicy
          : null;
      const planLabel =
        resolvedSimplePolicy?.personalTfsaAccountId === account.id
          ? "Personal saving"
          : resolvedSimplePolicy?.workplaceRrspAccountId === account.id
            ? "Workplace RRSP saving"
            : account.label;
      controls.push(
        {
          key: `contributionPhase.${account.id}.${phase.id}.monthlyAmountToday`,
          sourceKey: `accounts.${account.id}.contributionPhases.${phase.id}.monthlyAmountToday`,
          label: `${planLabel} · ${phase.label} monthly amount`,
          kind: "currency",
          min: fixed(0),
          max: fixed(Math.max(5000, phase.monthlyAmountToday * 3)),
          step: 0.01,
          format: currency.format,
          get: (inputs) =>
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find((item) => item.id === phase.id)!
              .monthlyAmountToday,
          set: (inputs, value) => {
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find(
                (item) => item.id === phase.id,
              )!.monthlyAmountToday = value;
          },
          persistence: contributionPhasePersistence(
            baseline,
            account.id,
            phase.id,
            "monthlyAmountToday",
          ),
        },
        {
          key: `contributionPhase.${account.id}.${phase.id}.indexingRate`,
          sourceKey: `accounts.${account.id}.contributionPhases.${phase.id}.indexingRate`,
          label: `${planLabel} · ${phase.label} indexing`,
          kind: "percentage",
          min: fixed(-0.2),
          max: fixed(0.5),
          step: 0.01,
          format: percent.format,
          get: (inputs) =>
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find((item) => item.id === phase.id)!
              .indexingRate,
          set: (inputs, value) => {
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find(
                (item) => item.id === phase.id,
              )!.indexingRate = value;
          },
          persistence: contributionPhasePersistence(
            baseline,
            account.id,
            phase.id,
            "indexingRate",
          ),
        },
      );
    }
  }

  if (baseline.savingsPolicy.mode === "simple") {
    for (const phase of baseline.savingsPolicy.reserveBuildingPhases) {
      controls.push(
        {
          key: `reserveBuildingPhase.${phase.id}.monthlyAmountToday`,
          sourceKey: `savingsPolicy.reserveBuilding.phases.${phase.id}.monthlyAmountToday`,
          label: `Reserve building · ${phase.label} monthly amount`,
          kind: "currency",
          min: fixed(0),
          max: fixed(Math.max(5000, phase.monthlyAmountToday * 3)),
          step: 0.01,
          format: currency.format,
          get: (inputs) =>
            inputs.savingsPolicy.mode === "simple"
              ? inputs.savingsPolicy.reserveBuildingPhases.find(
                  (item) => item.id === phase.id,
                )!.monthlyAmountToday
              : 0,
          set: (inputs, value) => {
            if (inputs.savingsPolicy.mode === "simple") {
              inputs.savingsPolicy.reserveBuildingPhases.find(
                (item) => item.id === phase.id,
              )!.monthlyAmountToday = value;
            }
          },
          persistence: reservePhasePersistence(
            phase.id,
            "monthlyAmountToday",
          ),
        },
        {
          key: `reserveBuildingPhase.${phase.id}.indexingRate`,
          sourceKey: `savingsPolicy.reserveBuilding.phases.${phase.id}.indexingRate`,
          label: `Reserve building · ${phase.label} indexing`,
          kind: "percentage",
          min: fixed(-0.2),
          max: fixed(0.5),
          step: 0.01,
          format: percent.format,
          get: (inputs) =>
            inputs.savingsPolicy.mode === "simple"
              ? inputs.savingsPolicy.reserveBuildingPhases.find(
                  (item) => item.id === phase.id,
                )!.indexingRate
              : 0,
          set: (inputs, value) => {
            if (inputs.savingsPolicy.mode === "simple") {
              inputs.savingsPolicy.reserveBuildingPhases.find(
                (item) => item.id === phase.id,
              )!.indexingRate = value;
            }
          },
          persistence: reservePhasePersistence(phase.id, "indexingRate"),
        },
      );
    }
  }

  const seenTypes = new Set<AccountType>();
  for (const account of baseline.accounts) {
    if (seenTypes.has(account.type)) continue;
    seenTypes.add(account.type);
    controls.push({
      key: `return.${account.type}`,
      sourceKey: `accounts.${account.id}.annualReturn`,
      label: returnLabels[account.type],
      kind: "percentage",
      min: fixed(-0.5),
      max: fixed(0.5),
      step: 0.01,
      format: percent.format,
      get: (inputs) =>
        inputs.accounts.find((item) => item.type === account.type)!.annualReturn,
      set: (inputs, value) => {
        for (const item of inputs.accounts) {
          if (item.type === account.type) item.annualReturn = value;
        }
      },
      persistence: returnPersistence(baseline, account.type),
    });
  }

  const residence = baseline.nonFinancialAssets.find(
    (asset) => asset.type === "primary_residence",
  );
  if (residence) {
    const residenceSourcePrefix =
      residence.origin === "lunchmoney"
        ? `nonFinancialAssets.${residence.id}`
        : "nonFinancialAssets.primaryResidence";
    controls.unshift(
      {
        key: "primaryResidence.currentValue",
        sourceKey: `${residenceSourcePrefix}.openingValue`,
        label: "Primary residence value",
        kind: "currency",
        min: fixed(0),
        max: fixed(Math.max(2_000_000, residence.openingValue * 3)),
        step: 0.01,
        format: currency.format,
        get: (inputs) =>
          inputs.nonFinancialAssets.find(
            (asset) => asset.id === residence.id,
          )!.openingValue,
        set: (inputs, value) => {
          inputs.nonFinancialAssets.find(
            (asset) => asset.id === residence.id,
          )!.openingValue = value;
        },
        persistence: residence.origin === "lunchmoney"
          ? () => scenarioOnly(
              "This residence value is owned by a Lunch Money manual asset and cannot be copied into the YAML draft.",
            )
          : (config) => config.primaryResidence
              ? configBinding(scalar("primaryResidence", "currentValue"))
              : scenarioOnly(
                  "This residence value has no configured primaryResidence destination.",
                ),
      },
      {
        key: "primaryResidence.annualAppreciation",
        sourceKey: `${residenceSourcePrefix}.annualAppreciation`,
        label: "Residence annual appreciation",
        kind: "percentage",
        min: fixed(-0.2),
        max: fixed(0.5),
        step: 0.01,
        format: percent.format,
        get: (inputs) =>
          inputs.nonFinancialAssets.find(
            (asset) => asset.id === residence.id,
          )!.annualAppreciation,
        set: (inputs, value) => {
          inputs.nonFinancialAssets.find(
            (asset) => asset.id === residence.id,
          )!.annualAppreciation = value;
        },
        persistence: residence.origin === "lunchmoney"
          ? (config) => config.accountMappings[residence.id]?.annualAppreciation !== undefined
              ? configBinding(
                  scalar("accountMappings", residence.id, "annualAppreciation"),
                )
              : scenarioOnly(
                  "This imported residence has no configured appreciation scalar.",
                )
          : (config) => config.primaryResidence
              ? configBinding(scalar("primaryResidence", "annualAppreciation"))
              : scenarioOnly(
                  "This residence appreciation has no configured primaryResidence destination.",
                ),
      },
    );
  }

  for (const liability of baseline.liabilities) {
    if (liability.treatment.mode !== "amortizing") continue;
    const baselineTreatment = liability.treatment;
    controls.unshift(
      {
        key: `liability.${liability.id}.annualInterestRate`,
        sourceKey: `liabilities.${liability.id}.treatment.annualInterestRate`,
        label: `${liability.label} annual interest rate`,
        kind: "percentage",
        min: fixed(0),
        max: fixed(0.5),
        step: 0.01,
        format: percent.format,
        get: (inputs) => {
          const treatment = inputs.liabilities.find(
            (item) => item.id === liability.id,
          )!.treatment;
          return treatment.mode === "amortizing"
            ? treatment.annualInterestRate
            : 0;
        },
        set: (inputs, value) => {
          const treatment = inputs.liabilities.find(
            (item) => item.id === liability.id,
          )!.treatment;
          if (treatment.mode === "amortizing") {
            treatment.annualInterestRate = value;
          }
        },
        persistence: (config) =>
          config.accountMappings[liability.id]?.liability?.mode === "amortizing"
            ? configBinding(
                scalar(
                  "accountMappings",
                  liability.id,
                  "liability",
                  "annualInterestRate",
                ),
              )
            : scenarioOnly(
                "This liability rate has no matching amortizing liability identity in the YAML draft.",
              ),
      },
      {
        key: `liability.${liability.id}.regularPayment.amount`,
        sourceKey: `liabilities.${liability.id}.treatment.regularPaymentAmount`,
        label: `${liability.label} regular payment`,
        kind: "currency",
        min: fixed(0.01),
        max: fixed(
          Math.max(20_000, baselineTreatment.regularPayment.amount * 3),
        ),
        step: 0.01,
        format: exactCurrency.format,
        get: (inputs) => {
          const treatment = inputs.liabilities.find(
            (item) => item.id === liability.id,
          )!.treatment;
          return treatment.mode === "amortizing"
            ? treatment.regularPayment.amount
            : 0;
        },
        set: (inputs, value) => {
          const treatment = inputs.liabilities.find(
            (item) => item.id === liability.id,
          )!.treatment;
          if (treatment.mode === "amortizing") {
            treatment.regularPayment.amount = value;
            treatment.regularPayment.monthlyEquivalent =
              monthlyPaymentEquivalent(value, treatment.regularPayment.frequency);
          }
        },
        persistence: (config) =>
          config.accountMappings[liability.id]?.liability?.mode === "amortizing"
            ? configBinding(
                scalar(
                  "accountMappings",
                  liability.id,
                  "liability",
                  "regularPayment",
                  "amount",
                ),
              )
            : scenarioOnly(
                "This liability payment has no matching amortizing liability identity in the YAML draft.",
              ),
      },
    );
  }

  return controls;
}

export function materializeInputs(
  baseline: ProjectionInputs,
  controls: ControlDefinition[],
  overrides: Overrides,
): ProjectionInputs {
  const inputs = structuredClone(baseline);
  for (const control of controls) {
    const override = overrides[control.key];
    if (override !== undefined) control.set(inputs, override);
  }
  return inputs;
}

export function humanScenarioSourceLabel(
  provenance: BaselineValue<unknown> | undefined,
  control: Pick<ControlDefinition, "sourceKey">,
): string {
  if (provenance?.sourceType === "local_configuration") {
    return "Source: planner.local.yaml";
  }
  if (provenance?.sourceType === "canadian_reference") {
    return "Source: Canadian reference";
  }
  if (provenance?.sourceType === "lunchmoney_derived") {
    if (control.sourceKey.includes(".openingValue")) {
      return "Source: Live Lunch Money account value";
    }
    if (
      control.sourceKey.includes("employmentIncomePhases") &&
      provenance.sourceDescription.startsWith("Live annualized")
    ) {
      return "Source: Live Lunch Money baseline (live_baseline)";
    }
    return "Source: Live Lunch Money baseline";
  }
  return "Source: Configured amount";
}
