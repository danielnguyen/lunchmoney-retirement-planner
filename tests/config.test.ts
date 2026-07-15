import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { validatePlannerConfig } from "@/src/config/loader";

describe("private planner configuration", () => {
  it("keeps the committed generic template aligned with the runtime schema", async () => {
    const template = JSON.parse(await readFile("config/planner.example.json", "utf8"));
    const config = validatePlannerConfig(template);
    expect(config.transactionTrailingMonths).toBe(12);
    expect(config.accountMappings).toHaveProperty("manual:replace-with-cash-account-id");
  });

  it("ignores the private local file in Git and Docker contexts", async () => {
    expect(await readFile(".gitignore", "utf8")).toContain("config/planner.local.json");
    expect(await readFile(".dockerignore", "utf8")).toContain("config/planner.local.json");
  });
});
