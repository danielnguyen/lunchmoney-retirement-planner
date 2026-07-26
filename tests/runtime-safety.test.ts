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
});
