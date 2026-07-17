"use client";

import {
  createElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { explanationTooltips } from "@/src/domain/explanations/tooltips";
import type {
  ExplanationDataSection,
  ExplanationDocument,
  ExplanationSourceType,
  ExplanationTarget,
} from "@/src/domain/explanations/types";

const number = new Intl.NumberFormat("en-CA", {
  maximumFractionDigits: 2,
});

const sourceLabels: Record<ExplanationSourceType, string> = {
  lunchmoney: "Lunch Money",
  configuration: "Local configuration",
  override: "Temporary override",
  projection: "Projection",
};

type ExplainHandler = (target: ExplanationTarget, opener: HTMLButtonElement) => void;

export function InfoTooltip({
  target,
  title,
}: {
  target: ExplanationTarget;
  title: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <span className="info-tooltip-wrap no-print">
      <button
        type="button"
        className="info-tooltip-button"
        aria-label={`What does ${title} mean?`}
        aria-describedby={id}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
      >
        i
      </button>
      {visible ? (
        <span className="info-tooltip" id={id} role="tooltip">
          {explanationTooltips[target]}
        </span>
      ) : null}
    </span>
  );
}

export function ExplainControl({
  target,
  onExplain,
}: {
  target: ExplanationTarget;
  onExplain: ExplainHandler;
}) {
  return (
    <button
      type="button"
      className="explain-control no-print"
      onClick={(event) => onExplain(target, event.currentTarget)}
    >
      Explain
    </button>
  );
}

export function ExplainableHeading({
  target,
  title,
  kicker,
  headingLevel = "h2",
  compact = false,
  trailing,
  onExplain,
}: {
  target: ExplanationTarget;
  title: string;
  kicker?: string;
  headingLevel?: "h2" | "h3" | "span";
  compact?: boolean;
  trailing?: ReactNode;
  onExplain: ExplainHandler;
}) {
  return (
    <div className={`explainable-heading ${compact ? "compact" : ""}`}>
      <div className="explainable-heading-copy">
        {kicker ? <span className="section-kicker">{kicker}</span> : null}
        <div className="explainable-title-row">
          {createElement(headingLevel, null, title)}
          <InfoTooltip target={target} title={title} />
          <ExplainControl target={target} onExplain={onExplain} />
        </div>
      </div>
      {trailing ? <div className="explainable-heading-trailing">{trailing}</div> : null}
    </div>
  );
}

export function SourceBadge({ source }: { source: ExplanationSourceType }) {
  return <span className={`source-badge ${source}`}>{sourceLabels[source]}</span>;
}

export function CalculationSteps({ document }: { document: ExplanationDocument }) {
  if (document.steps.length === 0 && !document.formula) return null;
  return (
    <section className="explanation-section" aria-labelledby={`${document.id}-calculation`}>
      <h3 id={`${document.id}-calculation`}>Calculation</h3>
      {document.formula ? <p className="formula">{document.formula}</p> : null}
      {document.steps.length > 0 ? (
        <ol className="calculation-steps">
          {document.steps.map((step, index) => (
            <li className={`calculation-step ${step.operation ?? "input"}`} key={`${step.label}-${index}`}>
              <span className="operation" aria-hidden="true">
                {step.operation === "add"
                  ? "+"
                  : step.operation === "subtract"
                    ? "−"
                    : step.operation === "result"
                      ? "="
                      : "•"}
              </span>
              <span className="calculation-label">
                <strong>{step.label}</strong>
                {step.sourceDescription ? <small>{step.sourceDescription}</small> : null}
                {step.effectiveDate ? <small>Effective {step.effectiveDate}</small> : null}
              </span>
              <span className="calculation-value">{step.value}</span>
              {step.sourceType ? <SourceBadge source={step.sourceType} /> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {document.reconciliation?.matched ? (
        <p className="reconciliation">✓ Reconciles to displayed value</p>
      ) : null}
    </section>
  );
}

function tableValue(value: string | number): string {
  return typeof value === "number" ? number.format(value) : value;
}

export function ExplanationDataTable({ section }: { section: ExplanationDataSection }) {
  return (
    <details className="explanation-data-section" open={section.initiallyExpanded}>
      <summary>{section.title}</summary>
      {section.description ? <p>{section.description}</p> : null}
      <div className="explanation-table-shell">
        <table>
          <thead>
            <tr>
              {section.columns.map((column) => <th key={column.key}>{column.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {section.rows.length > 0 ? section.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {section.columns.map((column) => (
                  <td key={column.key}>{tableValue(row[column.key] ?? "—")}</td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={section.columns.length}>No records were available.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute("hidden"));
}

export function ExplanationDrawer({
  document,
  opener,
  onClose,
}: {
  document: ExplanationDocument;
  opener: HTMLButtonElement | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleId = `${document.id}-dialog-title`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = "hidden";
    focusableElements(dialog)[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements(dialog!);
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
  }, [document.id, onClose, opener]);

  return (
    <div className="explanation-overlay no-print" data-testid="explanation-overlay">
      <aside
        className="explanation-drawer"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="explanation-drawer-header">
          <div>
            <span className="section-kicker">Calculation explanation</span>
            <h2 id={titleId}>{document.title}</h2>
          </div>
          <button type="button" className="drawer-close" aria-label="Close explanation" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="explanation-drawer-content">
          <p className="plain-language">{document.plainLanguage}</p>
          {document.displayedResult ? (
            <section className="displayed-result" aria-label="Currently displayed result">
              <span>{document.displayedResult.label}</span>
              <strong>{document.displayedResult.value}</strong>
              {document.displayedResult.period ? <small>{document.displayedResult.period}</small> : null}
              {document.displayedResult.dollarMode ? (
                <small>
                  {document.displayedResult.dollarMode === "real"
                    ? "Today’s dollars"
                    : "Future dollars"}
                </small>
              ) : null}
            </section>
          ) : null}
          <CalculationSteps document={document} />
          {document.unavailableEvidence?.length ? (
            <section className="explanation-section evidence-unavailable">
              <h3>Unavailable evidence</h3>
              <p>
                This explanation could not be completed because the following evidence was unavailable:
                {" "}{document.unavailableEvidence.join(", ")}.
              </p>
            </section>
          ) : null}
          {document.assumptions.length > 0 ? (
            <section className="explanation-section">
              <h3>Active assumptions and sources</h3>
              <div className="assumption-list">
                {document.assumptions.map((assumption, index) => (
                  <div className="assumption-row" key={`${assumption.label}-${index}`}>
                    <span>
                      <strong>{assumption.label}</strong>
                      {assumption.sourceDescription ? <small>{assumption.sourceDescription}</small> : null}
                      {assumption.effectiveDate ? <small>Effective {assumption.effectiveDate}</small> : null}
                    </span>
                    <span>{assumption.value}</span>
                    <SourceBadge source={assumption.sourceType} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {document.dataSections.length > 0 ? (
            <section className="explanation-section">
              <h3>Evidence and data</h3>
              <div className="explanation-data-list">
                {document.dataSections.map((section, index) => (
                  <ExplanationDataTable section={section} key={`${section.title}-${index}`} />
                ))}
              </div>
            </section>
          ) : null}
          {document.caveats.length > 0 ? (
            <section className="explanation-section">
              <h3>Important caveats</h3>
              <ul className="caveat-list">
                {document.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
              </ul>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
