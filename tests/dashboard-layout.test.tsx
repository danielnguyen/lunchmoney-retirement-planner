// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFile } from "node:fs/promises";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnnualXAxis,
  formatCalculatedMinimumComparison,
  formatOverviewDate,
  formatOverviewMonth,
  formatPersonalTargetComparison,
  formatProjectedAge,
  LunchMoneyMappingsDrawer,
  PlannerConfigurationDrawer,
  retirementSavingsDurationLabel,
  wholeDollarComparison,
  YearAgeTick,
  type PlannerDrawerView,
} from "@/components/planner-dashboard";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function ScenarioHarness() {
  const [drawer, setDrawer] = useState<{
    opener: HTMLButtonElement;
    view: PlannerDrawerView;
  } | null>(null);
  const [override, setOverride] = useState("100");
  const [yaml, setYaml] = useState("currentAge: 38\n");
  return (
    <>
      <button
        type="button"
        aria-expanded={drawer !== null}
        aria-controls="scenario-controls-drawer"
        onClick={(event) => setDrawer({
          opener: event.currentTarget,
          view: "controls",
        })}
      >
        Try another plan
      </button>
      {drawer ? (
        <PlannerConfigurationDrawer
          view={drawer.view}
          controlsAvailable
          onViewChange={(view) => setDrawer((current) => current
            ? { ...current, view }
            : null)}
          opener={drawer.opener}
          onClose={() => setDrawer(null)}
        >
          {drawer.view === "controls" ? (
            <>
              <label htmlFor="synthetic-override">Synthetic override</label>
              <input
                id="synthetic-override"
                value={override}
                onChange={(event) => setOverride(event.target.value)}
              />
              <button type="button" onClick={() => setOverride("100")}>Reset all</button>
            </>
          ) : (
            <>
              <label htmlFor="synthetic-yaml">Planner YAML</label>
              <textarea
                id="synthetic-yaml"
                value={yaml}
                onChange={(event) => setYaml(event.target.value)}
              />
            </>
          )}
        </PlannerConfigurationDrawer>
      ) : null}
    </>
  );
}

const syntheticMappings = {
  accounts: [
    {
      mappingId: "manual:101",
      lunchMoneyId: 101,
      source: "manual" as const,
      label: "Synthetic cash account",
      description: "Synthetic institution",
    },
    {
      mappingId: "cash",
      lunchMoneyId: null,
      source: "cash" as const,
      label: "Cash transactions",
      description: null,
    },
  ],
  categories: [
    {
      mappingId: "201",
      lunchMoneyId: 201,
      name: "Synthetic category",
      description: "Synthetic category description",
    },
  ],
};

function MappingsHarness() {
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-expanded={opener !== null}
        aria-controls="lunch-money-mappings-drawer"
        onClick={(event) => setOpener(event.currentTarget)}
      >
        Connected accounts
      </button>
      {opener ? (
        <LunchMoneyMappingsDrawer
          mappings={syntheticMappings}
          opener={opener}
          onClose={() => setOpener(null)}
        />
      ) : null}
    </>
  );
}

