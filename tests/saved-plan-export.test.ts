import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/v1/exports/projection/route";
import { POST as csvExport } from "@/app/api/v1/exports/projection-csv/route";
import { loadCurrentBaseline } from "@/src/domain/baseline/load";
import { currentBaselineFixture } from "./fixtures/projection";

vi.mock("@/src/domain/baseline/load", () => ({ loadCurrentBaseline: vi.fn() }));
const load = vi.mocked(loadCurrentBaseline);
const token = "synthetic-export-credential";
const url = "http://localhost/api/v1/exports/projection";
const request = (credential?: string, query = "") => new Request(url + query, {
  headers: credential === undefined ? {} : { authorization: `Bearer ${credential}` },
});

describe("saved-plan export", () => {
  beforeEach(() => {
    vi.stubEnv("PLANNER_EXPORT_TOKEN", token);
    load.mockReset();
    load.mockResolvedValue(structuredClone(currentBaselineFixture));
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["", token, 404], [token, undefined, 401], [token, "wrong", 401],
  ])("refuses before reading data (%s, %s)", async (configured, supplied, status) => {
    vi.stubEnv("PLANNER_EXPORT_TOKEN", configured);
    const response = await GET(request(supplied));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(load).not.toHaveBeenCalled();
  });

  it.each(["?path=secret.yaml", "?inputs={}", "?overrides={}", "?token=synthetic-export-credential"])("rejects all query inputs: %s", async (query) => {
    const response = await GET(request(token, query));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(load).not.toHaveBeenCalled();
  });

  it.each([
    ["content-length", "2"], ["transfer-encoding", "chunked"],
  ])("rejects body framing before baseline access: %s", async (header, value) => {
    const response = await GET(new Request(url, {
      headers: { authorization: `Bearer ${token}`, [header]: value },
    }));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "saved_export_inputs_not_allowed" });
    expect(load).not.toHaveBeenCalled();
  });

  it("matches the ordinary no-overrides export and excludes additional private fields", async () => {
    const baseline = structuredClone(currentBaselineFixture);
    Object.assign(baseline, { credentials: token, comparisonOnly: "synthetic-comparison-secret" });
    baseline.lunchMoneyMappings.accounts.push({
      mappingId: "manual:999919", lunchMoneyId: 999919, source: "manual",
      label: "synthetic-private-label", description: token,
    });
    load.mockResolvedValue(baseline);
    const response = await GET(request(token));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.json"/);
    const saved = await response.json();
    vi.stubEnv("PLANNER_EXPORT_TOKEN", "");
    const normal = await (await POST(new Request(url, {
      method: "POST", body: JSON.stringify({ baseline, inputs: baseline.projectionInputs, overrides: {} }),
    }))).json();
    expect({ ...saved, generatedAt: "same" }).toEqual({ ...normal, generatedAt: "same" });
    const text = JSON.stringify(saved);
    for (const forbidden of [token, "999919", "synthetic-private-label", "synthetic-comparison-secret", "lunchMoneyMappings", "scenarioComparison"]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("loads fresh server inputs for every request", async () => {
    const first = structuredClone(currentBaselineFixture);
    const second = structuredClone(first);
    second.projectionInputs.accounts[0].openingBalance += 1234;
    load.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const a = await (await GET(request(token))).json();
    const b = await (await GET(request(token))).json();
    expect(load).toHaveBeenCalledTimes(2);
    expect(a.activeInputs).not.toEqual(b.activeInputs);
  });

  it("sanitizes upstream/configuration failures", async () => {
    load.mockRejectedValue(new Error(`private YAML and ${token} at private/path`));
    const response = await GET(request(token));
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "saved_export_failed" });
  });

  it.each(["real", "nominal"])("preserves browser CSV %s without an export credential", async (mode) => {
    vi.stubEnv("PLANNER_EXPORT_TOKEN", "");
    const baseline = structuredClone(currentBaselineFixture);
    const response = await csvExport(new Request(`${url}-csv?mode=${mode}`, {
      method: "POST", body: JSON.stringify({ baseline, inputs: baseline.projectionInputs, overrides: {} }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect((await response.text()).split("\n").length).toBeGreaterThan(2);
    expect(load).not.toHaveBeenCalled();
  });
});
