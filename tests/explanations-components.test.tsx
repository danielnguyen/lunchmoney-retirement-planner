// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFile } from "node:fs/promises";
import { useCallback, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ExplainableHeading,
  ExplanationDrawer,
} from "@/components/explanations";
import {
  explanationTargets,
  type ExplanationDocument,
  type ExplanationTarget,
} from "@/src/domain/explanations/types";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const explanation: ExplanationDocument = {
  id: "starting-financial-assets",
  title: "Starting financial assets",
  plainLanguage: "Synthetic explanation.",
  displayedResult: { label: "Starting financial assets", value: "$200,000" },
  formula: "Cash + investments",
  steps: [
    {
      label: "Cash",
      value: "$20,000.00",
      operation: "input",
      sourceType: "lunchmoney",
    },
  ],
  dataSections: [
    {
      title: "Synthetic evidence",
      columns: [{ key: "value", label: "Value" }],
      rows: [{ value: 200000 }],
    },
  ],
  assumptions: [],
  caveats: [],
};

function Harness() {
  const [active, setActive] = useState<{
    target: ExplanationTarget;
    opener: HTMLButtonElement;
  } | null>(null);
  const open = useCallback((target: ExplanationTarget, opener: HTMLButtonElement) => {
    setActive({ target, opener });
  }, []);
  const close = useCallback(() => setActive(null), []);
  return (
    <>
      <ExplainableHeading
        target="starting-financial-assets"
        title="Starting financial assets"
        onExplain={open}
      />
      {active ? (
        <ExplanationDrawer document={explanation} opener={active.opener} onClose={close} />
      ) : null}
    </>
  );
}

describe("explanation accessibility components", () => {
  it("shows a semantic tooltip on hover and keyboard focus", () => {
    render(<Harness />);
    const info = screen.getByRole("button", {
      name: "What does Starting financial assets mean?",
    });

    fireEvent.mouseEnter(info);
    const hovered = screen.getByRole("tooltip");
    expect(hovered).toHaveTextContent("included cash and investment balances");
    expect(info).toHaveAttribute("aria-describedby", hovered.id);

    fireEvent.mouseLeave(info);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    fireEvent.focus(info);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("opens a labelled modal drawer, locks scrolling, and closes with Escape", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Explain" });
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Starting financial assets" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Close explanation" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
  });

  it("closes with the explicit close button and restores opener focus", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Explain" });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close explanation" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("closes when the backdrop is clicked but not when the drawer is clicked", () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Explain" });
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Starting financial assets" });

    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("explanation-overlay"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("traps keyboard focus inside the open drawer", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Explain" }));
    const close = screen.getByRole("button", { name: "Close explanation" });
    const summary = screen.getByText("Synthetic evidence");

    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(summary).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("hides tooltip, Explain, and drawer UI from print", async () => {
    const css = await readFile("app/globals.css", "utf8");
    const printRules = css.slice(css.indexOf("@media print"));

    expect(printRules).toContain(".info-tooltip-wrap");
    expect(printRules).toContain(".explain-control");
    expect(printRules).toContain(".explanation-overlay");
    expect(printRules).toContain("display: none !important");
  });

  it("wires every required explanation target into the dashboard", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");

    for (const target of explanationTargets) {
      expect(dashboard).toContain(`target="${target}"`);
    }
  });

  it("renders government-benefit values from the calculation result", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");

    expect(dashboard).toContain("projection.governmentBenefits.cpp");
    expect(dashboard).toContain("projection.governmentBenefits.oas");
    expect(dashboard).not.toContain("cppClaimFactor");
    expect(dashboard).not.toContain("oasClaimFactor");
  });
});
