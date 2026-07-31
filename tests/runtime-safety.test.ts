import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function runtimeSource(): Promise<string> {
  const roots = ["app", "components", "src"];
  const files = (
    await Promise.all(
      roots.map(async (root) =>
        (await readdir(root, { recursive: true }))
          .filter((file) => /\.(ts|tsx)$/.test(file))
          .map((file) => `${root}/${file}`),
      ),
    )
  ).flat();
  return (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
}

describe("runtime safety regressions", () => {
  it("contains no demonstration or household runtime path", async () => {
    const source = await runtimeSource();
    expect(source).not.toMatch(/src\/demo|demoInputs|demoSources|Member A|Member B|Combined household/);
  });

  it("contains no PostgreSQL runtime configuration", async () => {
    const source = `${await runtimeSource()}\n${await readFile("compose.yaml", "utf8")}\n${await readFile(".env.example", "utf8")}`;
    expect(source).not.toMatch(/DATABASE_URL|postgres/i);
  });

  it("keeps planner config writes opt-in while mounting the config directory for atomic replacement", async () => {
    const compose = await readFile("compose.yaml", "utf8");
    const environment = await readFile(".env.example", "utf8");
    const route = await readFile("app/api/v1/config/current/route.ts", "utf8");

    expect(compose).toContain(
      "PLANNER_CONFIG_WRITE_ENABLED: ${PLANNER_CONFIG_WRITE_ENABLED:-false}",
    );
    expect(compose).toContain("./config:/app/config:rw,Z");
    expect(environment).toContain("PLANNER_CONFIG_WRITE_ENABLED=false");
    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("keeps scenario draft generation dynamic, pathless, and separate from config writes", async () => {
    const route = await readFile(
      "app/api/v1/config/current/scenario-draft/route.ts",
      "utf8",
    );
    const service = await readFile("src/config/scenario-draft.ts", "utf8");

    expect(route).toContain('export const dynamic = "force-dynamic"');
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain('"Cache-Control": "no-store"');
    expect(route).not.toMatch(/saveCurrentPlannerConfig|writeFile|rename|caller.*path/i);
    expect(service).not.toMatch(/node:fs|writeFile|rename|plannerConfigPath/);
    expect(route).not.toMatch(/targetPath|yamlPath|filesystemPath/);
  });

  it("keeps health metadata synchronized with the public result schemas", async () => {
    const health = await readFile("app/api/v1/health/route.ts", "utf8");
    const baselineTypes = await readFile(
      "src/domain/baseline/types.ts",
      "utf8",
    );
    const projectionTypes = await readFile(
      "src/domain/projection/types.ts",
      "utf8",
    );

    expect(health).toContain('baselineSchemaVersion: "5.0"');
    expect(health).toContain('projectionSchemaVersion: "13.0"');
    expect(baselineTypes).toContain('schemaVersion: "5.0"');
    expect(projectionTypes).toContain('schemaVersion: "13.0"');
  });

  it("contains no Lunch Money mutation call", async () => {
    const service = await readFile("src/integrations/lunchmoney/read-service.ts", "utf8");
    expect(service).not.toMatch(/\.create\(|\.update\(|\.delete\(|\.split\(|\.group\(|triggerFetch/);
  });

  it("uses ordinary export button labels without privacy marketing copy", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const routes = `${await readFile("app/api/v1/exports/projection/route.ts", "utf8")}\n${await readFile("app/api/v1/exports/projection-csv/route.ts", "utf8")}`;

    expect(dashboard).toMatch(/>\s*Export JSON\s*</);
    expect(dashboard).toMatch(/>Export CSV<\/button>/);
    expect(`${dashboard}\n${routes}`).not.toMatch(/share-safe|anonymized/i);
  });

  it("uses one configuration drawer without an obsolete planner-config runtime tree", async () => {
    const dashboard = await readFile("components/planner-dashboard.tsx", "utf8");
    const css = await readFile("app/globals.css", "utf8");
    const normalHeaderStart = dashboard.lastIndexOf(
      '<div className="hero-actions no-print">',
    );
    const normalHeader = dashboard.slice(
      normalHeaderStart,
      dashboard.indexOf("</div>", normalHeaderStart),
    );

    expect(dashboard).toContain('type PlannerDrawerView = "controls" | "yaml"');
    expect(dashboard).toContain("const [plannerDrawer, setPlannerDrawer]");
    expect(dashboard).not.toContain("const [scenarioControls");
    expect(dashboard).not.toContain("const [plannerConfig");
    expect(dashboard).not.toContain("PlannerConfigDrawer");
    expect(dashboard.match(/<PlannerConfigEditor/g)).toHaveLength(1);
    expect(dashboard).not.toContain('variant="planner-config"');
    expect(dashboard).not.toContain('aria-controls="planner-config-drawer"');
    expect(css).not.toMatch(/\.planner-config-(?:overlay|drawer|drawer-content)/);
    expect(normalHeader).toContain("Scenario controls");
    expect(normalHeader).not.toContain("Planner config");
  });
});
