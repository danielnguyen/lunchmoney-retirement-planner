// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  await screen.findByText("Baseline income curve");
  expect(screen.getAllByText(/Select explicit future employment/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "Use illustrative Ontario terms (no match)" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  await screen.findAllByText("Tested boundary");
  expect(screen.getByText(/Stress unavailable/)).toBeInTheDocument();
  expect(screen.getByText(/all amounts on this curve remain annual today/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Income curve full retirement age"), { target: { value: "41" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body as string).employmentIncome.retirementAge).toBe(41));
  const changed = structuredClone(inputs);
  changed.retirementRequirement.minimumEndingFinancialAssetsToday = 10000000;
  rerender(<EmploymentIncome inputs={changed} definitions={[]} />);
  expect(screen.queryByText("Baseline income curve")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Calculate income curve" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
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

it("shows actionable dated failures and keeps quantified trial evidence collapsed through the real API", async () => {
  const inputs = fireInputs();
  inputs.accounts[0].openingBalance = 0;
  inputs.surplusAllocation.targetCashReserveToday = 1000000;
  inputs.surplusAllocation.reserveIndexingRate = 0;
  const responses: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const response = await POST(new Request("http://localhost/api/v1/projections", init));
    responses.push(await response.clone().json());
    return response;
  }));
  render(<EmploymentIncome inputs={inputs} definitions={[]} />);
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  fireEvent.click(screen.getByRole("button", { name: "Use illustrative Ontario terms (no match)" }));
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  await screen.findAllByText(/2027-01: Protected reserve is not funded at transition/);
  expect(screen.getAllByText(/928,000.00 today/).length).toBeGreaterThan(0);
  const result = responses.at(-1) as import("@/src/domain/projection/employment-income").EmploymentIncomeResult;
  expect(result.points[1].required.tested.at(-1)!.failure).toMatchObject({
    date: "2027-01", category: "reserve", shortfallToday: 928000,
  });
  const evidence = screen.getAllByText("No passing sampled income")[0].closest("details")!;
  expect(evidence.open).toBe(false);
  fireEvent.click(evidence.querySelector("summary")!);
  expect(evidence.open).toBe(true);
  expect(screen.getByText("Income curve search limits").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByText("Income curve active funding assumptions").closest("details")).not.toHaveAttribute("open");
  expect(screen.getByLabelText("Income curve full retirement age").closest("details")).toBeNull();
});

it("returns opening reserve evidence through the projection API before immediate salary", async () => {
  const inputs = fireInputs();
  inputs.accounts[0].openingBalance = 0;
  inputs.surplusAllocation.targetCashReserveToday = 1000;
  inputs.surplusAllocation.reserveIndexingRate = 0;
  const career = careerPreset(inputs, "reduced_income").careerTransition!;
  career.phases[0].employment = { mode: "gross_estimate", annualGrossToday: 100000 };
  const response = await POST(new Request("http://localhost/api/v1/projections", {
    method: "POST", body: JSON.stringify({ inputs, employmentIncome: {
      career, retirementAge: 42, stepMonths: 12, maxAnnualGrossToday: 100000, resolutionAnnualGrossToday: 100,
    } }),
  }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.points[0].required.status).toBe("not_found");
  expect(result.points[0].required.tested.at(-1).failure).toMatchObject({
    date: "2026-01", category: "reserve", shortfallToday: 1000,
  });
});


it("waits for explicit calculation and never submits another request during edits or an active calculation", async () => {
  let finish!: () => Promise<void>;
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>(resolve => {
    finish = async () => { resolve(await POST(new Request("http://localhost/api/v1/projections", init))); };
  }));
  vi.stubGlobal("fetch", fetcher);
  render(<EmploymentIncome inputs={fireInputs()} definitions={[]}  />);
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  for (const value of ["41", "42", "41"]) fireEvent.change(screen.getByLabelText("Income curve full retirement age"), { target: { value } });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Calculate income curve" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Income curve full retirement age"), { target: { value: "42" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { await finish(); });
  expect(screen.getByRole("button", { name: "Calculate income curve" })).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent(/Assumptions changed/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("summarizes exact returned points, including caps and incomplete work, without solving selected ages", async () => {
  const inputs = fireInputs();
  const boundary = (gross: number, net: number) => ({ status: "available" as const, annualGrossToday: gross, annualNetCashToday: net, adjacentLowerFails: true, reason: "Synthetic tested boundary", testedCount: 2, tested: [] });
  const result: import("@/src/domain/projection/employment-income").EmploymentIncomeResult = {
    request: { retirementAge: 42, stepMonths: 12, maxAnnualGrossToday: 200000, resolutionAnnualGrossToday: 100, career: null },
    effectiveDate: inputs.startDate, stressConfigured: true, work: { simulations: 2, simulatedMonths: 96 },
    points: [
      { age: 40, date: "2026-01", path: "baseline", required: boundary(24500, 20500.25), livingCosts: boundary(16000, 15000.12), terminalFinancialAssetsToday: 0, provisionalTax: true },
      { age: 40, date: "2026-01", path: "stress", required: boundary(30000, 24000.50), livingCosts: boundary(17000, 16000), terminalFinancialAssetsToday: 0, provisionalTax: true },
      { age: 41, date: "2027-01", path: "baseline", required: { ...boundary(0, 0), status: "not_found", annualGrossToday: null, annualNetCashToday: null, reason: "Synthetic cap reached" }, livingCosts: boundary(14000, 13000), terminalFinancialAssetsToday: null, provisionalTax: true },
      { age: 41.9166666667, date: "2027-12", path: "baseline", required: { ...boundary(0, 0), status: "unavailable", annualGrossToday: null, annualNetCashToday: null, reason: "Synthetic work budget exhausted" }, livingCosts: { ...boundary(0, 0), status: "unavailable", annualGrossToday: null, annualNetCashToday: null, reason: "Synthetic work budget exhausted" }, terminalFinancialAssetsToday: null, provisionalTax: true },
    ],
  };
  const fetcher = vi.fn(async () => Response.json(result));
  vi.stubGlobal("fetch", fetcher);
  render(<EmploymentIncome inputs={inputs} definitions={[]} />);
  fireEvent.click(screen.getByLabelText("Calculate income by transition age"));
  fireEvent.click(screen.getByRole("button", { name: "Calculate income curve" }));
  await screen.findByLabelText("Tested transition age");
  const summary = screen.getByLabelText("Career independence summary");
  expect(summary).toHaveTextContent("$24,500.00 gross / year");
  expect(summary).toHaveTextContent("$20,500.25 estimated net / year");
  expect(summary).toHaveTextContent("$16,000.00 gross / year");
  expect(summary).toHaveTextContent("$15,000.12 estimated net / year");
  expect(summary).toHaveTextContent("$30,000.00 gross / year");
  expect(summary).toHaveTextContent("retire fully at 42");
  expect(screen.getByLabelText("Tested transition age").querySelectorAll("option")).toHaveLength(3);
  fireEvent.change(screen.getByLabelText("Tested transition age"), { target: { value: "2027-01" } });
  expect(summary).toHaveTextContent("Synthetic cap reached");
  expect(summary).not.toHaveTextContent("$24,500.00");
  expect(summary).toHaveTextContent("No result returned for this transition age");
  fireEvent.change(screen.getByLabelText("Tested transition age"), { target: { value: "2027-12" } });
  expect(summary).toHaveTextContent("Synthetic work budget exhausted");
  expect(summary).not.toHaveTextContent("$0.00 gross / year");
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Income curve full retirement age"), { target: { value: "43" } });
  expect(summary).not.toHaveTextContent("Synthetic work budget exhausted");
  expect(screen.queryByLabelText("Tested transition age")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
