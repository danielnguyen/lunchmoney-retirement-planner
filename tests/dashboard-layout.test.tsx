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
  ScenarioControlsDrawer,
  YearAgeTick,
} from "@/components/planner-dashboard";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function ScenarioHarness() {
  const [opener, setOpener] = useState<HTMLButtonElement | null>(null);
  const [override, setOverride] = useState("100");
  return (
    <>
      <button
        type="button"
        aria-expanded={opener !== null}
        aria-controls="scenario-controls-drawer"
        onClick={(event) => setOpener(event.currentTarget)}
      >
        Scenario controls
      </button>
      {opener ? (
        <ScenarioControlsDrawer opener={opener} onClose={() => setOpener(null)}>
          <label htmlFor="synthetic-override">Synthetic override</label>
          <input
            id="synthetic-override"
            value={override}
            onChange={(event) => setOverride(event.target.value)}
          />
          <button type="button" onClick={() => setOverride("100")}>Reset all</button>
        </ScenarioControlsDrawer>
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
        Lunch Money mappings
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

describe("responsive scenario controls", () => {
  it("keeps the report full width and places both drawer triggers first in the hero actions", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const heroActions = dashboard.slice(
      dashboard.indexOf('<div className="hero-actions no-print">'),
      dashboard.indexOf("</div>", dashboard.indexOf('<div className="hero-actions no-print">')),
    );
    const toolbar = dashboard.slice(
      dashboard.indexOf('<section className="toolbar no-print"'),
      dashboard.indexOf("</section>", dashboard.indexOf('<section className="toolbar no-print"')),
    );

    expect(css).toContain(".report-layout { display: block; }");
    expect(css).not.toContain("@media (min-width: 1480px)");
    expect(css).not.toContain("controls-panel-desktop");
    expect(css).not.toContain("grid-template-columns: minmax(0, 3fr)");
    expect(css).not.toContain("scenario-controls-trigger");
    expect(heroActions.indexOf("Lunch Money mappings")).toBeLessThan(
      heroActions.indexOf("Scenario controls"),
    );
    expect(heroActions.indexOf("Scenario controls")).toBeLessThan(
      heroActions.indexOf("Print"),
    );
    expect(heroActions.indexOf("Print")).toBeLessThan(
      heroActions.indexOf("Export JSON"),
    );
    expect(toolbar).not.toContain("Scenario controls");
    expect(toolbar).not.toContain("Lunch Money mappings");
    expect(dashboard.match(/aria-controls="lunch-money-mappings-drawer"/g)).toHaveLength(1);
    expect(dashboard.match(/aria-controls="scenario-controls-drawer"/g)).toHaveLength(1);
    expect(dashboard).not.toContain("controls-panel-desktop");
  });

  it("mounts exactly one controls tree in the drawer and never in the report column", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const mountedPanels = dashboard.match(/<ScenarioControlsPanel/g) ?? [];
    const report = dashboard.slice(
      dashboard.indexOf('<section className="report-layout">'),
      dashboard.indexOf('<section className="report-card assumptions">'),
    );
    const drawerStart = dashboard.indexOf("{scenarioControls ? (");
    const drawer = dashboard.slice(
      drawerStart,
      dashboard.indexOf("</main>", drawerStart),
    );

    expect(mountedPanels).toHaveLength(1);
    expect(report).not.toContain("ScenarioControlsPanel");
    expect(report).not.toContain("controls-panel");
    expect(drawer).toContain("<ScenarioControlsDrawer");
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

  it("keeps the narrow drawer closed by default and exposes its ARIA contract", () => {
    render(<ScenarioHarness />);
    const opener = screen.getByRole("button", { name: "Scenario controls" });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", "scenario-controls-drawer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Scenario controls" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    expect(screen.getByRole("button", { name: "Close scenario controls" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("closes through the close button, Escape, or backdrop and restores focus", () => {
    render(<ScenarioHarness />);
    const opener = screen.getByRole("button", { name: "Scenario controls" });

    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close scenario controls" }));
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
    const opener = screen.getByRole("button", { name: "Lunch Money mappings" });

    expect(opener).toHaveAttribute("aria-expanded", "false");
    expect(opener).toHaveAttribute("aria-controls", "lunch-money-mappings-drawer");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(opener);
    expect(opener).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Lunch Money mappings" })).toHaveAttribute(
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
    const close = screen.getByRole("button", { name: "Close Lunch Money mappings" });
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
    const opener = screen.getByRole("button", { name: "Scenario controls" });
    fireEvent.click(opener);
    const input = screen.getByLabelText("Synthetic override");
    fireEvent.change(input, { target: { value: "250" } });
    fireEvent.click(screen.getByRole("button", { name: "Close scenario controls" }));
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

    expect(openExplanation).toContain("setScenarioControls(null)");
    expect(openExplanation).toContain("setLunchMoneyMappings(null)");
    expect(scenarioButton).toContain("setActiveExplanation(null)");
    expect(scenarioButton).toContain("setLunchMoneyMappings(null)");
    expect(mappingsButton).toContain("setActiveExplanation(null)");
    expect(mappingsButton).toContain("setScenarioControls(null)");
    expect(scenarioButton).not.toContain("setOverrides");
    expect(scenarioButton).not.toContain("setProjectionResult");
  });

  it("keeps drawer UI out of print and bounds it on mobile", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
    const print = css.slice(css.indexOf("@media print"));

    expect(mobile).toContain(".scenario-controls-drawer, .lunch-money-mappings-drawer { width: 100vw");
    expect(mobile).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain(".scenario-controls-drawer-content, .lunch-money-mappings-drawer-content { height: calc(100% - 84px)");
    expect(css).toContain("overflow-y: auto");
    expect(print).toContain(".scenario-controls-overlay");
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
