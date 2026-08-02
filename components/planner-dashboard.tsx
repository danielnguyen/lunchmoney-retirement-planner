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
import {
  organizeScenarioWarnings,
  resolveActiveScenarioWarnings,
} from "@/src/domain/baseline/scenario-warnings";
import type { CurrentBaseline } from "@/src/domain/baseline/types";
import { buildExplanation } from "@/src/domain/explanations/build";
import type { ExplanationTarget } from "@/src/domain/explanations/types";
import {
  buildAnnualChartData,
  buildAnnualLedgerData,
  buildSavingsPolicyPreview,
  closestAnnualPoint,
  type AnnualChartRow,
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
  ProjectionInputs,
  ProjectionResult,
  RetirementRequirementResult,
} from "@/src/domain/projection/types";
import {
  buildControls,
  controlDomainValue,
  controlInputValue,
  evaluateNumericDraft,
  humanScenarioSourceLabel,
  materializeInputs,
  type ControlDefinition,
  type Overrides,
} from "@/src/domain/scenario/controls";
import type {
  AppliedScenarioChange,
  ScenarioApplyResult,
  ScenarioPreview,
  SkippedScenarioChange,
} from "@/src/config/scenario-draft";

export {
  buildControls,
  controlDomainValue,
  controlInputValue,
  evaluateNumericDraft,
  materializeInputs,
} from "@/src/domain/scenario/controls";
export type {
  ControlDefinition,
  Overrides,
} from "@/src/domain/scenario/controls";

const currency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

const percent = new Intl.NumberFormat("en-CA", {
  style: "percent",
  maximumFractionDigits: 1,
});

function requirementSourceLabel(
  requirement: RetirementRequirementResult,
): string {
  if (
    requirement.minimumEndingBalanceActiveValueSource ===
    "scenario_override"
  ) {
    return "Temporary value from Try another plan";
  }
  return requirement.minimumEndingBalanceBaselineSource ===
    "compatibility_default"
    ? "Planner default because this setting is not in the configuration"
    : "Saved in the planner configuration";
}

const exactCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const accountColors = ["#d8bd65", "#d99269", "#8072d7", "#4eb5d2", "#70d6b2", "#a9cf6c"];

const AGE_INTEGER_EPSILON = 0.000001;
const overviewDate = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const overviewMonth = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export function formatOverviewDate(value: string): string {
  const date = parseCalendarDate(value);
  return date ? overviewDate.format(date) : value;
}

export function formatOverviewMonth(value: string): string {
  const date = parseCalendarDate(`${value}-01`);
  return date ? overviewMonth.format(date) : value;
}

export function wholeDollarComparison(differenceToday: number): {
  direction: "above" | "below" | "equal";
  amount: string;
} {
  const displayedMagnitude = Math.round(Math.abs(differenceToday));
  if (displayedMagnitude === 0) {
    return { direction: "equal", amount: currency.format(0) };
  }
  return {
    direction: differenceToday > 0 ? "above" : "below",
    amount: currency.format(displayedMagnitude),
  };
}

export function formatPersonalTargetComparison(
  differenceToday: number,
  targetToday: number,
): string {
  const comparison = wholeDollarComparison(differenceToday);
  if (comparison.direction === "equal") {
    return `On target for ${currency.format(targetToday)}`;
  }
  return `${comparison.amount} ${comparison.direction} your ${currency.format(targetToday)} target`;
}

export function formatCalculatedMinimumComparison(
  differenceToday: number,
): string {
  const comparison = wholeDollarComparison(differenceToday);
  return comparison.direction === "equal"
    ? "Equal to the minimum needed for this plan"
    : `${comparison.amount} ${comparison.direction} the minimum needed for this plan`;
}

export function retirementSavingsDurationLabel(
  depletionAge: number | null,
  completion: ProjectionResult["projectionCompletion"],
): string {
  if (completion.status !== "complete") {
    const stoppedMessage = `The planner stopped after ${formatOverviewDate(completion.completedThroughDate)}, at age ${formatProjectedAge(completion.completedThroughAge)}`;
    return depletionAge === null
      ? `How long savings last is not established because the projection stopped after ${formatOverviewDate(completion.completedThroughDate)}, at age ${formatProjectedAge(completion.completedThroughAge)}.`
      : `Savings reached zero around age ${formatProjectedAge(depletionAge)}. ${stoppedMessage}, so the full plan was not calculated.`;
  }
  if (depletionAge === null) {
    return `Savings remain at age ${completion.plannedTerminalAge}.`;
  }
  return depletionAge < completion.plannedTerminalAge
    ? `Savings are projected to run out at age ${formatProjectedAge(depletionAge)}, before your planned final age of ${completion.plannedTerminalAge}.`
    : `Savings are projected to run out at age ${formatProjectedAge(depletionAge)}.`;
}

export function formatProjectedAge(age: number): string {
  const nearestInteger = Math.round(age);
  if (Math.abs(age - nearestInteger) <= AGE_INTEGER_EPSILON) {
    return String(nearestInteger);
  }
  return age.toFixed(1);
}

type YearAgeTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  chartData: ReadonlyArray<Pick<AnnualChartRow, "year" | "age">>;
};

export function YearAgeTick({
  x = 0,
  y = 0,
  payload,
  chartData,
}: YearAgeTickProps) {
  const year = Number(payload?.value);
  const row = chartData.find((candidate) => candidate.year === year);
  if (!Number.isFinite(year) || !row) return null;

  return (
    <g transform={`translate(${x}, ${y})`}>
      <text
        aria-label={`${year}, Age ${formatProjectedAge(row.age)}`}
        fill="#9eb0c4"
        textAnchor="middle"
      >
        <tspan x="0" dy="14">{year}</tspan>
        <tspan x="0" dy="15" fill="#7f93aa" fontSize="11">
          Age {formatProjectedAge(row.age)}
        </tspan>
      </text>
    </g>
  );
}

export function AnnualXAxis({
  chartData,
}: {
  chartData: ReadonlyArray<Pick<AnnualChartRow, "year" | "age">>;
}) {
  return (
    <XAxis
      className="annual-year-age-axis"
      dataKey="year"
      stroke="#9eb0c4"
      minTickGap={28}
      height={52}
      tickMargin={8}
      fontSize={12}
      tick={<YearAgeTick chartData={chartData} />}
    />
  );
}

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

