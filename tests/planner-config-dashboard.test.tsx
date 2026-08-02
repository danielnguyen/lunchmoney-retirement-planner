// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerDashboard } from "@/components/planner-dashboard";
import { calculateProjection } from "@/src/domain/projection/calculate";
import type { ProjectionInputs } from "@/src/domain/projection/types";
import { currentBaselineFixture } from "./fixtures/projection";

const renderedCurrency = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

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

function statutoryRrifBaseline() {
  const baseline = structuredClone(currentBaselineFixture);
  baseline.projectionInputs.rrifMinimumWithdrawals = {
    mode: "statutory",
    source: "explicit_configuration",
    ageBasis: "owner_age",
    settlementTiming: "december_true_up",
    supportedRrifClass: "all_other_rrifs",
  };
  return baseline;
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
    expect(
      outlookView.getByText("Minimum needed for the spending in this plan"),
    ).toBeInTheDocument();
    expect(
      outlookView.getByText(/It is not your personal target or a recommended retirement target/),
    ).toBeInTheDocument();
    expect(outlookView.getByText(/At retirement on [A-Z][a-z]+ \d{1,2}, \d{4}/)).toBeInTheDocument();
    expect(screen.getByText("Data through July 14, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Retirement Planner" })).toBeInTheDocument();
    expect(screen.queryByText("Retirement lifecycle report")).not.toBeInTheDocument();
    expect(screen.queryByText("Your live financial baseline, projected forward.")).not.toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Jump to planner section" });
    const links = within(navigation).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Overview",
      "Spending",
      "Retirement income",
      "Accounts",
      "Plan details",
      "Assumptions",
    ]);
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Retirement income" })).toHaveAttribute("href", "#retirement-income");
    expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute("href", "#spending");
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "#accounts");
    expect(screen.getByRole("link", { name: "Plan details" })).toHaveAttribute("href", "#plan-details");
    expect(screen.getByRole("link", { name: "Assumptions" })).toHaveAttribute("href", "#assumptions");
    expect(navigation.querySelector("button")).toBeNull();
    expect(screen.getByRole("button", { name: "Try another plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connected accounts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh Lunch Money" })).toBeInTheDocument();
    expect(screen.getByText("Lunch Money connected · read-only")).toBeInTheDocument();
    const adjustedButton = screen.getByRole("button", { name: "Adjusted for inflation" });
    const futureButton = screen.getByRole("button", { name: "Future dollar amounts" });
    expect(adjustedButton).toHaveAttribute("aria-pressed", "true");
    expect(futureButton).toHaveAttribute("aria-pressed", "false");
    const retirementHeadline = outlook.querySelector(".retirement-savings-amount")?.textContent;
    expect(retirementHeadline).toBe(
      renderedCurrency.format(projection.summary.financialAssetsAtRetirementToday),
    );
    fireEvent.click(futureButton);
    expect(adjustedButton).toHaveAttribute("aria-pressed", "false");
    expect(futureButton).toHaveAttribute("aria-pressed", "true");
    expect(outlookView.getByText(retirementHeadline!)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to retirement outlook" })).toHaveAttribute("href", "#overview");
    expect(outlook).toHaveAttribute("id", "overview");
    expect(outlook).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("Annual spending projection")).toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Annual spending projection" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assumptions and data sources" })).toBeInTheDocument();
    expect(screen.getByText("Review the values used in this plan and where each value came from.")).toBeInTheDocument();
    expect(screen.queryByText("Owner goal marker")).not.toBeInTheDocument();
    expect(screen.queryByText("Owner-goal difference")).not.toBeInTheDocument();
    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    const disclosureTitles = [
      "Taxes included",
      "RRSP and RRIF withdrawals",
      "Taxable investment account",
      "How this plan was calculated",
      "Calculation notes and limitations",
    ];
    for (const title of disclosureTitles) {
      const disclosure = within(planDetails).getByText(title).closest("details");
      expect(disclosure).not.toHaveAttribute("open");
    }
    expect(within(planDetails).getByText("A simplified flat retirement-tax estimate is used.")).toBeVisible();
    expect(within(planDetails).getByText("About this tax estimate")).not.toBeVisible();
    fireEvent.click(within(planDetails).getByText("Taxes included").closest("summary")!);
    expect(within(planDetails).getByText("About this tax estimate")).toBeVisible();
    expect(within(planDetails).getByText("This is a retirement-planning estimate, not a tax return.")).toBeVisible();
    expect(within(planDetails).getByText("Estimated taxes")).toBeVisible();
    expect(within(planDetails).getByText("Tax paid from projected cash and savings")).toBeVisible();
    expect(within(planDetails).getByText("Effective tax rate used")).toBeVisible();
    fireEvent.click(within(planDetails).getByText("How this plan was calculated").closest("summary")!);
    expect(within(planDetails).getByText("Completed through the planned final age")).toBeVisible();
    expect(within(planDetails).getByText("Minimum ending financial assets")).toBeVisible();
    expect(within(planDetails).getByText("Saved in the planner configuration")).toBeVisible();
    expect(within(planDetails).getByText("Yes — only cash and investment accounts can fund retirement spending.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Connected accounts" }));
    expect(screen.getByRole("dialog", { name: "Connected accounts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close connected accounts" }));
  });

  it("structures Canadian tax evidence with verified payment meanings", async () => {
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
    baseline.projectionInputs.person.annualPensionToday = 250_000;
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

    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    fireEvent.click(within(planDetails).getByText("Taxes included").closest("summary")!);
    const taxDetails = within(planDetails);
    expect(taxDetails.getByText("Income used for the estimate")).toBeVisible();
    expect(taxDetails.getByText("Taxable income")).toBeVisible();
    expect(taxDetails.getByText("Eligible Canadian dividends")).toBeVisible();
    expect(taxDetails.getByText("Capital gains")).toBeVisible();
    expect(taxDetails.getByText("Capital losses")).toBeVisible();
    expect(taxDetails.getByText("Estimated taxes")).toBeVisible();
    expect(taxDetails.getByText("Federal income tax")).toBeVisible();
    expect(taxDetails.getByText("Ontario income tax, including surtax")).toBeVisible();
    expect(taxDetails.getByText("Ontario surtax included above")).toBeVisible();
    expect(taxDetails.getByText("Ontario health premium")).toBeVisible();
    expect(taxDetails.getByText("OAS repayment")).toBeVisible();
    expect(taxDetails.getByText("Total estimated tax")).toBeVisible();
    expect(taxDetails.getByText("Effective tax rate")).toBeVisible();
    expect(taxDetails.getByText("How tax is paid in this projection")).toBeVisible();
    expect(taxDetails.getByText("Total estimated tax on all income included for the year")).toBeVisible();
    expect(taxDetails.getByText("Tax already reflected in net income or opening-year context")).toBeVisible();
    expect(taxDetails.getByText("Additional tax paid from projected cash and savings")).toBeVisible();
    expect(taxDetails.getByText("Detailed tax calculation")).toBeVisible();
    expect(taxDetails.getByText("Eligible-dividend gross-up")).toBeVisible();
    expect(taxDetails.getByText("Unused current-year capital loss")).toBeVisible();
    expect(taxDetails.getByText("This is a retirement-planning estimate, not a tax return.")).toBeVisible();
    const latestTax = projection.taxation.annual.at(-1);
    expect(latestTax?.mode).toBe("canadian_annual");
    if (latestTax?.mode !== "canadian_annual") throw new Error("Expected Canadian annual tax evidence");
    expect(latestTax.fullAnnualTax.ontario.surtax).toBeGreaterThan(0);
    expect(taxDetails.getByText("Ontario income tax, including surtax").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTax.fullAnnualTax.totals.ontarioTax),
    );
    expect(taxDetails.getByText("Ontario surtax included above").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTax.fullAnnualTax.ontario.surtax),
    );
    expect(taxDetails.getByText("Total estimated tax").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTax.fullAnnualTax.totals.totalTax),
    );
    expect(taxDetails.getByText("Tax already reflected in net income or opening-year context").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTax.embeddedAnnualTax.totals.totalTax),
    );
    expect(taxDetails.getByText("Additional tax paid from projected cash and savings").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTax.projectionFundedTax),
    );
  });

  it("shows the RRIF conversion age and plain-language withdrawal evidence", async () => {
    const baseline = statutoryRrifBaseline();
    const projection = calculateProjection(baseline.projectionInputs);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") return jsonResponse(baseline);
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    expect(within(planDetails).getByText("Required RRIF withdrawals are included from age 71.")).toBeVisible();
    fireEvent.click(within(planDetails).getByText("RRSP and RRIF withdrawals").closest("summary")!);
    for (const label of [
      "Conversion age",
      "Calendar year",
      "Value at the start of the year",
      "Minimum withdrawal required",
      "Regular withdrawals",
      "Additional year-end withdrawal needed",
      "Minimum still outstanding",
      "RRSP/RRIF value at end of year",
    ]) {
      expect(within(planDetails).getAllByText(label)[0]).toBeVisible();
    }
    expect(within(planDetails).getByText("Technical calculation details")).toBeVisible();
    expect(within(planDetails).queryByText("owner age basis")).not.toBeInTheDocument();
    expect(within(planDetails).queryByText("settlement timing")).not.toBeInTheDocument();
  });

  it.each(["mismatched", "unavailable"] as const)(
    "omits the ending RRSP/RRIF value when the projection year is %s",
    async (alignment) => {
      const baseline = statutoryRrifBaseline();
      const projection = calculateProjection(baseline.projectionInputs);
      if (alignment === "mismatched") {
        const latestRrifPeriod = projection.rrif.annual.at(-1);
        if (!latestRrifPeriod) throw new Error("Expected RRIF evidence");
        latestRrifPeriod.calendarYear += 1;
      } else {
        projection.rrif.annual = [];
      }
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url === "/api/v1/baseline/current") return jsonResponse(baseline);
        if (url === "/api/v1/projections") return jsonResponse(projection);
        throw new Error(`Unexpected request: ${url}`);
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<PlannerDashboard />);

      const planDetails = await screen.findByRole("region", { name: "Plan details" });
      fireEvent.click(within(planDetails).getByText("RRSP and RRIF withdrawals").closest("summary")!);
      expect(within(planDetails).queryByText("RRSP/RRIF value at end of year")).not.toBeInTheDocument();
    },
  );

  it("structures taxable-account values, income, sales, and per-account evidence", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.projectionInputs.accounts[1]!.type = "non_registered";
    baseline.projectionInputs.accounts[1]!.label = "Synthetic taxable portfolio";
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
          interest: 0,
          eligibleCanadianDividends: 0,
          foreignIncome: 0,
          capitalGains: 0,
          capitalLosses: 0,
          otherTaxableIncome: 0,
        },
        source: "explicit_configuration",
      },
      limitations: [
        "rrif_minimum_withdrawals_not_modelled",
        "full_tax_return_deductions_and_refundable_credits_not_modelled",
      ],
    };
    for (const phase of baseline.projectionInputs.person.employmentIncomePhases) {
      phase.annualTaxableEmploymentIncomeToday = 100_000;
    }
    baseline.projectionInputs.nonRegisteredTaxation = {
      mode: "simplified_canadian",
      source: "explicit_configuration",
      accounts: [
        {
          accountId: "manual:2",
          openingAdjustedCostBase: {
            amount: 125_000,
            effectiveDate: "2026-07-14",
            sourceDescription: "Synthetic opening tax cost",
            source: "explicit_configuration",
          },
          annualDistributionYields: {
            interest: 0.01,
            eligibleCanadianDividends: 0.02,
            foreignIncome: 0.005,
            capitalGains: 0.005,
          },
        },
      ],
      limitations: [],
    };
    const projection = calculateProjection(baseline.projectionInputs);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") return jsonResponse(baseline);
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    const taxableDisclosure = within(planDetails).getByText("Taxable investment account").closest("details")!;
    fireEvent.click(taxableDisclosure.querySelector("summary")!);
    const taxableDetails = within(taxableDisclosure);
    expect(taxableDetails.getByText("Account values")).toBeVisible();
    expect(taxableDetails.getByText("Tax cost means adjusted cost base (ACB), which is generally the amount used to calculate a capital gain or loss.")).toBeVisible();
    for (const label of [
      "Value at start of year",
      "Value at end of year",
      "Starting tax cost",
      "Ending tax cost",
      "Interest",
      "Eligible Canadian dividends",
      "Foreign income",
      "Capital-gain distributions",
      "Sale proceeds",
      "Tax cost of investments sold",
      "Realized capital gains",
      "Realized capital losses",
      "Unrealized gain or loss remaining",
    ]) {
      expect(taxableDetails.getAllByText(label)[0]).toBeVisible();
    }
    expect(taxableDetails.getByText("Investment income")).toBeVisible();
    expect(taxableDetails.getByText("Investments sold")).toBeVisible();
    expect(taxableDetails.getByText("Account-by-account values")).toBeVisible();
    expect(taxableDetails.getByRole("table")).toHaveTextContent("Synthetic taxable portfolio");
    expect(taxableDetails.queryByText("ACB disposed")).not.toBeInTheDocument();
    const latestTaxablePeriod = projection.nonRegisteredTaxation.annual.at(-1);
    expect(latestTaxablePeriod).toBeDefined();
    expect(taxableDetails.getByText("Value at start of year").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTaxablePeriod!.openingMarketValueToday),
    );
    expect(taxableDetails.getByText("Tax cost of investments sold").parentElement).toHaveTextContent(
      renderedCurrency.format(latestTaxablePeriod!.adjustedCostBaseDisposedToday),
    );
  });

  it("shows early-stop calculation evidence without repeating the outlook answer", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    const projection = calculateProjection(baseline.projectionInputs);
    projection.projectionCompletion = {
      ...projection.projectionCompletion,
      status: "stopped_unfunded_liability",
      completedThroughDate: "2072-02-29",
      completedThroughAge: 87.7,
      stoppedBeforeMonth: "2072-03",
      reason: "A synthetic liability could not be funded.",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") return jsonResponse(baseline);
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    fireEvent.click(within(planDetails).getByText("How this plan was calculated").closest("summary")!);
    expect(within(planDetails).getByText("Planned final age")).toBeVisible();
    expect(within(planDetails).getByText("Last completed date")).toBeVisible();
    expect(within(planDetails).getByText("February 29, 2072")).toBeVisible();
    expect(within(planDetails).getByText("Last completed age")).toBeVisible();
    expect(within(planDetails).getByText("87.7")).toBeVisible();
    expect(within(planDetails).getByText("Stopped early — the full plan was not calculated")).toBeVisible();
    expect(within(planDetails).getByText("Why it stopped")).toBeVisible();
    expect(within(planDetails).getByText("A synthetic liability could not be funded.")).toBeVisible();
    expect(within(planDetails).getByText("Stopped before")).toBeVisible();
    expect(within(planDetails).getByText("March 2072")).toBeVisible();
    expect(within(planDetails).getByText("Minimum ending financial assets")).toBeVisible();
    expect(within(planDetails).getByText("Is home equity excluded from retirement funding?")).toBeVisible();
    expect(within(planDetails).getByText("Source of this rule")).toBeVisible();
    expect(within(planDetails).getByText("Saved in the planner configuration")).toBeVisible();
    expect(within(planDetails).queryByText("Savings remain at age 95.")).not.toBeInTheDocument();
  });

  it("keeps only actionable warnings above the outlook and moves calculation notes into Plan details", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.warnings = [
      {
        code: "negative_derived_total",
        severity: "error",
        message: "Correct the synthetic scenario input.",
      },
      {
        code: "suggested_recurring_ignored",
        severity: "warning",
        message: "Review synthetic suggested recurring items.",
      },
      {
        code: "supported_tax_model_complete",
        severity: "warning",
        message: "Synthetic supported-model calculation note.",
      },
    ];
    const projection = calculateProjection(baseline.projectionInputs);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url === "/api/v1/baseline/current") return jsonResponse(baseline);
      if (url === "/api/v1/projections") return jsonResponse(projection);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PlannerDashboard />);

    const actionNeeded = await screen.findByRole("region", { name: "Action needed" });
    expect(within(actionNeeded).getByText("Error")).toBeVisible();
    expect(within(actionNeeded).getByText("Correct the synthetic scenario input.")).toBeVisible();
    expect(within(actionNeeded).getAllByText("Review").length).toBeGreaterThan(0);
    expect(within(actionNeeded).getByText("Review synthetic suggested recurring items.")).toBeVisible();
    expect(within(actionNeeded).queryByText("Synthetic supported-model calculation note.")).not.toBeInTheDocument();

    const planDetails = await screen.findByRole("region", { name: "Plan details" });
    expect(within(planDetails).getByText("Synthetic supported-model calculation note.")).not.toBeVisible();
    fireEvent.click(
      within(planDetails).getByText("Calculation notes and limitations").closest("summary")!,
    );
    expect(within(planDetails).getByText("Synthetic supported-model calculation note.")).toBeVisible();
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
        "Source: Planner default because this setting is not in the configuration",
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
        "Source: Temporary value from Try another plan",
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