describe("unified planner configuration drawer", () => {
  it("keeps the report full width and places the compact shell actions in order", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const applicationActionsStart = dashboard.lastIndexOf('<div className="application-actions no-print">');
    const applicationActions = dashboard.slice(
      applicationActionsStart,
      dashboard.indexOf("</div>", applicationActionsStart),
    );

    expect(css).toContain(".report-layout { display: block; }");
    expect(css).not.toContain("@media (min-width: 1480px)");
    expect(css).not.toContain("controls-panel-desktop");
    expect(css).not.toContain("grid-template-columns: minmax(0, 3fr)");
    expect(css).not.toContain("scenario-controls-trigger");
    expect(applicationActions.indexOf("Try another plan")).toBeLessThan(
      applicationActions.indexOf("Connected accounts"),
    );
    expect(applicationActions.indexOf("Connected accounts")).toBeLessThan(
      applicationActions.indexOf("Print"),
    );
    expect(applicationActions.indexOf("Print")).toBeLessThan(
      applicationActions.indexOf("Export"),
    );
    expect(applicationActions).not.toContain("Planner config");
    expect(dashboard).toContain('<nav className="application-navigation no-print" aria-label="Jump to planner section">');
    expect(dashboard).toContain('<a href="#overview">Overview</a>');
    expect(dashboard).not.toContain('aria-current="page"');
    expect(dashboard).not.toContain("Retirement lifecycle report");
    expect(dashboard).not.toContain("Your live financial baseline, projected forward.");
    expect(dashboard.match(/aria-controls="lunch-money-mappings-drawer"/g)).toHaveLength(1);
    expect(dashboard.match(/aria-controls="scenario-controls-drawer"/g)).toHaveLength(2);
    expect(dashboard).not.toContain("controls-panel-desktop");
  });

  it("keeps responsive anchor targets clear and critical shell text readable", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const tablet = css.slice(
      css.indexOf("@media (max-width: 900px)"),
      css.indexOf("@media (max-width: 620px)"),
    );
    const mobile = css.slice(
      css.indexOf("@media (max-width: 620px)"),
      css.indexOf("@media print"),
    );

    expect(css).toContain(".application-header { position: sticky;");
    expect(css).toContain(
      "#overview, #retirement-income, #spending, #accounts, #plan-details, #assumptions { scroll-margin-top: 110px; }",
    );
    expect(tablet).toContain(
      "#overview, #retirement-income, #spending, #accounts, #plan-details, #assumptions { scroll-margin-top: 12rem; }",
    );
    expect(mobile).toContain(".application-header { position: static;");
    expect(mobile).toContain(
      "#overview, #retirement-income, #spending, #accounts, #plan-details, #assumptions { scroll-margin-top: 1rem; }",
    );
    expect(css).toContain(
      ".application-actions .button, .application-status-controls .button, .application-status-controls .segmented button { min-height: 40px;",
    );
    expect(css).toContain(".application-navigation a { position: relative; flex: 0 0 auto;");
    expect(css).toContain(".application-status-copy p { margin: 0; color: var(--muted); font-size: 0.875rem;");
    expect(css).toContain(".connection-badge { display: inline-flex; width: fit-content; padding: 5px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); background: rgba(17, 21, 19, 0.7); font-size: 0.875rem;");
    expect(css).toContain(".status { color: var(--muted); font-size: 0.875rem; }");
  });

  it("uses one mint-led visual system without turning warnings into the active accent", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");

    expect(css).toContain("--accent: #70d6b2");
    expect(css).toContain("--warning: #f2bd63");
    expect(css).toContain("--radius-control: 8px");
    expect(css).toContain("--radius-inner: 10px");
    expect(css).toContain("--radius-section: 14px");
    const reportCardRuleStart = css.indexOf(".report-card { border: 1px solid var(--border)");
    const reportCardRule = css.slice(
      reportCardRuleStart,
      css.indexOf("}", reportCardRuleStart) + 1,
    );
    expect(reportCardRule).toContain("background: var(--surface-1)");
    expect(reportCardRule).not.toContain("box-shadow");
    expect(dashboard).toContain("const chartColors = {");
    expect(dashboard).not.toContain('fill="#d8bd65"');
    expect(dashboard).not.toContain('stroke="#f2bd63"');
  });

  it("keeps every user-facing CSS and chart label at the 14px floor", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const remSizes = [...css.matchAll(/font(?:-size)?:\s*(0?\.\d+)rem/g)]
      .map((match) => Number(match[1]));
    const pixelSizes = [...dashboard.matchAll(/fontSize=(?:"(\d+)"|\{(\d+)\})/g)]
      .map((match) => Number(match[1] ?? match[2]));

    expect(remSizes.length).toBeGreaterThan(0);
    expect(Math.min(...remSizes)).toBeGreaterThanOrEqual(0.875);
    expect(pixelSizes.length).toBeGreaterThan(0);
    expect(Math.min(...pixelSizes)).toBeGreaterThanOrEqual(14);
  });

  it("contains navigation, charts, tables, and drawers at narrow and zoomed widths", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const mobile = css.slice(
      css.indexOf("@media (max-width: 620px)"),
      css.indexOf("@media print"),
    );

    expect(css).toContain("overflow-x: clip");
    expect(css).toContain(".application-navigation { display: flex; flex-wrap: nowrap;");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".chart-shell { width: 100%; max-width: 100%;");
    expect(css).toContain(".table-shell { max-width: 100%; overflow: auto;");
    expect(css).toContain("width: min(720px, 100vw)");
    expect(mobile).toContain("main { width: min(calc(100% - 16px), 1540px)");
    expect(mobile).toContain(".outlook-supporting-figures { grid-template-columns: 1fr; }");
    expect(mobile).toContain(".application-navigation a { flex: 0 0 auto;");
  });

  it("renders supporting outlook figures as a divided grid rather than four cards", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const supportingStart = css.indexOf(".outlook-supporting-figures {");
    const supportingEnd = css.indexOf(".model-minimum-summary", supportingStart);
    const supportingStyles = css.slice(supportingStart, supportingEnd);
    const articleStart = supportingStyles.indexOf(".outlook-supporting-figures article {");
    const articleRule = supportingStyles.slice(
      articleStart,
      supportingStyles.indexOf("}", articleStart) + 1,
    );

    expect(supportingStyles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(supportingStyles).toContain("border-block: 1px solid var(--border)");
    expect(articleRule).not.toContain("background:");
    expect(articleRule).not.toContain("border-radius:");
    expect(articleRule).not.toMatch(/border:\s/);
  });

  it("connects every primary chart region to its visible heading", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const labelledFigures = dashboard.match(
      /<figure className="chart-shell [^"]+" aria-labelledby="[^"]+">/g,
    ) ?? [];
    const headingIds = dashboard.match(/headingId="[^"]+"/g) ?? [];

    expect(labelledFigures).toHaveLength(9);
    expect(headingIds).toHaveLength(9);
    for (const figure of labelledFigures) {
      const id = figure.match(/aria-labelledby="([^"]+)"/)?.[1];
      expect(dashboard).toContain(`headingId="${id}"`);
    }
  });

  it("prints a readable report without trapping every long section on one page", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const print = css.slice(css.indexOf("@media print"));

    expect(print).toContain("@page { margin: 0.55in; }");
    expect(print).toContain("background: #fff");
    expect(print).toContain(".plan-details-disclosure > :not(summary) { display: block !important; }");
    expect(print).toContain("thead { display: table-header-group; }");
    expect(print).toContain("th, td { border: 1px solid #777;");
    expect(print).toContain(".report-card, .plan-details, .plan-details-disclosure { break-inside: auto; }");
    expect(print).not.toContain(".retirement-outlook, .report-card, .plan-details-disclosure { break-inside: avoid;");
  });

  it("mounts exactly one controls tree in the drawer and never in the report column", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const mountedPanels = dashboard.match(/<ScenarioControlsPanel/g) ?? [];
    const report = dashboard.slice(
      dashboard.indexOf('<section className="report-layout">'),
      dashboard.indexOf('<section id="assumptions" className="report-card assumptions">'),
    );
    const drawerStart = dashboard.lastIndexOf("{plannerDrawer ? (");
    const drawer = dashboard.slice(
      drawerStart,
      dashboard.indexOf("</main>", drawerStart),
    );

    expect(mountedPanels).toHaveLength(1);
    expect(report).not.toContain("ScenarioControlsPanel");
    expect(report).not.toContain("controls-panel");
    expect(drawer).toContain("<PlannerConfigurationDrawer");
    expect(drawer).toContain("<ScenarioControlsPanel");
  });

  it("routes plain-language supporting figures separately while preserving the schedule chart", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const homeEquityCard = dashboard.slice(
      dashboard.indexOf('target="home-equity-at-retirement"'),
      dashboard.indexOf("</article>", dashboard.indexOf('target="home-equity-at-retirement"')),
    );
    const liabilitiesCard = dashboard.slice(
      dashboard.indexOf('target="liabilities-at-retirement"'),
      dashboard.indexOf("</article>", dashboard.indexOf('target="liabilities-at-retirement"')),
    );
    const liabilitiesChart = dashboard.slice(
      dashboard.indexOf('kicker="Home and liabilities"'),
      dashboard.indexOf("</article>", dashboard.indexOf('kicker="Home and liabilities"')),
    );

    expect(homeEquityCard).toContain('title="Home equity at retirement"');
    expect(homeEquityCard).toContain("retirementSnapshot[mode].balances.homeEquity");
    expect(liabilitiesCard).toContain('title="Debts at retirement"');
    expect(liabilitiesCard).toContain("retirementSnapshot[mode].balances.totalLiabilities");
    expect(liabilitiesChart).toContain('target="liability-schedule"');
    expect(liabilitiesChart).toContain('title="Liabilities and home equity"');
  });

  it("makes the personal target primary and the plan minimum explicitly secondary", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const outlookStart = dashboard.indexOf('<section id="overview" className="retirement-outlook"');
    const outlook = dashboard.slice(
      outlookStart,
      dashboard.indexOf('<section className="report-layout">', outlookStart),
    );

    expect(outlookStart).toBeGreaterThan(-1);
    expect(outlook).toContain("Retirement outlook");
    expect(outlook).toContain("Expected retirement savings at age");
    expect(outlook).toContain("Compared with your personal target");
    expect(outlook).toContain("retirementSavingsDurationLabel");
    expect(outlook).toContain("Your personal retirement target");
    expect(outlook).toContain("Minimum needed for the spending in this plan");
    expect(outlook).toContain("It is not your personal target or a recommended retirement target.");
    expect(outlook.indexOf("Your personal retirement target")).toBeLessThan(
      outlook.indexOf("Minimum needed for the spending in this plan"),
    );
    expect(outlook).not.toContain("Owner goal marker");
    expect(outlook).not.toContain("Owner-goal difference");
  });

  it("keeps important retirement-outlook labels at or above the typography floor", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const outlookStyles = css.slice(
      css.indexOf(".retirement-outlook"),
      css.indexOf(".report-layout"),
    );
    const importantLabelSelectors = [
      ".personal-target-comparison .explainable-title-row > span:first-child",
      ".personal-target-card .explainable-title-row > span:first-child",
      ".outlook-supporting-figures .explainable-title-row > span:first-child",
      ".model-minimum-summary .explainable-title-row > span:first-child",
    ];

    for (const selector of importantLabelSelectors) {
      const rule = outlookStyles.slice(
        outlookStyles.indexOf(selector),
        outlookStyles.indexOf("}", outlookStyles.indexOf(selector)) + 1,
      );
      expect(rule).toContain("font-size: 0.875rem");
    }
    expect(outlookStyles).not.toMatch(/font-size:\s*0\.(?:7\d|8[0-6])rem/);
  });

  it("uses readable, calendar-safe overview dates", () => {
    expect(formatOverviewDate("2026-07-14")).toBe("July 14, 2026");
    expect(formatOverviewDate("2028-02-29")).toBe("February 29, 2028");
    expect(formatOverviewMonth("2026-07")).toBe("July 2026");
    expect(formatOverviewDate("2027-02-29")).toBe("2027-02-29");
    expect(formatOverviewDate("not-a-date")).toBe("not-a-date");
  });

  it("states personal-target and savings-duration outcomes without relying on colour", () => {
    expect(formatPersonalTargetComparison(-194735, 1500000)).toBe(
      "$194,735 below your $1,500,000 target",
    );
    expect(formatPersonalTargetComparison(25000, 900000)).toBe(
      "$25,000 above your $900,000 target",
    );
    expect(formatPersonalTargetComparison(0, 900000)).toBe(
      "On target for $900,000",
    );
    expect(formatPersonalTargetComparison(0.49, 900000)).toBe(
      "On target for $900,000",
    );
    expect(formatPersonalTargetComparison(-0.49, 900000)).toBe(
      "On target for $900,000",
    );
    expect(formatPersonalTargetComparison(0.5, 900000)).toBe(
      "$1 above your $900,000 target",
    );
    expect(formatPersonalTargetComparison(-0.5, 900000)).toBe(
      "$1 below your $900,000 target",
    );

    expect(wholeDollarComparison(0)).toEqual({ direction: "equal", amount: "$0" });
    expect(formatCalculatedMinimumComparison(0)).toBe(
      "Equal to the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(0.49)).toBe(
      "Equal to the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(-0.49)).toBe(
      "Equal to the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(0.5)).toBe(
      "$1 above the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(-0.5)).toBe(
      "$1 below the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(25000)).toBe(
      "$25,000 above the minimum needed for this plan",
    );
    expect(formatCalculatedMinimumComparison(-194735)).toBe(
      "$194,735 below the minimum needed for this plan",
    );

    const complete = {
      plannedTerminalAge: 95,
      completedThroughDate: "2081-06-30",
      completedThroughAge: 95,
      lastCompletedFinancialAssetsToday: 100,
      lastCompletedNetWorthToday: 100,
      status: "complete" as const,
      stoppedBeforeMonth: null,
      reason: null,
    };
    expect(retirementSavingsDurationLabel(null, complete)).toBe(
      "Savings remain at age 95.",
    );
    expect(retirementSavingsDurationLabel(88.5, complete)).toBe(
      "Savings are projected to run out at age 88.5, before your planned final age of 95.",
    );

    const stopped = {
      ...complete,
      completedThroughDate: "2072-02-29",
      completedThroughAge: 87.7,
      status: "stopped_unfunded_liability" as const,
      stoppedBeforeMonth: "2072-03",
      reason: "Synthetic stopped projection.",
    };
    expect(retirementSavingsDurationLabel(null, stopped)).toBe(
      "How long savings last is not established because the projection stopped after February 29, 2072, at age 87.7.",
    );
    expect(retirementSavingsDurationLabel(84, stopped)).toBe(
      "Savings reached zero around age 84. The planner stopped after February 29, 2072, at age 87.7, so the full plan was not calculated.",
    );
  });

  it("moves technical evidence after the main report into five semantic disclosures", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    const outlook = dashboard.indexOf('<section id="overview" className="retirement-outlook"');
    const report = dashboard.indexOf('<section className="report-layout">');
    const details = dashboard.indexOf('<section id="plan-details" className="plan-details"');
    const assumptions = dashboard.indexOf('<section id="assumptions" className="report-card assumptions">');
    const planDetails = dashboard.slice(details, assumptions);

    expect(outlook).toBeLessThan(report);
    expect(report).toBeLessThan(details);
    expect(details).toBeLessThan(assumptions);
    expect(dashboard).not.toContain('className="summary-grid"');
    expect(planDetails.match(/<details className="plan-details-disclosure">/g)).toHaveLength(5);
    expect(planDetails).not.toContain("<details open");
    expect(planDetails).toContain("Taxes included");
    expect(planDetails).toContain("RRSP and RRIF withdrawals");
    expect(planDetails).toContain("Taxable investment account");
    expect(planDetails).toContain("How this plan was calculated");
    expect(planDetails).toContain("Calculation notes and limitations");
    for (const summary of planDetails.matchAll(/<summary>([\s\S]*?)<\/summary>/g)) {
      expect(summary[1]).not.toContain("<button");
      expect(summary[1]).not.toContain("ExplainableHeading");
    }
  });

  it("renders plain-language calculation coverage independently from the requirement", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    const calculationDisclosure = dashboard.slice(
      dashboard.indexOf('<span className="plan-details-title">How this plan was calculated</span>'),
      dashboard.indexOf("</details>", dashboard.indexOf('<span className="plan-details-title">How this plan was calculated</span>')),
    );
    expect(calculationDisclosure).toContain(
      'projection.projectionCompletion.status === "complete"',
    );
    expect(calculationDisclosure).toContain("Planned final age");
    expect(calculationDisclosure).toContain("Last completed date");
    expect(calculationDisclosure).toContain("Last completed age");
    expect(calculationDisclosure).toContain("Stopped early — the full plan was not calculated");
    expect(calculationDisclosure).toContain("Why it stopped");
    expect(calculationDisclosure).toContain("Stopped before");
    expect(calculationDisclosure).toContain("Minimum ending financial assets");
    expect(calculationDisclosure).toContain("Is home equity excluded from retirement funding?");
    expect(calculationDisclosure).toContain("Source of this rule");
    expect(calculationDisclosure).toContain('target="financial-assets-duration"');
    expect(dashboard).toContain(
      "projection.retirementRequirement.status === \"available\"",
    );
  });

  it("renders RRIF evidence with plain-language rows", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    expect(dashboard).toContain('<span className="plan-details-title">RRSP and RRIF withdrawals</span>');
    expect(dashboard).toContain("Required RRIF withdrawals are included from age");
    expect(dashboard).toContain("RRIF conversion is shown at age");
    expect(dashboard).toContain("Value at the start of the year");
    expect(dashboard).toContain("Minimum withdrawal required");
    expect(dashboard).toContain("Regular withdrawals");
    expect(dashboard).toContain("Additional year-end withdrawal needed");
    expect(dashboard).toContain("Minimum still outstanding");
    expect(dashboard).toContain("RRSP/RRIF value at end of year");
    expect(dashboard).toContain(
      "latestProjectionPeriod.calendarYear === latestRrifPeriod.calendarYear",
    );
    expect(dashboard).toContain("latestRrifPeriod.minimumRequired");
    expect(dashboard).toContain("latestRrifPeriod.forcedDecemberWithdrawal");
    expect(dashboard).toContain("latestRrifPeriod.remainingMinimum");
  });

  it("keeps first-level Plan details free of the retired card terminology", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const details = dashboard.indexOf('<section id="plan-details" className="plan-details"');
    const assumptions = dashboard.indexOf('<section id="assumptions" className="report-card assumptions">');
    const planDetails = dashboard.slice(details, assumptions);
    const summaries = [...planDetails.matchAll(/<summary>([\s\S]*?)<\/summary>/g)]
      .map((match) => match[1])
      .join("\n");
    const taxes = planDetails.slice(
      planDetails.indexOf('<span className="plan-details-title">Taxes included</span>'),
      planDetails.indexOf("Detailed tax calculation"),
    );
    const rrif = planDetails.slice(
      planDetails.indexOf('<span className="plan-details-title">RRSP and RRIF withdrawals</span>'),
      planDetails.indexOf("Technical calculation details"),
    );
    const taxable = planDetails.slice(
      planDetails.indexOf('<span className="plan-details-title">Taxable investment account</span>'),
      planDetails.indexOf("Account-by-account values"),
    );
    const firstLevelContent = [summaries, taxes, rrif, taxable].join("\n");

    for (const term of [
      "deterministic tax model",
      "Compatibility milestone only",
      "Statutory minimums active",
      "Simplified Canadian mode active",
      "embedded/outside projection",
      "projection-funded",
      "owner age basis",
      "settlement timing",
      "ACB disposed",
    ]) {
      expect(firstLevelContent).not.toContain(term);
    }
    expect(planDetails).toContain("Total estimated tax on all income included for the year");
    expect(planDetails).toContain("Tax already reflected in net income or opening-year context");
    expect(planDetails).toContain("Additional tax paid from projected cash and savings");
  });

  it("keeps important Plan details text at or above the typography floor", async () => {
    const css = await readFile("app/globals.css", "utf8");
    for (const selector of [
      ".plan-detail-evidence > span:first-child",
      ".plan-detail-evidence small",
      ".plan-detail-explanation-heading .explainable-title-row > span:first-child",
      ".plan-detail-definition-list dt, .plan-detail-definition-list dd",
      ".plan-detail-technical-list",
      ".plan-detail-table th, .plan-detail-table td",
    ]) {
      const start = css.indexOf(selector);
      const rule = css.slice(start, css.indexOf("}", start) + 1);
      expect(start).toBeGreaterThan(-1);
      expect(rule).toContain("font-size: 0.875rem");
    }
  });

  it("opens guided controls by default and exposes one stable ARIA contract", () => {
    render(<ScenarioHarness />);
    const opener = screen.getByRole("button", { name: "Try another plan" });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", "scenario-controls-drawer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Try another plan" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("button", { name: "Close planner configuration" })).toHaveFocus();
    const viewSwitch = screen.getByRole("button", { name: "Edit YAML" });
    expect(viewSwitch).toBeInTheDocument();
    viewSwitch.focus();
    expect(viewSwitch).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("switches views inside one mounted overlay and preserves both drafts", () => {
    render(<ScenarioHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    const overlay = screen.getByTestId("scenario-controls-overlay");
    const dialog = screen.getByRole("dialog", { name: "Try another plan" });
    fireEvent.change(screen.getByLabelText("Synthetic override"), {
      target: { value: "250" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    expect(screen.getByTestId("scenario-controls-overlay")).toBe(overlay);
    expect(screen.getByRole("dialog", { name: "Planner YAML configuration" })).toBe(dialog);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getAllByTestId("scenario-controls-overlay")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: { value: "currentAge: 39\n" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to plan controls" }));
    expect(screen.getByLabelText("Synthetic override")).toHaveValue("250");
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    expect(screen.getByLabelText("Planner YAML")).toHaveValue("currentAge: 39\n");
  });

  it("closes through the close button, Escape, or backdrop and restores focus", () => {
    render(<ScenarioHarness />);
    const opener = screen.getByRole("button", { name: "Try another plan" });

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId("scenario-controls-overlay"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("renders the read-only mappings drawer and preserves its full interaction contract", () => {
    render(<MappingsHarness />);
    const opener = screen.getByRole("button", { name: "Connected accounts" });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", "lunch-money-mappings-drawer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Connected accounts" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Accounts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Categories" })).toBeInTheDocument();
    expect(screen.getByText("manual:101")).toBeInTheDocument();
    expect(screen.getByText("Synthetic cash account")).toBeInTheDocument();
    expect(screen.getByText("Synthetic institution")).toBeInTheDocument();
    expect(screen.getByText("201")).toBeInTheDocument();
    expect(screen.getByText("Synthetic category description")).toBeInTheDocument();
    const close = screen.getByRole("button", { name: "Close connected accounts" });
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    fireEvent.click(opener);
    fireEvent.click(screen.getByTestId("lunch-money-mappings-overlay"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps temporary overrides while closed and preserves Reset all", () => {
    render(<ScenarioHarness />);
    const opener = screen.getByRole("button", { name: "Try another plan" });
    fireEvent.click(opener);
    const input = screen.getByLabelText("Synthetic override");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(opener);
    expect(screen.getByLabelText("Synthetic override")).toHaveValue("250");

    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.getByLabelText("Synthetic override")).toHaveValue("100");
  });

  it("uses mutually exclusive scenario, mappings, and explanation drawer state", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const openExplanation = dashboard.slice(
      dashboard.indexOf("const openExplanation"),
      dashboard.indexOf("const closeExplanation"),
    );
    const scenarioButton = dashboard.slice(
      dashboard.indexOf('aria-controls="scenario-controls-drawer"'),
      dashboard.indexOf("</button>", dashboard.indexOf('aria-controls="scenario-controls-drawer"')),
    );
    const mappingsButton = dashboard.slice(
      dashboard.indexOf('aria-controls="lunch-money-mappings-drawer"'),
      dashboard.indexOf("</button>", dashboard.indexOf('aria-controls="lunch-money-mappings-drawer"')),
    );

    expect(openExplanation).toContain("setPlannerDrawer(null)");
    expect(openExplanation).toContain("setLunchMoneyMappings(null)");
    expect(dashboard).toContain('openPlannerDrawer(event.currentTarget, "controls")');
    expect(mappingsButton).toContain("setActiveExplanation(null)");
    expect(mappingsButton).toContain("setPlannerDrawer(null)");
    expect(scenarioButton).not.toContain("setOverrides");
    expect(scenarioButton).not.toContain("setProjectionResult");
  });

  it("keeps drawer UI out of print and bounds it on mobile", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
    const print = css.slice(css.indexOf("@media print"));

    expect(mobile).toContain(".scenario-controls-drawer, .lunch-money-mappings-drawer { width: 100vw");
    expect(mobile).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain(".scenario-controls-drawer-content, .lunch-money-mappings-drawer-content { min-height: 0; flex: 1");
    expect(css).toContain("overflow-y: auto");
    expect(print).toContain(".scenario-controls-overlay");
    expect(css).not.toContain(".planner-config-overlay");
    expect(css).not.toContain(".planner-config-drawer");
    expect(print).toContain(".lunch-money-mappings-overlay");
    expect(print).toContain("display: none !important");
    expect(print).toContain(".plan-details-disclosure > :not(summary) { display: block !important; }");
  });
});

describe("annual chart year and age axes", () => {
  const chartData = [
    { year: 2026, age: 40.5 },
    { year: 2051, age: 65.5 },
  ];

  it("formats integer, half-year, and near-integer projected ages", () => {
    expect(formatProjectedAge(39)).toBe("39");
    expect(formatProjectedAge(39.5)).toBe("39.5");
    expect(formatProjectedAge(55.0000001)).toBe("55");
  });

  it("renders the calendar year above the exact age supplied by its chart row", () => {
    render(
      <svg>
        <YearAgeTick
          x={100}
          y={200}
          payload={{ value: 2026 }}
          chartData={chartData}
        />
      </svg>,
    );

    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.getByText("Age 40.5")).toBeInTheDocument();
    expect(screen.getByLabelText("2026, Age 40.5")).toBeInTheDocument();
  });

  it("preserves the numeric year domain, tick density, and label clearance", () => {
    const axis = AnnualXAxis({ chartData });

    expect(axis.props).toMatchObject({
      className: "annual-year-age-axis",
      dataKey: "year",
      minTickGap: 28,
      height: 52,
      tickMargin: 8,
      fontSize: 14,
    });
  });

  it("uses the shared axis for every annual chart and keeps reference lines on calendar years", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const annualAxes = dashboard.match(
      /<AnnualXAxis chartData=\{chartData\} \/>/g,
    ) ?? [];

    expect(annualAxes).toHaveLength(8);
    expect(dashboard).not.toContain('<XAxis dataKey="year"');
    expect(dashboard).toContain("dataKey=\"year\"");
    expect(dashboard).toContain("minTickGap={28}");
    expect(dashboard).toContain("x={point.calendarYear}");
    expect(dashboard).not.toContain("x={point.age}");
  });

  it("does not hide the shared age markers in mobile CSS", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));

    expect(mobile).not.toContain("annual-year-age-axis");
  });
});
