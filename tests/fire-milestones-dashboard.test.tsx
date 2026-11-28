// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PlannerDashboard } from "@/components/planner-dashboard";
import { FireMilestones } from "@/components/fire-milestones";
import { POST } from "@/app/api/v1/projections/route";
import { fireInputs, fireRequest } from "./fixtures/fire-milestones";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";
import { currentBaselineFixture } from "./fixtures/projection";

vi.mock("recharts", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;
  return { ResponsiveContainer: Container, ComposedChart: Container, LineChart: Container, BarChart: Container,
    Area: Empty, Bar: Empty, CartesianGrid: Empty, Cell: Empty, Legend: Empty, Line: Empty, Pie: Empty,
    PieChart: Empty, Tooltip: Empty, XAxis: Empty, YAxis: Empty, ReferenceLine: ({ x }: { x: number }) => <span data-testid="chart-marker">{x}</span> };
});
afterEach(() => { window.location.hash = ""; cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("calculates opt-in through the real API, edits terms and clears stale chart results", async () => {
  const inputs = fireInputs();
  const request = fireRequest(inputs);
  const onResult = vi.fn();
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init)));
  vi.stubGlobal("fetch", fetcher);
  const definitions = [{ id: "synthetic-coast", label: "Synthetic private employment", spending: [], personalContributions: [], contributionPolicy: "cash_constrained" as const, careerTransition: request.coast! }];
  const { rerender } = render(<FireMilestones inputs={inputs} definitions={definitions} onResult={onResult} />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await screen.findByText("Coast FIRE — Baseline");
  expect(screen.getByText(/Stress unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/Select explicit barista/)).toBeInTheDocument();
  expect(screen.getAllByText(/Condition met at modeled start/)).toHaveLength(2);
  fireEvent.click(screen.getByText("Barista employment assumptions and sources"));
  fireEvent.click(screen.getByRole("button", { name: "Use illustrative barista terms" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await waitFor(() => expect(screen.getAllByText(/Condition met at modeled start/)).toHaveLength(3));
  const barista = screen.getByText("Barista employment assumptions and sources").closest("details")!;
  fireEvent.change(within(barista).getByLabelText("Annual net cash after payroll and employee withholding"), { target: { value: "6000" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Calculate FIRE milestones" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).fireMilestones.barista.phases[0].employment.annualNetCashToday).toBe(6000));
  fireEvent.change(screen.getByLabelText("Milestone full retirement age"), { target: { value: "41" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Calculate FIRE milestones" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).fireMilestones.retirementAge).toBe(41));
  const changed = structuredClone(inputs);
  changed.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
  rerender(<FireMilestones inputs={changed} definitions={definitions} onResult={onResult} />);
  expect(onResult).toHaveBeenLastCalledWith(JSON.stringify(changed), null);
  await waitFor(() => expect(screen.getByRole("button", { name: "Calculate FIRE milestones" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await waitFor(() => expect(screen.getAllByText(/No milestone in tested range/)).toHaveLength(3));
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  expect(onResult).toHaveBeenLastCalledWith(JSON.stringify(changed), null);
  expect(screen.queryByText("Full FIRE — Baseline")).not.toBeInTheDocument();
  const baseline = structuredClone(currentBaselineFixture);
  baseline.scenarioComparison = definitions;
  const snapshot = createProjectionSnapshot(calculateProjection(inputs), baseline, {}, "2026-01-01T00:00:00Z");
  expect(JSON.stringify(snapshot)).not.toMatch(/fireMilestones|Synthetic private employment|synthetic-coast/);
});

it("rejects malformed requests and renders unavailable rather than inventing a date", async () => {
  const inputs = fireInputs();
  const bad = await POST(new Request("http://localhost/api/v1/projections", { method: "POST", body: JSON.stringify({ inputs, fireMilestones: { ...fireRequest(inputs), stepMonths: -1 } }) }));
  expect(bad.status).toBe(400);
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init))));
  render(<FireMilestones inputs={inputs} definitions={[]} onResult={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  fireEvent.change(screen.getByLabelText("Milestone full retirement age"), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/after the starting age/);
});


it("keeps milestone state alongside scenario comparison and removes chart markers when disabled", async () => {
  const baseline = structuredClone(currentBaselineFixture);
  baseline.projectionInputs = fireInputs();
  const request = fireRequest();
  baseline.scenarioComparison = [{ id: "configured-coast", label: "Configured synthetic Coast", spending: [], personalContributions: [], contributionPolicy: "cash_constrained", careerTransition: request.coast! }];
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    if (url === "/api/v1/baseline/current") return Response.json(baseline);
    if (url === "/api/v1/config/sync") return Response.json({ available: false });
    return POST(new Request("http://localhost/api/v1/projections", init));
  }));
  render(<PlannerDashboard />);
  await screen.findByRole("region", { name: "Side-by-side scenario scorecard" });
  await act(async () => { window.location.hash = "/fire-milestones"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  await screen.findByText(/2026-01: conditional full FIRE/);
  expect(screen.getByText("Full FIRE — Baseline")).toBeInTheDocument();
  expect(screen.getAllByTestId("chart-marker").some(x => x.textContent === "2026")).toBe(true);
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key|Maximum update/);
  await act(async () => { window.location.hash = "overview"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getAllByTestId("chart-marker").find(x => x.textContent === "2026")).toBeVisible();
  await act(async () => { window.location.hash = "/fire-milestones"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  await waitFor(() => expect(screen.queryByText(/conditional full FIRE/)).not.toBeInTheDocument());
  await act(async () => { window.location.hash = "overview"; window.dispatchEvent(new HashChangeEvent("hashchange")); });
  expect(screen.getByRole("region", { name: "Side-by-side scenario scorecard" })).toBeInTheDocument();
});


it("waits for explicit calculation and never submits another request during edits or an active calculation", async () => {
  let finish!: () => Promise<void>;
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>(resolve => {
    finish = async () => { resolve(await POST(new Request("http://localhost/api/v1/projections", init))); };
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<FireMilestones inputs={fireInputs()} definitions={[]} onResult={vi.fn()} />);
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  for (const value of ["41", "42", "41"]) fireEvent.change(screen.getByLabelText("Milestone full retirement age"), { target: { value } });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Calculate FIRE milestones" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Milestone full retirement age"), { target: { value: "42" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { await finish(); });
  expect(screen.getByRole("button", { name: "Calculate FIRE milestones" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent(/Assumptions changed/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
