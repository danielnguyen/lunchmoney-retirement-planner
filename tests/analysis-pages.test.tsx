// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AnalysisPages } from "@/components/analysis-pages";
import { POST } from "@/app/api/v1/projections/route";
import { fireInputs } from "./fixtures/fire-milestones";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps inputs, edits and in-flight results across page switches without mounting other views or sending requests", async () => {
  const inputs = fireInputs();
  const onResult = vi.fn();
  let finish!: () => Promise<void>;
  const fetcher = vi.fn((_url: string, init: RequestInit) => new Promise<Response>(resolve => {
    finish = async () => resolve(await POST(new Request("http://localhost/api/v1/projections", init)));
  }));
  vi.stubGlobal("fetch", fetcher);
  const props = { inputs, definitions: [], onResult };
  const { rerender, container } = render(<AnalysisPages {...props} page="overview" />);
  expect(container).toBeEmptyDOMElement();
  expect(fetcher).not.toHaveBeenCalled();
  rerender(<AnalysisPages {...props} page="fire-milestones" />);
  fireEvent.click(screen.getByLabelText("Calculate conditional FIRE milestones"));
  fireEvent.change(screen.getByLabelText("Milestone full retirement age"), { target: { value: "41" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate FIRE milestones" }));
  rerender(<AnalysisPages {...props} page="career-independence" />);
  expect(screen.queryByRole("heading", { name: "FIRE milestones" })).not.toBeInTheDocument();
  await act(async () => { await finish(); });
  rerender(<AnalysisPages {...props} page="fire-milestones" />);
  expect(screen.getByLabelText("Milestone full retirement age")).toHaveValue(41);
  await screen.findByText("Full FIRE — Baseline");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string).inputs).toEqual(inputs);
  rerender(<AnalysisPages {...props} page="overview" />);
  expect(container).toBeEmptyDOMElement();
  expect(onResult.mock.calls.at(-1)?.[1]).not.toBeNull();
  const changed = structuredClone(inputs);
  changed.monthlyEssentialSpendingToday += 100;
  rerender(<AnalysisPages {...props} inputs={changed} page="overview" />);
  await waitFor(() => expect(onResult).toHaveBeenLastCalledWith(JSON.stringify(changed), null));
  rerender(<AnalysisPages {...props} inputs={changed} page="fire-milestones" />);
  expect(screen.queryByText("Full FIRE — Baseline")).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(localStorage.length + sessionStorage.length).toBe(0);
});
