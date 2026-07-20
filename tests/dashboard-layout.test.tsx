// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFile } from "node:fs/promises";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScenarioControlsDrawer } from "@/components/planner-dashboard";

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

describe("responsive scenario controls", () => {
  it("uses a flexible 3:1 desktop column only at the wide breakpoint", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const desktop = css.slice(css.indexOf("@media (min-width: 1480px)"));

    expect(css).toContain(".report-layout { display: block; }");
    expect(css).toContain(".controls-panel-desktop { display: none; }");
    expect(desktop).toContain(
      "grid-template-columns: minmax(0, 3fr) minmax(300px, 1fr)",
    );
    expect(desktop).toContain(".controls-panel-desktop { display: block; }");
    expect(css).not.toContain("grid-template-columns: minmax(0, 1fr) 380px");
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

  it("uses mutually exclusive scenario and explanation drawer state", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const openExplanation = dashboard.slice(
      dashboard.indexOf("const openExplanation"),
      dashboard.indexOf("const closeExplanation"),
    );
    const scenarioButton = dashboard.slice(
      dashboard.indexOf('aria-controls="scenario-controls-drawer"'),
      dashboard.indexOf('<span className="status">'),
    );

    expect(openExplanation).toContain("setScenarioControls(null)");
    expect(scenarioButton).toContain("setActiveExplanation(null)");
  });

  it("keeps drawer UI out of print and bounds it on mobile", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const mobile = css.slice(css.indexOf("@media (max-width: 620px)"));
    const print = css.slice(css.indexOf("@media print"));

    expect(mobile).toContain(".scenario-controls-drawer { width: 100vw");
    expect(css).toContain(".scenario-controls-drawer-content { height: calc(100% - 84px)");
    expect(css).toContain("overflow-y: auto");
    expect(print).toContain(".scenario-controls-overlay");
    expect(print).toContain("display: none !important");
  });
});
