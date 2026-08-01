// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerDashboard } from "@/components/planner-dashboard";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type {
  ScenarioApplyResult,
  ScenarioPreview,
  ScenarioReviewItem,
} from "@/src/config/scenario-draft";
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

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
}

function requestBody(init?: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

const directChange: ScenarioReviewItem = {
  key: "annualInflation",
  label: "Inflation",
  formattedActiveBaselineValue: "2%",
  draftDestinations: [{
    displayName: "Inflation",
    formattedCurrentValue: "2%",
    sourceKind: "number",
  }],
  destinationCount: 1,
  formattedScenarioValue: "2.5%",
  source: "planner.local.yaml",
  consequence: "Updates the corresponding configured scalar in the YAML draft only.",
};

const liveChange: ScenarioReviewItem = {
  key: "person.employmentIncomePhases.current-income.annualNetCashToday",
  label: "Current income annual net cash",
  formattedActiveBaselineValue: "$84,000.00",
  draftDestinations: [{
    displayName: "Current income annual net cash",
    formattedCurrentValue: "live_baseline",
    sourceKind: "live_baseline",
  }],
  destinationCount: 1,
  formattedScenarioValue: "$85,000.00",
  source: "Live Lunch Money baseline (live_baseline)",
  consequence:
    "Future Lunch Money income changes will no longer update this field automatically.",
};

const secondLiveChange: ScenarioReviewItem = {
  ...liveChange,
  key: "contributionPhase.synthetic.current.monthlyAmountToday",
  label: "Current contribution monthly amount",
  formattedActiveBaselineValue: "$500.00",
  draftDestinations: [{
    displayName: "Current contribution monthly amount",
    formattedCurrentValue: "live_baseline",
    sourceKind: "live_baseline",
  }],
  formattedScenarioValue: "$550.00",
};

const spendingChange: ScenarioReviewItem = {
  key: "monthlyEssentialSpendingToday",
  label: "Essential monthly spending",
  formattedActiveBaselineValue: "$3,200.00",
  draftDestinations: [],
  destinationCount: 0,
  formattedScenarioValue: "$3,300.25",
  source: "Live Lunch Money transaction baseline",
  consequence:
    "This value is calculated from Lunch Money transactions. The YAML config adjusts it through spending-phase multipliers, so this absolute scenario value cannot be applied directly.",
};

const directPreview: ScenarioPreview = {
  directChanges: [directChange],
  liveBaselineConversions: [],
  scenarioOnlyChanges: [],
};

const dirtyDirectChange: ScenarioReviewItem = {
  ...directChange,
  draftDestinations: [{
    displayName: "Inflation",
    formattedCurrentValue: "3%",
    sourceKind: "number",
  }],
};

const dirtyDirectPreview: ScenarioPreview = {
  directChanges: [dirtyDirectChange],
  liveBaselineConversions: [],
  scenarioOnlyChanges: [spendingChange],
};

function installBaseFetch(
  scenarioHandler: (
    body: Record<string, unknown>,
  ) => Response | Promise<Response>,
  options: {
    writeEnabled?: boolean;
    validate?: (body: Record<string, unknown>) => Response | Promise<Response>;
    put?: (body: Record<string, unknown>) => Response | Promise<Response>;
    reload?: Response;
  } = {},
) {
  let baselineReads = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url === "/api/v1/baseline/current") {
      baselineReads += 1;
      if (baselineReads > 1 && options.reload) return options.reload;
      return jsonResponse(structuredClone(currentBaselineFixture));
    }
    if (url === "/api/v1/projections") {
      const body = requestBody(init) as { inputs: typeof currentBaselineFixture.projectionInputs };
      return jsonResponse(calculateProjection(body.inputs));
    }
    if (url === "/api/v1/config/current" && !init?.method) {
      return jsonResponse({
        contents: "annualInflation: 0.02\nannualNetCashToday: live_baseline\n",
        displayPath: "planner.local.yaml",
        writeEnabled: options.writeEnabled ?? true,
        version: "sha256:loaded",
      });
    }
    if (url === "/api/v1/config/current/scenario-draft") {
      return scenarioHandler(requestBody(init));
    }
    if (url === "/api/v1/config/current" && init?.method === "POST") {
      if (options.validate) return options.validate(requestBody(init));
      return jsonResponse({ valid: true });
    }
    if (url === "/api/v1/config/current" && init?.method === "PUT") {
      if (options.put) return options.put(requestBody(init));
      return jsonResponse({ version: "sha256:saved" });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function waitForDashboard() {
  expect(
    await screen.findByRole("region", { name: "Retirement outlook" }),
  ).toBeInTheDocument();
}

async function overrideInflation(value = "2.5") {
  fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
  fireEvent.change(await screen.findByLabelText("Inflation"), {
    target: { value },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("scenario-to-config dashboard workflow", () => {
  it("preserves temporary overrides and unsaved YAML across view switches without side effects", async () => {
    const fetchMock = installBaseFetch(() => {
      throw new Error("View switching must not call scenario application.");
    }, { writeEnabled: false });
    render(<PlannerDashboard />);
    await waitForDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.change(await screen.findByLabelText("Inflation"), {
      target: { value: "2.5" },
    });
    const overlay = screen.getByTestId("scenario-controls-overlay");
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const editor = await screen.findByLabelText("Planner YAML");
    fireEvent.change(editor, {
      target: {
        value: "annualInflation: 0.03\n# unsaved advanced draft\n",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Back to plan controls" }));
    expect(screen.getByTestId("scenario-controls-overlay")).toBe(overlay);
    expect(screen.getByLabelText("Inflation")).toHaveValue(2.5);
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    expect(screen.getByLabelText("Planner YAML")).toHaveValue(
      "annualInflation: 0.03\n# unsaved advanced draft\n",
    );
    expect(screen.getByText("Saving is disabled.", { exact: false })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) =>
      requestUrl(input) === "/api/v1/config/current/scenario-draft"
    )).toBe(false);
    expect(fetchMock.mock.calls.some(([input, init]) =>
      requestUrl(input) === "/api/v1/config/current" &&
      (init?.method === "POST" || init?.method === "PUT")
    )).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Refresh Lunch Money" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  }, 10_000);

  it("patches the existing dirty draft, never saves, and preserves it across drawer closes", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    const fetchMock = installBaseFetch((body) => {
      requestBodies.push(body);
      if (body.action === "preview") return jsonResponse(dirtyDirectPreview);
      return jsonResponse({
        contents: `${(body.contents as string).replace("annualInflation: 0.03", "annualInflation: 0.025")}\n# scenario patch\n`,
        appliedChanges: [{ ...dirtyDirectChange, kind: "config" }],
        skippedChanges: [{ ...spendingChange, kind: "scenario_only" }],
      } satisfies ScenarioApplyResult);
    }, { writeEnabled: false });
    render(<PlannerDashboard />);
    await waitForDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    const editor = await screen.findByLabelText("Planner YAML");
    fireEvent.change(editor, {
      target: {
        value: "annualInflation: 0.03\nannualNetCashToday: live_baseline\n# manual edit\n",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));

    await overrideInflation();
    const unifiedOverlay = screen.getByTestId("scenario-controls-overlay");
    fireEvent.change(screen.getByLabelText("Essential monthly spending"), {
      target: { value: "3300.25" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));

    expect(await screen.findByRole("dialog", { name: "Planner YAML configuration" })).toBeInTheDocument();
    expect(screen.getByTestId("scenario-controls-overlay")).toBe(unifiedOverlay);
    expect(screen.queryByTestId("planner-config-overlay")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Planner YAML")).toHaveValue(
      "annualInflation: 0.025\nannualNetCashToday: live_baseline\n# manual edit\n\n# scenario patch\n",
    );
    expect(requestBodies[0]).toMatchObject({
      action: "preview",
      expectedVersion: "sha256:loaded",
      contents: expect.stringContaining("# manual edit"),
      overrides: {
        annualInflation: 0.025,
        monthlyEssentialSpendingToday: 3300.25,
      },
    });
    expect(requestBodies[1]).toMatchObject({
      action: "apply",
      liveBaselineAction: "keep",
      contents: expect.stringContaining("# manual edit"),
    });
    expect(screen.getByText("Applied config changes")).toBeInTheDocument();
    expect(screen.getByText("Scenario-only values not applied")).toBeInTheDocument();
    expect(screen.getByText("This value is calculated from Lunch Money transactions.", {
      exact: false,
    })).toBeInTheDocument();
    expect(screen.getByText("Applied to YAML draft only—review these changes and press Save config separately.")).toBeInTheDocument();
    expect(screen.getByText("Active baseline: 2%")).toBeInTheDocument();
    expect(screen.getByText("Current YAML draft: 3%")).toBeInTheDocument();
    expect(screen.getByText("Scenario: 2.5%")).toBeInTheDocument();
    expect(screen.getByText("Saving is disabled.", { exact: false })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    expect((await screen.findByLabelText("Planner YAML") as HTMLTextAreaElement).value)
      .toContain("# manual edit");
    expect(screen.getByText("Applied config changes")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: {
        value: `${(screen.getByLabelText("Planner YAML") as HTMLTextAreaElement).value}# edited after apply\n`,
      },
    });
    expect(screen.getByText(
      "The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.",
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply scenario to config" }));
    expect(await screen.findByText("Last scenario application")).toBeInTheDocument();
    expect(screen.queryByText(
      "The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.",
    )).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revert changes" }));
    await waitFor(() => {
      expect(screen.queryByText("Applied config changes")).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText("Planner YAML")).toHaveValue(
      "annualInflation: 0.02\nannualNetCashToday: live_baseline\n",
    );
  }, 10_000);

  it("shows one live-baseline dialog only on apply and supports cancel then keep", async () => {
    let applyCalls = 0;
    installBaseFetch((body) => {
      if (body.action === "preview") {
        return jsonResponse({
          directChanges: [],
          liveBaselineConversions: [liveChange, secondLiveChange],
          scenarioOnlyChanges: [],
        } satisfies ScenarioPreview);
      }
      applyCalls += 1;
      expect(body.liveBaselineAction).toBe("keep");
      return jsonResponse({
        contents: body.contents as string,
        appliedChanges: [],
        skippedChanges: [{ ...liveChange, kind: "live_baseline_kept" }],
      } satisfies ScenarioApplyResult);
    });
    render(<PlannerDashboard />);
    await waitForDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.change(await screen.findByLabelText("Current income annual net cash"), {
      target: { value: "85000" },
    });
    expect(screen.queryByRole("dialog", { name: "Replace live-derived values?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));

    const warning = await screen.findByRole("dialog", { name: "Replace live-derived values?" });
    expect(warning).toHaveTextContent("future Lunch Money changes will no longer update them automatically");
    expect(screen.getAllByText("Current income annual net cash")).toHaveLength(1);
    expect(warning).toHaveTextContent("Current contribution monthly amount");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByLabelText("Current income annual net cash")).toHaveValue(85000);
    expect(applyCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));
    fireEvent.click(await screen.findByRole("button", { name: "Keep live baseline" }));
    expect(await screen.findByRole("dialog", { name: "Planner YAML configuration" })).toBeInTheDocument();
    expect(screen.getByText("Kept live")).toBeInTheDocument();
    expect(screen.getAllByText("No YAML values changed.", { exact: false })).toHaveLength(2);
    expect(applyCalls).toBe(1);
  });

  it("replaces a confirmed live value in the draft and retains overrides until save succeeds", async () => {
    installBaseFetch((body) => {
      if (body.action === "preview") {
        return jsonResponse({
          directChanges: [],
          liveBaselineConversions: [liveChange],
          scenarioOnlyChanges: [],
        } satisfies ScenarioPreview);
      }
      expect(body.liveBaselineAction).toBe("replace");
      return jsonResponse({
        contents: "annualInflation: 0.02\nannualNetCashToday: 85000\n",
        appliedChanges: [{ ...liveChange, kind: "live_baseline_conversion" }],
        skippedChanges: [],
      } satisfies ScenarioApplyResult);
    });
    render(<PlannerDashboard />);
    await waitForDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.change(await screen.findByLabelText("Current income annual net cash"), {
      target: { value: "85000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));
    fireEvent.click(await screen.findByRole("button", { name: "Replace with fixed values" }));

    expect(await screen.findByText("Replaced live-derived values")).toBeInTheDocument();
    expect((screen.getByLabelText("Planner YAML") as HTMLTextAreaElement).value)
      .toContain("85000");
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    expect(await screen.findByLabelText("Current income annual net cash")).toHaveValue(85000);
    expect(screen.getByText("Scenario: $85,000.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    fireEvent.click(await screen.findByRole("button", { name: "Save config" }));
    expect(await screen.findByText("Configuration saved and the active baseline was reloaded.")).toBeInTheDocument();
    expect(screen.queryByText("Replaced live-derived values")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    expect(await screen.findByLabelText("Current income annual net cash")).toHaveValue(84000);
    expect(screen.getByRole("button", { name: "Apply scenario to config" })).toBeDisabled();
  }, 10_000);

  it("preserves the draft, overrides, and summary after a save conflict", async () => {
    installBaseFetch((body) => {
      if (body.action === "preview") return jsonResponse(directPreview);
      return jsonResponse({
        contents: "annualInflation: 0.025\nannualNetCashToday: live_baseline\n",
        appliedChanges: [{ ...directChange, kind: "config" }],
        skippedChanges: [],
      } satisfies ScenarioApplyResult);
    }, {
      put: () => jsonResponse({
        error: "planner_config_conflict",
        message: "The planner configuration changed on disk. Revert changes first.",
      }, 409),
    });
    render(<PlannerDashboard />);
    await waitForDashboard();
    await overrideInflation();
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));
    expect(await screen.findByText("Applied config changes")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: {
        value: `${(screen.getByLabelText("Planner YAML") as HTMLTextAreaElement).value}# manual repair\n`,
      },
    });
    expect(screen.getByText(
      "The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.",
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByText("The planner configuration changed on disk. Revert changes first.")).toBeInTheDocument();
    expect((screen.getByLabelText("Planner YAML") as HTMLTextAreaElement).value)
      .toContain("0.025");
    expect(screen.getByText("Applied config changes")).toBeInTheDocument();
    expect(screen.getByText(
      "The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.",
    )).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    expect(await screen.findByLabelText("Inflation")).toHaveValue(2.5);
  });

  it("preserves the applied summary and stale notice after validation failure", async () => {
    installBaseFetch((body) => {
      if (body.action === "preview") return jsonResponse(directPreview);
      return jsonResponse({
        contents: "annualInflation: 0.025\nannualNetCashToday: live_baseline\n",
        appliedChanges: [{ ...directChange, kind: "config" }],
        skippedChanges: [],
      } satisfies ScenarioApplyResult);
    }, {
      validate: () => jsonResponse({
        error: "invalid_planner_config",
        message: "Synthetic validation failure.",
      }, 422),
    });
    render(<PlannerDashboard />);
    await waitForDashboard();
    await overrideInflation();
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));
    expect(await screen.findByText("Applied config changes")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: {
        value: `${(screen.getByLabelText("Planner YAML") as HTMLTextAreaElement).value}# invalid manual edit\n`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByText("Synthetic validation failure.")).toBeInTheDocument();
    expect(screen.getByText("Applied config changes")).toBeInTheDocument();
    expect(screen.getByText(
      "The YAML draft has been edited since this scenario was applied. Review the YAML as the source of truth.",
    )).toBeInTheDocument();
    expect(screen.getByLabelText("Planner YAML")).toHaveValue(
      "annualInflation: 0.025\nannualNetCashToday: live_baseline\n# invalid manual edit\n",
    );
  });

  it("preserves invalid manual YAML and overrides when preview validation fails", async () => {
    installBaseFetch(() => jsonResponse({
      error: "invalid_planner_config",
      message: "Synthetic YAML is malformed.",
    }, 422));
    render(<PlannerDashboard />);
    await waitForDashboard();

    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit YAML" }));
    fireEvent.change(await screen.findByLabelText("Planner YAML"), {
      target: { value: "annualInflation: [\n# keep this draft\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    await overrideInflation();
    const unifiedOverlay = screen.getByTestId("scenario-controls-overlay");
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));

    expect(await screen.findByText("Synthetic YAML is malformed.")).toBeInTheDocument();
    expect(screen.getByTestId("scenario-controls-overlay")).toBe(unifiedOverlay);
    expect(screen.getByLabelText("Planner YAML")).toHaveValue(
      "annualInflation: [\n# keep this draft\n",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close planner configuration" }));
    fireEvent.click(screen.getByRole("button", { name: "Try another plan" }));
    expect(await screen.findByLabelText("Inflation")).toHaveValue(2.5);
  });

  it("retains repair context but removes stale projections after a saved draft cannot reload", async () => {
    const blocking = jsonResponse({
      error: "configuration_required",
      message: "Synthetic mapping repair required.",
      connection: { status: "connected", message: "Synthetic connection" },
      unmappedAccounts: [],
      unmappedCategories: [],
    }, 422);
    installBaseFetch((body) => {
      if (body.action === "preview") return jsonResponse(directPreview);
      return jsonResponse({
        contents: "annualInflation: 0.025\nannualNetCashToday: live_baseline\n",
        appliedChanges: [{ ...directChange, kind: "config" }],
        skippedChanges: [],
      } satisfies ScenarioApplyResult);
    }, { reload: blocking });
    render(<PlannerDashboard />);
    await waitForDashboard();
    await overrideInflation();
    fireEvent.click(screen.getByRole("button", { name: "Apply scenario to config" }));
    expect(await screen.findByText("Applied config changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByText("Synthetic mapping repair required.")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Retirement outlook" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Planner YAML configuration" })).toBeInTheDocument();
    expect(screen.getByText("Applied config changes")).toBeInTheDocument();
    expect(screen.getByText(
      "Configuration saved, but the active baseline could not be loaded. Fix the configuration and save again.",
    )).toBeInTheDocument();
  });
});
