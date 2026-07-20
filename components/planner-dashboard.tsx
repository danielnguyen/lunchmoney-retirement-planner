"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ExplainableHeading,
  ExplanationDrawer,
} from "@/components/explanations";
import { resolveActiveScenarioWarnings } from "@/src/domain/baseline/scenario-warnings";
import type { CurrentBaseline } from "@/src/domain/baseline/types";
import { buildExplanation } from "@/src/domain/explanations/build";
import type { ExplanationTarget } from "@/src/domain/explanations/types";
import {
  buildAnnualChartData,
  buildAnnualLedgerData,
  buildSavingsPolicyPreview,
  closestAnnualPoint,
  type DisplayMode,
  monthlyEmploymentNetCash,
  monthlyInvestmentContributions,
  startingFinancialAssets,
} from "@/src/domain/projection/presentation";
import {
  projectionCsvFilename,
  projectionJsonFilename,
} from "@/src/domain/projection/filenames";
import type {
  AccountType,
  ProjectionInputs,
  ProjectionResult,
} from "@/src/domain/projection/types";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

const exactCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const accountColors = ["#d8bd65", "#d99269", "#8072d7", "#4eb5d2", "#70d6b2", "#a9cf6c"];

type Overrides = Record<string, number>;

type BlockingError = {
  error: string;
  message: string;
  connection?: { status: string; message: string };
  dataThrough?: string;
  transactionWindow?: CurrentBaseline["transactionWindow"];
  recordsAnalyzed?: CurrentBaseline["recordsAnalyzed"];
  warnings?: CurrentBaseline["warnings"];
  unmappedAccounts?: CurrentBaseline["unmappedAccounts"];
  unmappedCategories?: CurrentBaseline["unmappedCategories"];
};

