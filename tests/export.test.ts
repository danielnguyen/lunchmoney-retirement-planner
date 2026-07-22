import { describe, expect, it } from "vitest";
import type { BaselineExportContext } from "@/src/domain/baseline/types";
import { calculateProjection } from "@/src/domain/projection/calculate";
import {
  createProjectionSnapshot,
  projectionSnapshotToCsv,
  type ProjectionSnapshot,
} from "@/src/domain/projection/export";
import {
  projectionCsvFilename,
  projectionJsonFilename,
} from "@/src/domain/projection/filenames";
import type { ProjectionInputs, ProjectionResult } from "@/src/domain/projection/types";
import {
  baselineContextFixture,
  currentBaselineFixture,
  projectionFixture,
} from "./fixtures/projection";

const EXPORT_TOKEN = "fixture-export-token-never-share";
const EXPORT_API_KEY = "fixture-api-key-never-share";
const EXPORT_PASSWORD = "fixture-password-never-share";
const EXPORT_AUTHORIZATION = "Basic fixture-authorization-never-share";
const AUDIT_RAW_ID = "raw-audit-category-should-not-export";
const RAW_IDS = {
  cash: "manual:919191",
  rrsp: "manual:919192",
  unmapped: "plaid:919193",
  category: "919194",
  recurring: 818181,
  event: "private-future-event-id",
  warning: "727272",
  employmentPhase: "private-employer-transition-id",
  spendingPhase: "private-lifestyle-transition-id",
  contributionPhase: "private-workplace-plan-id",
};
const PRIVATE_TEXT = {
  personalName: "Alexandra Privacy-Test",
  employer: "Confidential Employer Incorporated",
  institution: "Private Financial Institution",
  streetAddress: "742 Evergreen Privacy Avenue, Toronto",
  email: "alexandra.privacy-test@example.invalid",
  username: "alexandra-private-user",
  merchant: "Confidential Health Merchant",
  payee: "Private Therapy Payee",
  employmentPhaseLabel: "Senior role at Confidential Employer Incorporated",
  spendingPhaseLabel: "Confidential retirement lifestyle plan",
  contributionPhaseLabel: "Confidential Employer workplace plan",
  eventLabel: "Purchase a home for Alexandra at 742 Evergreen Privacy Avenue",
  warningMessage: "Alexandra must call the private adviser immediately.",
  note: "Personal note: transfer funds after the confidential appointment.",
  privateConfigPath: "config/planner.local.yaml",
};
const RAW_ACCOUNT_NAMES = {
  cash: "Private Financial Institution Everyday Chequing ending DIGITS-1234",
  rrsp: "Confidential Employer RRSP account ACCT-009876-Q ending DIGITS-9876",
  unmapped: "Private Card ending in 4321",
  category: "Private category name",
};
const PRIVATE_FRAGMENTS = ["ACCT-009876-Q", "DIGITS-9876", "DIGITS-1234"];

type ExportFixture = {
  inputs: ProjectionInputs;
  baseline: BaselineExportContext;
  projection: ProjectionResult;
  snapshot: ProjectionSnapshot;
};

