import { describe, expect, it } from "vitest";
import type { BaselineExportContext } from "@/src/domain/baseline/types";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
  type ProjectionSnapshot,
} from "@/src/domain/projection/export";
import type { ProjectionInputs, ProjectionResult } from "@/src/domain/projection/types";
import { baselineContextFixture, projectionFixture } from "./fixtures/projection";

const EXPORT_TOKEN = "fixture-export-token-never-share";
const RAW_IDS = {
  cash: "manual:919191",
  rrsp: "manual:919192",
  unmapped: "plaid:919193",
  category: "919194",
};
const RAW_NAMES = {
  cash: "Everyday Chequing •••• 1234",
  rrsp: "Employer RRSP ending in 9876",
  unmapped: "Private Card ending in 4321",
  category: "Private category name",
};

type ExportFixture = {
  projection: ProjectionResult;
  snapshot: ProjectionSnapshot;
};

function buildExportFixture(): ExportFixture {
  const inputs: ProjectionInputs = structuredClone(projectionFixture);
  inputs.accounts[0] = {
    ...inputs.accounts[0]!,
    id: RAW_IDS.cash,
    label: RAW_NAMES.cash,
  };
  inputs.accounts[1] = {
    ...inputs.accounts[1]!,
    id: RAW_IDS.rrsp,
    label: RAW_NAMES.rrsp,
  };
  inputs.events[0] = {
    ...inputs.events[0]!,
    id: "private-future-event-id",
    label: `Transfer to ${RAW_NAMES.rrsp}`,
    targetAccountId: RAW_IDS.rrsp,
  };

  const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
  baseline.connection.message = `Lunch Money connected with ${EXPORT_TOKEN}`;
  baseline.projectionInputs = inputs;
  baseline.provenance = {
    [`accounts.${RAW_IDS.cash}.openingBalance`]: {
      value: inputs.accounts[0]!.openingBalance,
      sourceType: "lunchmoney_derived",
      sourceDescription: `Lunch Money account 919191 (${RAW_IDS.cash}) balance for ${RAW_NAMES.cash}`,
      effectiveDate: baseline.dataThrough,
    },
    [`accounts.${RAW_IDS.rrsp}.monthlyContributionToday`]: {
      value: inputs.accounts[1]!.monthlyContributionToday,
      sourceType: "local_configuration",
      sourceDescription: `Manual contribution for ${RAW_NAMES.rrsp}`,
      effectiveDate: baseline.dataThrough,
    },
  };
  baseline.derived.accountBalances = [
    {
      id: RAW_IDS.cash,
      lunchMoneyId: 919191,
      source: "manual",
      name: RAW_NAMES.cash,
      plannerType: "cash",
      balance: inputs.accounts[0]!.openingBalance,
      balanceAsOf: baseline.dataThrough,
      monthlyContribution: 0,
      contributionSource: "lunchmoney_derived",
      contributionFunding: "cash",
    },
    {
      id: RAW_IDS.rrsp,
      lunchMoneyId: 919192,
      source: "manual",
      name: RAW_NAMES.rrsp,
      plannerType: "rrsp_rrif",
      balance: inputs.accounts[1]!.openingBalance,
      balanceAsOf: baseline.dataThrough,
      monthlyContribution: inputs.accounts[1]!.monthlyContributionToday,
      contributionSource: "local_configuration",
      contributionFunding: "cash",
    },
  ];
  baseline.derived.investmentContributions.accounts = [
    {
      accountId: RAW_IDS.rrsp,
      monthlyAverage: inputs.accounts[1]!.monthlyContributionToday,
      source: "local_configuration",
      funding: "cash",
    },
  ];
  baseline.derived.recurringExpenses.items = [
    {
      id: 818181,
      description: `Subscription paid from account no 1234 (${RAW_NAMES.cash})`,
      classification: "essential",
      monthlyAmount: 100,
      accountId: RAW_IDS.cash,
      categoryId: RAW_IDS.category,
    },
  ];
  baseline.warnings = [
    {
      code: "fixture_warning",
      severity: "warning",
      identifier: RAW_IDS.rrsp,
      name: RAW_NAMES.rrsp,
      message: `Review account ${RAW_IDS.rrsp}: ${RAW_NAMES.rrsp}`,
    },
    {
      code: "unused_account_mapping",
      severity: "warning",
      identifier: "727272",
      name: "Old private account label",
      message: "Account mapping 727272 for Old private account label did not match.",
    },
  ];
  baseline.unmappedAccounts = [
    {
      id: RAW_IDS.unmapped,
      lunchMoneyId: 919193,
      source: "plaid",
      name: RAW_NAMES.unmapped,
      status: "active",
    },
  ];
  baseline.unmappedCategories = [
    {
      id: RAW_IDS.category,
      lunchMoneyId: 919194,
      name: RAW_NAMES.category,
      transactionCount: 3,
    },
  ];

  const projection = calculateProjection(inputs);
  const previousToken = process.env.LUNCHMONEY_API_TOKEN;
  process.env.LUNCHMONEY_API_TOKEN = EXPORT_TOKEN;
  try {
    return {
      projection,
      snapshot: createProjectionSnapshot(
        projection,
        baseline,
        {
          retirementAge: 64,
          [`accounts.${RAW_IDS.rrsp}.monthlyContributionToday`]: 1500,
        },
        "2026-07-14T00:00:00.000Z",
      ),
    };
  } finally {
    if (previousToken === undefined) delete process.env.LUNCHMONEY_API_TOKEN;
    else process.env.LUNCHMONEY_API_TOKEN = previousToken;
  }
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  cells.push(value);
  return cells;
}