function compactCurrency(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${Math.round(value)}`;
}

function sourceLabel(baseline: CurrentBaseline, key: string): string {
  return baseline.provenance[key]?.sourceType.replaceAll("_", " ") ?? "live baseline";
}

export function NumericScenarioControl({
  control,
  activeValue,
  minimum,
  maximum,
  inputId,
  synchronizationVersion,
  onCommit,
}: {
  control: ControlDefinition;
  activeValue: number;
  minimum: number;
  maximum: number;
  inputId: string;
  synchronizationVersion: number;
  onCommit: (value: number) => void;
}) {
  const inputMinimum = controlInputValue(control, minimum);
  const inputMaximum = controlInputValue(control, maximum);
  const activeDraftText = scenarioInputDraftText(control, activeValue);
  const [draftState, setDraftState] = useState(() => ({
    draft: activeDraftText,
    validationMessage: "",
    pendingCommit: null as number | null,
    observedActiveValue: activeValue,
    observedControl: control,
    observedSynchronizationVersion: synchronizationVersion,
  }));

  let resolvedDraftState = draftState;
  const explicitSynchronization =
    draftState.observedSynchronizationVersion !== synchronizationVersion ||
    draftState.observedControl !== control;
  if (
    explicitSynchronization ||
    !Object.is(draftState.observedActiveValue, activeValue)
  ) {
    const ownCommitArrived =
      !explicitSynchronization &&
      draftState.pendingCommit !== null &&
      Object.is(draftState.pendingCommit, activeValue);
    resolvedDraftState = {
      draft: ownCommitArrived ? draftState.draft : activeDraftText,
      validationMessage: ownCommitArrived ? draftState.validationMessage : "",
      pendingCommit: null,
      observedActiveValue: activeValue,
      observedControl: control,
      observedSynchronizationVersion: synchronizationVersion,
    };
    setDraftState(resolvedDraftState);
  }

  const { draft, validationMessage } = resolvedDraftState;

  const validationId = `${inputId}-validation`;

  function updateDraft(nextDraft: string) {
    const result = evaluateNumericDraft(nextDraft, inputMinimum, inputMaximum);
    if (result.status === "invalid") {
      setDraftState((current) => ({
        ...current,
        draft: nextDraft,
        validationMessage: result.message,
      }));
      return;
    }
    const domainValue = controlDomainValue(control, result.value);
    setDraftState((current) => ({
      ...current,
      draft: nextDraft,
      validationMessage: "",
      pendingCommit: domainValue,
    }));
    onCommit(domainValue);
  }

  function resolveDraftOnBlur() {
    const result = evaluateNumericDraft(draft, inputMinimum, inputMaximum);
    if (result.status === "valid") return;
    setDraftState((current) => ({
      ...current,
      draft: activeDraftText,
      validationMessage: "",
      pendingCommit: null,
    }));
  }

  return (
    <>
      <input
        id={inputId}
        type="number"
        min={inputMinimum}
        max={inputMaximum}
        step={control.step}
        value={draft}
        aria-invalid={validationMessage ? "true" : undefined}
        aria-describedby={validationMessage ? validationId : undefined}
        onChange={(event) => updateDraft(event.target.value)}
        onBlur={resolveDraftOnBlur}
      />
      {validationMessage ? (
        <small className="control-validation" id={validationId} aria-live="polite">
          {validationMessage}
        </small>
      ) : null}
    </>
  );
}

export function scenarioInputDraftText(
  control: ControlDefinition,
  domainValue: number,
): string {
  const inputValue = controlInputValue(control, domainValue);
  if (control.kind !== "percentage") return String(inputValue);

  // Multiplying a decimal rate into percentage points can expose an
  // insignificant binary floating-point tail. Fifteen significant digits
  // retain ordinary planner precision while producing stable input text.
  return String(Number(inputValue.toPrecision(15)));
}

export function ScenarioControlsPanel({
  baseline,
  inputs,
  controls,
  overrides,
  setOverrides,
  onApplyScenario,
  applyingScenario = false,
}: {
  baseline: CurrentBaseline;
  inputs: ProjectionInputs;
  controls: ControlDefinition[];
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  onApplyScenario?: () => void;
  applyingScenario?: boolean;
}) {
  const [synchronizationVersion, setSynchronizationVersion] = useState(0);

  function resetAll() {
    setOverrides({});
    setSynchronizationVersion((current) => current + 1);
  }

  return (
    <>
      <div className="section-heading">
        <div><span className="section-kicker">Scenario</span><h2>Calculator controls</h2></div>
        <button className="text-button" onClick={resetAll}>Reset all</button>
      </div>
      <p className="panel-copy">Reset restores this refreshed live baseline. Refresh clears every temporary override.</p>
      <div className="control-list">
        {controls.map((control) => {
          const baselineValue = control.get(baseline.projectionInputs);
          const currentValue = control.get(inputs);
          const overridden = overrides[control.key] !== undefined;
          const inputId = `drawer-${control.key}`;
          const source = humanScenarioSourceLabel(
            baseline.provenance[control.sourceKey],
            control,
          );
          return (
            <div className={`control ${overridden ? "is-overridden" : ""}`} key={control.key}>
              <div className="control-head">
                <label htmlFor={inputId}>{control.label}</label>
                <output>
                  {overridden ? "Scenario: " : ""}{control.format(currentValue)}
                </output>
              </div>
              {control.kind === "age" ? (
                <input
                  id={inputId}
                  type="range"
                  min={control.min(inputs)}
                  max={control.max(inputs)}
                  step={control.step}
                  value={currentValue}
                  onChange={(event) => setOverrides((current) => ({
                    ...current,
                    [control.key]: Number(event.target.value),
                  }))}
                />
              ) : (
                <NumericScenarioControl
                  control={control}
                  activeValue={currentValue}
                  minimum={control.min(inputs)}
                  maximum={control.max(inputs)}
                  inputId={inputId}
                  synchronizationVersion={synchronizationVersion}
                  onCommit={(value) => setOverrides((current) => ({
                    ...current,
                    [control.key]: value,
                  }))}
                />
              )}
              <div className="control-meta">
                <span>
                  {overridden ? `Baseline: ${control.format(baselineValue)} · ` : ""}
                  {source}
                </span>
                <button
                  className="text-button"
                  disabled={!overridden}
                  onClick={() => {
                    setOverrides((current) => {
                      const next = { ...current };
                      delete next[control.key];
                      return next;
                    });
                    setSynchronizationVersion((current) => current + 1);
                  }}
                >
                  Reset to {control.format(baselineValue)}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="scenario-apply-actions">
        <p>
          Applies supported temporary overrides to the YAML draft for review.
          Nothing is written until you press Save config.
        </p>
        <button
          type="button"
          className="button"
          disabled={
            applyingScenario ||
            Object.keys(overrides).length === 0 ||
            !onApplyScenario
          }
          onClick={onApplyScenario}
        >
          {applyingScenario ? "Reviewing scenario…" : "Apply scenario to config"}
        </button>
      </div>
    </>
  );
}

function focusableDrawerElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute("hidden"));
}

function RightSideDrawer({
  variant,
  drawerId,
  titleId,
  title,
  kicker,
  dialogLabel,
  closeLabel,
  opener,
  onClose,
  headerAction,
  children,
}: {
  variant: "scenario-controls" | "lunch-money-mappings";
  drawerId: string;
  titleId: string;
  title: string;
  kicker: string;
  dialogLabel?: string;
  closeLabel: string;
  opener: HTMLButtonElement | null;
  onClose: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    focusableDrawerElements(dialog)[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableDrawerElements(dialog!);
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
      className={`${variant}-overlay no-print`}
      data-testid={`${variant}-overlay`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        className={`${variant}-drawer`}
        id={drawerId}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        aria-labelledby={dialogLabel ? undefined : titleId}
      >
        <header className={`${variant}-drawer-header`}>
          <div>
            <span className="section-kicker">{kicker}</span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="drawer-header-actions">
            <button type="button" className="drawer-close" aria-label={closeLabel} onClick={onClose}>
              ×
            </button>
            {headerAction}
          </div>
        </header>
        <div className={`${variant}-drawer-content`}>{children}</div>
      </aside>
    </div>
  );
}

export type PlannerDrawerView = "controls" | "yaml";

export function PlannerConfigurationDrawer({
  view,
  controlsAvailable,
  onViewChange,
  opener,
  onClose,
  children,
}: {
  view: PlannerDrawerView;
  controlsAvailable: boolean;
  onViewChange: (view: PlannerDrawerView) => void;
  opener: HTMLButtonElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const showingControls = view === "controls";
  return (
    <RightSideDrawer
      variant="scenario-controls"
      drawerId="scenario-controls-drawer"
      titleId="scenario-controls-title"
      title={showingControls ? "Try another plan" : "Planner YAML"}
      kicker={showingControls ? "Scenario" : "Advanced configuration"}
      dialogLabel={showingControls ? undefined : "Planner YAML configuration"}
      closeLabel="Close planner configuration"
      opener={opener}
      onClose={onClose}
      headerAction={
        controlsAvailable ? (
          <button
            type="button"
            className="button secondary drawer-view-switch"
            onClick={() => onViewChange(showingControls ? "yaml" : "controls")}
          >
            {showingControls ? "Edit YAML" : "Back to plan controls"}
          </button>
        ) : null
      }
    >
      {children}
    </RightSideDrawer>
  );
}

export function LunchMoneyMappingsDrawer({
  mappings,
  opener,
  onClose,
}: {
  mappings: CurrentBaseline["lunchMoneyMappings"];
  opener: HTMLButtonElement | null;
  onClose: () => void;
}) {
  return (
    <RightSideDrawer
      variant="lunch-money-mappings"
      drawerId="lunch-money-mappings-drawer"
      titleId="lunch-money-mappings-title"
      title="Connected accounts"
      kicker="Read-only reference"
      closeLabel="Close connected accounts"
      opener={opener}
      onClose={onClose}
    >
      <section className="mapping-reference-section" aria-labelledby="mapping-reference-accounts">
        <h3 id="mapping-reference-accounts">Accounts</h3>
        <div className="mapping-reference-list">
          {mappings.accounts.map((account) => (
            <article className="mapping-reference-row" key={account.mappingId}>
              <code>{account.mappingId}</code>
              <strong>{account.label}</strong>
              {account.lunchMoneyId !== null ? (
                <small>Lunch Money ID: {account.lunchMoneyId}</small>
              ) : null}
              {account.description ? <p>{account.description}</p> : null}
            </article>
          ))}
        </div>
      </section>
      <section className="mapping-reference-section" aria-labelledby="mapping-reference-categories">
        <h3 id="mapping-reference-categories">Categories</h3>
        <div className="mapping-reference-list">
          {mappings.categories.map((category) => (
            <article className="mapping-reference-row" key={category.mappingId}>
              <code>{category.mappingId}</code>
              <strong>{category.name}</strong>
              {category.description ? <p>{category.description}</p> : null}
            </article>
          ))}
        </div>
      </section>
    </RightSideDrawer>
  );
}

export type PlannerConfigDocument = {
  contents: string;
  displayPath: string;
  writeEnabled: boolean;
  version: string;
};

export type ConfigReloadResult =
  | { ok: true }
  | { ok: false; message: string };

export type PlannerConfigDraftState = {
  document: PlannerConfigDocument | null;
  contents: string;
  revision: number;
  loading: boolean;
  busy: boolean;
  validation: "idle" | "valid" | "invalid";
  message: string;
  error: string;
  appliedSummary: Pick<
    ScenarioApplyResult,
    "appliedChanges" | "skippedChanges"
  > & { appliedRevision: number } | null;
};

function initialPlannerConfigDraft(): PlannerConfigDraftState {
  return {
    document: null,
    contents: "",
    revision: 0,
    loading: false,
    busy: false,
    validation: "idle",
    message: "",
    error: "",
    appliedSummary: null,
  };
}

async function configErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

function ChangeList({
  changes,
}: {
  changes: Array<AppliedScenarioChange | SkippedScenarioChange>;
}) {
  return (
    <ul>
      {changes.map((change) => (
        <li key={`${change.kind}-${change.key}`}>
          <strong>{change.label}</strong>
          <span>Active baseline: {change.formattedActiveBaselineValue}</span>
          {change.draftDestinations.map((destination) => (
            <span key={destination.displayName}>
              {destination.sourceKind === "live_baseline"
                ? "Current YAML source"
                : "Current YAML draft"}
              {change.destinationCount > 1 ? ` — ${destination.displayName}` : ""}:
              {" "}{destination.formattedCurrentValue}
            </span>
          ))}
          <span>Scenario: {change.formattedScenarioValue}</span>
          {change.destinationCount > 1 ? (
            <span>{change.destinationCount} YAML destinations</span>
          ) : null}
          {change.kind === "scenario_only" ||
          change.kind === "live_baseline_kept" ? (
            <span>{change.consequence}</span>
          ) : null}
          <small>{change.source}</small>
        </li>
      ))}
    </ul>
  );
}

export function AppliedScenarioSummary({
  summary,
  stale,
}: {
  summary: NonNullable<PlannerConfigDraftState["appliedSummary"]>;
  stale: boolean;
}) {
  const direct = summary.appliedChanges.filter(
    (change) => change.kind === "config",
  );
  const replaced = summary.appliedChanges.filter(
    (change) => change.kind === "live_baseline_conversion",
  );
  const keptLive = summary.skippedChanges.filter(
    (change) => change.kind === "live_baseline_kept",
  );
  const scenarioOnly = summary.skippedChanges.filter(
    (change) => change.kind === "scenario_only",
  );
  return (
    <section className="scenario-change-summary" aria-labelledby="scenario-change-summary-title">
      <h3 id="scenario-change-summary-title">Last scenario application</h3>
      <p>Applied to YAML draft only—review these changes and press Save config separately.</p>
      {stale ? (
        <p className="scenario-summary-stale" role="status">
          The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.
        </p>
      ) : null}
      {direct.length > 0 ? (
        <div>
          <h4>Applied config changes</h4>
          <ChangeList changes={direct} />
        </div>
      ) : null}
      {replaced.length > 0 ? (
        <div>
          <h4>Replaced live-derived values</h4>
          <ChangeList changes={replaced} />
        </div>
      ) : null}
      {keptLive.length > 0 ? (
        <div>
          <h4>Kept live</h4>
          <ChangeList changes={keptLive} />
        </div>
      ) : null}
      {scenarioOnly.length > 0 ? (
        <div>
          <h4>Scenario-only values not applied</h4>
          <ChangeList changes={scenarioOnly} />
        </div>
      ) : null}
      {summary.appliedChanges.length === 0 ? (
        <p><strong>No YAML values changed.</strong> All overrides remain temporary.</p>
      ) : null}
    </section>
  );
}

export function PlannerConfigEditor({
  draft,
  setDraft,
  onSaved,
  onRevert,
}: {
  draft: PlannerConfigDraftState;
  setDraft: React.Dispatch<React.SetStateAction<PlannerConfigDraftState>>;
  onSaved: () => Promise<ConfigReloadResult>;
  onRevert: () => Promise<void>;
}) {
  async function validate(): Promise<boolean> {
    setDraft((current) => ({
      ...current,
      busy: true,
      message: "",
      error: "",
    }));
    try {
      const response = await fetch("/api/v1/config/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: draft.contents }),
      });
      if (!response.ok) {
        const error = await configErrorMessage(
          response,
          "The YAML is not a valid planner configuration.",
        );
        setDraft((current) => ({
          ...current,
          validation: "invalid",
          error,
        }));
        return false;
      }
      setDraft((current) => ({
        ...current,
        validation: "valid",
        message: "Configuration is valid. No file was changed.",
      }));
      return true;
    } catch {
      setDraft((current) => ({
        ...current,
        validation: "invalid",
        error: "The configuration could not be validated.",
      }));
      return false;
    } finally {
      setDraft((current) => ({ ...current, busy: false }));
    }
  }

  async function save() {
    if (!draft.document?.writeEnabled) return;
    if (!(await validate())) return;

    setDraft((current) => ({
      ...current,
      busy: true,
      message: "",
      error: "",
    }));
    try {
      const response = await fetch("/api/v1/config/current", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: draft.contents,
          expectedVersion: draft.document.version,
        }),
      });
      if (!response.ok) {
        const error = await configErrorMessage(
          response,
          "The planner configuration could not be saved.",
        );
        setDraft((current) => ({ ...current, error }));
        return;
      }
      const saved = (await response.json()) as { version: string };
      setDraft((current) => ({
        ...current,
        document: current.document
          ? {
              ...current.document,
              contents: current.contents,
              version: saved.version,
            }
          : current.document,
        message: "Configuration saved. Reloading the active baseline…",
      }));
      let reloadResult: ConfigReloadResult;
      try {
        reloadResult = await onSaved();
      } catch {
        reloadResult = {
          ok: false,
          message: "Configuration saved, but the active baseline could not be loaded. Fix the configuration and save again.",
        };
      }
      if (reloadResult.ok) {
        setDraft((current) => ({
          ...current,
          appliedSummary: null,
          message: "Configuration saved and the active baseline was reloaded.",
        }));
      } else {
        setDraft((current) => ({
          ...current,
          message: "Configuration saved to disk.",
          error: reloadResult.message,
        }));
      }
    } catch {
      setDraft((current) => ({
        ...current,
        error: "The planner configuration could not be saved.",
      }));
    } finally {
      setDraft((current) => ({ ...current, busy: false }));
    }
  }

  const dirty =
    draft.document !== null && draft.contents !== draft.document.contents;
  const validationLabel = draft.validation === "valid"
    ? "Valid configuration"
    : draft.validation === "invalid"
      ? "Validation failed"
      : "Not yet validated";

  if (draft.loading) {
    return (
      <p className="panel-copy" aria-live="polite">
        Loading planner configuration…
      </p>
    );
  }
  if (!draft.document) {
    return <p className="config-message error" role="alert">{draft.error}</p>;
  }

  return (
    <section className="config-editor" aria-label="Active planner configuration editor">
      <div className="config-editor-meta">
        <div><span>Active file</span><strong>{draft.document.displayPath}</strong></div>
        <div><span>Editor state</span><strong>{dirty ? "Unsaved changes" : "Matches disk"}</strong></div>
        <div><span>Validation</span><strong>{validationLabel}</strong></div>
      </div>
      <p className="panel-copy">
        Plan controls remain temporary until explicitly applied to this draft and saved.
      </p>
      {draft.appliedSummary ? (
        <AppliedScenarioSummary
          summary={draft.appliedSummary}
          stale={draft.revision !== draft.appliedSummary.appliedRevision}
        />
      ) : null}
      {!draft.document.writeEnabled ? (
        <p className="config-write-disabled">
          Saving is disabled. Validation and scenario draft application remain available. Set
          {" "}<code>PLANNER_CONFIG_WRITE_ENABLED=true</code> and restart the application to enable saving.
        </p>
      ) : (
        <p className="config-write-enabled">Saving is enabled. A successful save replaces the backup and reloads the baseline.</p>
      )}
      <label className="config-editor-label" htmlFor="planner-config-yaml">Planner YAML</label>
      <textarea
        id="planner-config-yaml"
        className="config-editor-textarea"
        value={draft.contents}
        onChange={(event) => {
          const contents = event.target.value;
          setDraft((current) => ({
            ...current,
            contents,
            revision: current.revision + 1,
            validation: "idle",
            message: "",
            error: "",
          }));
        }}
        spellCheck={false}
        rows={30}
      />
      {draft.message ? <p className="config-message success" role="status">{draft.message}</p> : null}
      {draft.error ? <p className="config-message error" role="alert">{draft.error}</p> : null}
      <div className="config-editor-actions">
        <button type="button" className="button secondary" disabled={draft.busy} onClick={() => void validate()}>
          Validate
        </button>
        <button type="button" className="button secondary" disabled={draft.busy} onClick={() => void onRevert()}>
          Revert changes
        </button>
        <button type="button" className="button" disabled={draft.busy || !draft.document.writeEnabled} onClick={() => void save()}>
          Save config
        </button>
      </div>
    </section>
  );
}

export function LiveBaselineConfirmationDialog({
  conversions,
  busy,
  onCancel,
  onKeep,
  onReplace,
}: {
  conversions: ScenarioPreview["liveBaselineConversions"];
  busy: boolean;
  onCancel: () => void;
  onKeep: () => void;
  onReplace: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    focusableDrawerElements(dialog)[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busy) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableDrawerElements(dialog!);
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }
      const first = elements[0]!;
      const last = elements.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  return (
    <div className="scenario-confirmation-overlay no-print">
      <div
        className="scenario-confirmation-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-confirmation-title"
        aria-describedby="scenario-confirmation-description"
      >
        <span className="section-kicker">Source conversion</span>
        <h2 id="scenario-confirmation-title">Replace live-derived values?</h2>
        <p id="scenario-confirmation-description">
          These fields currently use <code>live_baseline</code>. Replacing them
          writes fixed numbers into the YAML draft, so future Lunch Money
          changes will no longer update them automatically.
        </p>
        <div className="scenario-conversion-list">
          {conversions.map((conversion) => (
            <article key={conversion.key}>
              <h3>{conversion.label}</h3>
              {conversion.draftDestinations.map((destination) => (
                <p key={destination.displayName}>
                  Current YAML source
                  {conversion.destinationCount > 1
                    ? ` — ${destination.displayName}`
                    : ""}: <code>{destination.formattedCurrentValue}</code>
                </p>
              ))}
              <p>Resolved baseline: {conversion.formattedActiveBaselineValue}</p>
              <p>Fixed scenario value: <strong>{conversion.formattedScenarioValue}</strong></p>
              <small>{conversion.consequence}</small>
            </article>
          ))}
        </div>
        <div className="scenario-confirmation-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="button secondary" disabled={busy} onClick={onKeep}>
            Keep live baseline
          </button>
          <button type="button" className="button" disabled={busy} onClick={onReplace}>
            Replace with fixed values
          </button>
        </div>
      </div>
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

function BlockingState({
  error,
  onRefresh,
  onOpenConfig,
  configOpen,
}: {
  error: BlockingError;
  onRefresh: () => void;
  onOpenConfig: (opener: HTMLButtonElement) => void;
  configOpen: boolean;
}) {
  const connected = error.connection?.status === "connected";
  return (
    <main>
      <header className="application-header blocking-application-header">
        <div className="application-header-row">
          <div className="application-title-group">
            <h1>Retirement Planner</h1>
            <p>Live baseline required.</p>
          </div>
          <div className="application-actions no-print">
          <button
            type="button"
            className="button secondary"
            aria-controls="scenario-controls-drawer"
            aria-expanded={configOpen}
            onClick={(event) => onOpenConfig(event.currentTarget)}
          >
            Repair planner config
          </button>
          <button type="button" className="button" onClick={onRefresh}>Try again</button>
          </div>
        </div>
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
  const [plannerDrawer, setPlannerDrawer] = useState<{
    opener: HTMLButtonElement;
    view: PlannerDrawerView;
  } | null>(null);
  const [lunchMoneyMappings, setLunchMoneyMappings] = useState<{
    opener: HTMLButtonElement;
  } | null>(null);
  const [configDraft, setConfigDraft] = useState<PlannerConfigDraftState>(
    initialPlannerConfigDraft,
  );
  const [scenarioPreview, setScenarioPreview] = useState<{
    preview: ScenarioPreview;
    opener: HTMLButtonElement;
  } | null>(null);
  const [scenarioApplyBusy, setScenarioApplyBusy] = useState(false);

  const loadPlannerConfigDraft = useCallback(
    async (clearAppliedSummary: boolean): Promise<PlannerConfigDraftState | null> => {
      setConfigDraft((current) => ({
        ...current,
        loading: true,
        message: "",
        error: "",
      }));
      try {
        const response = await fetch("/api/v1/config/current", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error(
            await configErrorMessage(
              response,
              "The planner configuration could not be loaded.",
            ),
          );
        }
        const document = (await response.json()) as PlannerConfigDocument;
        const next: PlannerConfigDraftState = {
          document,
          contents: document.contents,
          revision: configDraft.revision + 1,
          loading: false,
          busy: false,
          validation: "idle",
          message: "",
          error: "",
          appliedSummary: clearAppliedSummary ? null : configDraft.appliedSummary,
        };
        setConfigDraft(next);
        return next;
      } catch (error) {
        setConfigDraft((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error
            ? error.message
            : "The planner configuration could not be loaded.",
        }));
        return null;
      }
    },
    [configDraft.appliedSummary, configDraft.revision],
  );

  const openPlannerDrawer = useCallback(
    (opener: HTMLButtonElement, view: PlannerDrawerView) => {
      setActiveExplanation(null);
      setLunchMoneyMappings(null);
      setPlannerDrawer({ opener, view });
      if (
        view === "yaml" &&
        !configDraft.document &&
        !configDraft.loading
      ) {
        void loadPlannerConfigDraft(false);
      }
    },
    [configDraft.document, configDraft.loading, loadPlannerConfigDraft],
  );

  const openExplanation = useCallback(
    (target: ExplanationTarget, opener: HTMLButtonElement) => {
      setPlannerDrawer(null);
      setLunchMoneyMappings(null);
      setActiveExplanation({ target, opener });
    },
    [],
  );
  const closeExplanation = useCallback(() => setActiveExplanation(null), []);
  const closePlannerDrawer = useCallback(() => setPlannerDrawer(null), []);
  const closeLunchMoneyMappings = useCallback(
    () => setLunchMoneyMappings(null),
    [],
  );

  const changePlannerDrawerView = useCallback(
    (view: PlannerDrawerView) => {
      setPlannerDrawer((current) => current ? { ...current, view } : null);
      if (
        view === "yaml" &&
        !configDraft.document &&
        !configDraft.loading
      ) {
        void loadPlannerConfigDraft(false);
      }
    },
    [configDraft.document, configDraft.loading, loadPlannerConfigDraft],
  );

  const refresh = useCallback(() => {
    setRefreshGeneration((current) => current + 1);
    setOverrides({});
    setExportStatus("");
    setActiveExplanation(null);
    setPlannerDrawer(null);
    setLunchMoneyMappings(null);
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

  const reloadBaselineAfterConfigSave = useCallback(async (): Promise<ConfigReloadResult> => {
    let response: Response;
    let body: CurrentBaseline | BlockingError;
    try {
      response = await fetch("/api/v1/baseline/current", { cache: "no-store" });
      body = (await response.json()) as CurrentBaseline | BlockingError;
    } catch {
      response = new Response(null, { status: 500 });
      body = {
        error: "baseline_load_failed",
        message: "The active baseline could not be loaded.",
      };
    }

    setOverrides({});
    setProjectionResult(null);
    setExportStatus("");
    setActiveExplanation(null);
    setLunchMoneyMappings(null);

    if (!response.ok) {
      setBaselineResult({
        generation: refreshGeneration,
        error: body as BlockingError,
      });
      return {
        ok: false,
        message: "Configuration saved, but the active baseline could not be loaded. Fix the configuration and save again.",
      };
    }

    const current = body as CurrentBaseline;
    setBaselineResult({ generation: refreshGeneration, baseline: current });
    setAllocationYear(Number(current.projectionInputs.startDate.slice(0, 4)) + 20);
    return { ok: true };
  }, [refreshGeneration]);

  async function ensurePlannerConfigDraft(): Promise<PlannerConfigDraftState | null> {
    if (configDraft.document) return configDraft;
    return loadPlannerConfigDraft(false);
  }

  async function applyScenarioSelection(
    opener: HTMLButtonElement,
    liveBaselineAction: "keep" | "replace",
    loadedDraft?: PlannerConfigDraftState,
  ) {
    if (!baseline) return;
    const activeDraft = loadedDraft ?? await ensurePlannerConfigDraft();
    if (!activeDraft?.document) {
      setScenarioPreview(null);
      setPlannerDrawer({ opener, view: "yaml" });
      return;
    }
    setScenarioApplyBusy(true);
    try {
      const response = await fetch(
        "/api/v1/config/current/scenario-draft",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: activeDraft.contents,
            expectedVersion: activeDraft.document.version,
            baseline: baseline.projectionInputs,
            overrides,
            action: "apply",
            liveBaselineAction,
          }),
        },
      );
      if (!response.ok) {
        const error = await configErrorMessage(
          response,
          "The scenario could not be applied to the YAML draft.",
        );
        setConfigDraft((current) => ({
          ...current,
          validation: response.status === 422 ? "invalid" : current.validation,
          message: "",
          error,
        }));
        setScenarioPreview(null);
        setPlannerDrawer({ opener, view: "yaml" });
        return;
      }
      const result = (await response.json()) as ScenarioApplyResult;
      setConfigDraft((current) => {
        const revision = current.revision + 1;
        return {
          ...current,
          contents: result.contents,
          revision,
          validation: "valid",
          message: result.appliedChanges.length > 0
            ? "Scenario values were applied to the YAML draft. Nothing has been saved."
            : "No YAML values changed. Scenario overrides remain temporary.",
          error: "",
          appliedSummary: {
            appliedChanges: result.appliedChanges,
            skippedChanges: result.skippedChanges,
            appliedRevision: revision,
          },
        };
      });
      setScenarioPreview(null);
      setPlannerDrawer({ opener, view: "yaml" });
    } catch {
      setConfigDraft((current) => ({
        ...current,
        message: "",
        error: "The scenario could not be applied to the YAML draft.",
      }));
      setScenarioPreview(null);
      setPlannerDrawer({ opener, view: "yaml" });
    } finally {
      setScenarioApplyBusy(false);
    }
  }

  async function previewScenarioToConfig(opener: HTMLButtonElement) {
    if (!baseline || Object.keys(overrides).length === 0) return;
    setScenarioApplyBusy(true);
    const activeDraft = await ensurePlannerConfigDraft();
    if (!activeDraft?.document) {
      setScenarioApplyBusy(false);
      setPlannerDrawer({ opener, view: "yaml" });
      return;
    }
    try {
      const response = await fetch(
        "/api/v1/config/current/scenario-draft",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: activeDraft.contents,
            expectedVersion: activeDraft.document.version,
            baseline: baseline.projectionInputs,
            overrides,
            action: "preview",
          }),
        },
      );
      if (!response.ok) {
        const error = await configErrorMessage(
          response,
          "The scenario could not be reviewed against the YAML draft.",
        );
        setConfigDraft((current) => ({
          ...current,
          validation: response.status === 422 ? "invalid" : current.validation,
          message: "",
          error,
        }));
        setPlannerDrawer({ opener, view: "yaml" });
        return;
      }
      const preview = (await response.json()) as ScenarioPreview;
      if (preview.liveBaselineConversions.length > 0) {
        setPlannerDrawer(null);
        setScenarioPreview({ preview, opener });
        return;
      }
      await applyScenarioSelection(opener, "keep", activeDraft);
    } catch {
      setConfigDraft((current) => ({
        ...current,
        message: "",
        error: "The scenario could not be reviewed against the YAML draft.",
      }));
      setPlannerDrawer({ opener, view: "yaml" });
    } finally {
      setScenarioApplyBusy(false);
    }
  }

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

  const plannerConfigEditor = (
    <PlannerConfigEditor
      draft={configDraft}
      setDraft={setConfigDraft}
      onSaved={reloadBaselineAfterConfigSave}
      onRevert={async () => {
        await loadPlannerConfigDraft(true);
      }}
    />
  );

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
  if (loadError) return (
    <>
      <BlockingState
        error={loadError}
        onRefresh={() => void refresh()}
        onOpenConfig={(opener) => openPlannerDrawer(opener, "yaml")}
        configOpen={plannerDrawer !== null}
      />
      {plannerDrawer ? (
        <PlannerConfigurationDrawer
          view="yaml"
          controlsAvailable={false}
          onViewChange={changePlannerDrawerView}
          opener={plannerDrawer.opener}
          onClose={closePlannerDrawer}
        >
          {plannerConfigEditor}
        </PlannerConfigurationDrawer>
      ) : null}
    </>
  );
  if (!baseline || !inputs) return null;

  const chartData = projection ? buildAnnualChartData(inputs, projection, mode) : [];
  const ledgerData = projection ? buildAnnualLedgerData(inputs, projection, mode) : [];
  const latestAnnualTax = projection?.taxation.annual.at(-1) ?? null;
  const latestCanadianTax =
    latestAnnualTax?.mode === "canadian_annual" ? latestAnnualTax : null;
  const latestRrifPeriod = projection?.rrif.annual.at(-1) ?? null;
  const latestNonRegisteredPeriod =
    projection?.nonRegisteredTaxation.annual.at(-1) ?? null;
  const latestProjectionPeriod = projection?.annual.at(-1) ?? null;
  const latestRrspRrifValue = latestProjectionPeriod
    ? inputs.accounts
        .filter((account) => account.type === "rrsp_rrif")
        .reduce(
          (total, account) =>
            total + (latestProjectionPeriod[mode].accountBalances[account.id] ?? 0),
          0,
        )
    : null;
  // canadianTaxPosition defines these as tax on all annual income, tax on
  // opening/embedded income already reflected outside planner funding, and
  // the non-negative difference that the projection must fund, respectively.
  const latestTaxPayment = latestCanadianTax
    ? {
        totalEstimatedTax: latestCanadianTax.fullAnnualTax.totals.totalTax,
        alreadyReflectedTax:
          latestCanadianTax.embeddedAnnualTax.totals.totalTax,
        additionalTaxPaidByProjection: latestCanadianTax.projectionFundedTax,
      }
    : null;
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
  const { actionRequired, calculationNotes } =
    organizeScenarioWarnings(activeWarnings);
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
    <>
    <main>
      <header className="application-header">
        <div className="application-header-row">
          <div className="application-title-group">
            <h1>Retirement Planner</h1>
          </div>
          <div className="application-actions no-print">
            <button
              type="button"
              className="button secondary"
              aria-expanded={plannerDrawer !== null}
              aria-controls="scenario-controls-drawer"
              onClick={(event) => openPlannerDrawer(event.currentTarget, "controls")}
            >
              Try another plan
            </button>
            <button
              type="button"
              className="button secondary"
              aria-expanded={lunchMoneyMappings !== null}
              aria-controls="lunch-money-mappings-drawer"
              onClick={(event) => {
                setActiveExplanation(null);
                setPlannerDrawer(null);
                setLunchMoneyMappings({ opener: event.currentTarget });
              }}
            >
              Connected accounts
            </button>
            <button type="button" className="button secondary" onClick={() => window.print()}>Print</button>
            <button
              type="button"
              className="button"
              onClick={() => void download(
                "/api/v1/exports/projection",
                projectionJsonFilename(new Date().toISOString()),
              )}
            >
              Export
            </button>
          </div>
        </div>
        <nav className="application-navigation no-print" aria-label="Planner sections">
          <a href="#overview" aria-current="page">Overview</a>
          <a href="#retirement-income">Retirement income</a>
          <a href="#spending">Spending</a>
          <a href="#accounts">Accounts</a>
          <a href="#assumptions">Assumptions</a>
        </nav>
      </header>

      <section className="application-status-panel" aria-label="Connection and report controls">
        <div className="application-status-copy">
          <div className="application-status-heading">
            <span className="connection-badge connected">Lunch Money connected · read-only</span>
            <strong>Data through {formatOverviewDate(baseline.dataThrough)}</strong>
          </div>
          <p>
            Using {baseline.recordsAnalyzed.accounts} accounts and {baseline.recordsAnalyzed.transactions} transactions from the past {baseline.transactionWindow.trailingMonths} months ({formatOverviewDate(baseline.transactionWindow.startDate)}–{formatOverviewDate(baseline.transactionWindow.endDate)}) · {baseline.recordsAnalyzed.recurringItems} recurring items
          </p>
          {baseline.unmappedAccounts.length > 0 || baseline.unmappedCategories.length > 0 ? (
            <p className="mapping-attention">
              Mapping attention: {baseline.unmappedAccounts.length} unmapped accounts and {baseline.unmappedCategories.length} unmapped categories.
            </p>
          ) : null}
        </div>
        <div className="application-status-controls no-print">
          <button type="button" className="button secondary" onClick={() => void refresh()}>Refresh Lunch Money</button>
          <div className="segmented" aria-label="Dollar display">
            <button type="button" className={mode === "real" ? "active" : ""} onClick={() => setMode("real")}>
              Today&apos;s dollars
            </button>
            <button type="button" className={mode === "nominal" ? "active" : ""} onClick={() => setMode("nominal")}>
              Future dollars
            </button>
          </div>
          <span className="status" aria-live="polite">
            {projectionError || exportStatus || (projecting ? "Recalculating…" : "Live baseline active")}
          </span>
        </div>
      </section>

      {actionRequired.length > 0 ? (
        <section className="warning-panel" aria-labelledby="action-needed-title">
          <h2 id="action-needed-title">Action needed</h2>
          <p>Review these items before relying on the plan.</p>
          <ul>
            {actionRequired.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                <strong className="warning-severity-label">
                  {warning.severity === "error" ? "Error" : "Review"}
                </strong>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {projectionError ? (
        <section className="blocking-card" role="alert">
          <h2>Projection blocked</h2>
          <p>{projectionError}</p>
        </section>
      ) : null}

      {projection ? (
        <>
          <section id="overview" className="retirement-outlook" aria-labelledby="retirement-outlook-title">
            <div className="retirement-outlook-heading">
              <div>
                <span className="section-kicker">Overview</span>
                <h2 id="retirement-outlook-title">Retirement outlook</h2>
              </div>
              <span className="pill">Savings and targets in today&apos;s dollars</span>
            </div>

            <div className="retirement-outlook-primary">
              <div className="retirement-savings-summary">
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="assets-at-retirement"
                  title={`Expected retirement savings at age ${inputs.person.retirementAge}`}
                  onExplain={openExplanation}
                />
                <strong className="retirement-savings-amount">
                  {currency.format(projection.summary.financialAssetsAtRetirementToday)}
                </strong>
                <small>
                  At retirement on {formatOverviewDate(projection.summary.retirementDate)} · cash and investment accounts only
                </small>

                <div
                  className={`personal-target-comparison ${
                    wholeDollarComparison(
                      projection.retirementRequirement.ownerGoalDifferenceToday,
                    ).direction === "below"
                      ? "below-target"
                      : "at-or-above-target"
                  }`}
                >
                  <ExplainableHeading
                    compact
                    headingLevel="span"
                    target="goal-gap"
                    title="Compared with your personal target"
                    onExplain={openExplanation}
                  />
                  <strong>
                    {formatPersonalTargetComparison(
                      projection.retirementRequirement.ownerGoalDifferenceToday,
                      projection.summary.retirementGoalToday,
                    )}
                  </strong>
                </div>

                <p className="savings-duration-summary">
                  {retirementSavingsDurationLabel(
                    projection.summary.financialAssetsDepletionAge,
                    projection.projectionCompletion,
                  )}
                </p>
              </div>

              <article className="personal-target-card">
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="retirement-goal"
                  title="Your personal retirement target"
                  onExplain={openExplanation}
                />
                <strong>{currency.format(projection.summary.retirementGoalToday)}</strong>
                <small>
                  Your chosen savings target is the main comparison for this outlook.
                </small>
              </article>
            </div>

            <div className="outlook-supporting-figures" aria-label="Supporting retirement figures">
              <article>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="starting-financial-assets"
                  title="Retirement savings today"
                  onExplain={openExplanation}
                />
                <strong>{currency.format(importedStartingFinancialAssets)}</strong>
                <small>Imported balances as of {formatOverviewDate(baseline.dataThrough)}</small>
              </article>
              <article>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="home-equity-at-retirement"
                  title="Home equity at retirement"
                  onExplain={openExplanation}
                />
                <strong>{currency.format(projection.retirementSnapshot[mode].balances.homeEquity)}</strong>
                <small>Home value less the linked mortgage · {mode === "real" ? "today’s dollars" : "future dollars"}</small>
              </article>
              <article>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="liabilities-at-retirement"
                  title="Debts at retirement"
                  onExplain={openExplanation}
                />
                <strong>{currency.format(projection.retirementSnapshot[mode].balances.totalLiabilities)}</strong>
                <small>
                  {projection.summary.mortgagePayoffDate
                    ? `Mortgage payoff ${formatOverviewDate(projection.summary.mortgagePayoffDate)}`
                    : "No later mortgage payoff is projected"} · {mode === "real" ? "today’s dollars" : "future dollars"}
                </small>
              </article>
              <article>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="total-net-worth"
                  title="Net worth at retirement"
                  onExplain={openExplanation}
                />
                <strong>{currency.format(projection.retirementSnapshot[mode].balances.totalNetWorth)}</strong>
                <small>All modelled assets less debts · {mode === "real" ? "today’s dollars" : "future dollars"}</small>
              </article>
            </div>

            <aside className="model-minimum-summary" aria-label="Minimum needed for the spending in this plan">
              <div>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="retirement-requirement"
                  title="Minimum needed for the spending in this plan"
                  onExplain={openExplanation}
                />
                <strong>
                  {projection.retirementRequirement.status === "available" &&
                  projection.retirementRequirement.requiredFinancialAssetsToday !== null
                    ? currency.format(projection.retirementRequirement.requiredFinancialAssetsToday)
                    : "Unavailable"}
                </strong>
                <small>
                  {projection.retirementRequirement.status === "available"
                    ? `Calculated to support this plan through age ${projection.retirementRequirement.terminalAge}.`
                    : projection.retirementRequirement.reason}
                </small>
              </div>
              <div className="model-minimum-explanation">
                <p>
                  This is the lowest amount the model calculates for the current assumptions about your spending, benefits, taxes, debts, returns, and planned final age. It is not your personal target or a recommended retirement target.
                </p>
                <ExplainableHeading
                  compact
                  headingLevel="span"
                  target="retirement-funding-margin"
                  title="Compared with this minimum"
                  onExplain={openExplanation}
                />
                <strong>
                  {projection.retirementRequirement.fundingMarginToday === null
                    ? "No model comparison is available"
                    : formatCalculatedMinimumComparison(
                        projection.retirementRequirement.fundingMarginToday,
                      )}
                </strong>
                <small>
                  Minimum ending balance {currency.format(projection.retirementRequirement.minimumEndingFinancialAssetsToday)} · residence equity excluded
                </small>
                <small>Source: {requirementSourceLabel(projection.retirementRequirement)}</small>
              </div>
            </aside>
          </section>

          <section className="report-layout">
            <div className="report-column">
              <article id="spending" className="report-card wide-chart">
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
                      <AnnualXAxis chartData={chartData} />
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
                        <AnnualXAxis chartData={chartData} />
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
                      <AnnualXAxis chartData={chartData} />
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
                          <Bar dataKey="unplannedCashSwept" name="Unplanned cash swept" fill="#d99269" />
                          <Line dataKey="operatingCashTarget" name="Operating cash target" stroke="#ef7d86" strokeWidth={2} dot={false} />
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

              <article id="retirement-income" className="report-card wide-chart">
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
                      <AnnualXAxis chartData={chartData} />
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
                      <AnnualXAxis chartData={chartData} />
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
                          <AnnualXAxis chartData={chartData} />
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
                          <AnnualXAxis chartData={chartData} />
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

              <article id="accounts" className="report-card wide-chart">
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
                      <AnnualXAxis chartData={chartData} />
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
          </section>

          <section id="plan-details" className="plan-details" aria-labelledby="plan-details-title">
            <div className="section-heading">
              <div>
                <span className="section-kicker">Technical details</span>
                <h2 id="plan-details-title">Plan details</h2>
              </div>
            </div>
            <p className="plan-details-introduction">
              See how taxes, withdrawals, taxable investments, and calculation limits are handled in this plan.
            </p>

            <div className="plan-details-list">
              <details className="plan-details-disclosure">
                <summary>
                  <span className="plan-details-title">Taxes included</span>
                  <span className="plan-details-status">
                    {projection.taxation.mode === "canadian_annual"
                      ? projection.taxation.provisional
                        ? "Canadian federal and Ontario income tax are included with noted limits."
                        : "Canadian federal and Ontario income tax are included in this estimate."
                      : "A simplified flat retirement-tax estimate is used."}
                  </span>
                </summary>
                <div className="plan-details-content">
                  <div className="plan-detail-explanation-heading">
                    <ExplainableHeading
                      compact
                      headingLevel="span"
                      target="annual-tax"
                      title="About this tax estimate"
                      onExplain={openExplanation}
                    />
                  </div>
                  <p className="plan-detail-disclaimer">
                    This is a retirement-planning estimate, not a tax return.
                  </p>
                  {latestCanadianTax && latestTaxPayment ? (
                    <>
                      <section className="plan-detail-group" aria-labelledby="tax-income-title">
                        <h3 id="tax-income-title">Income used for the estimate</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Tax year</dt><dd>{latestCanadianTax.taxYear}</dd></div>
                          <div><dt>Taxable income</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.taxableIncomeBasis)}</dd></div>
                          <div><dt>Eligible Canadian dividends</dt><dd>{currency.format(latestCanadianTax.totalIncome.eligibleCanadianDividends ?? 0)}</dd></div>
                          <div><dt>Capital gains</dt><dd>{currency.format(latestCanadianTax.totalIncome.capitalGains ?? 0)}</dd></div>
                          <div><dt>Capital losses</dt><dd>{currency.format(latestCanadianTax.totalIncome.capitalLosses ?? 0)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group" aria-labelledby="estimated-taxes-title">
                        <h3 id="estimated-taxes-title">Estimated taxes</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Federal income tax</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.totals.federalTax)}</dd></div>
                          <div><dt>Ontario income tax</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.totals.ontarioTax)}</dd></div>
                          {latestCanadianTax.fullAnnualTax.ontario.surtax !== 0 ? (
                            <div><dt>Ontario surtax</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.ontario.surtax)}</dd></div>
                          ) : null}
                          <div><dt>Ontario health premium</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.totals.ontarioHealthPremium)}</dd></div>
                          <div><dt>OAS repayment</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.totals.oasRecoveryTax)}</dd></div>
                          <div><dt>Total estimated tax</dt><dd>{currency.format(latestTaxPayment.totalEstimatedTax)}</dd></div>
                          <div><dt>Effective tax rate</dt><dd>{percent.format(latestCanadianTax.fullAnnualTax.totals.effectiveTaxRate)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group" aria-labelledby="tax-payment-title">
                        <h3 id="tax-payment-title">How tax is paid in this projection</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Total estimated tax on all income included for the year</dt><dd>{currency.format(latestTaxPayment.totalEstimatedTax)}</dd></div>
                          <div><dt>Tax already reflected in net income or opening-year context</dt><dd>{currency.format(latestTaxPayment.alreadyReflectedTax)}</dd></div>
                          <div><dt>Additional tax paid from projected cash and savings</dt><dd>{currency.format(latestTaxPayment.additionalTaxPaidByProjection)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group plan-detail-subsection" aria-labelledby="detailed-tax-title">
                        <h3 id="detailed-tax-title">Detailed tax calculation</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Eligible-dividend gross-up</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.incomeAdjustments.eligibleDividendGrossUp)}</dd></div>
                          <div><dt>Taxable eligible dividends</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.incomeAdjustments.taxableEligibleDividends)}</dd></div>
                          <div><dt>Federal dividend tax credit</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.federal.eligibleDividendTaxCredit)}</dd></div>
                          <div><dt>Ontario dividend tax credit</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.ontario.eligibleDividendTaxCredit)}</dd></div>
                          <div><dt>Taxable capital gain after current-year losses</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.incomeAdjustments.taxableCapitalGain)}</dd></div>
                          <div><dt>Unused current-year capital loss</dt><dd>{currency.format(latestCanadianTax.fullAnnualTax.incomeAdjustments.currentYearExcessCapitalLoss)}</dd></div>
                        </dl>
                      </section>
                    </>
                  ) : latestAnnualTax?.mode === "flat_compatibility" ? (
                    <section className="plan-detail-group" aria-labelledby="flat-tax-title">
                      <h3 id="flat-tax-title">Estimated taxes</h3>
                      <dl className="plan-detail-definition-list">
                        <div><dt>Tax year</dt><dd>{latestAnnualTax.taxYear}</dd></div>
                        <div><dt>Tax paid from projected cash and savings</dt><dd>{currency.format(latestAnnualTax.projectionFundedTax)}</dd></div>
                        <div><dt>Effective tax rate used</dt><dd>{percent.format(latestAnnualTax.effectiveTaxRate)}</dd></div>
                      </dl>
                    </section>
                  ) : (
                    <p>No annual tax period is available.</p>
                  )}
                </div>
              </details>

              <details className="plan-details-disclosure">
                <summary>
                  <span className="plan-details-title">RRSP and RRIF withdrawals</span>
                  <span className="plan-details-status">
                    {projection.rrif.mode === "statutory"
                      ? `Required RRIF withdrawals are included from age ${projection.rrif.conversionAge}.`
                      : `RRIF conversion is shown at age ${projection.rrif.conversionAge}, but required minimum withdrawals are not calculated.`}
                  </span>
                </summary>
                <div className="plan-details-content">
                  <section className="plan-detail-group" aria-labelledby="rrif-withdrawal-details-title">
                    <h3 id="rrif-withdrawal-details-title">Withdrawal details</h3>
                    <dl className="plan-detail-definition-list">
                      <div><dt>Conversion age</dt><dd>{projection.rrif.conversionAge}</dd></div>
                      {latestRrifPeriod ? (
                        <>
                          <div><dt>Calendar year</dt><dd>{latestRrifPeriod.calendarYear}</dd></div>
                          <div><dt>Value at the start of the year</dt><dd>{currency.format(mode === "nominal" ? latestRrifPeriod.openingFairMarketValue : latestRrifPeriod.openingFairMarketValueToday)}</dd></div>
                          <div><dt>Minimum withdrawal required</dt><dd>{currency.format(mode === "nominal" ? latestRrifPeriod.minimumRequired : latestRrifPeriod.minimumRequiredToday)}</dd></div>
                          <div><dt>Regular withdrawals</dt><dd>{currency.format(mode === "nominal" ? latestRrifPeriod.ordinaryWithdrawals : latestRrifPeriod.ordinaryWithdrawalsToday)}</dd></div>
                          <div><dt>Additional year-end withdrawal needed</dt><dd>{currency.format(mode === "nominal" ? latestRrifPeriod.forcedDecemberWithdrawal : latestRrifPeriod.forcedDecemberWithdrawalToday)}</dd></div>
                          <div><dt>Minimum still outstanding</dt><dd>{currency.format(mode === "nominal" ? latestRrifPeriod.remainingMinimum : latestRrifPeriod.remainingMinimumToday)}</dd></div>
                          {latestRrspRrifValue !== null ? (
                            <div><dt>Value remaining after withdrawals</dt><dd>{currency.format(latestRrspRrifValue)}</dd></div>
                          ) : null}
                        </>
                      ) : null}
                    </dl>
                  </section>
                  <section className="plan-detail-group plan-detail-subsection" aria-labelledby="rrif-technical-details-title">
                    <h3 id="rrif-technical-details-title">Technical calculation details</h3>
                    {projection.rrif.mode === "statutory" ? (
                      <ul className="plan-detail-technical-list">
                        <li>The required minimum uses the owner&apos;s age at the beginning of each calendar year.</li>
                        <li>If regular withdrawals do not meet the minimum, the remaining amount is withdrawn at year end.</li>
                        {latestRrifPeriod ? (
                          <li>
                            {latestRrifPeriod.periodStatus === "complete_calendar_year"
                              ? "The latest figures cover a complete calendar year."
                              : latestRrifPeriod.periodStatus === "partial_period"
                                ? "The latest figures cover part of a calendar year."
                                : "The latest figures are incomplete because the projection stopped early."}
                          </li>
                        ) : null}
                      </ul>
                    ) : (
                      <p>Required minimum withdrawals are not calculated; only the planned conversion age is shown.</p>
                    )}
                  </section>
                </div>
              </details>

              <details className="plan-details-disclosure">
                <summary>
                  <span className="plan-details-title">Taxable investment account</span>
                  <span className="plan-details-status">
                    {projection.nonRegisteredTaxation.mode === "simplified_canadian"
                      ? "Investment income and sales taxes are estimated."
                      : "Investment income and sales taxes are not included."}
                  </span>
                </summary>
                <div className="plan-details-content">
                  {latestNonRegisteredPeriod &&
                  projection.nonRegisteredTaxation.mode === "simplified_canadian" ? (
                    <>
                      <p className="plan-detail-context">Figures below are for calendar year {latestNonRegisteredPeriod.calendarYear}.</p>
                      <section className="plan-detail-group" aria-labelledby="taxable-account-values-title">
                        <h3 id="taxable-account-values-title">Account values</h3>
                        <p>Tax cost means adjusted cost base (ACB), which is generally the amount used to calculate a capital gain or loss.</p>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Value at start of year</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.openingMarketValue : latestNonRegisteredPeriod.openingMarketValueToday)}</dd></div>
                          <div><dt>Value at end of year</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.closingMarketValue : latestNonRegisteredPeriod.closingMarketValueToday)}</dd></div>
                          <div><dt>Starting tax cost</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.openingAdjustedCostBase : latestNonRegisteredPeriod.openingAdjustedCostBaseToday)}</dd></div>
                          <div><dt>Ending tax cost</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.closingAdjustedCostBase : latestNonRegisteredPeriod.closingAdjustedCostBaseToday)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group" aria-labelledby="taxable-investment-income-title">
                        <h3 id="taxable-investment-income-title">Investment income</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Interest</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.interestDistributions : latestNonRegisteredPeriod.interestDistributionsToday)}</dd></div>
                          <div><dt>Eligible Canadian dividends</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.eligibleCanadianDividends : latestNonRegisteredPeriod.eligibleCanadianDividendsToday)}</dd></div>
                          <div><dt>Foreign income</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.foreignIncomeDistributions : latestNonRegisteredPeriod.foreignIncomeDistributionsToday)}</dd></div>
                          <div><dt>Capital-gain distributions</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.capitalGainDistributions : latestNonRegisteredPeriod.capitalGainDistributionsToday)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group" aria-labelledby="taxable-investments-sold-title">
                        <h3 id="taxable-investments-sold-title">Investments sold</h3>
                        <dl className="plan-detail-definition-list">
                          <div><dt>Sale proceeds</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.dispositionProceeds : latestNonRegisteredPeriod.dispositionProceedsToday)}</dd></div>
                          <div><dt>Tax cost of investments sold</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.adjustedCostBaseDisposed : latestNonRegisteredPeriod.adjustedCostBaseDisposedToday)}</dd></div>
                          <div><dt>Realized capital gains</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.realizedCapitalGains : latestNonRegisteredPeriod.realizedCapitalGainsToday)}</dd></div>
                          <div><dt>Realized capital losses</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.realizedCapitalLosses : latestNonRegisteredPeriod.realizedCapitalLossesToday)}</dd></div>
                          <div><dt>Unrealized gain or loss remaining</dt><dd>{currency.format(mode === "nominal" ? latestNonRegisteredPeriod.closingUnrealizedGainOrLoss : latestNonRegisteredPeriod.closingUnrealizedGainOrLossToday)}</dd></div>
                        </dl>
                      </section>
                      <section className="plan-detail-group plan-detail-subsection" aria-labelledby="taxable-account-evidence-title">
                        <h3 id="taxable-account-evidence-title">Account-by-account values</h3>
                        <div className="plan-detail-table-shell">
                          <table className="plan-detail-table">
                            <thead>
                              <tr><th>Account</th><th>Value at start</th><th>Starting tax cost</th><th>Value at end</th><th>Ending tax cost</th></tr>
                            </thead>
                            <tbody>
                              {latestNonRegisteredPeriod.accounts.map((account) => (
                                <tr key={account.accountId}>
                                  <th scope="row">{inputs.accounts.find((item) => item.id === account.accountId)?.label ?? "Taxable investment account"}</th>
                                  <td>{currency.format(mode === "nominal" ? account.openingMarketValue : account.openingMarketValueToday)}</td>
                                  <td>{currency.format(mode === "nominal" ? account.openingAdjustedCostBase : account.openingAdjustedCostBaseToday)}</td>
                                  <td>{currency.format(mode === "nominal" ? account.closingMarketValue : account.closingMarketValueToday)}</td>
                                  <td>{currency.format(mode === "nominal" ? account.closingAdjustedCostBase : account.closingAdjustedCostBaseToday)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  ) : (
                    <p>
                      Investment income and taxes on investment sales are not calculated for this plan. Existing total-return and withdrawal behaviour is unchanged.
                    </p>
                  )}
                </div>
              </details>

              <details className="plan-details-disclosure">
                <summary>
                  <span className="plan-details-title">How this plan was calculated</span>
                  <span className="plan-details-status">
                    {projection.projectionCompletion.status === "complete"
                      ? `The plan was calculated through age ${projection.projectionCompletion.plannedTerminalAge}.`
                      : `The calculation stopped at age ${formatProjectedAge(projection.projectionCompletion.completedThroughAge)}.`}
                  </span>
                </summary>
                <div className="plan-details-content">
                  <section className="plan-detail-group" aria-labelledby="calculation-coverage-title">
                    <h3 id="calculation-coverage-title">Calculation coverage</h3>
                    <dl className="plan-detail-definition-list">
                      <div><dt>Planned final age</dt><dd>{projection.projectionCompletion.plannedTerminalAge}</dd></div>
                      <div><dt>Last completed date</dt><dd>{formatOverviewDate(projection.projectionCompletion.completedThroughDate)}</dd></div>
                      <div><dt>Last completed age</dt><dd>{formatProjectedAge(projection.projectionCompletion.completedThroughAge)}</dd></div>
                      <div>
                        <dt>Calculation status</dt>
                        <dd>
                          {projection.projectionCompletion.status === "complete"
                            ? "Completed through the planned final age"
                            : "Stopped early — the full plan was not calculated"}
                        </dd>
                      </div>
                      {projection.projectionCompletion.status !== "complete" && projection.projectionCompletion.reason ? (
                        <div><dt>Why it stopped</dt><dd>{projection.projectionCompletion.reason}</dd></div>
                      ) : null}
                      {projection.projectionCompletion.status !== "complete" && projection.projectionCompletion.stoppedBeforeMonth ? (
                        <div><dt>Stopped before</dt><dd>{formatOverviewMonth(projection.projectionCompletion.stoppedBeforeMonth)}</dd></div>
                      ) : null}
                    </dl>
                  </section>
                  <section className="plan-detail-group" aria-labelledby="ending-balance-rule-title">
                    <h3 id="ending-balance-rule-title">Ending-balance rule</h3>
                    <dl className="plan-detail-definition-list">
                      <div><dt>Minimum ending financial assets</dt><dd>{currency.format(projection.retirementRequirement.minimumEndingFinancialAssetsToday)}</dd></div>
                      <div><dt>Is home equity excluded from retirement funding?</dt><dd>Yes — only cash and investment accounts can fund retirement spending.</dd></div>
                      <div><dt>Source of this rule</dt><dd>{requirementSourceLabel(projection.retirementRequirement)}</dd></div>
                    </dl>
                  </section>
                  <section className="plan-detail-group plan-detail-subsection" aria-labelledby="savings-duration-method-title">
                    <ExplainableHeading
                      compact
                      headingLevel="h3"
                      target="financial-assets-duration"
                      title="How savings duration is checked"
                      onExplain={openExplanation}
                    />
                    <p>
                      The planner checks cash and investment-account balances in each completed projection period. Home equity is not counted as retirement funding.
                    </p>
                  </section>
                </div>
              </details>

              <details className="plan-details-disclosure">
                <summary>
                  <span className="plan-details-title">Calculation notes and limitations</span>
                  <span className="plan-details-status">
                    {calculationNotes.length === 0
                      ? "No additional calculation notes are active."
                      : `${calculationNotes.length} ${calculationNotes.length === 1 ? "note" : "notes"} about assumptions and calculation limits.`}
                  </span>
                </summary>
                <div className="plan-details-content">
                  {calculationNotes.length > 0 ? (
                    <ul className="calculation-notes-list">
                      {calculationNotes.map((warning, index) => (
                        <li key={`${warning.code}-${index}`}>{warning.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>No additional calculation notes or limitations apply to this plan.</p>
                  )}
                </div>
              </details>
            </div>
          </section>

          <section id="assumptions" className="report-card assumptions">
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
                    <div><dt>Operating target today</dt><dd>{policyPreview.operatingTargetToday === null ? "Not configured (retain compatibility)" : currency.format(policyPreview.operatingTargetToday)}</dd></div>
                    <div><dt>Operating indexing</dt><dd>{policyPreview.operatingIndexingRate === null ? "Not configured" : percent.format(policyPreview.operatingIndexingRate)}</dd></div>
                    <div><dt>Operating cash in combined reserve</dt><dd>{policyPreview.operatingCashIsReserveMember ? "Yes — the targets overlap and are not added" : "No — the targets are funded independently"}</dd></div>
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
                    <div><dt>Target-funding cash retained</dt><dd>{currency.format(savingsTotals?.targetFundingRetained ?? 0)}</dd></div>
                    <div><dt>Unplanned cash retained</dt><dd>{currency.format(savingsTotals?.unplannedCashRetained ?? 0)}</dd></div>
                    <div><dt>Unplanned cash swept</dt><dd>{currency.format(savingsTotals?.unplannedCashSwept ?? 0)}</dd></div>
                    <div><dt>Operating target unfunded</dt><dd>{currency.format(savingsTotals?.operatingTargetUnfunded ?? 0)}</dd></div>
                    <div><dt>Combined reserve target unfunded</dt><dd>{currency.format(savingsTotals?.reserveTargetUnfunded ?? 0)}</dd></div>
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
                  <div><dt>RRIF minimum mode</dt><dd>{projection.rrif.mode.replaceAll("_", " ")} · {projection.rrif.source.replaceAll("_", " ")}</dd></div>
                  <div><dt>RRIF settlement</dt><dd>{projection.rrif.settlementTiming.replaceAll("_", " ")}</dd></div>
                  <div><dt>Non-registered taxation</dt><dd>{projection.nonRegisteredTaxation.mode.replaceAll("_", " ")} · {projection.nonRegisteredTaxation.source.replaceAll("_", " ")}</dd></div>
                  <div><dt>Tax coverage</dt><dd>{projection.taxation.coverageStatus.replaceAll("_", " ")} · full tax-return fidelity: no</dd></div>
                  {projection.nonRegisteredTaxation.accounts.map((account) => {
                    const label = inputs.accounts.find(
                      (item) => item.id === account.accountId,
                    )?.label ?? "Non-registered account";
                    return (
                      <div key={account.accountId}>
                        <dt>{label} tax assumptions</dt>
                        <dd>
                          {account.openingAdjustedCostBase === null ||
                          account.annualDistributionYields === null
                            ? "ACB and taxable-distribution assumptions unavailable because compatibility mode is active."
                            : `Opening ACB ${currency.format(account.openingAdjustedCostBase)} · interest ${percent.format(account.annualDistributionYields.interest)} · eligible dividends ${percent.format(account.annualDistributionYields.eligibleCanadianDividends)} · foreign income ${percent.format(account.annualDistributionYields.foreignIncome)} · capital-gain distributions ${percent.format(account.annualDistributionYields.capitalGains)}`}
                        </dd>
                      </div>
                    );
                  })}
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
                  <div>
                    <dt>Projection period</dt>
                    <dd>
                      {inputs.startDate}–{projection.projectionCompletion.completedThroughDate}
                      {projection.projectionCompletion.status === "complete"
                        ? ` · complete through age ${projection.projectionCompletion.plannedTerminalAge}`
                        : ` · stopped early before ${projection.projectionCompletion.stoppedBeforeMonth}`}
                    </dd>
                  </div>
                  <div><dt>Inflation</dt><dd>{percent.format(inputs.annualInflation)}</dd></div>
                  <div>
                    <dt>Tax model</dt>
                    <dd>
                      {inputs.tax.mode === "canadian_annual"
                        ? `Canadian annual tax · Canada / Ontario · ${inputs.tax.referenceYear} reference · ${percent.format(inputs.tax.futureIndexingRate)} forecast indexing`
                        : `Flat compatibility · ${percent.format(inputs.tax.effectiveTaxRate)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Employment tax basis</dt>
                    <dd>
                      Net deposited cash enters the budget; explicit taxable employment income establishes annual bracket context; RRSP-eligible income creates future contribution room.
                    </dd>
                  </div>
                  {inputs.tax.mode === "canadian_annual" ? (
                    <>
                      <div>
                        <dt>Opening tax-year context</dt>
                        <dd>
                          {inputs.tax.openingTaxYearBeforeProjectionMonth.source === "january_zero"
                            ? "January start · explicit zero opening context"
                            : `${inputs.tax.openingTaxYearBeforeProjectionMonth.calendarYear} through month ${inputs.tax.openingTaxYearBeforeProjectionMonth.throughMonth} · bracket context only, not deposited cash`}
                        </dd>
                      </div>
                      <div>
                        <dt>Canadian tax limitations</dt>
                        <dd>
                          {projection.taxation.provisional
                            ? `Provisional · ${projection.taxation.coverageStatus.replaceAll("_", " ")}. Full-return deductions and refundable credits are not modelled.`
                            : "Complete for the supported deterministic model · planning estimate, not a tax return. Security-level tax lots, loss carryovers, foreign tax credits, arbitrary deductions, refundable credits, AMT, optimization, and full tax-return preparation remain out of scope."}
                        </dd>
                      </div>
                    </>
                  ) : null}
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
      {plannerDrawer ? (
        <PlannerConfigurationDrawer
          view={plannerDrawer.view}
          controlsAvailable
          onViewChange={changePlannerDrawerView}
          opener={plannerDrawer.opener}
          onClose={closePlannerDrawer}
        >
          {plannerDrawer.view === "controls" ? (
            <ScenarioControlsPanel
              baseline={baseline}
              inputs={inputs}
              controls={controls}
              overrides={overrides}
              setOverrides={setOverrides}
              applyingScenario={scenarioApplyBusy}
              onApplyScenario={() => {
                void previewScenarioToConfig(plannerDrawer.opener);
              }}
            />
          ) : (
            plannerConfigEditor
          )}
        </PlannerConfigurationDrawer>
      ) : null}
      {lunchMoneyMappings ? (
        <LunchMoneyMappingsDrawer
          mappings={baseline.lunchMoneyMappings}
          opener={lunchMoneyMappings.opener}
          onClose={closeLunchMoneyMappings}
        />
      ) : null}
    </main>
      {scenarioPreview ? (
        <LiveBaselineConfirmationDialog
          conversions={scenarioPreview.preview.liveBaselineConversions}
          busy={scenarioApplyBusy}
          onCancel={() => {
            setScenarioPreview(null);
            setPlannerDrawer({
              opener: scenarioPreview.opener,
              view: "controls",
            });
          }}
          onKeep={() => {
            void applyScenarioSelection(scenarioPreview.opener, "keep");
          }}
          onReplace={() => {
            void applyScenarioSelection(scenarioPreview.opener, "replace");
          }}
        />
      ) : null}
    </>
  );
}
