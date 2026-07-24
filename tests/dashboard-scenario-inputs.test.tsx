// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildControls,
  materializeInputs,
  ScenarioControlsPanel,
  type Overrides,
} from "@/components/planner-dashboard";
import type { CurrentBaseline } from "@/src/domain/baseline/types";
import { projectionFixture } from "./fixtures/projection";

afterEach(cleanup);

function ScenarioInputHarness() {
  const projectionInputs = useMemo(() => structuredClone(projectionFixture), []);
  const controls = useMemo(() => buildControls(projectionInputs), [projectionInputs]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const inputs = useMemo(
    () => materializeInputs(projectionInputs, controls, overrides),
    [controls, overrides, projectionInputs],
  );
  const baseline = {
    projectionInputs,
    provenance: {},
  } as unknown as CurrentBaseline;

  return (
    <>
      <ScenarioControlsPanel
        baseline={baseline}
        inputs={inputs}
        controls={controls}
        overrides={overrides}
        setOverrides={setOverrides}
      />
      <output data-testid="active-inflation">{inputs.annualInflation}</output>
      <output data-testid="active-essential">
        {inputs.monthlyEssentialSpendingToday}
      </output>
      <output data-testid="override-count">{Object.keys(overrides).length}</output>
    </>
  );
}

describe("precise scenario input semantics", () => {
  it("renders every age as a range and every non-age numeric control as a number input", () => {
    const controls = buildControls(structuredClone(projectionFixture));
    render(<ScenarioInputHarness />);

    expect(screen.getAllByRole("slider")).toHaveLength(
      controls.filter((control) => control.kind === "age").length,
    );
    expect(screen.getAllByRole("spinbutton")).toHaveLength(
      controls.filter((control) => control.kind !== "age").length,
    );
    expect(screen.getByLabelText("CPP start age")).toHaveAttribute("type", "range");
    expect(screen.getByLabelText("OAS start age")).toHaveAttribute("type", "range");
    expect(screen.getByLabelText("Projection end age")).toHaveAttribute("type", "range");
  });

  it("displays percentage points and converts precise edits back to domain decimals", () => {
    render(<ScenarioInputHarness />);
    const inflation = screen.getByLabelText("Inflation");

    expect(inflation).toHaveValue(projectionFixture.annualInflation * 100);
    expect(inflation).toHaveAttribute("step", "0.01");
    fireEvent.change(inflation, { target: { value: "5.257" } });

    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.05257");
    expect(screen.getByTestId("override-count")).toHaveTextContent("1");
  });

  it("preserves precise currency edits and supports reset-one and reset-all", () => {
    render(<ScenarioInputHarness />);
    const essential = screen.getByLabelText("Essential monthly spending");
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(essential, { target: { value: "4321.67" } });
    fireEvent.change(inflation, { target: { value: "5.25" } });
    expect(screen.getByTestId("active-essential")).toHaveTextContent("4321.67");
    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.0525");
    expect(screen.getByTestId("override-count")).toHaveTextContent("2");

    fireEvent.click(essential.closest(".control")!.querySelector("button")!);
    expect(screen.getByTestId("active-essential")).toHaveTextContent(
      String(projectionFixture.monthlyEssentialSpendingToday),
    );
    expect(screen.getByTestId("override-count")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.getByTestId("active-inflation")).toHaveTextContent(
      String(projectionFixture.annualInflation),
    );
    expect(screen.getByTestId("override-count")).toHaveTextContent("0");
  });
});
