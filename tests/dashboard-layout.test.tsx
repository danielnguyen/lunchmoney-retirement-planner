// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFile } from "node:fs/promises";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnnualXAxis,
  formatProjectedAge,
  LunchMoneyMappingsDrawer,
  PlannerConfigurationDrawer,
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
    expect(dashboard).toContain('<nav className="application-navigation no-print" aria-label="Planner sections">');
    expect(dashboard).toContain('<a href="#overview" aria-current="page">Overview</a>');
    expect(dashboard).not.toContain("Retirement lifecycle report");
    expect(dashboard).not.toContain("Your live financial baseline, projected forward.");
    expect(dashboard.match(/aria-controls="lunch-money-mappings-drawer"/g)).toHaveLength(1);
    expect(dashboard.match(/aria-controls="scenario-controls-drawer"/g)).toHaveLength(2);
    expect(dashboard).not.toContain("controls-panel-desktop");
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

  it("routes retirement summary cards separately while preserving the schedule chart", async () => {
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

    expect(homeEquityCard).toContain('title="Home equity"');
    expect(homeEquityCard).toContain("retirementSnapshot[mode].balances.homeEquity");
    expect(liabilitiesCard).toContain('title="Total liabilities"');
    expect(liabilitiesCard).toContain("retirementSnapshot[mode].balances.totalLiabilities");
    expect(liabilitiesChart).toContain('target="liability-schedule"');
    expect(liabilitiesChart).toContain('title="Liabilities and home equity"');
  });

  it("renders projection completion independently from the derived requirement", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    const completionCard = dashboard.slice(
      dashboard.indexOf("<span>Projection completion</span>"),
      dashboard.indexOf(
        "</article>",
        dashboard.indexOf("<span>Projection completion</span>"),
      ),
    );
    const durationCard = dashboard.slice(
      dashboard.indexOf('target="financial-assets-duration"'),
      dashboard.indexOf(
        "</article>",
        dashboard.indexOf('target="financial-assets-duration"'),
      ),
    );

    expect(completionCard).toContain(
      'projection.projectionCompletion.status === "complete"',
    );
    expect(completionCard).toContain("Projected path stopped early");
    expect(completionCard).toContain("completedThroughDate");
    expect(completionCard).toContain("stoppedBeforeMonth");
    expect(durationCard).toContain("Not established");
    expect(durationCard).toContain("last completed balance");
    expect(dashboard).toContain(
      "projection.retirementRequirement.status === \"available\"",
    );
  });

  it("renders shared RRIF lifecycle and annual minimum evidence", async () => {
    const dashboard = await readFile(
      "components/planner-dashboard.tsx",
      "utf8",
    );
    expect(dashboard).toContain("<span>RRIF lifecycle</span>");
    expect(dashboard).toContain("Statutory minimums active");
    expect(dashboard).toContain("Compatibility milestone only");
    expect(dashboard).toContain("latestRrifPeriod.minimumRequired");
    expect(dashboard).toContain("latestRrifPeriod.forcedDecemberWithdrawal");
    expect(dashboard).toContain("latestRrifPeriod.remainingMinimum");
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
      fontSize: 12,
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
