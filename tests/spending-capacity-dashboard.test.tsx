// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpendingCapacity } from "@/components/spending-capacity";
import { POST } from "@/app/api/v1/projections/route";
import { projectionFixture } from "./fixtures/projection";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function fixture() {
  const input = structuredClone(projectionFixture);
  input.accounts.forEach((account) => { account.openingBalance += 1000000; });
  input.spendingPhases = [
    { ...input.spendingPhases[0], id: "working", endAge: 65, source: "explicit_configuration" },
    { ...input.spendingPhases[0], id: "retired", label: "Synthetic retirement", startAge: 65, source: "explicit_configuration" },
  ];
  return input;
}

describe("optional spending capacity dashboard", () => {
  it("uses the real API only on opt-in, exposes accessible amounts and recomputes active inputs", async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init)));
    vi.stubGlobal("fetch", fetcher);
    const input = fixture();
    const { rerender } = render(<SpendingCapacity inputs={input} />);
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Calculate spending capacity"));
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Synthetic retirement/));
    fireEvent.click(screen.getByRole("button", { name: "Calculate spending capacity" }));
    await screen.findByText("Monthly spending table");
    fireEvent.click(screen.getByText("Monthly spending table"));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Difference from configured" })).toBeInTheDocument();
    expect(screen.getByText(/Source: active resolved plan/)).toBeInTheDocument();
    expect(screen.getByText(/not a probability of success/)).toBeInTheDocument();
    expect(screen.getByText(/Tax modelling is provisional/)).toBeInTheDocument();
    const changed = structuredClone(input);
    changed.retirementRequirement.minimumEndingFinancialAssetsToday = 10000;
    rerender(<SpendingCapacity inputs={changed} />);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Calculate spending capacity" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/minimum ending assets \$10,000.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Calculate spending capacity"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("explains unsupported and zero-base selections without showing a computed amount", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => POST(new Request("http://localhost/api/v1/projections", init))));
    const { rerender } = render(<SpendingCapacity inputs={projectionFixture} />);
    fireEvent.click(screen.getByLabelText("Calculate spending capacity"));
    expect(screen.getByText(/Unavailable: configure explicit/)).toBeInTheDocument();
    const input = fixture();
    input.monthlyDiscretionarySpendingToday = 0;
    rerender(<SpendingCapacity inputs={input} />);
    fireEvent.click(screen.getByLabelText(/Synthetic retirement/));
    fireEvent.click(screen.getByRole("button", { name: "Calculate spending capacity" }));
    expect(await screen.findByText(/positive configured discretionary spending base/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