function buildExportFixture(): ExportFixture {
  const inputs: ProjectionInputs = structuredClone(projectionFixture);
  inputs.person.employmentIncomePhases[0] = {
    ...inputs.person.employmentIncomePhases[0]!,
    id: RAW_IDS.employmentPhase,
    label: PRIVATE_TEXT.employmentPhaseLabel,
  };
  inputs.spendingPhases[0] = {
    ...inputs.spendingPhases[0]!,
    id: RAW_IDS.spendingPhase,
    label: PRIVATE_TEXT.spendingPhaseLabel,
    source: "explicit_configuration",
  };
  inputs.accounts[0] = {
    ...inputs.accounts[0]!,
    id: RAW_IDS.cash,
    label: RAW_ACCOUNT_NAMES.cash,
  };
  inputs.accounts[1] = {
    ...inputs.accounts[1]!,
    id: RAW_IDS.rrsp,
    label: RAW_ACCOUNT_NAMES.rrsp,
    contributionPhases: inputs.accounts[1]!.contributionPhases.map((phase) => ({
      ...phase,
      id: RAW_IDS.contributionPhase,
      label: PRIVATE_TEXT.contributionPhaseLabel,
    })),
  };
  inputs.surplusAllocation.reserveAccountIds = [RAW_IDS.cash];
  inputs.surplusAllocation.reserveRefillAccountId = RAW_IDS.cash;
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
    [`accounts.${RAW_IDS.rrsp}.contributionPhases.${RAW_IDS.contributionPhase}.monthlyAmountToday`]: {
      value: inputs.accounts[1]!.contributionPhases[0]!.monthlyAmountToday,
      sourceType: "local_configuration",
      sourceDescription: `Manual contribution for ${RAW_ACCOUNT_NAMES.rrsp}`,
      effectiveDate: baseline.dataThrough,
    },
    [`accounts.${RAW_IDS.rrsp}.contributionPhases.${RAW_IDS.contributionPhase}.label`]: {
      value: PRIVATE_TEXT.contributionPhaseLabel,
      sourceType: "local_configuration",
      sourceDescription: `Contribution phase for ${PRIVATE_TEXT.employer}`,
      effectiveDate: baseline.dataThrough,
    },
    [`person.employmentIncomePhases.${RAW_IDS.employmentPhase}.label`]: {
      value: PRIVATE_TEXT.employmentPhaseLabel,
      sourceType: "local_configuration",
      sourceDescription: `Employment phase for ${PRIVATE_TEXT.employer}`,
      effectiveDate: baseline.dataThrough,
    },
    [`spendingPhases.${RAW_IDS.spendingPhase}.label`]: {
      value: PRIVATE_TEXT.spendingPhaseLabel,
      sourceType: "local_configuration",
      sourceDescription: `Private lifestyle phase for ${PRIVATE_TEXT.personalName}`,
      effectiveDate: baseline.dataThrough,
    },
    [`spendingPhases.${RAW_IDS.spendingPhase}.discretionaryMultiplier`]: {
      value: inputs.spendingPhases[0]!.discretionaryMultiplier,
      sourceType: "local_configuration",
      sourceDescription: `Private lifestyle multiplier for ${PRIVATE_TEXT.personalName}`,
      effectiveDate: baseline.dataThrough,
    },
    events: {
      value: inputs.events,
      sourceType: "local_configuration",
      sourceDescription: `${PRIVATE_TEXT.eventLabel}; ${PRIVATE_TEXT.note}`,
      effectiveDate: baseline.dataThrough,
    },
    "surplusAllocation.reserveAccountIds": {
      value: [RAW_IDS.cash],
      sourceType: "local_configuration",
      sourceDescription: RAW_ACCOUNT_NAMES.cash,
      effectiveDate: baseline.dataThrough,
    },
    "surplusAllocation.reserveRefillAccountId": {
      value: RAW_IDS.cash,
      sourceType: "local_configuration",
      sourceDescription: `Reserve account ${RAW_ACCOUNT_NAMES.cash}`,
      effectiveDate: baseline.dataThrough,
    },
    "surplusAllocation.targetCashReserveToday": {
      value: inputs.surplusAllocation.targetCashReserveToday,
      sourceType: "local_configuration",
      sourceDescription: "Configured cash reserve",
      effectiveDate: baseline.dataThrough,
    },
    "surplusAllocation.reserveIndexingRate": {
      value: inputs.surplusAllocation.reserveIndexingRate,
      sourceType: "local_configuration",
      sourceDescription: "Configured cash reserve indexing",
      effectiveDate: baseline.dataThrough,
    },
    "surplusAllocation.excess.mode": {
      value: inputs.surplusAllocation.excess.mode,
      sourceType: "local_configuration",
      sourceDescription: "Configured excess strategy",
      effectiveDate: baseline.dataThrough,
    },
    "person.cpp.monthlyAmountAt65Today": {
      value: 877.01,
      sourceType: "canadian_reference",
      sourceDescription:
        "Published average for new CPP beneficiaries at age 65; not a personal entitlement.",
      effectiveDate: "2026-04-01",
      referenceKind: "population_average",
      referenceUrl:
        "https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html",
    },
    [`notes.${PRIVATE_TEXT.personalName}`]: {
      value:
        `${PRIVATE_TEXT.note} ${PRIVATE_TEXT.streetAddress}; ${PRIVATE_TEXT.email}; ` +
        `${PRIVATE_TEXT.username}; ${PRIVATE_TEXT.privateConfigPath}; password=${EXPORT_PASSWORD}`,
      sourceType: "local_configuration",
      sourceDescription:
        `${PRIVATE_TEXT.merchant} / ${PRIVATE_TEXT.payee}; ${PRIVATE_TEXT.institution}; ` +
        `${PRIVATE_TEXT.employer}; token=${EXPORT_TOKEN}; api_key=${EXPORT_API_KEY}; ` +
        `authorization=${EXPORT_AUTHORIZATION}`,
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
      monthlyContribution: inputs.accounts[1]!.contributionPhases[0]!.monthlyAmountToday,
      contributionSource: "local_configuration",
      contributionFunding: "cash",
    },
  ];
  baseline.derived.investmentContributions.accounts = [
    {
      accountId: RAW_IDS.rrsp,
      monthlyAverage: inputs.accounts[1]!.contributionPhases[0]!.monthlyAmountToday,
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
  baseline.cashFlowAudit.income = {
    trailingTotal: 1,
    monthlyAverage: 1,
    transactionCount: 1,
    breakdown: [
      {
        categoryId: AUDIT_RAW_ID,
        categoryName: PRIVATE_TEXT.merchant,
        accountId: RAW_IDS.cash,
        accountName: RAW_ACCOUNT_NAMES.cash,
        transactionCount: 1,
        trailingTotal: 1,
        monthlyAverage: 1,
      },
    ],
  };

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
          [`employmentPhase.${RAW_IDS.employmentPhase}.annualNetCashToday`]: 70000,
          [`contributionPhase.${RAW_IDS.rrsp}.${RAW_IDS.contributionPhase}.monthlyAmountToday`]: 1500,
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

function expectNoSourceIdentifiersOrCredentials(exported: string): void {
  expect(exported).not.toMatch(/\b(?:plaid|manual):/i);
  for (const raw of Object.values(RAW_IDS)) {
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
  for (const credential of [
    EXPORT_TOKEN,
    EXPORT_API_KEY,
    EXPORT_PASSWORD,
    EXPORT_AUTHORIZATION,
  ]) {
    expect(exported).not.toContain(credential);
  }
  for (const text of [
    ...Object.values(RAW_ACCOUNT_NAMES),
    ...Object.values(PRIVATE_TEXT),
    ...PRIVATE_FRAGMENTS,
  ]) {
    expect(exported).not.toContain(text);
  }
}

describe("automatically anonymized projection exports", () => {
  it("keeps Lunch Money mapping reference metadata outside JSON and both CSV modes", () => {
    const baseline = structuredClone(currentBaselineFixture);
    baseline.lunchMoneyMappings = {
      accounts: [
        {
          mappingId: "manual:707070",
          lunchMoneyId: 707070,
          source: "manual",
          label: "Synthetic raw mapping account",
          description: "Synthetic raw mapping institution",
        },
      ],
      categories: [
        {
          mappingId: "808080",
          lunchMoneyId: 808080,
          name: "Synthetic raw mapping category",
          description: "Synthetic raw mapping description",
        },
      ],
    };
    const projection = calculateProjection(baseline.projectionInputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});
    const exported = [
      JSON.stringify(snapshot),
      projectionSnapshotToCsv(snapshot, "real"),
      projectionSnapshotToCsv(snapshot, "nominal"),
    ].join("\n");

    expect(snapshot.schemaVersion).toBe("9.0");
    expect(exported).not.toContain("lunchMoneyMappings");
    for (const privateMappingValue of [
      "manual:707070",
      "707070",
      "808080",
      "Synthetic raw mapping account",
      "Synthetic raw mapping institution",
      "Synthetic raw mapping category",
      "Synthetic raw mapping description",
    ]) {
      expect(exported).not.toContain(privateMappingValue);
    }
  });

  it("aliases every exported identifier and removes descriptive private text", () => {
    const { snapshot } = buildExportFixture();
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("9.0");
    expect(snapshot.projection.schemaVersion).toBe("9.0");
    expect(snapshot.exportMetadata).toEqual({
      transformation: "typed_allowlist_and_automatic_anonymization",
      automaticSanitizationApplied: true,
      rawLunchMoneyIdentifiersIncluded: false,
      sourceSystemRecordIdsIncluded: false,
      descriptiveFinancialTextIncluded: false,
      credentialsIncluded: false,
      accountAliases: [
        { key: "cash_1", label: "Cash account 1", plannerType: "cash" },
        { key: "rrsp_1", label: "RRSP/RRIF account 1", plannerType: "rrsp_rrif" },
      ],
      nonFinancialAssetAliases: [],
      liabilityAliases: [],
    });
    expect(snapshot.resolvedBaseline.accounts.map(({ label }) => label)).toEqual([
      "Cash account 1",
      "RRSP/RRIF account 1",
    ]);
    expect(snapshot.activeInputs.accounts.map(({ label }) => label)).toEqual([
      "Cash account 1",
      "RRSP/RRIF account 1",
    ]);
    expect(snapshot.projection.inputs.accounts.map(({ label }) => label)).toEqual([
      "Cash account 1",
      "RRSP/RRIF account 1",
    ]);
    expect(snapshot.derivedBaseline.accountBalances.map(({ name }) => name)).toEqual([
      "Cash account 1",
      "RRSP/RRIF account 1",
    ]);
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
        identifier: "warning_1",
        name: "Warning 1",
        message: "An included financial account has a negative opening balance.",
      },
      {
        code: "unused_account_mapping",
        severity: "warning",
        identifier: "warning_2",
        name: "Warning 2",
        message: "A configured account mapping did not match an imported account.",
      },
    ]);
    expect(snapshot.unmappedAccounts).toEqual([
      { id: "unmapped_account_1", source: "plaid", name: "Unmapped account 1" },
    ]);
    expect(snapshot.unmappedCategories).toEqual([
      { id: "category_1", name: "Category 1", transactionCount: 3 },
    ]);
    expect(snapshot.resolvedBaseline.person.employmentIncomePhases[0]).toMatchObject({
      id: "employment_phase_1",
      label: "Employment phase 1",
    });
    expect(snapshot.resolvedBaseline.spendingPhases[0]).toMatchObject({
      id: "spending_phase_1",
      label: "Spending phase 1",
      source: "explicit_configuration",
    });
    expect(snapshot.resolvedBaseline.accounts[1]!.contributionPhases[0]).toMatchObject({
      id: "contribution_phase_1",
      label: "Contribution phase 1",
    });

    const idValues = collectIdValues(snapshot);
    expect(idValues.length).toBeGreaterThan(0);
    expect(idValues.every((id) => typeof id === "string")).toBe(true);
    expect(idValues.every((id) =>
      /^(?:cash|tfsa|rrsp|non_registered|debt|event|recurring_expense|category|unmapped_account|employment_phase|spending_phase|contribution_phase)_\d+$/.test(String(id)),
    )).toBe(true);
    expectNoSourceIdentifiersOrCredentials(serialized);
    expect(serialized).not.toContain(AUDIT_RAW_ID);
  });

  it("exports only safe provenance field references and override keys", () => {
    const { inputs, snapshot } = buildExportFixture();

    expect(snapshot.provenance["accounts.cash_1.openingBalance"]).toEqual({
      fieldReference: "accounts.cash_1.openingBalance",
      value: 20000,
      sourceType: "lunchmoney_derived",
      sourceDescription: "Value imported from Lunch Money and aggregated for the baseline",
      effectiveDate: "2026-07-14",
    });
    expect(snapshot.provenance.events?.value).toEqual(snapshot.resolvedBaseline.events);
    expect(snapshot.provenance.events?.sourceDescription).toBe(
      "Value supplied through private local configuration",
    );
    expect(
      snapshot.provenance["person.cpp.monthlyAmountAt65Today"],
    ).toMatchObject({
      referenceKind: "population_average",
      referenceUrl:
        "https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html",
      sourceDescription: "Published Canadian reference",
    });
    expect(snapshot.provenance).not.toHaveProperty("field_1");
    expect(snapshot.activeOverrides).toEqual({
      "contributionPhase.rrsp_1.contribution_phase_1.monthlyAmountToday": 1500,
      "employmentPhase.employment_phase_1.annualNetCashToday": 70000,
    });
    expect(
      snapshot.provenance[
        "accounts.rrsp_1.contributionPhases.contribution_phase_1.monthlyAmountToday"
      ]?.sourceDescription,
    )
      .toBe("Value supplied through private local configuration");
    expect(
      snapshot.provenance[
        "accounts.rrsp_1.contributionPhases.contribution_phase_1.label"
      ]?.value,
    ).toBe("Contribution phase 1");
    expect(
      snapshot.provenance[
        "person.employmentIncomePhases.employment_phase_1.label"
      ]?.value,
    ).toBe("Employment phase 1");
    expect(
      snapshot.provenance["spendingPhases.spending_phase_1.label"]?.value,
    ).toBe("Spending phase 1");
    expect(
      snapshot.provenance[
        "spendingPhases.spending_phase_1.discretionaryMultiplier"
      ]?.value,
    ).toBe(inputs.spendingPhases[0]!.discretionaryMultiplier);
    expectNoSourceIdentifiersOrCredentials(JSON.stringify(snapshot.provenance));
    expectNoSourceIdentifiersOrCredentials(JSON.stringify(snapshot.activeOverrides));
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
    expect(snapshot.projection.retirementSnapshot).toEqual({
      ...projection.retirementSnapshot,
      nominal: expect.any(Object),
      real: expect.any(Object),
    });
    expect(snapshot.projection.retirementSnapshot.flowPeriod).toEqual({
      kind: "final_working_month",
      calendarMonth: projection.retirementSnapshot.flowPeriod.calendarMonth,
    });
    expect(snapshot.projection.financialAssetsBridge).toEqual(
      projection.financialAssetsBridge,
    );
    expect(snapshot.projection.governmentBenefits).toEqual(
      projection.governmentBenefits,
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
    expectNoSourceIdentifiersOrCredentials(JSON.stringify(snapshot));
  });

  it("preserves typed legacy-zero migration warnings", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.person.cpp.monthlyAmountAt65Today = 0;
    inputs.person.oas.fullMonthlyAmountAt65Today = 0;
    const baseline = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    baseline.warnings = [
      {
        code: "legacy_zero_cpp_amount",
        severity: "warning",
        message: "Legacy CPP zero requires explicit_zero when migrated.",
      },
      {
        code: "legacy_zero_oas_amount",
        severity: "warning",
        message: "Legacy OAS zero requires eligibility mode none when migrated.",
      },
    ];

    const snapshot = createProjectionSnapshot(
      calculateProjection(inputs),
      baseline,
      {},
    );

    expect(snapshot.warnings.map((warning) => warning.code)).toEqual([
      "legacy_zero_cpp_amount",
      "legacy_zero_oas_amount",
    ]);
  });

  it("preserves active CPP and OAS claim-age overrides", () => {
    const baseline = structuredClone(baselineContextFixture);
    const activeInputs = structuredClone(projectionFixture);
    activeInputs.person.cpp.startAge = 70;
    activeInputs.person.oas.startAge = 70;

    const snapshot = createProjectionSnapshot(
      calculateProjection(activeInputs),
      baseline,
      { cppStartAge: 70, oasStartAge: 70 },
    );

    expect(snapshot.resolvedBaseline.person.cpp.startAge).toBe(65);
    expect(snapshot.activeInputs.person.cpp.startAge).toBe(70);
    expect(snapshot.projection.governmentBenefits.cpp.claimFactor).toBeCloseTo(
      1.42,
    );
    expect(snapshot.projection.governmentBenefits.oas.claimFactor).toBeCloseTo(
      1.36,
    );
    expect(snapshot.activeOverrides).toEqual({
      cppStartAge: 70,
      oasStartAge: 70,
    });
  });

  it("keeps same-type account aliases distinct despite duplicate private labels", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, label: PRIVATE_TEXT.personalName };
    inputs.accounts[1] = { ...inputs.accounts[1]!, label: PRIVATE_TEXT.personalName };
    inputs.accounts.push({
      ...structuredClone(inputs.accounts[1]!),
      id: "manual:duplicate-private-rrsp",
      label: PRIVATE_TEXT.personalName,
      openingBalance: 25000,
      contributionPhases: [],
      withdrawalPriority: 3,
    });
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
      "Cash account 1",
      "RRSP/RRIF account 1",
      "RRSP/RRIF account 2",
    ]);
    expect(snapshot.exportMetadata.accountAliases.map(({ key }) => key)).toEqual([
      "cash_1",
      "rrsp_1",
      "rrsp_2",
    ]);
    expect(snapshot.projection.inputs.events[0]!.label).toBe("Future event 1");
    expectNoSourceIdentifiersOrCredentials(JSON.stringify(snapshot));
  });

  it("uses a generic label and safe key for the synthetic cash account", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.accounts[0] = { ...inputs.accounts[0]!, id: "cash", label: PRIVATE_TEXT.personalName };
    inputs.surplusAllocation.reserveAccountIds = ["cash"];
    inputs.surplusAllocation.reserveRefillAccountId = "cash";
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
    expect(snapshot.resolvedBaseline.accounts[0]!.label).toBe("Cash account 1");
    expectNoSourceIdentifiersOrCredentials(JSON.stringify(snapshot));
  });

  it("preserves CPP and OAS milestone labels in JSON and flat CSV", () => {
    const inputs: ProjectionInputs = structuredClone(projectionFixture);
    inputs.person.currentAge = 64;
    inputs.person.retirementAge = 65;
    inputs.person.employmentIncomePhases = [
      {
        id: "current-income",
        label: "Current income",
        startAge: 64,
        endAge: 65,
        annualNetCashToday: 84000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 100000,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
    ];
    for (const account of inputs.accounts) {
      account.contributionPhases = account.contributionPhases.map((phase) => ({
        ...phase,
        startAge: 64,
        endAge: 65,
      }));
    }
    inputs.person.cpp.startAge = 65;
    inputs.person.oas.startAge = 65;
    inputs.endAge = 66;

    const baseline: BaselineExportContext = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});
    const milestonePeriod = snapshot.projection.annual.find((point) =>
      point.milestones.includes("CPP begins"),
    );

    expect(milestonePeriod?.milestones).toEqual([
      "Retirement",
      "CPP begins",
      "OAS begins",
    ]);
    expect(JSON.stringify(snapshot)).toContain('"CPP begins"');
    expect(JSON.stringify(snapshot)).toContain('"OAS begins"');

    const csv = projectionSnapshotToCsv(snapshot, "real");
    const rows = csv.split("\n").map(parseCsvLine);
    const header = rows[0]!;
    const milestoneRow = rows.slice(1).find(
      (row) =>
        row[header.indexOf("milestone_cpp")] === "1" &&
        row[header.indexOf("milestone_oas")] === "1",
    );
    expect(milestoneRow).toBeDefined();
  });

  it("exports corrected future employment income from the shared projection result", () => {
    const inputs = structuredClone(projectionFixture);
    inputs.startDate = "2026-07-15";
    inputs.person.currentAge = 40;
    inputs.person.retirementAge = 43;
    inputs.endAge = 43;
    inputs.annualInflation = 0.02;
    inputs.tax.effectiveTaxRate = 0;
    inputs.tax.oasRecoveryRate = 0;
    inputs.events = [];
    for (const account of inputs.accounts) {
      account.contributionPhases = [];
    }
    inputs.person.employmentIncomePhases = [
      {
        id: "synthetic-current-income",
        label: "Synthetic current income",
        startAge: 40,
        endAge: 41,
        annualNetCashToday: 12000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 0,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
      {
        id: "synthetic-future-income",
        label: "Synthetic future income",
        startAge: 41,
        endAge: 43,
        annualNetCashToday: 24000,
        annualGrowth: 0.02,
        rrspRoomGeneration: {
          annualEligibleEarnedIncomeToday: 0,
          annualPensionAdjustmentToday: 0,
          annualOtherRoomReductionToday: 0,
          annualGrowth: 0.02,
        },
      },
    ];
    const baseline = structuredClone(baselineContextFixture);
    baseline.projectionInputs = inputs;
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(projection, baseline, {});
    const exportedAnnual = snapshot.projection.annual.find(
      (point) => point.calendarYear === 2028,
    )!;
    const sourceAnnual = projection.annual.find(
      (point) => point.calendarYear === 2028,
    )!;

    expect(exportedAnnual.real.income.employment).toBe(24000);
    expect(exportedAnnual.real.income).toEqual(sourceAnnual.real.income);
    expect(exportedAnnual.real.balances.financialAssets).toBe(
      sourceAnnual.real.balances.financialAssets,
    );

    for (const mode of ["real", "nominal"] as const) {
      const rows = projectionSnapshotToCsv(snapshot, mode)
        .split("\n")
        .map(parseCsvLine);
      const header = rows[0]!;
      const row = rows.slice(1).find((candidate) =>
        candidate[0]?.startsWith("2028"),
      )!;
      expect(Number(row[header.indexOf("employmentNetCash")])).toBe(
        exportedAnnual[mode].income.employment,
      );
      expect(row).toHaveLength(header.length);
    }
  });

  it("emits automatically anonymized rectangular real and nominal CSV tables", () => {
    const { snapshot } = buildExportFixture();
    const csv = projectionSnapshotToCsv(snapshot, "real");
    const nominalCsv = projectionSnapshotToCsv(snapshot, "nominal");
    const lines = csv.split("\n");
    const parsed = lines.map(parseCsvLine);
    const header = parsed[0]!;

    expect(lines).toHaveLength(snapshot.projection.annual.length + 1);
    expect(lines.filter((line) => line.startsWith("period,"))).toHaveLength(1);
    expect(parsed.every((row) => row.length === header.length)).toBe(true);
    expect(header).toContain("account_cash_1");
    expect(header).toContain("account_rrsp_1");
    expect(header).toContain("employmentPhase");
    expect(header).toContain("incomeWithheldContributions");
    expect(header).toContain("allowedContributions");
    expect(header).toContain("surplusFundedContributions");
    expect(header).toContain("registered_room_basis");
    expect(header).toEqual(expect.arrayContaining([
      "cpp_base_monthly_at_65_today",
      "cpp_claim_age",
      "cpp_claim_factor",
      "oas_full_monthly_at_65_today",
      "oas_claim_age",
      "oas_claim_factor",
      "oas_eligibility_fraction",
      "oas_age_75_increase_rate",
    ]));
    expect(parsed[1]![0]).toBe("2026 (Jul–Dec)");
    expect(parsed[1]![header.indexOf("employmentPhase")]).toBe("Employment phase 1");
    expect(csv).not.toContain("section,key,value");
    expect(csv).not.toContain("metadata,");
    expect(csv).not.toContain("resolvedBaseline,");
    expect(csv).not.toMatch(/[{}[\]]/);
    expect(lines).not.toContain("");

    const financialAssetsColumn = header.indexOf("financial_assets");
    expect(Number(parsed[1]![financialAssetsColumn])).toBe(
      snapshot.projection.annual[0]!.real.balances.financialAssets,
    );
    expect(
      Number(parsed[1]![header.indexOf("cpp_claim_factor")]),
    ).toBe(snapshot.projection.governmentBenefits.cpp.claimFactor);
    expect(
      Number(parsed[1]![header.indexOf("oas_eligibility_fraction")]),
    ).toBe(snapshot.projection.governmentBenefits.oas.eligibilityFraction);
    expectNoSourceIdentifiersOrCredentials(csv);
    expectNoSourceIdentifiersOrCredentials(nominalCsv);
    const nominalRows = nominalCsv.split("\n").map(parseCsvLine);
    expect(nominalRows).toHaveLength(snapshot.projection.annual.length + 1);
    expect(nominalRows.every((row) => row.length === nominalRows[0]!.length)).toBe(true);
    expect(nominalRows[1]![header.indexOf("dollarMode")]).toBe("nominal");
    const roomColumns = [
      "tfsa_room_opening",
      "tfsa_room_new",
      "tfsa_room_withdrawal_restored",
      "tfsa_contribution_allowed",
      "tfsa_room_closing",
      "rrsp_room_opening",
      "rrsp_room_new",
      "rrsp_contribution_allowed",
      "rrsp_room_closing",
    ];
    for (let rowIndex = 1; rowIndex < parsed.length; rowIndex += 1) {
      for (const column of roomColumns) {
        expect(parsed[rowIndex]![header.indexOf(column)]).toBe(
          nominalRows[rowIndex]![header.indexOf(column)],
        );
      }
      expect(
        parsed[rowIndex]![header.indexOf("registered_room_basis")],
      ).toBe("nominal_regulatory_dollars");
      const numberAt = (column: string) =>
        Number(parsed[rowIndex]![header.indexOf(column)]);
      expect(
        numberAt("tfsa_room_opening") +
          numberAt("tfsa_room_new") +
          numberAt("tfsa_room_withdrawal_restored") -
          numberAt("tfsa_contribution_allowed") -
          numberAt("tfsa_room_closing"),
      ).toBeCloseTo(0, 2);
      expect(
        numberAt("rrsp_room_opening") +
          numberAt("rrsp_room_new") -
          numberAt("rrsp_contribution_allowed") -
          numberAt("rrsp_room_closing"),
      ).toBeCloseTo(0, 2);
    }
    expect(
      parsed.slice(1).some(
        (row, index) =>
          row[header.indexOf("employmentNetCash")] !==
          nominalRows[index + 1]![header.indexOf("employmentNetCash")],
      ),
    ).toBe(true);
    expect(snapshot.projection.registeredAccountRoom.denomination).toBe(
      "nominal_regulatory_dollars",
    );
    expect(
      snapshot.projection.annual[0]!.real.contributions,
    ).toHaveProperty("surplusFunded");
  });

  it("produces deterministic aliases across repeated exports of the same input", () => {
    const { projection, baseline } = buildExportFixture();
    const overrides = {
      [`employmentPhase.${RAW_IDS.employmentPhase}.annualNetCashToday`]: 70000,
      [`contributionPhase.${RAW_IDS.rrsp}.${RAW_IDS.contributionPhase}.monthlyAmountToday`]: 1500,
    };
    const first = createProjectionSnapshot(
      projection,
      baseline,
      overrides,
      "2026-07-14T00:00:00.000Z",
    );
    const second = createProjectionSnapshot(
      projection,
      baseline,
      overrides,
      "2026-07-14T00:00:00.000Z",
    );

    expect(second).toEqual(first);
    expect(projectionSnapshotToCsv(second, "real")).toBe(
      projectionSnapshotToCsv(first, "real"),
    );
    expect(projectionSnapshotToCsv(second, "nominal")).toBe(
      projectionSnapshotToCsv(first, "nominal"),
    );
  });

  it("automatically aliases projection-only policy accounts, provenance, overrides, and flat CSV fields", () => {
    const inputs = structuredClone(projectionFixture);
    const secondReserveAccountId =
      "manual:private-second-cash-DIGITS-4444";
    const projectionAccountId =
      "projection:private-taxable-DIGITS-5555";
    const projectionLabel =
      `${PRIVATE_TEXT.personalName} future taxable at ${PRIVATE_TEXT.institution}`;
    inputs.accounts.push({
      id: secondReserveAccountId,
      label: `${PRIVATE_TEXT.personalName} second cash`,
      origin: "lunchmoney",
      type: "cash",
      openingBalance: 1000,
      annualReturn: 0.01,
      contributionPhases: [],
      withdrawalPriority: 3,
      allocation: { cash: 1, fixedIncome: 0, equity: 0 },
    });
    inputs.accounts.push({
      id: projectionAccountId,
      label: projectionLabel,
      origin: "projection_configuration",
      type: "non_registered",
      openingBalance: 0,
      annualReturn: 0.07,
      contributionPhases: [],
      withdrawalPriority: 4,
      allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 },
    });
    inputs.surplusAllocation = {
      reserveAccountIds: ["manual:1", secondReserveAccountId],
      reserveRefillAccountId: "manual:1",
      targetCashReserveToday: 27500,
      reserveIndexingRate: 0.03,
      excess: {
        mode: "allocate_to_account",
        destinationAccountId: projectionAccountId,
      },
    };
    const baseline = structuredClone(baselineContextFixture);
    baseline.projectionInputs = structuredClone(inputs);
    baseline.provenance = {
      "accounts.projection:private-taxable-DIGITS-5555.label": {
        value: projectionLabel,
        sourceType: "local_configuration",
        sourceDescription: `${projectionLabel} from ${PRIVATE_TEXT.privateConfigPath}`,
        effectiveDate: baseline.dataThrough,
      },
      "accounts.projection:private-taxable-DIGITS-5555.origin": {
        value: "projection_configuration",
        sourceType: "local_configuration",
        sourceDescription: "Projection-only configured origin",
        effectiveDate: baseline.dataThrough,
      },
      "accounts.projection:private-taxable-DIGITS-5555.openingBalance": {
        value: 0,
        sourceType: "local_configuration",
        sourceDescription: "Fixed zero and not imported",
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.reserveAccountIds": {
        value: ["manual:1", secondReserveAccountId],
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.reserveRefillAccountId": {
        value: "manual:1",
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.targetCashReserveToday": {
        value: 27500,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.reserveIndexingRate": {
        value: 0.03,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.excess.mode": {
        value: "allocate_to_account",
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "surplusAllocation.excess.destinationAccountId": {
        value: projectionAccountId,
        sourceType: "local_configuration",
        sourceDescription: projectionLabel,
        effectiveDate: baseline.dataThrough,
      },
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(
      projection,
      baseline,
      {
        "surplusAllocation.targetCashReserveToday": 27500,
        "surplusAllocation.reserveIndexingRate": 0.03,
      },
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.schemaVersion).toBe("9.0");
    expect(snapshot.projection.inputs.accounts.at(-1)).toMatchObject({
      id: "non_registered_1",
      label: "Non-registered account 1",
      origin: "projection_configuration",
      openingBalance: 0,
    });
    expect(snapshot.projection.surplusAllocation.policy).toMatchObject({
      reserveAccountIds: ["cash_1", "cash_2"],
      reserveRefillAccountId: "cash_1",
      destinationAccountId: "non_registered_1",
      targetCashReserveToday: 27500,
      reserveIndexingRate: 0.03,
      excessMode: "allocate_to_account",
    });
    expect(
      snapshot.provenance[
        "surplusAllocation.excess.destinationAccountId"
      ]?.value,
    ).toBe("non_registered_1");
    expect(
      snapshot.provenance["surplusAllocation.reserveAccountIds"]?.value,
    ).toEqual(["cash_1", "cash_2"]);
    expect(
      snapshot.provenance[
        "surplusAllocation.reserveRefillAccountId"
      ]?.value,
    ).toBe("cash_1");
    expect(snapshot.activeOverrides).toEqual({
      "surplusAllocation.reserveIndexingRate": 0.03,
      "surplusAllocation.targetCashReserveToday": 27500,
    });
    expect(serialized).not.toContain(projectionAccountId);
    expect(serialized).not.toContain(projectionLabel);
    expect(serialized).not.toContain("projection:");

    for (const mode of ["real", "nominal"] as const) {
      const csv = projectionSnapshotToCsv(snapshot, mode);
      const lines = csv.split("\n").map(parseCsvLine);
      const header = lines[0]!;
      expect(header).toEqual(
        expect.arrayContaining([
          "surplus_generated",
          "surplus_reserve_refill",
          "surplus_retained_as_cash",
          "surplus_redirected",
          "surplus_reserve_target",
          "surplus_reserve_target_today",
          "surplus_reserve_indexing_rate",
          "surplus_excess_mode",
          "surplus_reserve_refill_account",
          "surplus_destination_account",
          "surplus_reserve_member_cash_1",
          "surplus_reserve_member_cash_2",
          "surplus_reserve_member_rrsp_1",
          "surplus_reserve_member_non_registered_1",
          "surplus_allocation_cash_1",
          "surplus_allocation_cash_2",
          "surplus_allocation_non_registered_1",
          "tfsa_room_opening",
          "tfsa_room_new",
          "tfsa_room_withdrawal_restored",
          "tfsa_contribution_planned",
          "tfsa_contribution_allowed",
          "tfsa_room_closing",
          "rrsp_room_opening",
          "rrsp_previous_year_eligible_earned_income",
          "rrsp_earned_income_rate",
          "rrsp_annual_cap",
          "rrsp_room_new",
          "rrsp_room_closing",
          "planned_contribution_rrsp_1",
          "actual_contribution_rrsp_1",
          "redirected_in_rrsp_1",
          "redirected_out_rrsp_1",
          "surplus_contribution_rrsp_1",
        ]),
      );
      expect(header).not.toContain("surplus_reserve_accounts");
      expect(
        header.filter((column) =>
          column.startsWith("surplus_reserve_member_"),
        ),
      ).toEqual(
        snapshot.exportMetadata.accountAliases.map(
          (account) => `surplus_reserve_member_${account.key}`,
        ),
      );
      const membershipExpectations = {
        surplus_reserve_member_cash_1: "1",
        surplus_reserve_member_cash_2: "1",
        surplus_reserve_member_rrsp_1: "0",
        surplus_reserve_member_non_registered_1: "0",
      };
      for (const row of lines.slice(1)) {
        for (const [column, expected] of Object.entries(
          membershipExpectations,
        )) {
          expect(row[header.indexOf(column)]).toBe(expected);
        }
        expect(
          row[header.indexOf("surplus_reserve_refill_account")],
        ).toBe("cash_1");
        expect(
          row[header.indexOf("surplus_destination_account")],
        ).toBe("non_registered_1");
      }
      expect(new Set(lines.map((line) => line.length))).toEqual(
        new Set([header.length]),
      );
      expect(csv).not.toContain("cash_1; cash_2");
      expect(csv).not.toContain(projectionAccountId);
      expect(csv).not.toContain(projectionLabel);
      expect(csv).not.toContain("projection:");
      expect(csv).not.toContain("manual:1");
    }
  });

  it("anonymizes simple roles, policy preview, explicit plans, projection taxable account, and scalar CSV fields", () => {
    const fixture = buildExportFixture();
    const inputs = structuredClone(fixture.inputs);
    const personalRrspId = "manual:private-personal-rrsp-DIGITS-1111";
    const workplaceRrspId =
      "plaid:private-workplace-rrsp-DIGITS-2222";
    const taxableId = "projection:private-future-taxable-DIGITS-3333";
    const reservePhaseId = "private-reserve-phase-id";
    const privateTaxableLabel =
      `${PRIVATE_TEXT.personalName} taxable future at ${PRIVATE_TEXT.institution}`;

    inputs.accounts[0] = {
      ...inputs.accounts[0]!,
      id: RAW_IDS.cash,
      label: RAW_ACCOUNT_NAMES.cash,
      type: "cash",
      contributionPhases: [],
    };
    inputs.accounts[1] = {
      ...inputs.accounts[1]!,
      id: RAW_IDS.rrsp,
      label: `${PRIVATE_TEXT.personalName} personal TFSA`,
      type: "tfsa",
      contributionPhases: [
        {
          id: RAW_IDS.contributionPhase,
          label: PRIVATE_TEXT.contributionPhaseLabel,
          startAge: 40,
          endAge: 65,
          monthlyAmountToday: 1000,
          funding: "cash",
          indexingRate: 0,
        },
      ],
    };
    inputs.accounts.push(
      {
        ...structuredClone(inputs.accounts[1]!),
        id: personalRrspId,
        label: `${PRIVATE_TEXT.personalName} personal RRSP`,
        type: "rrsp_rrif",
        contributionPhases: [],
        withdrawalPriority: 3,
      },
      {
        ...structuredClone(inputs.accounts[1]!),
        id: workplaceRrspId,
        label: `${PRIVATE_TEXT.employer} workplace RRSP`,
        type: "rrsp_rrif",
        contributionPhases: [
          {
            id: "private-workplace-phase-id",
            label: `${PRIVATE_TEXT.employer} workplace saving`,
            startAge: 40,
            endAge: 65,
            monthlyAmountToday: 1800,
            funding: "income_withheld",
            indexingRate: 0,
          },
        ],
        withdrawalPriority: 4,
      },
      {
        id: taxableId,
        label: privateTaxableLabel,
        origin: "projection_configuration",
        type: "non_registered",
        openingBalance: 0,
        annualReturn: 0.05,
        contributionPhases: [],
        withdrawalPriority: 5,
        allocation: { cash: 0.05, fixedIncome: 0.25, equity: 0.7 },
      },
    );
    inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount = 10000;
    inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.amount =
      10000;
    inputs.contributionWaterfall = {
      mode: "simple_policy",
      routes: [
        {
          sourceAccountId: workplaceRrspId,
          destinationAccountIds: [workplaceRrspId],
        },
        {
          sourceAccountId: RAW_IDS.rrsp,
          destinationAccountIds: [
            RAW_IDS.rrsp,
            personalRrspId,
            taxableId,
          ],
        },
      ],
      surplusDestinationAccountIds: [
        RAW_IDS.rrsp,
        personalRrspId,
        taxableId,
      ],
    };
    inputs.surplusAllocation = {
      reserveAccountIds: [RAW_IDS.cash],
      reserveRefillAccountId: RAW_IDS.cash,
      targetCashReserveToday: 40000,
      reserveIndexingRate: 0.02,
      excess: { mode: "allocate_through_contribution_waterfall" },
    };
    inputs.savingsPolicy = {
      mode: "simple",
      operatingCashAccountId: RAW_IDS.cash,
      reserveAccountIds: [RAW_IDS.cash],
      reserveRefillAccountId: RAW_IDS.cash,
      personalTfsaAccountId: RAW_IDS.rrsp,
      personalRrspAccountId: personalRrspId,
      workplaceRrspAccountId: workplaceRrspId,
      taxableAccountId: taxableId,
      taxableAccountOrigin: "projection_configuration",
      reserveBuildingPhases: [
        {
          id: reservePhaseId,
          label: `${PRIVATE_TEXT.personalName} emergency saving`,
          startAge: 40,
          endAge: 50,
          monthlyAmountToday: 1500,
          indexingRate: 0,
        },
      ],
      operatingCashTarget: { targetToday: 10000, indexingRate: 0.02 },
      unplannedCash: "sweep_above_targets",
      personalOrder: ["personal_tfsa", "personal_rrsp", "taxable"],
      workplaceRoomPriority: "first",
      workplaceOverflow: "unallocated",
      reserveAfterTarget: "personal_investing",
    };

    const baseline = structuredClone(fixture.baseline);
    baseline.projectionInputs = structuredClone(inputs);
    baseline.derived.accountBalances[1]!.plannerType = "tfsa";
    baseline.provenance = {
      [`accounts.${RAW_IDS.cash}.roles`]: {
        value: ["operating_cash", "reserve_member", "reserve_refill"],
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      [`accounts.${RAW_IDS.rrsp}.roles`]: {
        value: ["personal_tfsa"],
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.personalName,
        effectiveDate: baseline.dataThrough,
      },
      [`accounts.${personalRrspId}.roles`]: {
        value: ["personal_rrsp"],
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.personalName,
        effectiveDate: baseline.dataThrough,
      },
      [`accounts.${workplaceRrspId}.roles`]: {
        value: ["workplace_rrsp"],
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.employer,
        effectiveDate: baseline.dataThrough,
      },
      [`accounts.${taxableId}.roles`]: {
        value: ["personal_taxable"],
        sourceType: "local_configuration",
        sourceDescription: privateTaxableLabel,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.reserveAccountIds": {
        value: [RAW_IDS.cash],
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.operatingCashAccountId": {
        value: RAW_IDS.cash,
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.reserveRefillAccountId": {
        value: RAW_IDS.cash,
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.cash,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.personalTfsaAccountId": {
        value: RAW_IDS.rrsp,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.personalName,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.personalRrspAccountId": {
        value: personalRrspId,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.personalName,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.workplaceRrspAccountId": {
        value: workplaceRrspId,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.employer,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.taxableAccountId": {
        value: taxableId,
        sourceType: "local_configuration",
        sourceDescription: privateTaxableLabel,
        effectiveDate: baseline.dataThrough,
      },
      [`savingsPolicy.reserveBuilding.phases.${reservePhaseId}.label`]: {
        value: `${PRIVATE_TEXT.personalName} emergency saving`,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.reserveBuilding.targetToday": {
        value: 40000,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.reserveBuilding.indexingRate": {
        value: 0.02,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.operatingCash.targetToday": {
        value: 10000,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
      "savingsPolicy.operatingCash.indexingRate": {
        value: 0.02,
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(
      projection,
      baseline,
      {
        "savingsPolicy.reserveBuilding.targetToday": 40000,
        "savingsPolicy.operatingCash.targetToday": 10000,
        "savingsPolicy.operatingCash.indexingRate": 0.02,
        [`reserveBuildingPhase.${reservePhaseId}.monthlyAmountToday`]:
          1500,
      },
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.policyPreview).toMatchObject({
      mode: "simple",
      reserveAccounts: ["Cash account 1"],
      reserveRefillAccount: "Cash account 1",
      operatingCashAccount: "Cash account 1",
      workplacePriority:
        "Workplace RRSP gets first claim on global RRSP room",
      workplaceOverflow: "Workplace RRSP overflow is unallocated",
      personalOrder: "Personal TFSA → personal RRSP → taxable",
      taxableDestination: "Non-registered account 1",
      taxableDestinationKind: "projection-only",
    });
    expect(snapshot.activeInputs.savingsPolicy).toMatchObject({
      mode: "simple",
      operatingCashAccountId: "cash_1",
      reserveAccountIds: ["cash_1"],
      reserveRefillAccountId: "cash_1",
      personalTfsaAccountId: "tfsa_1",
      personalRrspAccountId: "rrsp_1",
      workplaceRrspAccountId: "rrsp_2",
      taxableAccountId: "non_registered_1",
      taxableAccountOrigin: "projection_configuration",
      operatingCashTarget: { targetToday: 10000, indexingRate: 0.02 },
      unplannedCash: "sweep_above_targets",
    });
    expect(snapshot.projection.savingsPolicy.policy).toMatchObject({
      mode: "simple",
      personalTfsaAccountId: "tfsa_1",
      personalRrspAccountId: "rrsp_1",
      workplaceRrspAccountId: "rrsp_2",
      taxableAccountId: "non_registered_1",
      workplaceRoomPriority: "first",
      workplaceOverflow: "unallocated",
      unplannedCash: "sweep_above_targets",
      operatingCashIsReserveMember: true,
    });
    expect(
      Object.keys(
        snapshot.projection.savingsPolicy.throughRetirement.nominal
          .accountSweepAllocations,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^(tfsa|rrsp|non_registered)_\d+$/),
      ]),
    );
    expect(
      Object.keys(
        snapshot.projection.annual[0]!.nominal.accountSweepAllocations,
      ).every((accountId) => !accountId.includes(":")),
    ).toBe(true);
    expect(snapshot.activeOverrides).toEqual({
      "reserveBuildingPhase.savings_phase_1.monthlyAmountToday": 1500,
      "savingsPolicy.operatingCash.indexingRate": 0.02,
      "savingsPolicy.operatingCash.targetToday": 10000,
      "savingsPolicy.reserveBuilding.targetToday": 40000,
    });
    expect(
      snapshot.provenance["accounts.cash_1.roles"]?.value,
    ).toEqual(["operating_cash", "reserve_member", "reserve_refill"]);
    expect(
      snapshot.provenance["savingsPolicy.taxableAccountId"]?.value,
    ).toBe("non_registered_1");

    for (const mode of ["real", "nominal"] as const) {
      const csv = projectionSnapshotToCsv(snapshot, mode);
      const rows = csv.split("\n").map(parseCsvLine);
      const header = rows[0]!;
      expect(header).toEqual(
        expect.arrayContaining([
          "savings_policy_mode",
          "savings_unplanned_cash_policy",
          "operating_cash_target_today",
          "operating_cash_indexing_rate",
          "operating_cash_is_reserve_member",
          "positive_cash_available",
          "personal_plan_planned",
          "personal_plan_allowed",
          "personal_plan_unallocated",
          "reserve_plan_planned",
          "reserve_plan_funded",
          "reserve_cash_retained",
          "reserve_plan_redirected",
          "reserve_plan_unfunded",
          "workplace_plan_planned",
          "workplace_plan_allowed",
          "workplace_plan_unallocated",
          "unplanned_cash_retained",
          "unplanned_cash_swept",
          "operating_target_unfunded",
          "reserve_target_unfunded",
          "total_investment_deposits",
          "savings_operating_cash_account",
          "savings_taxable_account",
          "savings_taxable_origin",
          "unplanned_sweep_allocation_tfsa_1",
          "unplanned_sweep_allocation_rrsp_1",
          "unplanned_sweep_allocation_non_registered_1",
        ]),
      );
      expect(rows.every((row) => row.length === header.length)).toBe(true);
      expect(
        rows.slice(1).every(
          (row) =>
            row[header.indexOf("savings_policy_mode")] === "simple" &&
            row[header.indexOf("savings_unplanned_cash_policy")] ===
              "sweep_above_targets" &&
            row[header.indexOf("savings_operating_cash_account")] ===
              "cash_1" &&
            row[header.indexOf("savings_taxable_account")] ===
              "non_registered_1",
        ),
      ).toBe(true);
      expect(csv).not.toMatch(/[{}[\]]/);
      expect(csv).not.toContain(";");
      expectNoSourceIdentifiersOrCredentials(csv);
      for (const privateValue of [
        personalRrspId,
        workplaceRrspId,
        taxableId,
        reservePhaseId,
        privateTaxableLabel,
      ]) {
        expect(csv).not.toContain(privateValue);
      }
    }
    expectNoSourceIdentifiersOrCredentials(serialized);
    for (const privateValue of [
      personalRrspId,
      workplaceRrspId,
      taxableId,
      reservePhaseId,
      privateTaxableLabel,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).not.toContain("projection:");
  });

  it("uses ordinary export filenames for JSON and both CSV modes", () => {
    const json = projectionJsonFilename("2026-07-15T12:00:00.000Z");
    const realCsv = projectionCsvFilename("2026-07-15T12:00:00.000Z", "real");
    const nominalCsv = projectionCsvFilename("2026-07-15T12:00:00.000Z", "nominal");

    expect(json).toBe("retirement-projection-2026-07-15.json");
    expect(realCsv).toBe("retirement-projection-real-2026-07-15.csv");
    expect(nominalCsv).toBe("retirement-projection-nominal-2026-07-15.csv");
    expect([json, realCsv, nominalCsv].join(" ")).not.toMatch(/share-safe|anonymized/i);
  });

  it("aliases registered-room routes, provenance, overrides, and flat account contribution columns", () => {
    const fixture = buildExportFixture();
    const inputs = structuredClone(fixture.inputs);
    const baseline = structuredClone(fixture.baseline);
    inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.sourceDescription =
      `${PRIVATE_TEXT.personalName} TFSA notice from ${PRIVATE_TEXT.institution}`;
    inputs.registeredAccountRoom!.rrsp.startingAvailableDeductionRoom.sourceDescription =
      `${PRIVATE_TEXT.employer} RRSP notice at ${PRIVATE_TEXT.streetAddress}`;
    inputs.contributionWaterfall = {
      mode: "canonical",
      routes: [
        {
          sourceAccountId: RAW_IDS.rrsp,
          destinationAccountIds: [RAW_IDS.rrsp],
        },
      ],
      surplusDestinationAccountIds: [RAW_IDS.rrsp],
    };
    baseline.projectionInputs = structuredClone(inputs);
    baseline.provenance = {
      ...baseline.provenance,
      "registeredAccountRoom.tfsa.startingAvailableRoom.amount": {
        value:
          inputs.registeredAccountRoom!.tfsa.startingAvailableRoom.amount,
        sourceType: "local_configuration",
        sourceDescription: `${PRIVATE_TEXT.personalName} ${PRIVATE_TEXT.email}`,
        effectiveDate: baseline.dataThrough,
      },
      [`person.employmentIncomePhases.${RAW_IDS.employmentPhase}.rrspRoomGeneration.annualEligibleEarnedIncomeToday`]:
        {
          value:
            inputs.person.employmentIncomePhases[0]!
              .rrspRoomGeneration!.annualEligibleEarnedIncomeToday,
          sourceType: "local_configuration",
          sourceDescription: `${PRIVATE_TEXT.employer} payroll statement`,
          effectiveDate: baseline.dataThrough,
        },
      "contributionWaterfall.routes.0.sourceAccountId": {
        value: RAW_IDS.rrsp,
        sourceType: "local_configuration",
        sourceDescription: RAW_ACCOUNT_NAMES.rrsp,
        effectiveDate: baseline.dataThrough,
      },
      "contributionWaterfall.routes.0.destinationAccountIds": {
        value: [RAW_IDS.rrsp],
        sourceType: "local_configuration",
        sourceDescription: PRIVATE_TEXT.note,
        effectiveDate: baseline.dataThrough,
      },
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(
      projection,
      baseline,
      {
        "registeredAccountRoom.tfsa.startingAvailableRoom.amount": 4321,
        [`employmentPhase.${RAW_IDS.employmentPhase}.rrspRoomGeneration.annualEligibleEarnedIncomeToday`]:
          123456,
      },
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.projection.inputs.contributionWaterfall.routes).toEqual([
      {
        sourceAccountId: "rrsp_1",
        destinationAccountIds: ["rrsp_1"],
      },
    ]);
    expect(
      snapshot.projection.inputs.registeredAccountRoom!.tfsa
        .startingAvailableRoom.sourceDescription,
    ).toBe("Personal TFSA room supplied through private configuration");
    expect(
      snapshot.provenance[
        "contributionWaterfall.routes.0.sourceAccountId"
      ]?.value,
    ).toBe("rrsp_1");
    expect(
      snapshot.provenance[
        "contributionWaterfall.routes.0.destinationAccountIds"
      ]?.value,
    ).toEqual(["rrsp_1"]);
    expect(snapshot.activeOverrides).toHaveProperty(
      "registeredAccountRoom.tfsa.startingAvailableRoom.amount",
      4321,
    );
    expect(snapshot.activeOverrides).toHaveProperty(
      "employmentPhase.employment_phase_1.rrspRoomGeneration.annualEligibleEarnedIncomeToday",
      123456,
    );
    for (const value of [
      RAW_IDS.rrsp,
      PRIVATE_TEXT.personalName,
      PRIVATE_TEXT.employer,
      PRIVATE_TEXT.institution,
      PRIVATE_TEXT.streetAddress,
      PRIVATE_TEXT.email,
    ]) {
      expect(serialized).not.toContain(value);
    }

    for (const mode of ["real", "nominal"] as const) {
      const lines = projectionSnapshotToCsv(snapshot, mode)
        .split("\n")
        .map(parseCsvLine);
      const header = lines[0]!;
      expect(header).toEqual(
        expect.arrayContaining([
          "tfsa_room_opening",
          "tfsa_room_closing",
          "rrsp_room_opening",
          "rrsp_room_closing",
          "planned_contribution_rrsp_1",
          "actual_contribution_rrsp_1",
          "redirected_in_rrsp_1",
          "redirected_out_rrsp_1",
          "surplus_contribution_rrsp_1",
        ]),
      );
      expect(new Set(lines.map((row) => row.length))).toEqual(
        new Set([header.length]),
      );
      expect(lines.flat().some((cell) => /[\[\]{}]/.test(cell))).toBe(false);
      expect(lines.flat().some((cell) => cell.includes(";"))).toBe(false);
    }
  });

  it("aliases residence and liability structures while keeping balance-sheet CSV fields scalar and rectangular", () => {
    const fixture = buildExportFixture();
    const inputs = structuredClone(fixture.inputs);
    const baseline = structuredClone(fixture.baseline);
    const liabilityId = "manual:private-mortgage-919199";
    const privateLiabilityLabel =
      `${PRIVATE_TEXT.institution} mortgage at ${PRIVATE_TEXT.streetAddress}`;
    const privateResidenceLabel =
      `Home at ${PRIVATE_TEXT.streetAddress}`;
    const residenceId = "manual:private-home-919198";
    const rawMatcherSource = "manual:private-chequing-919197";
    const rawMatcherPayee = "Private exact mortgage payee";
    inputs.nonFinancialAssets = [
      {
        id: residenceId,
        label: privateResidenceLabel,
        origin: "lunchmoney",
        type: "primary_residence",
        openingValue: 500000,
        valueAsOf: "2026-07-14",
        annualAppreciation: 0.02,
        availableForWithdrawals: false,
      },
    ];
    inputs.liabilities = [
      {
        id: liabilityId,
        label: privateLiabilityLabel,
        origin: "lunchmoney",
        openingBalance: 10000,
        balanceAsOf: "2026-07-14",
        role: "primary_mortgage",
        treatment: {
          mode: "amortizing",
          annualInterestRate: 0.04,
          interestRateConvention: "canadian_mortgage",
          regularPayment: {
            amount: 1000,
            frequency: "monthly",
            monthlyEquivalent: 1000,
          },
          scheduleStartDate: "2026-07-01",
          lumpSumPayments: [],
        },
        historicalPaymentHandling: "payee_and_source_account",
        historicalMonthlyAverage: 1000,
      },
    ];
    baseline.projectionInputs = structuredClone(inputs);
    baseline.derived.accountBalances.push({
      id: liabilityId,
      lunchMoneyId: 919199,
      source: "manual",
      name: privateLiabilityLabel,
      plannerType: "debt",
      balance: 10000,
      balanceAsOf: "2026-07-14T00:00:00Z",
      monthlyContribution: 0,
      contributionSource: "lunchmoney_derived",
      contributionFunding: undefined,
    });
    baseline.derived.nonFinancialAssetBalances.push({
      id: residenceId,
      lunchMoneyId: 919198,
      source: "manual",
      name: privateResidenceLabel,
      plannerType: "real_estate",
      value: 500000,
      valueAsOf: "2026-07-14T00:00:00Z",
    });
    baseline.derived.debtPayments = {
      trailingTotal: 12000,
      monthlyAverage: 1000,
      transactionCount: 12,
    };
    baseline.provenance[
      `liabilities.${liabilityId}.openingBalance`
    ] = {
      value: 10000,
      sourceType: "lunchmoney_derived",
      sourceDescription: privateLiabilityLabel,
      effectiveDate: "2026-07-14",
    };
    baseline.provenance[
      `liabilities.${liabilityId}.treatment.annualInterestRate`
    ] = {
      value: 0.04,
      sourceType: "local_configuration",
      sourceDescription: PRIVATE_TEXT.note,
      effectiveDate: "2026-07-14",
    };
    baseline.provenance[
      `liabilities.${liabilityId}.treatment.interestRateConvention`
    ] = {
      value: "canadian_mortgage",
      sourceType: "local_configuration",
      sourceDescription: PRIVATE_TEXT.note,
      effectiveDate: "2026-07-14",
    };
    baseline.provenance[
      `nonFinancialAssets.${residenceId}.openingValue`
    ] = {
      value: 500000,
      sourceType: "lunchmoney_derived",
      sourceDescription:
        `${privateResidenceLabel} ${rawMatcherSource} ${rawMatcherPayee}`,
      effectiveDate: "2026-07-14",
    };
    const projection = calculateProjection(inputs);
    const snapshot = createProjectionSnapshot(
      projection,
      baseline,
      {
        "primaryResidence.currentValue": 510000,
        [`liability.${liabilityId}.annualInterestRate`]: 0.05,
        [`liability.${liabilityId}.regularPayment.amount`]: 1100,
      },
      "2026-07-14T00:00:00.000Z",
    );
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.exportMetadata.nonFinancialAssetAliases).toEqual([
      {
        key: "non_financial_asset_1",
        label: "Non-financial asset 1",
      },
    ]);
    expect(snapshot.exportMetadata.liabilityAliases).toEqual([
      { key: "liability_1", label: "Liability 1" },
    ]);
    expect(snapshot.projection.inputs.nonFinancialAssets[0]).toMatchObject({
      id: "non_financial_asset_1",
      label: "Non-financial asset 1",
      openingValue: 500000,
    });
    expect(snapshot.projection.inputs.liabilities[0]).toMatchObject({
      id: "liability_1",
      label: "Liability 1",
      openingBalance: 10000,
      treatment: {
        mode: "amortizing",
        annualInterestRate: 0.04,
        interestRateConvention: "canadian_mortgage",
      },
    });
    expect(
      snapshot.provenance[
        "liabilities.liability_1.treatment.interestRateConvention"
      ],
    ).toMatchObject({
      value: "canadian_mortgage",
      sourceType: "local_configuration",
    });
    expect(
      snapshot.projection.annual[0]!.nominal.liabilitySchedules,
    ).toHaveProperty("liability_1");
    expect(snapshot.projection.liabilityPayoffDates).toHaveProperty(
      "liability_1",
    );
    expect(snapshot.activeOverrides).toMatchObject({
      "primaryResidence.currentValue": 510000,
      "liability.liability_1.annualInterestRate": 0.05,
      "liability.liability_1.regularPayment.amount": 1100,
    });
    for (const value of [
      liabilityId,
      privateLiabilityLabel,
      privateResidenceLabel,
      residenceId,
      rawMatcherSource,
      rawMatcherPayee,
      PRIVATE_TEXT.streetAddress,
      PRIVATE_TEXT.institution,
    ]) {
      expect(serialized).not.toContain(value);
    }

    for (const mode of ["real", "nominal"] as const) {
      const csv = projectionSnapshotToCsv(snapshot, mode);
      const rows = csv.split("\n").map(parseCsvLine);
      const header = rows[0]!;
      expect(header).toEqual(
        expect.arrayContaining([
          "financial_assets",
          "non_financial_assets",
          "total_assets",
          "mortgage_balance",
          "other_liabilities",
          "total_liabilities",
          "home_equity",
          "total_net_worth",
          "liability_cash_payment",
          "liability_interest",
          "liability_principal",
          "liability_lump_sum_principal",
        ]),
      );
      expect(
        rows.every((row) => row.length === header.length),
      ).toBe(true);
      expect(csv).not.toContain(liabilityId);
      expect(csv).not.toContain(privateLiabilityLabel);
      expect(csv).not.toContain(privateResidenceLabel);
      expect(csv).not.toMatch(/[{}[\]]/);
    }
  });
});
