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
