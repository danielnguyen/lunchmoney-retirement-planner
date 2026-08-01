// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerDashboard } from "@/components/planner-dashboard";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { currentBaselineFixture } from "./fixtures/projection";

vi.mock("recharts", () => {
  const EmptyChart = () => null;
  return {
    Area: EmptyChart,
    Bar: EmptyChart,
    BarChart: EmptyChart,
    CartesianGrid: EmptyChart,
    Cell: EmptyChart,
    ComposedChart: EmptyChart,
    Legend: EmptyChart,
    Line: EmptyChart,
    Pie: EmptyChart,
    PieChart: EmptyChart,
    ReferenceLine: EmptyChart,
    ResponsiveContainer: EmptyChart,
    Tooltip: EmptyChart,
    XAxis: EmptyChart,
    YAxis: EmptyChart,
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("dashboard config-save baseline transitions", () => {
  it("leads with personal-target retirement outlook and keeps the model minimum secondary", async () => {
    const projection = calculateProjection(
      currentBaselineFixture.projectionInputs,
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        return jsonResponse(structuredClone(currentBaselineFixture));
      }
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const outlook = await screen.findByRole("region", { name: "Retirement outlook" });
    const outlookView = within(outlook);
    expect(outlookView.getByText("Expected retirement savings at age 65")).toBeInTheDocument();
    expect(outlookView.getByText("Your personal retirement target")).toBeInTheDocument();
    expect(outlookView.getByText(/(above|below) your .* target/)).toBeInTheDocument();
    expect(outlookView.getByText(/Savings (remain|are projected to run out)/)).toBeInTheDocument();
    expect(outlookView.getByText("Model-calculated minimum")).toBeInTheDocument();
    expect(
      outlookView.getByText(/It is not your personal target or a recommended retirement target/),
    ).toBeInTheDocument();
    expect(outlookView.getByText(/At retirement on [A-Z][a-z]+ \d{1,2}, \d{4}/)).toBeInTheDocument();
    expect(screen.getByText("Data through July 14, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Retirement Planner" })).toBeInTheDocument();
    expect(screen.queryByText("Retirement lifecycle report")).not.toBeInTheDocument();
    expect(screen.queryByText("Your live financial baseline, projected forward.")).not.toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Planner sections" });
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Retirement income" })).toHaveAttribute("href", "#retirement-income");
    expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute("href", "#spending");
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "#accounts");
    expect(screen.getByRole("link", { name: "Assumptions" })).toHaveAttribute("href", "#assumptions");
    expect(navigation.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Try another plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Lunch Money" })).toBeInTheDocument();
    expect(screen.getByText("Lunch Money connected · read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today's dollars" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Future dollars" })).toBeInTheDocument();
    expect(screen.getByText("Annual spending projection")).toBeInTheDocument();
    expect(screen.queryByText("Owner goal marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Owner-goal difference")).not.toBeInTheDocument();
    expect(screen.getByText("Tax status")).toBeInTheDocument();
    expect(screen.getByText("Provisional")).toBeInTheDocument();
    expect(
      screen.getByText(/progressive Canadian taxes and RRIF minimums/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connected accounts" }));
    expect(screen.getByRole("dialog", { name: "Connected accounts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close connected accounts" }));
  });

  it("renders shared Canadian annual tax evidence and its provisional limits", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.projectionInputs.tax = {
      mode: "canadian_annual",
      source: "explicit_configuration",
      effectiveTaxRate: 0.2,
      oasRecoveryThresholdToday: 90_000,
      oasRecoveryRate: 0.15,
      province: "ON",
      referenceYear: 2026,
      futureIndexingRate: 0.02,
      openingTaxYearBeforeProjectionMonth: {
        calendarYear: 2026,
        throughMonth: 6,
        income: {
          employment: 40_000,
          cpp: 0,
          oas: 0,
          pension: 0,
          rrspWithdrawals: 0,
          rrifWithdrawals: 0,
          otherTaxableIncome: 0,
        },
        source: "explicit_configuration",
      },
      limitations: [
        "rrif_minimum_withdrawals_not_modelled",
        "non_registered_investment_income_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    for (const phase of baseline.projectionInputs.person.employmentIncomePhases) {
      phase.annualTaxableEmploymentIncomeToday = 100_000;
    }
    const projection = calculateProjection(baseline.projectionInputs);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        return jsonResponse(baseline);
      }
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    expect(
      await screen.findByText("Canadian annual tax · latest modelled period"),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Canada \/ Ontario/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Full liability/)).toBeInTheDocument();
    expect(screen.getByText(/embedded\/outside projection/)).toBeInTheDocument();
    expect(screen.getByText(/projection-funded/)).toBeInTheDocument();
    expect(screen.getAllByText(/RRIF minimum withdrawals/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Opening tax-year context/)).toBeInTheDocument();
  });

  it("shows the active terminal override separately from its compatibility YAML source", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.projectionInputs.retirementRequirement = {
      minimumEndingFinancialAssetsToday: 0,
      baselineSource: "compatibility_default",
      activeValueSource: "compatibility_default",
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (url === "/api/v1/baseline/current") {
          return jsonResponse(structuredClone(baseline));
        }
        if (url === "/api/v1/projections") {
          const request = JSON.parse(String(init?.body)) as {
            inputs: ProjectionInputs;
          };
          return jsonResponse(calculateProjection(request.inputs));
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    expect(
      await screen.findByText(
        "Source: Compatibility default · retirementRequirement omitted from YAML",
      ),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Try another plan" }),
    );
    fireEvent.change(
      await screen.findByLabelText(
        "Minimum financial assets at terminal age",
      ),
      { target: { value: "12345.67" } },
    );

    expect(
      await screen.findByText(
        "Source: Temporary scenario override · YAML baseline: compatibility default (block omitted)",
      ),
    ).toBeInTheDocument();
  });

  it("shows an honest unavailable requirement without a misleading zero", async () => {
    const projection = calculateProjection(
      currentBaselineFixture.projectionInputs,
    );
    projection.retirementRequirement = {
      ...projection.retirementRequirement,
      status: "unavailable",
      requiredFinancialAssetsToday: null,
      fundingMarginToday: null,
      composition: [],
      bindingConstraint: "unavailable_composition",
      reason: "Synthetic projected composition is unavailable.",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        return jsonResponse(structuredClone(currentBaselineFixture));
      }
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const outlook = await screen.findByRole("region", { name: "Retirement outlook" });
    expect(within(outlook).getByText("Unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("Synthetic projected composition is unavailable."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No model comparison is available"),
    ).toBeInTheDocument();
  });

  it("opens blocking repair in the unified YAML drawer and reloads the dashboard", async () => {
    const blockingError = {
      error: "configuration_required",
      message: "Synthetic planner configuration needs repair.",
      connection: { status: "connected", message: "Synthetic connection" },
      unmappedAccounts: [],
      unmappedCategories: [],
    };
    let baselineRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        baselineRequests += 1;
        return baselineRequests === 1
          ? jsonResponse(blockingError, 422)
          : jsonResponse(structuredClone(currentBaselineFixture));
      }
      if (url === "/api/v1/projections") {
        const payload = JSON.parse(init?.body as string) as { inputs: ProjectionInputs };
        return jsonResponse(calculateProjection(payload.inputs));
      }
      if (url === "/api/v1/config/current" && !init?.method) {
        return jsonResponse({
          contents: "currentAge: 38\n",
          displayPath: "planner.local.yaml",
          writeEnabled: true,
          version: "sha256:loaded",
        });
      }
      if (url === "/api/v1/config/current" && init?.method === "POST") {
        return jsonResponse({ valid: true });
      }
      if (url === "/api/v1/config/current" && init?.method === "PUT") {
        return jsonResponse({ version: "sha256:repaired" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerDashboard />);

    expect(await screen.findByText("Live baseline required.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Planner config" })).not.toBeInTheDocument();
    const repair = screen.getByRole("button", { name: "Repair planner config" });
    expect(repair).toHaveAttribute("aria-controls", "scenario-controls-drawer");
    fireEvent.click(repair);

    const dialog = await screen.findByRole("dialog", { name: "Planner YAML configuration" });
    expect(dialog).toHaveAttribute("id", "scenario-controls-drawer");
    expect(screen.queryByRole("button", { name: "Back to plan controls" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: { value: "currentAge: 39\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByRole("region", { name: "Retirement outlook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try another plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Planner config" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Planner YAML configuration" })).toHaveAttribute(
      "id",
      "scenario-controls-drawer",
    );
    expect(screen.getByRole("button", { name: "Back to plan controls" })).toBeInTheDocument();
  });

  it("clears overrides and stale projection before regenerating from a reloaded baseline", async () => {
    const initialBaseline = structuredClone(currentBaselineFixture);
    const refreshedBaseline = structuredClone(currentBaselineFixture);
    refreshedBaseline.dataThrough = "2026-08-14";
    refreshedBaseline.projectionInputs.monthlyEssentialSpendingToday = 3600.25;
    const pendingProjection = deferred<Response>();
    const projectionInputs: ProjectionInputs[] = [];
    let baselineRequests = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        baselineRequests += 1;
        return jsonResponse(baselineRequests === 1 ? initialBaseline : refreshedBaseline);
      }
      if (url === "/api/v1/projections") {
        const payload = JSON.parse(init?.body as string) as { inputs: ProjectionInputs };
        projectionInputs.push(payload.inputs);
        if (baselineRequests >= 2) return pendingProjection.promise;
        return jsonResponse(calculateProjection(payload.inputs));
      }
      if (url === "/api/v1/config/current" && !init?.method) {
        return jsonResponse({
          contents: "currentAge: 38\n",
          displayPath: "planner.local.yaml",
          writeEnabled: true,
          version: "sha256:loaded",
        });
      }
      if (url === "/api/v1/config/current" && init?.method === "POST") {
        return jsonResponse({ valid: true });
      }
      if (url === "/api/v1/config/current" && init?.method === "PUT") {
        return jsonResponse({ version: "sha256:saved" });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerDashboard />);

    expect(await screen.findByRole("region", { name: "Retirement outlook" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    const essential = await screen.findByLabelText("Essential monthly spending");
    fireEvent.change(essential, { target: { value: "4321.67" } });
    await waitFor(() => {
      expect(projectionInputs.at(-1)?.monthlyEssentialSpendingToday).toBe(4321.67);
    });
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const editor = await screen.findByLabelText("Planner YAML");
    fireEvent.change(editor, { target: { value: "currentAge: 39\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByText("Configuration saved and the active baseline was reloaded.")).toBeInTheDocument();
    await waitFor(() => {
      expect(projectionInputs.at(-1)?.monthlyEssentialSpendingToday).toBe(3600.25);
    });
    expect(screen.queryByRole("region", { name: "Retirement outlook" })).not.toBeInTheDocument();
    expect(screen.getByText("Recalculating…")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Planner YAML configuration" })).toBeInTheDocument();

    await act(async () => {
      pendingProjection.resolve(
        jsonResponse(calculateProjection(projectionInputs.at(-1)!)),
      );
    });
    expect(await screen.findByRole("region", { name: "Retirement outlook" })).toBeInTheDocument();
    expect(projectionInputs.at(-1)?.monthlyEssentialSpendingToday).toBe(3600.25);
  }, 10_000);

  it("installs a blocking error after reload failure and keeps the editor usable for repair", async () => {
    const initialBaseline = structuredClone(currentBaselineFixture);
    const repairedBaseline = structuredClone(currentBaselineFixture);
    repairedBaseline.dataThrough = "2026-08-14";
    repairedBaseline.projectionInputs.monthlyEssentialSpendingToday = 3700.5;
    const blockingError = {
      error: "configuration_required",
      message: "Synthetic mappings need correction.",
      connection: { status: "connected", message: "Synthetic connection" },
      unmappedAccounts: [],
      unmappedCategories: [],
    };
    const projectionInputs: ProjectionInputs[] = [];
    let baselineRequests = 0;
    let configReads = 0;
    let configWrites = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") {
        baselineRequests += 1;
        if (baselineRequests === 1) return jsonResponse(initialBaseline);
        if (baselineRequests === 2) return jsonResponse(blockingError, 422);
        return jsonResponse(repairedBaseline);
      }
      if (url === "/api/v1/projections") {
        const payload = JSON.parse(init?.body as string) as { inputs: ProjectionInputs };
        projectionInputs.push(payload.inputs);
        return jsonResponse(calculateProjection(payload.inputs));
      }
      if (url === "/api/v1/config/current" && !init?.method) {
        configReads += 1;
        return jsonResponse({
          contents: "currentAge: 38\n",
          displayPath: "planner.local.yaml",
          writeEnabled: true,
          version: "sha256:loaded",
        });
      }
      if (url === "/api/v1/config/current" && init?.method === "POST") {
        return jsonResponse({ valid: true });
      }
      if (url === "/api/v1/config/current" && init?.method === "PUT") {
        configWrites += 1;
        const body = JSON.parse(init!.body as string) as { expectedVersion: string };
        expect(body.expectedVersion).toBe(
          configWrites === 1 ? "sha256:loaded" : "sha256:saved-1",
        );
        return jsonResponse({ version: `sha256:saved-${configWrites}` });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerDashboard />);

    expect(await screen.findByRole("region", { name: "Retirement outlook" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.change(await screen.findByLabelText("Essential monthly spending"), {
      target: { value: "4321.67" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const editor = await screen.findByLabelText("Planner YAML");
    fireEvent.change(editor, { target: { value: "currentAge: 39\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByText("Live baseline required.")).toBeInTheDocument();
    expect(screen.getByText("Synthetic mappings need correction.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Retirement outlook" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Planner YAML configuration" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair planner config" })).toHaveAttribute(
      "aria-controls",
      "scenario-controls-drawer",
    );
    expect(screen.queryByRole("button", { name: "Back to plan controls" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Planner YAML")).toHaveValue("currentAge: 39\n");
    expect(screen.getByRole("status")).toHaveTextContent("Configuration saved to disk.");
    expect(screen.getByText(
      "Configuration saved, but the active baseline could not be loaded. Fix the configuration and save again.",
    )).toHaveAttribute("role", "alert");
    expect(configReads).toBe(1);

    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: { value: "currentAge: 40\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByText("Configuration saved and the active baseline was reloaded.")).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "Retirement outlook" })).toBeInTheDocument();
    expect(projectionInputs.at(-1)?.monthlyEssentialSpendingToday).toBe(3700.5);
    expect(configReads).toBe(1);
  });
});