function expectNoPrivateAccountData(exported: string): void {
  expect(exported).not.toMatch(/\b(?:plaid|manual):/i);
  for (const raw of [RAW_IDS.cash, RAW_IDS.rrsp, RAW_IDS.unmapped, ...Object.values(RAW_NAMES)]) {
    expect(exported).not.toContain(raw);
  }
  for (const numericId of ["919191", "919192", "919193"]) {
    expect(exported).not.toContain(numericId);
  }
  expect(exported).not.toContain(EXPORT_TOKEN);
}

describe("share-safe projection exports", () => {
  it("anonymizes the synthetic cash account in provenance and override keys", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, id: "cash", label: "Cash transactions" };
    const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    baseline.derived.accountBalances[0] = {
      ...baseline.derived.accountBalances[0]!,
      id: "cash",
      lunchMoneyId: null,
      source: "cash",
      name: "Cash transactions",
    };
    baseline.provenance = {
      "accounts.cash.openingBalance": {
        value: inputs.accounts[0]!.openingBalance,
        sourceType: "lunchmoney_derived",
        sourceDescription: "Lunch Money cash account balance and return assumption for cash",
        effectiveDate: baseline.dataThrough,
      },
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {
      "accounts.cash.openingBalance": inputs.accounts[0]!.openingBalance,
    });

    expect(snapshot.provenance["accounts.cash_1.openingBalance"]?.sourceDescription).toBe(
      "Lunch Money cash_1 account balance and return assumption for cash_1",
    );
    expect(snapshot.activeOverrides).toEqual({
      "accounts.cash_1.openingBalance": inputs.accounts[0]!.openingBalance,
    });
    expect(Object.keys(snapshot.projection.annual[0]!.real.accountBalances)).toContain("cash_1");
  });

  it("keeps aliases distinct when included accounts have duplicate display names", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, label: "Duplicate account name" };
    inputs.accounts[1] = { ...inputs.accounts[1]!, label: "Duplicate account name" };
    inputs.events[0] = {
      ...inputs.events[0]!,
      label: "Contribution to Duplicate account name",
      targetAccountId: inputs.accounts[1]!.id,
    };
    const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    baseline.derived.accountBalances[0] = {
      ...baseline.derived.accountBalances[0]!,
      name: "Duplicate account name",
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});

    expect(snapshot.projection.inputs.accounts.map(({ label }) => label)).toEqual([
      "Cash 1",
      "RRSP 1",
    ]);
    expect(snapshot.projection.inputs.events[0]!.label).toBe("Contribution to RRSP 1");
  });

  it("uses one consistent deterministic account alias map throughout JSON", () => {
    const { snapshot } = buildExportFixture();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.exportMetadata).toEqual({
      shareSafe: true,
      anonymized: true,
      rawLunchMoneyIdentifiersIncluded: false,
      credentialsIncluded: false,
      accountAliases: [
        { key: "cash_1", label: "Cash 1", plannerType: "cash" },
        { key: "rrsp_1", label: "RRSP 1", plannerType: "rrsp_rrif" },
      ],
    });
    expect(snapshot.resolvedBaseline.accounts.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "cash_1", label: "Cash 1" },
      { id: "rrsp_1", label: "RRSP 1" },
    ]);
    expect(snapshot.activeInputs.accounts.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "cash_1", label: "Cash 1" },
      { id: "rrsp_1", label: "RRSP 1" },
    ]);
    expect(snapshot.projection.inputs.accounts.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "cash_1", label: "Cash 1" },
      { id: "rrsp_1", label: "RRSP 1" },
    ]);
    expect(Object.keys(snapshot.projection.annual[0]!.real.accountBalances)).toEqual([
      "cash_1",
      "rrsp_1",
    ]);
    expect(snapshot.derivedBaseline.accountBalances.map(({ id, name, lunchMoneyId }) => ({
      id,
      name,
      lunchMoneyId,
    }))).toEqual([
      { id: "cash_1", name: "Cash 1", lunchMoneyId: null },
      { id: "rrsp_1", name: "RRSP 1", lunchMoneyId: null },
    ]);
    expect(snapshot.derivedBaseline.investmentContributions.accounts[0]!.accountId).toBe("rrsp_1");
    expect(snapshot.projection.inputs.events[0]).toMatchObject({
      id: "event_1",
      label: "Transfer to RRSP 1",
      targetAccountId: "rrsp_1",
    });
    expect(snapshot.provenance["accounts.cash_1.openingBalance"]?.sourceDescription).toContain(
      "Cash 1",
    );
    expect(snapshot.provenance["accounts.rrsp_1.monthlyContributionToday"]?.sourceDescription).toContain(
      "RRSP 1",
    );
    expect(snapshot.activeOverrides).toEqual({
      retirementAge: 64,
      "accounts.rrsp_1.monthlyContributionToday": 1500,
    });
    expect(snapshot.warnings[0]).toMatchObject({ identifier: "rrsp_1", name: "RRSP 1" });
    expect(snapshot.warnings[0]!.message).toContain("rrsp_1");
    expect(snapshot.warnings[1]).toMatchObject({
      identifier: "warning_identifier_1",
      name: "Warning record 1",
    });
    expect(snapshot.unmappedAccounts[0]).toMatchObject({
      id: "unmapped_account_1",
      lunchMoneyId: null,
      name: "Unmapped account 1",
    });
    expect(snapshot.unmappedCategories[0]).toMatchObject({
      id: "category_1",
      lunchMoneyId: null,
      name: "Category 1",
    });
    expectNoPrivateAccountData(serialized);
    expect(serialized).not.toContain("727272");
    expect(serialized).not.toContain("Old private account label");
  });

  it("preserves financial values and projection totals while removing credentials", () => {
    const { projection, snapshot } = buildExportFixture();

    expect(snapshot.projection.summary).toEqual(projection.summary);
    expect(snapshot.projection.annual.map((point) => point.real.income)).toEqual(
      projection.annual.map((point) => point.real.income),
    );
    expect(snapshot.projection.annual.map((point) => point.real.outflows)).toEqual(
      projection.annual.map((point) => point.real.outflows),
    );
    expect(snapshot.projection.annual.map((point) => point.real.balances)).toEqual(
      projection.annual.map((point) => point.real.balances),
    );
    expect(
      Object.values(snapshot.projection.annual[0]!.real.accountBalances).sort((a, b) => a - b),
    ).toEqual(
      Object.values(projection.annual[0]!.real.accountBalances).sort((a, b) => a - b),
    );
    expectNoPrivateAccountData(JSON.stringify(snapshot));
  });

  it("emits one consistently shaped, conventional annual CSV table", () => {
    const { snapshot } = buildExportFixture();
    const csv = projectionSnapshotToCsv(snapshot, "real");
    const lines = csv.split("\n");
    const parsed = lines.map(parseCsvLine);
    const header = parsed[0]!;

    expect(lines).toHaveLength(snapshot.projection.annual.length + 1);
    expect(lines.filter((line) => line.startsWith("period,"))).toHaveLength(1);
    expect(parsed.every((row) => row.length === header.length)).toBe(true);
    expect(header).toContain("account_cash_1");
    expect(header).toContain("account_rrsp_1");
    expect(parsed[1]![0]).toBe("2026 (Jul–Dec)");
    expect(csv).not.toContain("section,key,value");
    expect(csv).not.toContain("metadata,");
    expect(csv).not.toContain("resolvedBaseline,");
    expect(csv).not.toMatch(/[{}[\]]/);
    expect(lines).not.toContain("");

    const financialAssetsColumn = header.indexOf("financialAssets");
    expect(Number(parsed[1]![financialAssetsColumn])).toBe(
      snapshot.projection.annual[0]!.real.balances.financialAssets,
    );
    expectNoPrivateAccountData(csv);
  });
});
