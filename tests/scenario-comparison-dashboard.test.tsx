// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { ScenarioComparison } from "@/components/scenario-comparison";
import { POST } from "@/app/api/v1/projections/route";
import type { ComparisonScenarioConfig } from "@/src/config/types";
import { projectionFixture, currentBaselineFixture } from "./fixtures/projection";
import { calculateProjection } from "@/src/domain/projection/calculate";
import { createProjectionSnapshot } from "@/src/domain/projection/export";

const series = vi.hoisted(() => ({ lines: [] as unknown[], bars: [] as unknown[] }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BarChart: ({ children, data }: { children: ReactNode; data: unknown }) => { series.bars.push(data); return <div>{children}</div>; },
  Line: (props: unknown) => { series.lines.push(props); return null; },
  Bar: () => null, CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
}));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); series.lines = []; series.bars = []; });
const definition: ComparisonScenarioConfig = { id: "synthetic-a", label: "Synthetic comparison A", spending: [], personalContributions: [], contributionPolicy: "cash_constrained" };

describe("comparison dashboard and API", () => {
  it.each([1, 3])("renders %s calculated scenarios with accessible data and canonical chart series", async (count) => {
    const requestBodies: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requestBodies.push(JSON.parse(init.body as string));
      return POST(new Request("http://localhost/api/v1/projections", init));
    }));
    const definitions = Array.from({ length: count }, (_, index) => ({ ...definition, id: `synthetic-${index}`, label: `Synthetic comparison ${index}` }));
    render(<ScenarioComparison inputs={projectionFixture} definitions={definitions} />);
    expect(await screen.findByRole("region", { name: "Side-by-side scenario scorecard" })).toBeInTheDocument();
    expect(screen.getAllByText("Not calculated")).toHaveLength(count);
    expect(screen.getByRole("img", { name: "Shared comparison of real-dollar financial asset balances across ages" })).toBeInTheDocument();
    expect(series.lines).toHaveLength(count);
    expect(series.bars).toHaveLength(count);
    expect(series.lines[0]).toMatchObject({ dataKey: "financialAssetsToday", data: expect.arrayContaining([expect.objectContaining({ age: expect.any(Number), financialAssetsToday: expect.any(Number) })]) });
    expect(requestBodies[0]).toMatchObject({ inputs: projectionFixture, scenarioComparison: definitions });
    fireEvent.change(screen.getAllByLabelText("Scenario name")[0], { target: { value: "Synthetic temporary name" } });
    await waitFor(() => expect(requestBodies).toHaveLength(2));
    expect(definitions[0].label).toBe("Synthetic comparison 0");
  });
  it("surfaces server failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Synthetic projection failure" }, { status: 400 })));
    render(<ScenarioComparison inputs={projectionFixture} definitions={[definition]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Synthetic projection failure");
  });
  it("keeps comparison definitions out of existing allowlisted exports", () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.scenarioComparison = [{ ...definition, label: "Synthetic label excluded from export" }];
    const snapshot = createProjectionSnapshot(calculateProjection(projectionFixture), baseline, {}, "2026-07-14T00:00:00.000Z");
    expect(JSON.stringify(snapshot)).not.toContain("Synthetic label excluded from export");
    expect(JSON.stringify(snapshot)).not.toContain("scenarioComparison");
  });
});
