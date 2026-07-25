// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { useMemo, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildControls,
  evaluateNumericDraft,
  materializeInputs,
  ScenarioControlsPanel,
  type Overrides,
} from "@/components/planner-dashboard";
import type { CurrentBaseline } from "@/src/domain/baseline/types";
import { projectionFixture } from "./fixtures/projection";

afterEach(cleanup);

function ScenarioInputHarness() {
  const [projectionInputs, setProjectionInputs] = useState(() =>
    structuredClone(projectionFixture),
  );
  const controls = useMemo(() => buildControls(projectionInputs), [projectionInputs]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const inputs = useMemo(
    () => materializeInputs(projectionInputs, controls, overrides),
    [controls, overrides, projectionInputs],
  );
  const baseline = {
    projectionInputs,
    provenance: {
      annualInflation: {
        value: projectionInputs.annualInflation,
        sourceType: "local_configuration",
        sourceDescription: "Configured inflation",
        effectiveDate: "2026-07-01",
      },
      "person.employmentIncomePhases.current-income.annualNetCashToday": {
        value: projectionInputs.person.employmentIncomePhases[0]!.annualNetCashToday,
        sourceType: "lunchmoney_derived",
        sourceDescription: "Live annualized synthetic income",
        effectiveDate: "2026-07-01",
      },
      monthlyEssentialSpendingToday: {
        value: projectionInputs.monthlyEssentialSpendingToday,
        sourceType: "lunchmoney_derived",
        sourceDescription: "Synthetic transaction baseline",
        effectiveDate: "2026-07-01",
      },
    },
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
      <button
        type="button"
        onClick={() => {
          const refreshed = structuredClone(projectionFixture);
          refreshed.monthlyEssentialSpendingToday = 4100.45;
          refreshed.annualInflation = 0.03;
          setProjectionInputs(refreshed);
          setOverrides({});
        }}
      >
        Install refreshed baseline
      </button>
      <output data-testid="active-inflation">{inputs.annualInflation}</output>
      <output data-testid="active-reserve-indexing">
        {inputs.surplusAllocation.reserveIndexingRate}
      </output>
      <output data-testid="active-essential">
        {inputs.monthlyEssentialSpendingToday}
      </output>
      <output data-testid="override-count">{Object.keys(overrides).length}</output>
    </>
  );
}

function typeByCharacters(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value: "" } });
  let draft = "";
  for (const character of value) {
    draft += character;
    fireEvent.change(input, { target: { value: draft } });
  }
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

  it("distinguishes temporary scenarios, baseline values, and human-readable sources", () => {
    render(<ScenarioInputHarness />);

    expect(screen.getByLabelText("Inflation").closest(".control")).toHaveTextContent(
      "Source: planner.local.yaml",
    );
    expect(screen.getByLabelText("Current income annual net cash").closest(".control"))
      .toHaveTextContent("Source: Live Lunch Money baseline (live_baseline)");
    expect(screen.getByLabelText("Essential monthly spending").closest(".control"))
      .toHaveTextContent("Source: Live Lunch Money baseline");

    fireEvent.change(screen.getByLabelText("Inflation"), {
      target: { value: "2.5" },
    });
    const inflationControl = screen.getByLabelText("Inflation").closest(".control")!;
    expect(inflationControl).toHaveTextContent("Scenario: 2.5%");
    expect(inflationControl).toHaveTextContent("Baseline: 2%");
    expect(inflationControl).toHaveTextContent("Source: planner.local.yaml");
  });

  it("keeps an empty currency draft without temporarily applying zero", () => {
    render(<ScenarioInputHarness />);
    const essential = screen.getByLabelText("Essential monthly spending");

    fireEvent.change(essential, { target: { value: "" } });

    expect(essential).toHaveValue(null);
    expect(screen.getByTestId("active-essential")).toHaveTextContent("3200");
    expect(screen.getByTestId("override-count")).toHaveTextContent("0");
    expect(essential).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a valid number.")).toBeInTheDocument();
  });

  it("commits character-by-character currency typing with exact cents", () => {
    render(<ScenarioInputHarness />);
    const essential = screen.getByLabelText("Essential monthly spending");

    typeByCharacters(essential, "4321.67");

    expect(essential).toHaveValue(4321.67);
    expect(screen.getByTestId("active-essential")).toHaveTextContent("4321.67");
    expect(screen.getByTestId("override-count")).toHaveTextContent("1");
  });

  it("converts percentage points only when a complete valid draft commits", () => {
    render(<ScenarioInputHarness />);
    const inflation = screen.getByLabelText("Inflation");

    typeByCharacters(inflation, "5.25");

    expect(inflation).toHaveValue(5.25);
    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.0525");
    expect(inflation).toHaveAttribute("step", "0.01");
  });

  it("does not corrupt the committed override during a transitional trailing decimal", () => {
    render(<ScenarioInputHarness />);
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(inflation, { target: { value: "5" } });
    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.05");
    fireEvent.change(inflation, { target: { value: "5." } });

    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.05");
    expect(inflation).toHaveAttribute("aria-invalid", "true");
    expect(evaluateNumericDraft("5.", 0, 10)).toEqual({
      status: "invalid",
      message: "Enter a valid number.",
    });
  });

  it("accepts negative values only when the configured range allows them", () => {
    render(<ScenarioInputHarness />);
    const reserveIndexing = screen.getByLabelText("Reserve indexing rate");
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(reserveIndexing, { target: { value: "-5.25" } });
    expect(screen.getByTestId("active-reserve-indexing")).toHaveTextContent("-0.0525");
    expect(reserveIndexing).not.toHaveAttribute("aria-invalid");

    fireEvent.change(inflation, { target: { value: "-1" } });
    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.02");
    expect(inflation).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Enter a value from 0 to 10.")).toBeInTheDocument();
  });

  it("does not update projection inputs for an out-of-range draft", () => {
    render(<ScenarioInputHarness />);
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(inflation, { target: { value: "11" } });

    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.02");
    expect(screen.getByTestId("override-count")).toHaveTextContent("0");
    expect(inflation).toHaveAttribute("aria-invalid", "true");
    expect(inflation).toHaveAttribute("aria-describedby");
  });

  it("restores the current scenario value on blur when a draft is incomplete", () => {
    render(<ScenarioInputHarness />);
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(inflation, { target: { value: "" } });
    fireEvent.blur(inflation);

    expect(inflation).toHaveValue(2);
    expect(inflation).not.toHaveAttribute("aria-invalid");
    expect(screen.getByTestId("active-inflation")).toHaveTextContent("0.02");
  });

  it("synchronizes drafts after reset-one and reset-all", () => {
    render(<ScenarioInputHarness />);
    const essential = screen.getByLabelText("Essential monthly spending");
    const inflation = screen.getByLabelText("Inflation");

    fireEvent.change(essential, { target: { value: "4321.67" } });
    fireEvent.change(essential, { target: { value: "" } });
    fireEvent.click(essential.closest(".control")!.querySelector("button")!);
    expect(essential).toHaveValue(3200);
    expect(screen.getByTestId("active-essential")).toHaveTextContent("3200");

    fireEvent.change(essential, { target: { value: "4500.25" } });
    fireEvent.change(inflation, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(essential).toHaveValue(3200);
    expect(inflation).toHaveValue(2);
    expect(screen.getByTestId("override-count")).toHaveTextContent("0");
  });

  it("synchronizes displayed drafts when a refreshed baseline replaces active values", () => {
    render(<ScenarioInputHarness />);
    const essential = screen.getByLabelText("Essential monthly spending");

    fireEvent.change(essential, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Install refreshed baseline" }));

    expect(screen.getByLabelText("Essential monthly spending")).toHaveValue(4100.45);
    expect(screen.getByLabelText("Inflation")).toHaveValue(3);
    expect(screen.getByTestId("active-essential")).toHaveTextContent("4100.45");
  });
});
