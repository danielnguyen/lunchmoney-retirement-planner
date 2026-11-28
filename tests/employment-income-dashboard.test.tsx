// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { EmploymentIncome } from "@/components/employment-income";
import { POST } from "@/app/api/v1/projections/route";
import { fireInputs } from "./fixtures/fire-milestones";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { currentBaselineFixture } from "./fixtures/projection";
import { careerPreset } from "@/src/domain/scenario/career";

vi.mock("recharts", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, LineChart: Container, CartesianGrid: Empty, Legend: Empty, Line: Empty, Tooltip: Empty, XAxis: Empty, YAxis: Empty };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("opts in, selects explicit terms, edits retirement and invalidates baseline overrides through the actual API", async () => {
  const inputs = fireInputs();
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init)));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<EmploymentIncome inputs={inputs} definitions={[]} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  await screen.findByText("Baseline income curve");
  expect(screen.getAllByText(/Select explicit future employment/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Use illustrative Ontario terms (no match)" }));
  await screen.findAllByText("Tested boundary");
  expect(screen.getByText(/Stress unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/all amounts on this curve remain annual today/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Income curve full retirement age"), { target: { value: "41" } });
  await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).employmentIncome.retirementAge).toBe(41));
  const changed = structuredClone(inputs);
  changed.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
  rerender(<EmploymentIncome inputs={changed} definitions={[]} />);
  expect(screen.queryByText("Baseline income curve")).not.toBeInTheDocument();
  await screen.findAllByText("No passing sampled income");
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  expect(screen.queryByText("Baseline income curve")).not.toBeInTheDocument();
});

it("shows unavailable net overrides and keeps temporary job terms out of exports", async () => {
  const inputs = fireInputs();
  const definition = careerPreset(inputs, "reduced_income");
  definition.label = "Synthetic private employer";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init))));
  render(<EmploymentIncome inputs={inputs} definitions={[definition]} />);
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  fireEvent.change(screen.getByLabelText("Income curve employment template"), { target: { value: definition.id } });
  await screen.findAllByText(/reliable salary relation/);
  const baseline = structuredClone(currentBaselineFixture);
  baseline.scenarioComparison = [definition];
  const snapshot = createProjectionSnapshot(calculateProjection(inputs), baseline, {}, "2026-01-01T00:00:00Z");
  expect(JSON.stringify(snapshot)).not.toMatch(/maxAnnualGrossToday|resolutionAnnualGrossToday|Synthetic private employer|career-reduced_income/);
  const bad = await POST(new Request("http://localhost/api/v1/projections", { method: "POST", body: JSON.stringify({ inputs, employmentIncome: { unexpected: true } }) }));
  expect(bad.status).toBe(400);
});

it("does not construct illustrative job terms without a baseline employment interval", () => {
  const inputs = fireInputs();
  inputs.person.employmentIncomePhases = [];
  render(<EmploymentIncome inputs={inputs} definitions={[]} />);
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  expect(screen.getByRole("button", { name: "Use illustrative Ontario terms (no match)" })).toBeDisabled();
});
