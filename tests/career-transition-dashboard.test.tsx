// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ScenarioComparison } from "@/components/scenario-comparison";
import { POST } from "@/app/api/v1/projections/route";
import { careerPreset } from "@/src/domain/scenario/career";
import { projectionFixture, currentBaselineFixture } from "./fixtures/projection";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type { ComparisonResult } from "@/src/domain/scenario/comparison";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null, Bar: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function input() {
  const p = structuredClone(projectionFixture);
  p.person.retirementAge = 42;
  p.endAge = 44;
  p.events = [];
  p.person.employmentIncomePhases[0].endAge = 42;
  p.spendingPhases[0].endAge = 44;
  p.accounts[1].contributionPhases[0].endAge = 42;
  return p;
}

it.each(["reduced_income", "coast", "barista", "coast_to_barista"] as const)("edits %s in the existing comparison and sends real inputs through the API", async kind => {
  const inputs = input();
  const results: ComparisonResult[][] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const response = await POST(new Request("http://localhost/api/v1/projections", init));
    if (response.ok) results.push(await response.clone().json());
    return response;
  }));
  const baseline = { id: "baseline", label: "Unchanged baseline", spending: [], personalContributions: [], contributionPolicy: "configured_fixed_plan" as const };
  render(<ScenarioComparison inputs={inputs} definitions={[baseline]} />);
  await screen.findByRole("region", { name: "Side-by-side scenario scorecard" });
  fireEvent.click(screen.getByRole("button", { name: `Add ${kind.replaceAll("_", " ")} preset` }));
  await waitFor(() => expect(results.at(-1)).toHaveLength(2));
  const before = results.at(-1)![1].summary!.endingFinancialAssetsToday;
  expect(results.at(-1)![0].definition).toEqual(baseline);
  fireEvent.click(screen.getByText("Edit gross/net pay, retirement age and scenario assumptions"));
  fireEvent.change(screen.getAllByLabelText("Annual net cash after payroll and employee withholding")[0], { target: { value: "90000" } });
  await waitFor(() => expect(results.at(-1)![1].summary!.endingFinancialAssetsToday).not.toBe(before));
  const card = await screen.findByRole("region", { name: "Side-by-side scenario scorecard" });
  expect(within(card).getByText("Working-life cash feasibility")).toBeInTheDocument();
  expect(within(card).getByText("Full-horizon viability")).toBeInTheDocument();
  expect(screen.getAllByText("Full-horizon annual cash allocation")[0]).toBeInTheDocument();
  expect(results.at(-1)![1].trajectory.at(-1)!.age).toBe(44);
  expect(inputs.person.retirementAge).toBe(42);
  fireEvent.change(screen.getByLabelText("Full retirement age"), { target: { value: "40" } });
  expect(await screen.findByRole("alert")).toHaveTextContent(/contiguous|ordered|retirement/);
});

it("preserves mobile control structure, explicit payroll selection and export privacy", async () => {
  const inputs = input();
  const scenario = careerPreset(inputs, "coast");
  scenario.label = "Synthetic private career label";
  scenario.careerTransition!.phases[0].label = "Synthetic private employer";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init))));
  render(<ScenarioComparison inputs={inputs} definitions={[scenario]} />);
  await screen.findByRole("region", { name: "Side-by-side scenario scorecard" });
  fireEvent.click(screen.getByText("Edit gross/net pay, retirement age and scenario assumptions"));
  fireEvent.change(screen.getByLabelText("Employment assumption"), { target: { value: "gross_estimate" } });
  expect(screen.getByLabelText("Annual gross pay today")).toHaveValue(0);
  fireEvent.change(screen.getByLabelText("Annual gross pay today"), { target: { value: "30000" } });
  fireEvent.click(screen.getByText("Payroll estimate provenance and limits"));
  expect(screen.getByRole("link", { name: "CRA 2026 reference 1" })).toHaveAttribute("href", expect.stringContaining("canada.ca"));
  const baseline = structuredClone(currentBaselineFixture);
  baseline.scenarioComparison = [scenario];
  const snapshot = createProjectionSnapshot(calculateProjection(inputs), baseline, {}, "2026-01-01T00:00:00.000Z");
  expect(JSON.stringify(snapshot)).not.toMatch(/Synthetic private|careerTransition|scenarioComparison/);
});
