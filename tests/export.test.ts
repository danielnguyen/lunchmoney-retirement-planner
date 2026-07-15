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
  recurring: 818181,
  event: "private-future-event-id",
  warning: "727272",
};
const PRIVATE_TEXT = {
  personalName: "Alexandra Privacy-Test",
  streetAddress: "742 Evergreen Privacy Avenue, Toronto",
  merchant: "Confidential Health Merchant",
  payee: "Private Therapy Payee",
  eventLabel: "Purchase a home for Alexandra at 742 Evergreen Privacy Avenue",
  warningMessage: "Alexandra must call the private adviser about account 727272 immediately.",
  note: "Personal note: transfer funds after the confidential appointment.",
};
const RAW_ACCOUNT_NAMES = {
  cash: "Everyday Chequing •••• 1234",
  rrsp: "Employer RRSP ending in 9876",
  unmapped: "Private Card ending in 4321",
  category: "Private category name",
};

type ExportFixture = {
  inputs: ProjectionInputs;
  baseline: BaselineExportContext;
  projection: ProjectionResult;
  snapshot: ProjectionSnapshot;
};

function buildExportFixture(): ExportFixture {
  const inputs: ProjectionInputs = structuredClone(projectionFixture);
  inputs.accounts[0] = {
    ...inputs.accounts[0]!,
    id: RAW_IDS.cash,
    label: RAW_ACCOUNT_NAMES.cash,
  };
  inputs.accounts[1] = {
    ...inputs.accounts[1]!,
    id: RAW_IDS.rrsp,
    label: RAW_ACCOUNT_NAMES.rrsp,
  };
  inputs.events[0] = {
    ...inputs.events[0]!,
    id: RAW_IDS.event,
    label: PRIVATE_TEXT.eventLabel,
    targetAccountId: RAW_IDS.rrsp,
  };

  const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
  baseline.connection.message =
    `${PRIVATE_TEXT.personalName} connected from ${PRIVATE_TEXT.streetAddress} using ${EXPORT_TOKEN}`;
  baseline.projectionInputs = inputs;
  baseline.provenance = {
    [`accounts.${RAW_IDS.cash}.openingBalance`]: {
      value: inputs.accounts[0]!.openingBalance,
      sourceType: "lunchmoney_derived",
      sourceDescription:
        `Lunch Money account 919191 (${RAW_IDS.cash}) balance for ${RAW_ACCOUNT_NAMES.cash}`,
      effectiveDate: baseline.dataThrough,
    },
    [`accounts.${RAW_IDS.rrsp}.monthlyContributionToday`]: {
      value: inputs.accounts[1]!.monthlyContributionToday,
      sourceType: "local_configuration",
      sourceDescription: `Manual contribution for ${RAW_ACCOUNT_NAMES.rrsp}`,
      effectiveDate: baseline.dataThrough,
    },
    events: {
      value: inputs.events,
      sourceType: "local_configuration",
      sourceDescription: `${PRIVATE_TEXT.eventLabel}; ${PRIVATE_TEXT.note}`,
      effectiveDate: baseline.dataThrough,
    },
    [`notes.${PRIVATE_TEXT.personalName}`]: {
      value: `${PRIVATE_TEXT.note} ${PRIVATE_TEXT.streetAddress}`,
      sourceType: "local_configuration",
      sourceDescription: `${PRIVATE_TEXT.merchant} / ${PRIVATE_TEXT.payee}`,
      effectiveDate: baseline.dataThrough,
      referenceUrl: `https://example.invalid/${encodeURIComponent(PRIVATE_TEXT.personalName)}`,
    },
  };
  baseline.derived.accountBalances = [
    {
      id: RAW_IDS.cash,
      lunchMoneyId: 919191,
      source: "manual",
      name: RAW_ACCOUNT_NAMES.cash,
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
      name: RAW_ACCOUNT_NAMES.rrsp,
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
  baseline.derived.recurringExpenses = {
    monthlyTotal: 137.45,
    count: 1,
    items: [
      {
        id: RAW_IDS.recurring,
        description:
          `${PRIVATE_TEXT.merchant} paid to ${PRIVATE_TEXT.payee} for ${PRIVATE_TEXT.personalName} at ${PRIVATE_TEXT.streetAddress}`,
        classification: "essential",
        monthlyAmount: 137.45,
        accountId: RAW_IDS.cash,
        categoryId: RAW_IDS.category,
      },
    ],
  };
  baseline.warnings = [
    {
      code: "negative_asset_balance",
      severity: "warning",
      identifier: RAW_IDS.rrsp,
      name: PRIVATE_TEXT.personalName,
      message: PRIVATE_TEXT.warningMessage,
    },
    {
      code: "unused_account_mapping",
      severity: "warning",
      identifier: RAW_IDS.warning,
      name: `${PRIVATE_TEXT.merchant} account`,
      message: `${PRIVATE_TEXT.note} ${PRIVATE_TEXT.payee}`,
    },
  ];
  baseline.unmappedAccounts = [
    {
      id: RAW_IDS.unmapped,
      lunchMoneyId: 919193,
      source: "plaid",
      name: RAW_ACCOUNT_NAMES.unmapped,
      status: "active",
    },
  ];
  baseline.unmappedCategories = [
    {
      id: RAW_IDS.category,
      lunchMoneyId: 919194,
      name: RAW_ACCOUNT_NAMES.category,
      transactionCount: 3,
    },
  ];

  const projection = calculateProjection(inputs);
  const previousToken = process.env.LUNCHMONEY_API_TOKEN;
  process.env.LUNCHMONEY_API_TOKEN = EXPORT_TOKEN;
  try {
    return {
      inputs,
      baseline,
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

function collectIdValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(collectIdValues);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    ...(key === "id" ? [entry] : []),
    ...collectIdValues(entry),
  ]);
}

function expectNoPrivateData(exported: string): void {
  expect(exported).not.toMatch(/\b(?:plaid|manual):/i);
  for (const raw of [
    RAW_IDS.cash,
    RAW_IDS.rrsp,
    RAW_IDS.unmapped,
    RAW_IDS.event,
    ...Object.values(RAW_ACCOUNT_NAMES),
    ...Object.values(PRIVATE_TEXT),
  ]) {
    expect(exported).not.toContain(raw);
  }
  for (const rawId of [
    "919191",
    "919192",
    "919193",
    "919194",
    String(RAW_IDS.recurring),
    RAW_IDS.warning,
  ]) {
    expect(exported).not.toContain(rawId);
  }
  expect(exported).not.toContain(EXPORT_TOKEN);
}

describe("allowlisted share-safe projection exports", () => {
  it("aliases every exported id and genericizes all user-controlled free text", () => {
    const { snapshot } = buildExportFixture();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.exportMetadata).toEqual({
      shareSafe: true,
      anonymized: true,
      transformation: "typed_allowlist",
      rawLunchMoneyIdentifiersIncluded: false,
      sourceSystemRecordIdsIncluded: false,
      userControlledFreeTextIncluded: false,
      credentialsIncluded: false,
      accountAliases: [
        { key: "cash_1", label: "Cash 1", plannerType: "cash" },
        { key: "rrsp_1", label: "RRSP 1", plannerType: "rrsp_rrif" },
      ],
    });
    expect(snapshot.connection).toEqual({
      status: "connected",
      checkedAt: "2026-07-14T00:00:00.000Z",
      message: "Lunch Money connection verified.",
    });
    expect(snapshot.resolvedBaseline.events[0]).toEqual({
      id: "event_1",
      label: "Future event 1",
      calendarYear: 2038,
      month: 6,
      amountToday: 10000,
      direction: "outflow",
      targetAccountId: "rrsp_1",
    });
    expect(snapshot.activeInputs.events[0]).toEqual(snapshot.resolvedBaseline.events[0]);
    expect(snapshot.projection.inputs.events[0]).toEqual(snapshot.resolvedBaseline.events[0]);
    expect(snapshot.derivedBaseline.recurringExpenses.items).toEqual([
      {
        id: "recurring_expense_1",
        description: "Recurring expense 1",
        classification: "essential",
        monthlyAmount: 137.45,
        accountId: "cash_1",
        categoryId: "category_1",
      },
    ]);
    expect(snapshot.warnings).toEqual([
      {
        code: "negative_asset_balance",
        severity: "warning",
        identifier: "rrsp_1",
        name: "Warning 1",
        message: "Warning 1",
      },
      {
        code: "unused_account_mapping",
        severity: "warning",
        identifier: "warning_identifier_1",
        name: "Warning 2",
        message: "Warning 2",
      },
    ]);
    expect(snapshot.unmappedAccounts).toEqual([
      { id: "unmapped_account_1", source: "plaid", name: "Unmapped account 1" },
    ]);
    expect(snapshot.unmappedCategories).toEqual([
      { id: "category_1", name: "Category 1", transactionCount: 3 },
    ]);

    const idValues = collectIdValues(snapshot);
    expect(idValues.length).toBeGreaterThan(0);
    expect(idValues.every((id) => typeof id === "string")).toBe(true);
    expect(idValues.every((id) =>
      /^(?:cash|tfsa|rrsp|non_registered|debt|event|recurring_expense|category|unmapped_account)_\d+$/.test(
        String(id),
      ),
    )).toBe(true);
    expectNoPrivateData(serialized);
  });

  it("exports only safe provenance field references and override keys", () => {
    const { snapshot } = buildExportFixture();

    expect(snapshot.provenance["accounts.cash_1.openingBalance"]).toEqual({
      fieldReference: "accounts.cash_1.openingBalance",
      value: 20000,
      sourceType: "lunchmoney_derived",
      sourceDescription:
        "lunchmoney derived value for accounts.cash_1.openingBalance.",
      effectiveDate: "2026-07-14",
    });
    expect(snapshot.provenance.events?.value).toEqual(snapshot.resolvedBaseline.events);
    expect(snapshot.provenance.events?.sourceDescription).toBe(
      "local configuration value for events.",
    );
    expect(snapshot.provenance.field_1).toMatchObject({
      fieldReference: "field_1",
      value: "anonymized",
      sourceType: "local_configuration",
      sourceDescription: "local configuration value for field_1.",
    });
    expect(snapshot.activeOverrides).toEqual({
      "accounts.rrsp_1.monthlyContributionToday": 1500,
      retirementAge: 64,
    });
    expectNoPrivateData(JSON.stringify(snapshot.provenance));
    expectNoPrivateData(JSON.stringify(snapshot.activeOverrides));
  });

  it("preserves analytical values, event timing, classifications, and projection totals", () => {
    const { inputs, baseline, projection, snapshot } = buildExportFixture();

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
    expect(snapshot.resolvedBaseline.events[0]).toMatchObject({
      calendarYear: inputs.events[0]!.calendarYear,
      month: inputs.events[0]!.month,
      amountToday: inputs.events[0]!.amountToday,
      direction: inputs.events[0]!.direction,
    });
    expect(snapshot.derivedBaseline.recurringExpenses).toMatchObject({
      monthlyTotal: baseline.derived.recurringExpenses.monthlyTotal,
      count: baseline.derived.recurringExpenses.count,
    });
    expect(snapshot.derivedBaseline.recurringExpenses.items[0]).toMatchObject({
      monthlyAmount: baseline.derived.recurringExpenses.items[0]!.monthlyAmount,
      classification: baseline.derived.recurringExpenses.items[0]!.classification,
    });
    expectNoPrivateData(JSON.stringify(snapshot));
  });

  it("keeps aliases distinct when included accounts have duplicate display names", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, label: PRIVATE_TEXT.personalName };
    inputs.accounts[1] = { ...inputs.accounts[1]!, label: PRIVATE_TEXT.personalName };
    inputs.events[0] = {
      ...inputs.events[0]!,
      label: `${PRIVATE_TEXT.personalName} at ${PRIVATE_TEXT.streetAddress}`,
      targetAccountId: inputs.accounts[1]!.id,
    };
    const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    baseline.derived.accountBalances[0] = {
      ...baseline.derived.accountBalances[0]!,
      name: PRIVATE_TEXT.personalName,
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});

    expect(snapshot.projection.inputs.accounts.map(({ label }) => label)).toEqual([
      "Cash 1",
      "RRSP 1",
    ]);
    expect(snapshot.projection.inputs.events[0]!.label).toBe("Future event 1");
    expectNoPrivateData(JSON.stringify(snapshot));
  });

  it("anonymizes the synthetic cash account in provenance and override keys", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, id: "cash", label: PRIVATE_TEXT.personalName };
    const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    baseline.derived.accountBalances[0] = {
      ...baseline.derived.accountBalances[0]!,
      id: "cash",
      lunchMoneyId: null,
      source: "cash",
      name: PRIVATE_TEXT.personalName,
    };
    baseline.provenance = {
      "accounts.cash.openingBalance": {
        value: inputs.accounts[0]!.openingBalance,
        sourceType: "lunchmoney_derived",
        sourceDescription: `${PRIVATE_TEXT.personalName} at ${PRIVATE_TEXT.streetAddress}`,
        effectiveDate: baseline.dataThrough,
      },
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {
      "accounts.cash.openingBalance": inputs.accounts[0]!.openingBalance,
    });

    expect(snapshot.provenance["accounts.cash_1.openingBalance"]?.fieldReference).toBe(
      "accounts.cash_1.openingBalance",
    );
    expect(snapshot.activeOverrides).toEqual({
      "accounts.cash_1.openingBalance": inputs.accounts[0]!.openingBalance,
    });
    expect(Object.keys(snapshot.projection.annual[0]!.real.accountBalances)).toContain("cash_1");
    expectNoPrivateData(JSON.stringify(snapshot));
  });

  it("emits one consistently shaped flat CSV without private text or source ids", () => {
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
    expectNoPrivateData(csv);
  });
});