export type ControlDefinition = {
  key: string;
  sourceKey: string;
  label: string;
  min: (inputs: ProjectionInputs) => number;
  max: (inputs: ProjectionInputs) => number;
  step: number;
  format: (value: number) => string;
  get: (inputs: ProjectionInputs) => number;
  set: (inputs: ProjectionInputs, value: number) => void;
  inputType?: "range" | "number";
};

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
      min: fixed(0),
      max: fixed(
        Math.max(
          250000,
          baseline.surplusAllocation.targetCashReserveToday * 3,
        ),
      ),
      step: 100,
      format: currency.format,
      get: (inputs) =>
        inputs.surplusAllocation.targetCashReserveToday,
      set: (inputs, value) => {
        inputs.surplusAllocation.targetCashReserveToday = value;
      },
      inputType: "number",
    },
    {
      key: simplePolicy
        ? "savingsPolicy.reserveBuilding.indexingRate"
        : "surplusAllocation.reserveIndexingRate",
      sourceKey: simplePolicy
        ? "savingsPolicy.reserveBuilding.indexingRate"
        : "surplusAllocation.reserveIndexingRate",
      label: "Reserve indexing rate",
      min: fixed(-0.2),
      max: fixed(0.5),
      step: 0.001,
      format: percent.format,
      get: (inputs) => inputs.surplusAllocation.reserveIndexingRate,
      set: (inputs, value) => {
        inputs.surplusAllocation.reserveIndexingRate = value;
      },
      inputType: "number",
    },
    {
      key: "cppStartAge",
      sourceKey: "person.cpp.startAge",
      label: "CPP start age",
      min: fixed(60),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.cpp.startAge,
      set: (inputs, value) => {
        inputs.person.cpp.startAge = value;
      },
    },
    {
      key: "oasStartAge",
      sourceKey: "person.oas.startAge",
      label: "OAS start age",
      min: fixed(65),
      max: fixed(70),
      step: 1,
      format: String,
      get: (inputs) => inputs.person.oas.startAge,
      set: (inputs, value) => {
        inputs.person.oas.startAge = value;
      },
    },
    {
      key: "monthlyEssentialSpendingToday",
      sourceKey: "monthlyEssentialSpendingToday",
      label: "Essential monthly spending",
      min: fixed(0),
      max: fixed(Math.max(20000, baseline.monthlyEssentialSpendingToday * 3)),
      step: 50,
      format: currency.format,
      get: (inputs) => inputs.monthlyEssentialSpendingToday,
      set: (inputs, value) => {
        inputs.monthlyEssentialSpendingToday = value;
      },
    },
    {
      key: "monthlyDiscretionarySpendingToday",
      sourceKey: "monthlyDiscretionarySpendingToday",
      label: "Discretionary monthly spending",
      min: fixed(0),
      max: fixed(Math.max(10000, baseline.monthlyDiscretionarySpendingToday * 3)),
      step: 50,
      format: currency.format,
      get: (inputs) => inputs.monthlyDiscretionarySpendingToday,
      set: (inputs, value) => {
        inputs.monthlyDiscretionarySpendingToday = value;
      },
    },
    {
      key: "annualInflation",
      sourceKey: "annualInflation",
      label: "Inflation",
      min: fixed(0),
      max: fixed(0.1),
      step: 0.001,
      format: percent.format,
      get: (inputs) => inputs.annualInflation,
      set: (inputs, value) => {
        inputs.annualInflation = value;
      },
    },
    {
      key: "endAge",
      sourceKey: "endAge",
      label: "Projection end age",
      min: (inputs) => inputs.person.retirementAge,
      max: fixed(120),
      step: 1,
      format: String,
      get: (inputs) => inputs.endAge,
      set: (inputs, value) => {
        inputs.endAge = value;
      },
    },
  ];

  if (baseline.registeredAccountRoom) {
    const simpleRoom = baseline.savingsPolicy.mode === "simple";
    controls.unshift(
      {
        key: simpleRoom
          ? "registeredRoom.tfsa.availableAtStart"
          : "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
        sourceKey:
          simpleRoom
            ? "registeredRoom.tfsa.availableAtStart"
            : "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
        label: "Starting TFSA room",
        min: fixed(0),
        max: fixed(
          Math.max(
            250000,
            baseline.registeredAccountRoom.tfsa.startingAvailableRoom.amount *
              3,
          ),
        ),
        step: 100,
        format: currency.format,
        get: (inputs) =>
          inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount,
        set: (inputs, value) => {
          inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount =
            value;
        },
        inputType: "number",
      },
      {
        key:
          simpleRoom
            ? "registeredRoom.rrsp.availableAtStart"
            : "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
        sourceKey:
          simpleRoom
            ? "registeredRoom.rrsp.availableAtStart"
            : "registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount",
        label: "Starting RRSP deduction room",
        min: fixed(0),
        max: fixed(
          Math.max(
            250000,
            baseline.registeredAccountRoom.rrsp
              .startingAvailableDeductionRoom.amount * 3,
          ),
        ),
        step: 100,
        format: currency.format,
        get: (inputs) =>
          inputs.registeredAccountRoom!.rrsp
            .startingAvailableDeductionRoom.amount,
        set: (inputs, value) => {
          inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
            value;
        },
        inputType: "number",
      },
    );
  }

  for (const phase of baseline.person.employmentIncomePhases) {
    controls.push(
      {
        key: `employmentPhase.${phase.id}.annualNetCashToday`,
        sourceKey: `person.employmentIncomePhases.${phase.id}.annualNetCashToday`,
        label: `${phase.label} annual net cash`,
        min: fixed(0),
        max: fixed(Math.max(250000, phase.annualNetCashToday * 3)),
        step: 1000,
        format: currency.format,
        get: (inputs) =>
          inputs.person.employmentIncomePhases.find((item) => item.id === phase.id)!
            .annualNetCashToday,
        set: (inputs, value) => {
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualNetCashToday = value;
        },
      },
      {
        key: `employmentPhase.${phase.id}.annualGrowth`,
        sourceKey: `person.employmentIncomePhases.${phase.id}.annualGrowth`,
        label: `${phase.label} annual income growth`,
        min: fixed(-0.2),
        max: fixed(0.5),
        step: 0.001,
        format: percent.format,
        get: (inputs) =>
          inputs.person.employmentIncomePhases.find((item) => item.id === phase.id)!
            .annualGrowth,
        set: (inputs, value) => {
          inputs.person.employmentIncomePhases.find(
            (item) => item.id === phase.id,
          )!.annualGrowth = value;
        },
      },
    );
    if (phase.rrspRoomGeneration) {
      for (const [
        field,
        label,
      ] of [
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
          min: fixed(0),
          max: fixed(
            Math.max(250000, phase.rrspRoomGeneration[field] * 3),
          ),
          step: 100,
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
          inputType: "number",
        });
      }
    }
  }

  for (const account of baseline.accounts) {
    if (!["tfsa", "rrsp_rrif", "non_registered"].includes(account.type)) continue;
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
          min: fixed(0),
          max: fixed(Math.max(5000, phase.monthlyAmountToday * 3)),
          step: 25,
          format: currency.format,
          get: (inputs) =>
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find((item) => item.id === phase.id)!.monthlyAmountToday,
          set: (inputs, value) => {
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find(
                (item) => item.id === phase.id,
              )!.monthlyAmountToday = value;
          },
        },
        {
          key: `contributionPhase.${account.id}.${phase.id}.indexingRate`,
          sourceKey: `accounts.${account.id}.contributionPhases.${phase.id}.indexingRate`,
          label: `${planLabel} · ${phase.label} indexing`,
          min: fixed(-0.2),
          max: fixed(0.5),
          step: 0.001,
          format: percent.format,
          get: (inputs) =>
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find((item) => item.id === phase.id)!.indexingRate,
          set: (inputs, value) => {
            inputs.accounts
              .find((item) => item.id === account.id)!
              .contributionPhases.find((item) => item.id === phase.id)!.indexingRate =
              value;
          },
        },
      );
    }
  }

  if (baseline.savingsPolicy.mode === "simple") {
    for (const phase of baseline.savingsPolicy
      .reserveBuildingPhases) {
      controls.push(
        {
          key: `reserveBuildingPhase.${phase.id}.monthlyAmountToday`,
          sourceKey: `savingsPolicy.reserveBuilding.phases.${phase.id}.monthlyAmountToday`,
          label: `Reserve building · ${phase.label} monthly amount`,
          min: fixed(0),
          max: fixed(Math.max(5000, phase.monthlyAmountToday * 3)),
          step: 25,
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
        },
        {
          key: `reserveBuildingPhase.${phase.id}.indexingRate`,
          sourceKey: `savingsPolicy.reserveBuilding.phases.${phase.id}.indexingRate`,
          label: `Reserve building · ${phase.label} indexing`,
          min: fixed(-0.2),
          max: fixed(0.5),
          step: 0.001,
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
        },
      );
    }
  }

  const typeLabels: Record<AccountType, string> = {
    cash: "Cash return",
    tfsa: "TFSA return",
    rrsp_rrif: "RRSP / RRIF return",
    non_registered: "Non-registered return",
  };
  const seenTypes = new Set<AccountType>();
  for (const account of baseline.accounts) {
    if (seenTypes.has(account.type)) continue;
    seenTypes.add(account.type);
    controls.push({
      key: `return.${account.type}`,
      sourceKey: `accounts.${account.id}.annualReturn`,
      label: typeLabels[account.type],
      min: fixed(-0.5),
      max: fixed(0.5),
      step: 0.001,
      format: percent.format,
      get: (inputs) => inputs.accounts.find((item) => item.type === account.type)!.annualReturn,
      set: (inputs, value) => {
        for (const item of inputs.accounts) {
          if (item.type === account.type) item.annualReturn = value;
        }
      },
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
        min: fixed(0),
        max: fixed(Math.max(2_000_000, residence.openingValue * 3)),
        step: 1_000,
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
        inputType: "number",
      },
      {
        key: "primaryResidence.annualAppreciation",
        sourceKey: `${residenceSourcePrefix}.annualAppreciation`,
        label: "Residence annual appreciation",
        min: fixed(-0.2),
        max: fixed(0.5),
        step: 0.001,
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
        inputType: "number",
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
        min: fixed(0),
        max: fixed(0.5),
        step: 0.001,
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
        inputType: "number",
      },
      {
        key: `liability.${liability.id}.regularPayment.amount`,
        sourceKey: `liabilities.${liability.id}.treatment.regularPaymentAmount`,
        label: `${liability.label} regular payment`,
        min: fixed(0.01),
        max: fixed(
          Math.max(20_000, baselineTreatment.regularPayment.amount * 3),
        ),
        step: 1,
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
              monthlyPaymentEquivalent(
                value,
                treatment.regularPayment.frequency,
              );
          }
        },
        inputType: "number",
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

function compactCurrency(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function sourceLabel(baseline: CurrentBaseline, key: string): string {
  return baseline.provenance[key]?.sourceType.replaceAll("_", " ") ?? "live baseline";
}

function ScenarioControlsPanel({
  baseline,
  inputs,
  controls,
  overrides,
  setOverrides,
  idPrefix,
}: {
  baseline: CurrentBaseline;
  inputs: ProjectionInputs;
  controls: ControlDefinition[];
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  idPrefix: "desktop" | "drawer";
}) {
  return (
    <>
      <div className="section-heading">
        <div><span className="section-kicker">Scenario</span><h2>Calculator controls</h2></div>
        <button className="text-button" onClick={() => setOverrides({})}>Reset all</button>
      </div>
      <p className="panel-copy">Reset restores this refreshed live baseline. Refresh clears every temporary override.</p>
      <div className="control-list">
        {controls.map((control) => {
          const baselineValue = control.get(baseline.projectionInputs);
          const currentValue = control.get(inputs);
          const overridden = overrides[control.key] !== undefined;
          const inputId = `${idPrefix}-${control.key}`;
          return (
            <div className={`control ${overridden ? "is-overridden" : ""}`} key={control.key}>
              <div className="control-head"><label htmlFor={inputId}>{control.label}</label><output>{control.format(currentValue)}</output></div>
              <input id={inputId} type={control.inputType ?? "range"} min={control.min(inputs)} max={control.max(inputs)} step={control.step} value={currentValue} onChange={(event) => setOverrides((current) => ({ ...current, [control.key]: Number(event.target.value) }))} />
              <div className="control-meta">
                <span>{sourceLabel(baseline, control.sourceKey)}</span>
                <button className="text-button" disabled={!overridden} onClick={() => setOverrides((current) => { const next = { ...current }; delete next[control.key]; return next; })}>Reset to {control.format(baselineValue)}</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function focusableScenarioElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute("hidden"));
}

export function ScenarioControlsDrawer({
  opener,
  onClose,
  children,
}: {
  opener: HTMLButtonElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    focusableScenarioElements(dialog)[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableScenarioElements(dialog!);
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0]!;
      const last = elements.at(-1)!;
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.document.addEventListener("keydown", onKeyDown);
    return () => {
      window.document.removeEventListener("keydown", onKeyDown);
      window.document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, [onClose, opener]);

  return (
    <div
      className="scenario-controls-overlay no-print"
      data-testid="scenario-controls-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className="scenario-controls-drawer"
        id="scenario-controls-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-controls-title"
      >
        <header className="scenario-controls-drawer-header">
          <div>
            <span className="section-kicker">Scenario</span>
            <h2 id="scenario-controls-title">Scenario controls</h2>
          </div>
          <button type="button" className="drawer-close" aria-label="Close scenario controls" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="scenario-controls-drawer-content">{children}</div>
      </aside>
    </div>
  );
}

function benefitSourceLabel(
  baseline: CurrentBaseline,
  key: "person.cpp.amountSourceMode" | "person.oas.fullAmountSourceMode",
): string {
  const mode = baseline.provenance[key]?.value;
  if (mode === "official_estimate") return "Official estimate";
  if (mode === "configured_amount") return "Configured amount";
  if (mode === "canadian_reference") return "Canadian reference";
  if (mode === "explicit_zero") return "Explicit zero";
  if (mode === "legacy_configured_amount") return "Legacy compatibility amount";
  return "Source unavailable";
}

function BlockingState({ error, onRefresh }: { error: BlockingError; onRefresh: () => void }) {
  const connected = error.connection?.status === "connected";
  return (
    <main>
      <header className="hero compact-hero">
        <div>
          <span className="eyebrow">Retirement lifecycle report</span>
          <h1>Live baseline required.</h1>
          <p>The planner will not render projections until Lunch Money and the private mappings are valid.</p>
        </div>
        <button className="button no-print" onClick={onRefresh}>Try again</button>
      </header>
      <section className="blocking-card" role="alert">
        <span className={`connection-badge ${connected ? "connected" : "failed"}`}>
          {connected ? "Lunch Money connected" : "Connection blocked"}
        </span>
        <h2>{error.message}</h2>
        <p className="error-code">{error.error}</p>
        {error.recordsAnalyzed ? (
          <p className="panel-copy">
            Analysed {error.recordsAnalyzed.accounts} accounts, {error.recordsAnalyzed.categories} categories,
            {" "}{error.recordsAnalyzed.recurringItems} recurring items, and {error.recordsAnalyzed.transactions} transactions.
          </p>
        ) : null}
        {(error.unmappedAccounts?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Unmapped accounts</h3>
            {error.unmappedAccounts!.map((account) => (
              <code key={account.id}>{account.id} · {account.name} · {account.status}</code>
            ))}
          </div>
        ) : null}
        {(error.unmappedCategories?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Unmapped categories</h3>
            {error.unmappedCategories!.map((category) => (
              <code key={category.id}>{category.id} · {category.name} · {category.transactionCount} records</code>
            ))}
          </div>
        ) : null}
        {(error.warnings?.length ?? 0) > 0 ? (
          <div className="mapping-list">
            <h3>Configuration details</h3>
            {error.warnings!.map((warning, index) => (
              <p key={`${warning.code}-${index}`}>{warning.message}</p>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function PlannerDashboard() {
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [baselineResult, setBaselineResult] = useState<{
    generation: number;
    baseline?: CurrentBaseline;
    error?: BlockingError;
  } | null>(null);
  const [projectionResult, setProjectionResult] = useState<{
    key: string;
    projection?: ProjectionResult;
    error?: string;
  } | null>(null);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [mode, setMode] = useState<DisplayMode>("real");
  const [allocationYear, setAllocationYear] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState("");
  const [activeExplanation, setActiveExplanation] = useState<{
    target: ExplanationTarget;
    opener: HTMLButtonElement;
  } | null>(null);
  const [scenarioControls, setScenarioControls] = useState<{
    opener: HTMLButtonElement;
  } | null>(null);

  const openExplanation = useCallback(
    (target: ExplanationTarget, opener: HTMLButtonElement) => {
      setScenarioControls(null);
      setActiveExplanation({ target, opener });
    },
    [],
  );
  const closeExplanation = useCallback(() => setActiveExplanation(null), []);
  const closeScenarioControls = useCallback(() => setScenarioControls(null), []);

  useEffect(() => {
    const wideDesktop = window.matchMedia("(min-width: 1480px)");
    const closeAtWideDesktop = () => {
      if (wideDesktop.matches) setScenarioControls(null);
    };
    closeAtWideDesktop();
    wideDesktop.addEventListener("change", closeAtWideDesktop);
    return () => wideDesktop.removeEventListener("change", closeAtWideDesktop);
  }, []);

  const refresh = useCallback(() => {
    setRefreshGeneration((current) => current + 1);
    setOverrides({});
    setExportStatus("");
    setActiveExplanation(null);
    setScenarioControls(null);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/baseline/current", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as CurrentBaseline | BlockingError;
        if (!response.ok) {
          setBaselineResult({ generation: refreshGeneration, error: body as BlockingError });
          return;
        }
        const current = body as CurrentBaseline;
        setBaselineResult({ generation: refreshGeneration, baseline: current });
        setAllocationYear(Number(current.projectionInputs.startDate.slice(0, 4)) + 20);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setBaselineResult({
          generation: refreshGeneration,
          error: { error: "baseline_load_failed", message: "The live baseline could not be loaded." },
        });
      });
    return () => controller.abort();
  }, [refreshGeneration]);

  const currentBaselineResult =
    baselineResult?.generation === refreshGeneration ? baselineResult : null;
  const baseline = currentBaselineResult?.baseline ?? null;
  const loadError = currentBaselineResult?.error ?? null;
  const loading = currentBaselineResult === null;

  const controls = useMemo(
    () => (baseline ? buildControls(baseline.projectionInputs) : []),
    [baseline],
  );
  const inputs = useMemo(
    () => (baseline ? materializeInputs(baseline.projectionInputs, controls, overrides) : null),
    [baseline, controls, overrides],
  );
  const inputsKey = useMemo(() => (inputs ? JSON.stringify(inputs) : ""), [inputs]);

  useEffect(() => {
    if (!inputs) return;
    const controller = new AbortController();
    void fetch("/api/v1/projections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as ProjectionResult | { message?: string };
        if (!response.ok) throw new Error("message" in body ? body.message : "Projection failed");
        setProjectionResult({ key: inputsKey, projection: body as ProjectionResult });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProjectionResult({
          key: inputsKey,
          error: error instanceof Error ? error.message : "Projection failed",
        });
      });
    return () => controller.abort();
  }, [inputs, inputsKey]);

  const currentProjectionResult = projectionResult?.key === inputsKey ? projectionResult : null;
  const projection = currentProjectionResult?.projection ?? null;
  const projectionError = currentProjectionResult?.error ?? "";
  const projecting = Boolean(inputs) && currentProjectionResult === null;

  async function download(endpoint: string, filename: string) {
    if (!baseline || !inputs) return;
    setExportStatus("Preparing export…");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline, inputs, overrides }),
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportStatus("Export ready");
    } catch {
      setExportStatus("Export failed");
    }
  }

  if (loading) {
    return (
      <main>
        <section className="blocking-card loading-card" aria-live="polite">
          <span className="connection-badge">Connecting read-only</span>
          <h1>Loading the current Lunch Money baseline…</h1>
          <p>No projection will be shown until live data and private mappings pass validation.</p>
        </section>
      </main>
    );
  }
  if (loadError) return <BlockingState error={loadError} onRefresh={() => void refresh()} />;
  if (!baseline || !inputs) return null;

  const chartData = projection ? buildAnnualChartData(inputs, projection, mode) : [];
  const ledgerData = projection ? buildAnnualLedgerData(inputs, projection, mode) : [];
  const milestonePoints = projection?.annual.filter((point) => point.milestones.length > 0) ?? [];
  const selectedAllocationPoint = projection && allocationYear !== null
    ? closestAnnualPoint(projection.annual, allocationYear)
    : null;
  const selectedAllocationView = selectedAllocationPoint?.[mode];
  const allocationData = selectedAllocationView
    ? [
        { name: "Cash", value: selectedAllocationView.allocation.cash },
        { name: "Fixed income", value: selectedAllocationView.allocation.fixedIncome },
        { name: "Equity", value: selectedAllocationView.allocation.equity },
      ].filter((item) => item.value > 0)
    : [];
  const financialAccounts = inputs.accounts;
  const importedStartingFinancialAssets = startingFinancialAssets(
    baseline.projectionInputs.accounts,
  );
  const activeMonthlyIncome = monthlyEmploymentNetCash(inputs);
  const activeMonthlyContributions = monthlyInvestmentContributions(inputs);
  const activeWarnings = resolveActiveScenarioWarnings(baseline, inputs);
  const surplusTotals =
    projection?.surplusAllocation.throughRetirement[mode];
  const savingsTotals =
    projection?.savingsPolicy.throughRetirement[mode];
  const reserveAccounts = inputs.surplusAllocation.reserveAccountIds.map(
    (accountId) =>
      inputs.accounts.find((account) => account.id === accountId)!,
  );
  const reserveRefillAccount = inputs.accounts.find(
    (account) =>
      account.id === inputs.surplusAllocation.reserveRefillAccountId,
  );
  const destinationAccountId =
    inputs.surplusAllocation.excess.mode === "allocate_to_account"
      ? inputs.surplusAllocation.excess.destinationAccountId
      : null;
  const destinationAccount =
    destinationAccountId
      ? inputs.accounts.find(
          (account) => account.id === destinationAccountId,
        )
      : null;
  const projectionOnlyAccounts = inputs.accounts.filter(
    (account) => account.origin === "projection_configuration",
  );
  const policyPreview = buildSavingsPolicyPreview(inputs);
  const explanationDocument =
    projection && activeExplanation
      ? buildExplanation(activeExplanation.target, {
          baseline,
          inputs,
          overrides,
          projection,
          displayMode: mode,
          selectedAllocationYear:
            selectedAllocationPoint?.calendarYear ??
            allocationYear ??
            projection.annual[0]?.calendarYear ??
            Number(inputs.startDate.slice(0, 4)),
        })
      : null;

  return (
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">Retirement lifecycle report</span>
          <h1>Your live financial baseline, projected forward.</h1>
          <p>
            Lunch Money transactions and balances drive every chart. Private assumptions and temporary overrides remain explicit.
          </p>
        </div>
        <div className="hero-actions no-print">
          <button className="button secondary" onClick={() => window.print()}>Print</button>
          <button
            className="button"
            onClick={() => void download(
              "/api/v1/exports/projection",
              projectionJsonFilename(new Date().toISOString()),
            )}
          >
            Export JSON
          </button>
        </div>
      </header>

      <section className="connection-panel">
        <div>
          <span className="connection-badge connected">Lunch Money connected · read-only</span>
          <strong>Data through {baseline.dataThrough}</strong>
          <small>
            {baseline.transactionWindow.startDate}–{baseline.transactionWindow.endDate} · {baseline.transactionWindow.trailingMonths} months
          </small>
        </div>
        <dl className="connection-stats">
          <div><dt>Transactions</dt><dd>{baseline.recordsAnalyzed.transactions}</dd></div>
          <div><dt>Accounts</dt><dd>{baseline.recordsAnalyzed.accounts}</dd></div>
          <div><dt>Recurring</dt><dd>{baseline.recordsAnalyzed.recurringItems}</dd></div>
          <div><dt>Unmapped accounts</dt><dd>{baseline.unmappedAccounts.length}</dd></div>
          <div><dt>Unmapped categories</dt><dd>{baseline.unmappedCategories.length}</dd></div>
        </dl>
        <button className="button secondary no-print" onClick={() => void refresh()}>Refresh Lunch Money</button>
      </section>

      {activeWarnings.length > 0 ? (
        <section className="warning-panel" aria-label="Baseline warnings">
          {activeWarnings.map((warning, index) => (
            <p key={`${warning.code}-${index}`}>{warning.message}</p>
          ))}
        </section>
      ) : null}

      <section className="toolbar no-print" aria-label="Report controls">
        <div className="segmented">
          <button className={mode === "real" ? "active" : ""} onClick={() => setMode("real")}>
            Today&apos;s dollars
          </button>
          <button className={mode === "nominal" ? "active" : ""} onClick={() => setMode("nominal")}>
            Future dollars
          </button>
        </div>
        <button
          type="button"
          className="button secondary scenario-controls-trigger"
          aria-expanded={scenarioControls !== null}
          aria-controls="scenario-controls-drawer"
          onClick={(event) => {
            setActiveExplanation(null);
            setScenarioControls({ opener: event.currentTarget });
          }}
        >
          Scenario controls
        </button>
        <span className="status">
          {projectionError || exportStatus || (projecting ? "Recalculating…" : "Live baseline active")}
        </span>
      </section>

      {projectionError ? (
        <section className="blocking-card" role="alert">
          <h2>Projection blocked</h2>
          <p>{projectionError}</p>
        </section>
      ) : null}

      {projection ? (
        <>
          <section className="summary-grid" aria-label="Projection summary">
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="starting-financial-assets"
                title="Starting financial assets"
                onExplain={openExplanation}
              />
              <strong>{currency.format(importedStartingFinancialAssets)}</strong>
              <small>Imported balances as of {baseline.dataThrough} · liabilities shown separately</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="assets-at-retirement"
                title="Retirement funding assets"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.financialAssetsAtRetirementToday)}</strong>
              <small>{projection.summary.retirementDate} · home equity unavailable</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="total-net-worth"
                title="Home equity"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.homeEquityAtRetirementToday)}</strong>
              <small>Residence less linked mortgage at retirement</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="liability-schedule"
                title="Total liabilities"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.liabilitiesAtRetirementToday)}</strong>
              <small>
                {projection.summary.mortgagePayoffDate
                  ? `Mortgage payoff ${projection.summary.mortgagePayoffDate}`
                  : "At retirement"}
              </small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="total-net-worth"
                title="Total net worth"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.totalNetWorthAtRetirementToday)}</strong>
              <small>Financial and non-financial assets less liabilities</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="retirement-goal"
                title="Goal"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.retirementGoalToday)}</strong>
              <small>Financial-asset target</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="goal-gap"
                title="Goal gap"
                onExplain={openExplanation}
              />
              <strong>{currency.format(projection.summary.goalGapToday)}</strong>
              <small>{projection.summary.goalGapToday >= 0 ? "Above goal" : "Below goal"}</small>
            </article>
            <article className="metric-card">
              <ExplainableHeading
                compact
                headingLevel="span"
                target="financial-assets-duration"
                title="Financial assets duration"
                onExplain={openExplanation}
              />
              <strong>
                {projection.summary.financialAssetsDepletionAge === null
                  ? `Past age ${inputs.endAge}`
                  : `To age ${projection.summary.financialAssetsDepletionAge}`}
              </strong>
              <small>Cash and investment accounts</small>
            </article>
          </section>

          <section className="report-layout">
            <div className="report-column">
              <article className="report-card wide-chart">
                <ExplainableHeading
                  kicker="Expenses"
                  target="annual-spending"
                  title="Annual spending projection"
                  onExplain={openExplanation}
                  trailing={<span className="pill">{mode === "real" ? "Today’s dollars" : "Future dollars"}</span>}
                />
                <div className="chart-shell medium">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="essential" name="Essential" stackId="expenses" fill="#55b8d8" />
                      <Bar dataKey="discretionary" name="Discretionary" stackId="expenses" fill="#8c78dd" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              {inputs.registeredAccountRoom ? (
                <article className="report-card wide-chart">
                  <ExplainableHeading
                    kicker="Registered room"
                    target="registered-account-room"
                    title="Annual registered room and contributions"
                    onExplain={openExplanation}
                    trailing={<span className="pill">Nominal regulatory dollars</span>}
                  />
                  <div className="chart-shell medium">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData}>
                        <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                        <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                        <Tooltip formatter={(value) => currency.format(Number(value))} />
                        <Legend />
                        <Bar dataKey="actualContributions" name="Actual contributions" fill="#70d6b2" />
                        <Bar dataKey="unallocatedContributions" name="Unallocated" fill="#ef7d86" />
                        <Line dataKey="tfsaRoomClosing" name="TFSA closing room" stroke="#55b8d8" strokeWidth={2} dot={false} />
                        <Line dataKey="rrspRoomClosing" name="RRSP closing room" stroke="#d8bd65" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </article>
              ) : null}

              <article className="report-card wide-chart">
                <ExplainableHeading
                  kicker="Surplus policy"
                  target="surplus-allocation"
                  title={
                    inputs.savingsPolicy.mode === "simple"
                      ? "Annual explicit savings and retained cash"
                      : "Annual surplus allocation"
                  }
                  onExplain={openExplanation}
                />
                <div className="chart-shell medium">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      {inputs.savingsPolicy.mode === "simple" ? (
                        <>
                          <Bar dataKey="reserveCashRetained" name="Reserve plan retained" fill="#55b8d8" />
                          <Bar dataKey="reservePlanRedirected" name="Reserve plan invested" fill="#8c78dd" />
                          <Bar dataKey="unplannedCashRetained" name="Unplanned cash retained" fill="#70d6b2" />
                        </>
                      ) : (
                        <>
                          <Bar dataKey="surplusRetainedAsCash" name="Retained as cash" fill="#55b8d8" />
                          <Bar dataKey="surplusRedirected" name="Redirected" fill="#8c78dd" />
                        </>
                      )}
                      <Line dataKey="surplusReserveTarget" name="Active reserve target" stroke="#f2bd63" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="report-card wide-chart">
                <ExplainableHeading
                  kicker="Cash inflow"
                  target="annual-funding"
                  title="How each year is funded"
                  onExplain={openExplanation}
                />
                <div className="chart-shell tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="employmentNetCash" name="Employment (net deposited cash)" stackId="inflow" fill="#3f78c5" />
                      <Bar dataKey="cpp" name="CPP" stackId="inflow" fill="#4eb5d2" />
                      <Bar dataKey="oas" name="OAS" stackId="inflow" fill="#77d2b2" />
                      <Bar dataKey="pension" name="Pension" stackId="inflow" fill="#a9cf6c" />
                      <Bar dataKey="cashWithdrawal" name="Cash" stackId="inflow" fill="#d8bd65" />
                      <Bar dataKey="nonRegisteredWithdrawal" name="Non-registered" stackId="inflow" fill="#d99269" />
                      <Bar dataKey="rrspWithdrawal" name="RRSP / RRIF" stackId="inflow" fill="#b978b8" />
                      <Bar dataKey="tfsaWithdrawal" name="TFSA" stackId="inflow" fill="#8072d7" />
                      <Line dataKey="tax" name="Simplified retirement tax" stroke="#ef7d86" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="report-card wide-chart">
                <ExplainableHeading
                  kicker="Cash outflow"
                  target="annual-outflows"
                  title="Spending, liability payments, taxes, and contributions"
                  onExplain={openExplanation}
                />
                <div className="chart-shell medium">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      <Bar dataKey="essential" name="Essential" stackId="outflow" fill="#55b8d8" />
                      <Bar dataKey="discretionary" name="Discretionary" stackId="outflow" fill="#8c78dd" />
                      <Bar dataKey="oneTime" name="One-time events" stackId="outflow" fill="#d99269" />
                      <Bar dataKey="liabilityCashPayment" name="Liability payments" stackId="outflow" fill="#d8bd65" />
                      <Bar dataKey="tax" name="Simplified retirement tax" stackId="outflow" fill="#ef7d86" />
                      <Bar dataKey="contributions" name="Cash-funded contributions" stackId="outflow" fill="#70d6b2" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>

              {inputs.nonFinancialAssets.length > 0 ||
              inputs.liabilities.length > 0 ? (
                <>
                  <article className="report-card wide-chart">
                    <ExplainableHeading
                      kicker="Balance sheet"
                      target="total-net-worth"
                      title="Assets and total net worth"
                      onExplain={openExplanation}
                    />
                    <div className="chart-shell medium">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                          <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                          <Tooltip formatter={(value) => currency.format(Number(value))} />
                          <Legend />
                          <Line dataKey="financialAssets" name="Retirement funding assets" stroke="#55b8d8" strokeWidth={2} dot={false} />
                          <Line dataKey="residenceValue" name="Residence value" stroke="#d8bd65" strokeWidth={2} dot={false} />
                          <Line dataKey="totalNetWorth" name="Total net worth" stroke="#f6f8fb" strokeWidth={3} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                  <article className="report-card wide-chart">
                    <ExplainableHeading
                      kicker="Home and liabilities"
                      target="liability-schedule"
                      title="Liabilities and home equity"
                      onExplain={openExplanation}
                    />
                    <div className="chart-shell medium">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                          <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                          <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                          <Tooltip formatter={(value) => currency.format(Number(value))} />
                          <Legend />
                          <Area dataKey="homeEquity" name="Home equity" fill="#70d6b2" stroke="#70d6b2" />
                          <Line dataKey="mortgageBalance" name="Mortgage balance" stroke="#ef7d86" strokeWidth={3} dot={false} />
                          <Line dataKey="totalLiabilities" name="Total liabilities" stroke="#d99269" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </article>
                </>
              ) : null}

              <article className="report-card wide-chart">
                <ExplainableHeading
                  kicker="Financial assets"
                  target="account-burndown"
                  title="Account-level burndown"
                  onExplain={openExplanation}
                />
                <div className="chart-shell tall">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#24364d" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="year" stroke="#9eb0c4" minTickGap={28} />
                      <YAxis stroke="#9eb0c4" tickFormatter={compactCurrency} width={72} />
                      <Tooltip
                        formatter={(value) => currency.format(Number(value))}
                        labelFormatter={(label, payload) =>
                          payload[0]?.payload?.periodLabel ?? label
                        }
                      />
                      <Legend />
                      {financialAccounts.map((account, index) => (
                        <Area
                          key={account.id}
                          dataKey={`account:${account.id}`}
                          name={account.label}
                          stackId="balances"
                          fill={accountColors[index % accountColors.length]}
                          stroke={accountColors[index % accountColors.length]}
                        />
                      ))}
                      <Line dataKey="financialAssets" name="Financial assets" stroke="#f6f8fb" strokeWidth={3} dot={false} />
                      <Line dataKey="goal" name="Goal" stroke="#f2bd63" strokeWidth={2} strokeDasharray="7 6" dot={false} />
                      {milestonePoints.slice(0, 10).map((point) => (
                        <ReferenceLine key={`${point.calendarYear}-${point.milestones.join("-")}`} x={point.calendarYear} stroke="#9eb0c4" strokeDasharray="4 4" />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="milestone-list">
                  {milestonePoints.map((point) => (
                    <span className="milestone" key={`${point.calendarYear}-${point.milestones.join("-")}`}>
                      {point.calendarYear}: {point.milestones.join(" · ")}
                    </span>
                  ))}
                </div>
              </article>

              <div className="two-column">
                <article className="report-card">
                  <ExplainableHeading
                    kicker="Allocation"
                    target="asset-allocation"
                    title={`Asset allocation in ${selectedAllocationPoint?.calendarYear ?? "selected year"}`}
                    onExplain={openExplanation}
                  />
                  <div className="chart-shell compact">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={allocationData} dataKey="value" nameKey="name" innerRadius="48%" outerRadius="78%" paddingAngle={2} label={({ name, percent: share }) => `${name} ${Math.round((share ?? 0) * 100)}%`}>
                          {allocationData.map((item, index) => <Cell key={item.name} fill={accountColors[index % accountColors.length]} />)}
                        </Pie>
                        <Tooltip formatter={(value) => currency.format(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  {allocationYear !== null ? (
                    <label className="allocation-slider no-print">
                      Year {allocationYear}
                      <input type="range" min={projection.annual[0]!.calendarYear} max={projection.annual.at(-1)!.calendarYear} value={allocationYear} onChange={(event) => setAllocationYear(Number(event.target.value))} />
                    </label>
                  ) : null}
                </article>

                <article className="report-card">
                  <div className="section-heading">
                    <div><span className="section-kicker">Observations</span><h2>Deterministic report notes</h2></div>
                  </div>
                  <div className="observation-list">
                    {projection.observations.map((observation) => (
                      <div className="observation" key={observation.code}>
                        <span>{observation.age ? `Age ${observation.age}` : "Projection"}</span>
                        <p>{observation.message}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <article className="report-card">
                <ExplainableHeading
                  kicker="Annual details"
                  target="annual-ledger"
                  title="Inspectable projection ledger"
                  onExplain={openExplanation}
                  trailing={<button className="button secondary no-print" onClick={() => void download(`/api/v1/exports/projection-csv?mode=${mode}`, projectionCsvFilename(new Date().toISOString(), mode))}>Export CSV</button>}
                />
                <div className="table-shell">
                  <table>
                    <thead><tr><th>Year</th><th>Age</th><th>Income</th><th>Withdrawals</th><th>Tax</th><th>Spending</th><th>Liability payments</th><th>Actual contributions</th><th>{inputs.savingsPolicy.mode === "simple" ? "Reserve-plan investing" : "Surplus funded"}</th><th>Financial assets</th><th>Total net worth</th><th>Milestones</th></tr></thead>
                    <tbody>
                      {ledgerData.map((row) => (
                        <tr key={row.year}>
                          <td>{row.periodLabel}</td><td>{row.age}</td><td>{currency.format(row.income)}</td><td>{currency.format(row.withdrawals)}</td><td>{currency.format(row.tax)}</td>
                          <td>{currency.format(row.spending)}</td><td>{currency.format(row.liabilityCashPayment)}</td><td>{currency.format(row.actualContributions)}</td><td>{currency.format(row.surplusFundedContributions)}</td><td>{currency.format(row.financialAssets)}</td><td>{currency.format(row.totalNetWorth)}</td><td>{row.milestones}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            </div>

            <aside className="controls-panel controls-panel-desktop no-print">
              <ScenarioControlsPanel
                baseline={baseline}
                inputs={inputs}
                controls={controls}
                overrides={overrides}
                setOverrides={setOverrides}
                idPrefix="desktop"
              />
            </aside>
          </section>

          <section className="report-card assumptions">
            <div className="section-heading"><div><span className="section-kicker">Live baseline</span><h2>Resolved inputs and provenance</h2></div></div>
            <div className="assumption-grid">
              <div>
                <h3>Cash flow</h3>
                <dl>
                  <div>
                    <dt><ExplainableHeading compact headingLevel="span" target="baseline-income" title="Monthly employment income" onExplain={openExplanation} /></dt>
                    <dd>{currency.format(activeMonthlyIncome)}</dd>
                  </div>
                  <div>
                    <dt><ExplainableHeading compact headingLevel="span" target="baseline-essential" title="Essential spending" onExplain={openExplanation} /></dt>
                    <dd>{currency.format(inputs.monthlyEssentialSpendingToday)}</dd>
                  </div>
                  <div>
                    <dt><ExplainableHeading compact headingLevel="span" target="baseline-discretionary" title="Discretionary spending" onExplain={openExplanation} /></dt>
                    <dd>{currency.format(inputs.monthlyDiscretionarySpendingToday)}</dd>
                  </div>
                  <div>
                    <dt><ExplainableHeading compact headingLevel="span" target="baseline-contributions" title="Investment contributions" onExplain={openExplanation} /></dt>
                    <dd>{currency.format(activeMonthlyContributions)}</dd>
                  </div>
                  <div>
                    <dt><ExplainableHeading compact headingLevel="span" target="baseline-recurring" title="Recurring expenses" onExplain={openExplanation} /></dt>
                    <dd>{currency.format(baseline.derived.recurringExpenses.monthlyTotal)}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3>Employment income path</h3>
                <dl>
                  {inputs.person.employmentIncomePhases.map((phase) => {
                    const overrideKey =
                      `employmentPhase.${phase.id}.annualNetCashToday`;
                    const provenanceKey =
                      `person.employmentIncomePhases.${phase.id}.annualNetCashToday`;
                    return (
                      <div key={phase.id}>
                        <dt>
                          {phase.label} · age {phase.startAge}–{phase.endAge} (end exclusive)
                        </dt>
                        <dd>
                          {currency.format(phase.annualNetCashToday)} ·{" "}
                          {overrides[overrideKey] !== undefined
                            ? "temporary override"
                            : sourceLabel(baseline, provenanceKey)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
              <div>
                <h3>Government benefits</h3>
                <dl>
                  <div>
                    <dt>
                      <ExplainableHeading
                        compact
                        headingLevel="span"
                        target="cpp-benefit"
                        title="Canada Pension Plan (CPP)"
                        onExplain={openExplanation}
                      />
                    </dt>
                    <dd>
                      {benefitSourceLabel(
                        baseline,
                        "person.cpp.amountSourceMode",
                      )} · {exactCurrency.format(
                        projection.governmentBenefits.cpp
                          .baseMonthlyAmountAt65Today,
                      )} at 65 · claim age{" "}
                      {projection.governmentBenefits.cpp.claimAge} ·{" "}
                      {exactCurrency.format(
                        projection.governmentBenefits.cpp
                          .monthlyAmountAtClaimToday,
                      )} at claim
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <ExplainableHeading
                        compact
                        headingLevel="span"
                        target="oas-benefit"
                        title="Old Age Security (OAS)"
                        onExplain={openExplanation}
                      />
                    </dt>
                    <dd>
                      {benefitSourceLabel(
                        baseline,
                        "person.oas.fullAmountSourceMode",
                      )} · {exactCurrency.format(
                        projection.governmentBenefits.oas
                          .fullBaseMonthlyAmountAt65Today,
                      )} full amount ·{" "}
                      {projection.governmentBenefits.oas.eligibilityMode}{" "}
                      {percent.format(
                        projection.governmentBenefits.oas
                          .eligibilityFraction,
                      )} · claim age{" "}
                      {projection.governmentBenefits.oas.claimAge} ·{" "}
                      {exactCurrency.format(
                        projection.governmentBenefits.oas
                          .monthlyAmountAtClaimToday,
                      )} at claim ·{" "}
                      {percent.format(
                        projection.governmentBenefits.oas.age75IncreaseRate,
                      )} increase after age 75
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <h3>{inputs.savingsPolicy.mode === "simple" ? "Resolved savings policy" : "Surplus allocation policy"}</h3>
                {inputs.savingsPolicy.mode === "simple" ? (
                  <dl>
                    <div><dt>Policy mode</dt><dd>Simple owner intent</dd></div>
                    <div><dt>Reserve accounts</dt><dd>{policyPreview.reserveAccounts.join(", ")}</dd></div>
                    <div><dt>Reserve refill account</dt><dd>{policyPreview.reserveRefillAccount}</dd></div>
                    <div><dt>Operating cash account</dt><dd>{policyPreview.operatingCashAccount}</dd></div>
                    <div><dt>Target reserve today</dt><dd>{currency.format(inputs.surplusAllocation.targetCashReserveToday)}</dd></div>
                    <div><dt>Reserve indexing</dt><dd>{percent.format(inputs.surplusAllocation.reserveIndexingRate)}</dd></div>
                    <div><dt>Combined reserve at retirement</dt><dd>{currency.format(projection.surplusAllocation.reserveAccountsBalanceAtRetirement[mode])}</dd></div>
                    <div><dt>Workplace room priority</dt><dd>{policyPreview.workplacePriority}</dd></div>
                    <div><dt>Workplace overflow</dt><dd>{policyPreview.workplaceOverflow}</dd></div>
                    <div><dt>Personal order</dt><dd>{policyPreview.personalOrder}</dd></div>
                    <div><dt>Taxable destination</dt><dd>{policyPreview.taxableDestination} · {policyPreview.taxableDestinationKind}</dd></div>
                    <div><dt>Reserve transition</dt><dd>{policyPreview.reserveTransition}</dd></div>
                    <div><dt>Unplanned cash</dt><dd>{policyPreview.unplannedCash}</dd></div>
                    <div><dt>Personal planned through retirement</dt><dd>{currency.format(savingsTotals?.personalPlanned ?? 0)}</dd></div>
                    <div><dt>Reserve planned through retirement</dt><dd>{currency.format(savingsTotals?.reservePlanned ?? 0)}</dd></div>
                    <div><dt>Reserve invested after target</dt><dd>{currency.format(savingsTotals?.reserveRedirected ?? 0)}</dd></div>
                    <div><dt>Workplace unallocated</dt><dd>{currency.format(savingsTotals?.workplaceUnallocated ?? 0)}</dd></div>
                    <div><dt>Unplanned cash retained</dt><dd>{currency.format(savingsTotals?.unplannedCashRetained ?? 0)}</dd></div>
                  </dl>
                ) : (
                  <dl>
                    <div><dt>Reserve accounts</dt><dd>{reserveAccounts.map((account) => account.label).join(", ") || "Unavailable"}</dd></div>
                    <div><dt>Reserve refill account</dt><dd>{reserveRefillAccount?.label ?? "Unavailable"}</dd></div>
                    <div><dt>Target reserve today</dt><dd>{currency.format(inputs.surplusAllocation.targetCashReserveToday)}</dd></div>
                    <div><dt>Reserve indexing</dt><dd>{percent.format(inputs.surplusAllocation.reserveIndexingRate)}</dd></div>
                    <div><dt>Excess mode</dt><dd>{inputs.surplusAllocation.excess.mode.replaceAll("_", " ")}</dd></div>
                    {destinationAccount ? <div><dt>Destination account</dt><dd>{destinationAccount.label}</dd></div> : null}
                    <div><dt>Surplus generated through retirement</dt><dd>{currency.format(surplusTotals?.generated ?? 0)}</dd></div>
                    <div><dt>Retained as cash through retirement</dt><dd>{currency.format(surplusTotals?.retainedAsCash ?? 0)}</dd></div>
                    <div><dt>Redirected through retirement</dt><dd>{currency.format(surplusTotals?.redirected ?? 0)}</dd></div>
                  </dl>
                )}
              </div>
              {inputs.registeredAccountRoom ? (
                <div>
                  <h3>Registered room and contribution routing</h3>
                  <dl>
                    <div><dt>Starting TFSA room</dt><dd>{currency.format(inputs.registeredAccountRoom.tfsa.startingAvailableRoom.amount)} · {inputs.savingsPolicy.mode === "simple" ? "owner supplied" : inputs.registeredAccountRoom.tfsa.startingAvailableRoom.source.replaceAll("_", " ")}</dd></div>
                    <div><dt>Starting RRSP room</dt><dd>{currency.format(inputs.registeredAccountRoom.rrsp.startingAvailableDeductionRoom.amount)} · {inputs.savingsPolicy.mode === "simple" ? "owner supplied" : inputs.registeredAccountRoom.rrsp.startingAvailableDeductionRoom.source.replaceAll("_", " ")}</dd></div>
                    <div><dt>TFSA carry-forward</dt><dd>{inputs.registeredAccountRoom.tfsa.carryForwardUnusedRoom ? "Enabled" : "Disabled scenario"}</dd></div>
                    <div><dt>RRSP carry-forward</dt><dd>{inputs.registeredAccountRoom.rrsp.carryForwardUnusedRoom ? "Enabled" : "Disabled scenario"}</dd></div>
                    <div><dt>TFSA annual-limit source</dt><dd>Published Canadian reference through 2026; later years are configured forecasts</dd></div>
                    <div><dt>RRSP annual-cap source</dt><dd>Published Canadian references through 2027; later years are configured forecasts</dd></div>
                    <div><dt>Current-period planned</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.planned ?? 0)}</dd></div>
                    <div><dt>Current-period allowed from planned routes</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.allowed ?? 0)}</dd></div>
                    <div><dt>{inputs.savingsPolicy.mode === "simple" ? "Current-period reserve-plan investing" : "Current-period surplus funded"}</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.surplusFunded ?? 0)}</dd></div>
                    <div><dt>Current-period total actual</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.total ?? 0)}</dd></div>
                    <div><dt>Current-period redirected</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.redirected ?? 0)}</dd></div>
                    <div><dt>Current-period unallocated</dt><dd>{currency.format(projection.annual[0]?.[mode].contributions.unallocated ?? 0)}</dd></div>
                    <div><dt>TFSA closing room</dt><dd>{currency.format(projection.annual[0]?.[mode].registeredAccountRoom.tfsa.closingRoom ?? 0)}</dd></div>
                    <div><dt>RRSP closing room</dt><dd>{currency.format(projection.annual[0]?.[mode].registeredAccountRoom.rrsp.closingRoom ?? 0)}</dd></div>
                    <div><dt>Room denomination</dt><dd>Nominal regulatory dollars · unaffected by display mode</dd></div>
                  </dl>
                </div>
              ) : null}
              {inputs.nonFinancialAssets.length > 0 ||
              inputs.liabilities.length > 0 ? (
                <div>
                  <ExplainableHeading
                    compact
                    headingLevel="h3"
                    target="total-net-worth"
                    title="Residence and liabilities"
                    onExplain={openExplanation}
                  />
                  <dl>
                    {inputs.nonFinancialAssets.map((asset) => (
                      <div key={asset.id}>
                        <dt>{asset.label}</dt>
                        <dd>
                          {currency.format(asset.openingValue)} as of{" "}
                          {asset.valueAsOf} ·{" "}
                          {percent.format(asset.annualAppreciation)} annual
                          appreciation ·{" "}
                          {asset.origin === "lunchmoney"
                            ? "imported residence value"
                            : "configured residence fallback"}{" "}
                          · unavailable for withdrawals
                        </dd>
                      </div>
                    ))}
                    {inputs.liabilities.map((liability) => (
                      <div key={liability.id}>
                        <dt>{liability.label}</dt>
                        <dd>
                          {liability.treatment.mode === "amortizing"
                            ? `${percent.format(liability.treatment.annualInterestRate)} · ${exactCurrency.format(liability.treatment.regularPayment.amount)} ${liability.treatment.regularPayment.frequency} · ${exactCurrency.format(liability.treatment.regularPayment.monthlyEquivalent)} monthly equivalent`
                            : liability.treatment.mode.replaceAll("_", " ")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <div>
                <h3>Personal settings</h3>
                <dl>
                  <div><dt>Current age</dt><dd>{inputs.person.currentAge}</dd></div>
                  <div><dt>Retirement age</dt><dd>{inputs.person.retirementAge}</dd></div>
                  <div><dt>CPP start age</dt><dd>{inputs.person.cpp.startAge}</dd></div>
                  <div><dt>OAS start age</dt><dd>{inputs.person.oas.startAge}</dd></div>
                  <div><dt>RRIF conversion age</dt><dd>{inputs.person.rrifConversionAge}</dd></div>
                </dl>
              </div>
              {projectionOnlyAccounts.length > 0 ? (
                <div>
                  <h3>Projection-only accounts</h3>
                  <dl>
                    {projectionOnlyAccounts.map((account) => (
                      <div key={account.id}>
                        <dt>{account.label} · {account.type.replaceAll("_", " ")}</dt>
                        <dd>
                          Projection-only configuration · zero opening balance ·{" "}
                          {percent.format(account.annualReturn)} return ·{" "}
                          {percent.format(account.allocation.cash)} cash /{" "}
                          {percent.format(account.allocation.fixedIncome)} fixed income /{" "}
                          {percent.format(account.allocation.equity)} equity
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              <div>
                <h3>Assumptions</h3>
                <dl>
                  <div><dt>Projection period</dt><dd>{inputs.startDate}–{projection.annual.at(-1)?.calendarYear}</dd></div>
                  <div><dt>Inflation</dt><dd>{percent.format(inputs.annualInflation)}</dd></div>
                  <div><dt>Simplified retirement tax rate</dt><dd>{percent.format(inputs.tax.effectiveTaxRate)}</dd></div>
                  <div><dt>Employment tax basis</dt><dd>Net cash; no second tax</dd></div>
                  <div><dt>Data through</dt><dd>{baseline.dataThrough}</dd></div>
                </dl>
              </div>
              <div>
                <ExplainableHeading
                  compact
                  headingLevel="h3"
                  target="lunchmoney-accounts"
                  title="Lunch Money accounts"
                  onExplain={openExplanation}
                />
                <dl>
                  {baseline.derived.accountBalances.map((account) => (
                    <div key={account.id}>
                      <dt>{account.name} · {account.plannerType.replaceAll("_", " ")}</dt>
                      <dd>{currency.format(account.balance)} · {account.balanceAsOf.slice(0, 10)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>
        </>
      ) : null}
      {explanationDocument && activeExplanation ? (
        <ExplanationDrawer
          document={explanationDocument}
          opener={activeExplanation.opener}
          onClose={closeExplanation}
        />
      ) : null}
      {scenarioControls ? (
        <ScenarioControlsDrawer
          opener={scenarioControls.opener}
          onClose={closeScenarioControls}
        >
          <ScenarioControlsPanel
            baseline={baseline}
            inputs={inputs}
            controls={controls}
            overrides={overrides}
            setOverrides={setOverrides}
            idPrefix="drawer"
          />
        </ScenarioControlsDrawer>
      ) : null}
    </main>
  );
}
