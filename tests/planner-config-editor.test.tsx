// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerConfigEditor } from "@/components/planner-dashboard";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function currentConfig(overrides: Partial<{
  contents: string;
  displayPath: string;
  writeEnabled: boolean;
  version: string;
}> = {}) {
  return {
    contents: "currentAge: 38\n",
    displayPath: "planner.local.yaml",
    writeEnabled: true,
    version: "sha256:loaded",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("planner config editor", () => {
  it("loads current YAML and clearly explains the write-disabled state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      jsonResponse(currentConfig({ writeEnabled: false })),
    ));

    render(<PlannerConfigEditor onSaved={vi.fn()} />);

    expect(await screen.findByLabelText("Planner YAML")).toHaveValue("currentAge: 38\n");
    expect(screen.getByText("planner.local.yaml")).toBeInTheDocument();
    expect(screen.getByText("Matches disk")).toBeInTheDocument();
    expect(screen.getByText(/Saving is disabled/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save config" })).toBeDisabled();
  });

  it("tracks dirty state, validates without saving, and preserves invalid text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentConfig()))
      .mockResolvedValueOnce(jsonResponse({
        error: "invalid_planner_config",
        message: "currentAge must be a finite number.",
      }, 422));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerConfigEditor onSaved={vi.fn()} />);
    const editor = await screen.findByLabelText("Planner YAML");

    fireEvent.change(editor, { target: { value: "currentAge: nope\n" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Validate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "currentAge must be a finite number.",
    );
    expect(screen.getByLabelText("Planner YAML")).toHaveValue("currentAge: nope\n");
    expect(screen.getByText("Validation failed")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe("POST");
  });

  it("revert reloads the latest file contents instead of the originally loaded text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentConfig()))
      .mockResolvedValueOnce(jsonResponse(currentConfig({
        contents: "currentAge: 39\n",
        version: "sha256:external",
      })));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerConfigEditor onSaved={vi.fn()} />);
    const editor = await screen.findByLabelText("Planner YAML");

    fireEvent.change(editor, { target: { value: "currentAge: 40\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Revert changes" }));

    await waitFor(() => expect(screen.getByLabelText("Planner YAML")).toHaveValue("currentAge: 39\n"));
    expect(screen.getByText("Matches disk")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/config/current",
      { cache: "no-store" },
    );
  });

  it("validates before save and preserves unsaved text on a version conflict", async () => {
    const onSaved = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentConfig()))
      .mockResolvedValueOnce(jsonResponse({ valid: true }))
      .mockResolvedValueOnce(jsonResponse({
        error: "planner_config_conflict",
        message: "The planner configuration changed on disk. Revert changes to load the latest contents before saving again.",
      }, 409));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerConfigEditor onSaved={onSaved} />);
    const editor = await screen.findByLabelText("Planner YAML");

    fireEvent.change(editor, { target: { value: "currentAge: 40\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed on disk");
    expect(screen.getByLabelText("Planner YAML")).toHaveValue("currentAge: 40\n");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe("POST");
    const saveRequest = fetchMock.mock.calls[2]![1] as RequestInit;
    expect(saveRequest.method).toBe("PUT");
    expect(JSON.parse(saveRequest.body as string)).toEqual({
      contents: "currentAge: 40\n",
      expectedVersion: "sha256:loaded",
    });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("updates the version, reloads the baseline, and reports a saved state", async () => {
    const onSaved = vi.fn().mockResolvedValue({ ok: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentConfig()))
      .mockResolvedValueOnce(jsonResponse({ valid: true }))
      .mockResolvedValueOnce(jsonResponse({ version: "sha256:saved" }))
      .mockResolvedValueOnce(jsonResponse({ valid: true }))
      .mockResolvedValueOnce(jsonResponse({ version: "sha256:saved-again" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlannerConfigEditor onSaved={onSaved} />);
    const editor = await screen.findByLabelText("Planner YAML");

    fireEvent.change(editor, { target: { value: "currentAge: 39\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Configuration saved and the active baseline was reloaded.",
    );
    expect(screen.getByText("Matches disk")).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText("Planner YAML"), {
      target: { value: "currentAge: 40\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[4]![1] as RequestInit).body as string)).toMatchObject({
      expectedVersion: "sha256:saved",
    });
  });
});
