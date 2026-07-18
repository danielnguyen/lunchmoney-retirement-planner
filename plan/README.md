# End-to-End MVP

This document is the source of truth for the first fully working version of Lunch Money Retirement Planner.

Implementation work must remain within this scope. Any change to the MVP definition must update this document first.

## Objective

Deliver one complete working path:

```text
Lunch Money API
    -> current financial baseline
    -> retirement projection
    -> charts, annual ledger, and exports
```

The application must use real Lunch Money data at runtime. It must not silently substitute demonstration data when a Lunch Money connection is configured.

## MVP principles

- Prefer the simplest complete implementation over extensible infrastructure.
- Fetch Lunch Money data on demand; persistence is not required.
- Keep all Lunch Money access read-only.
- Use explicit local configuration for information Lunch Money cannot provide reliably.
- Surface missing mappings and failures visibly instead of guessing.
- Keep the existing deterministic projection engine and useful report charts where they can operate on real inputs.
- Do not add features that are not required for the end-to-end path.

## Runtime data flow

A server-side operation loads the current baseline:

```text
LUNCHMONEY_API_TOKEN
    -> validate Lunch Money connection
    -> fetch accounts, categories, recurring items, and trailing transactions
    -> load local planner configuration
    -> classify accounts and transactions
    -> derive balances, income, spending, and contributions
    -> resolve remaining assumptions
    -> validate projection inputs
    -> calculate projection
    -> return report data with provenance, warnings, and data-through date
```

The implementation may call Lunch Money for every page load or explicit refresh. Caching and database persistence are out of scope.

## Runtime states

The application has only these runtime states:

1. **Connected**: real Lunch Money data has been loaded and the report is displayed.
2. **Configuration required**: the connection works, but required account or category mappings are missing.
3. **Connection failed**: the token is absent, invalid, or the Lunch Money API request failed.

The application must not display fictional projections in any of these states.

Test fixtures may use synthetic data, but fixtures must not be imported by production runtime code.

## Single-person scope

The MVP models one person.

Required personal assumptions:

- current age
- retirement age
- projection end age
- CPP claim age, indexing, and explicit dated amount source
- OAS claim age, indexing, full-amount source, and explicit eligibility

Household members, combined-household reporting, expense sharing, and member switching are out of scope.

## Local configuration

The application reads a private local configuration file:

```text
config/planner.local.yaml
```

The file must be excluded from Git. The repository provides a public template:

```text
config/planner.example.yaml
```

The local configuration contains only information that Lunch Money cannot determine safely or fields that require an explicit assumption.
YAML is canonical so human-readable account and category names can be kept as comments beside quoted opaque Lunch Money IDs. The runtime selects its parser from the file extension, accepts `.yaml` and `.yml`, and retains `.json` only for explicitly configured backward compatibility. Every format passes through the same planner configuration validator.

Example shape:

```yaml
currentAge: 38
retirementAge: 62
projectionEndAge: 95
governmentBenefits:
  cpp:
    startAge: 65
    indexingRate: 0.02
    amountAt65:
      source: canadian_reference
  oas:
    startAge: 65
    indexingRate: 0.02
    fullAmountAt65:
      source: canadian_reference
    eligibility:
      mode: full
employmentIncomePhases:
  - id: current-income
    label: Current income
    startAge: 38
    endAge: 41
    annualNetCashToday: live_baseline
    annualGrowth: 0
  - id: future-income
    label: Expected future income
    startAge: 41
    endAge: 62
    annualNetCashToday: 72000
    annualGrowth: 0.02
projectionAccounts:
  "projection:future-taxable":
    label: Future taxable investment account
    type: non_registered
    annualReturn: 0.05
    withdrawalPriority: 4
    allocation: { cash: 0, fixedIncome: 0.2, equity: 0.8 }
    contributionPhases: []
surplusAllocation:
  reserveAccountId: "manual:lunch-money-cash-account-id"
  targetCashReserveToday: 30000
  reserveIndexingRate: 0.02
  excess:
    mode: allocate_to_account
    destinationAccountId: "projection:future-taxable"
accountMappings:
  "manual:lunch-money-account-id": # Synthetic retirement account
    include: true
    type: rrsp
    withdrawalPriority: 2
    contributionPhases:
      - id: current-plan
        label: Current plan
        startAge: 38
        endAge: 41
        monthlyAmountToday: live_baseline
        funding: income_withheld
        indexingRate: 0
      - id: later-saving
        label: Later saving
        startAge: 41
        endAge: 62
        monthlyAmountToday: 500
        funding: cash
        indexingRate: 0.02
categoryMappings:
  "lunch-money-category-id": essential # Groceries
assumptions:
  inflation: 0.02
  cashReturn: 0.02
  tfsaReturn: 0.05
  rrspReturn: 0.05
  nonRegisteredReturn: 0.05
```

CPP source modes distinguish a privately entered official estimate, an explicit planning amount, the dated Canadian average reference, and intentional zero. OAS resolves its full amount separately from explicit full, partial, or absent eligibility; partial eligibility is asserted qualifying residence years divided by 40. CPP and OAS claim adjustments and the permanent 10% OAS increase beginning after age 75 are calculated in the monthly projection. Legacy scalar benefit fields remain deterministic compatibility inputs but cannot be mixed with `governmentBenefits`.

Supported planner account types:

- `cash`
- `tfsa`
- `rrsp`
- `non_registered`
- `debt`
- `exclude`

Supported spending classifications:

- `essential`
- `discretionary`
- `income`
- `investment_contribution`
- `transfer`
- `exclude`

Unmapped accounts or required categories must be returned as warnings or blocking configuration errors. They must not be silently assigned a planner type.

## Lunch Money access

The runtime uses only retrieval methods.

Required reads:

- manual accounts
- Plaid-connected accounts
- categories
- recurring items
- transactions for a configurable trailing period, initially 12 months

The application must not call Lunch Money create, update, delete, split, group, or budget mutation methods.

A regression test must fail if the application-facing Lunch Money service exposes mutation methods.

## Baseline derivation

The baseline loader derives the following from Lunch Money data and local mappings.

### Account balances

- Include only explicitly mapped accounts.
- Preserve the Lunch Money account identifier and display name in provenance.
- Convert mapped account balances into planner account types.
- Do not infer TFSA, RRSP, or non-registered status from an account name alone.

### Spending

Calculate monthly essential and discretionary spending from the trailing transaction window.

The derivation must:

- exclude explicitly mapped transfers
- exclude credit-card payments and internal account movements when identified
- exclude ignored accounts and categories
- avoid double-counting grouped or split transactions
- treat refunds and reversals consistently
- report the transaction window and data-through date

The MVP may use a straightforward trailing monthly average. More advanced seasonality and irregular-spending models are out of scope.

### Income

Calculate monthly income from categories mapped as income.

Lunch Money-derived employment income is net cash already deposited after payroll deductions. The projection must not apply the simplified effective tax rate to this employment cash flow a second time. The interface, provenance, and exports must identify it as net deposited cash.

The result must show:

- trailing-period income total
- monthly average
- transaction count
- data-through date

### Investment contributions

Calculate monthly contributions from transactions mapped as investment contributions.

The canonical configuration defines explicit employment and contribution phases. `startAge` is inclusive, `endAge` is exclusive, and boundaries align to projection months. Employment phases must be ordered, contiguous, and cover current age through retirement. Contribution phases are ordered and non-overlapping; gaps mean zero.

`live_baseline` resolves employment income from annualized net Lunch Money deposits. Inside explicit contribution phases it resolves only from mapped Lunch Money contribution transactions for that account. Resolution happens before projection validation, so the engine consumes numbers only. Future salary phases require explicit user amounts; the planner does not forecast them.

Legacy `assumptions.incomeGrowth`, account-level `monthlyContribution`, `contributionFunding`, and global contribution indexing remain accepted. When contribution phases are omitted, these fields normalize into a deterministic compatibility phase; they cannot be combined with explicit contribution phases. A fallback current-income phase or explicit `live_baseline` phase spanning more than five years produces an active-scenario warning while its amount still matches the refreshed Lunch Money baseline.

Every contribution increases its investment account balance. A `cash` contribution also reduces available projected cash. An `income_withheld` contribution does not reduce projected cash because it was withheld before the net employment deposit reached Lunch Money. Transaction-derived contributions are cash-funded unless their account mapping explicitly identifies them as `income_withheld`.

## Default resolution

Each projection input resolves in this order:

1. explicit local configuration
2. Lunch Money-derived value
3. bundled dated Canadian reference value
4. blocking missing-value error

The MVP may bundle a small static Canadian reference file. Automated reference-data ingestion is out of scope.

Each resolved field must include:

- value
- source type
- source description
- effective or data-through date

No value may be labelled as a median unless the underlying reference is a median.

## Projection model

Retain the deterministic monthly projection engine, reduced to the single-person MVP input model.

Required account pools:

- cash
- TFSA
- RRSP/RRIF
- non-registered investments
- debt, when mapped

Required income streams:

- net deposited employment cash selected from the active resolved phase before retirement
- CPP beginning at the configured age
- OAS beginning at the configured age
- optional manually configured pension income

Required outflows:

- essential spending
- discretionary spending
- simplified taxes
- per-account phased investment contributions before retirement
- portfolio withdrawals after cash-flow shortfalls

Required milestones:

- retirement
- CPP start
- OAS start
- RRIF conversion age

The existing simplified tax model may remain for the MVP, but the interface and exports must identify it as a simplified assumption. It applies to gross retirement income such as CPP, OAS, pension income, and taxable RRSP/RRIF withdrawals, not to Lunch Money-derived net employment cash.

The first projected month is the calendar month containing the live baseline data-through date. Employment and contribution phases are selected from each month’s working-age interval, use phase-local growth/indexing, and stop at retirement. Future events, retirement, CPP, OAS, RRIF milestones, calendar years, and annual ledger rows use the real calendar anchor. The first and last annual rows may therefore represent partial calendar years.

The exact retirement snapshot is captured at the end of the final working month, immediately before the first fully retired month. The Assets at retirement summary uses this real-dollar snapshot rather than the next December row. The projection also emits nominal and real accumulation bridges from starting financial assets to this boundary. Cash-funded contributions and surplus routing are internal transfers; income-withheld contributions are external additions. Both bridges must reconcile within one cent.

Positive unassigned monthly cash uses the required resolved `surplusAllocation` policy. The explicit cash reserve is refilled to its indexed target before remaining excess is retained as cash or sent to one explicit non-registered destination. Account ordering never selects the reserve or destination. Targeted event inflows deposit only their own amounts into their targets. TFSA and RRSP/RRIF routing remains unavailable until registered-account room is modelled.

Optional projection-only accounts are appended after imported accounts with origin `projection_configuration` and a fixed zero opening balance. They have explicit return, withdrawal, allocation, and contribution assumptions and remain distinct from Lunch Money balances in the dashboard, explanations, and exports.

## Dashboard

The dashboard must load its baseline from a server API. It must not import compile-time demonstration inputs.

The header must show:

- Lunch Money connection status
- data-through date
- trailing period analysed
- transaction count
- unmapped account count
- unmapped category count
- explicit refresh action

When the baseline cannot be loaded, the dashboard shows the error and no projection charts.

When mappings are incomplete, the dashboard shows the missing identifiers and names needed to update the planner configuration.

## Calculator controls

Controls create temporary in-browser scenario overrides.

Required controls:

- CPP start age
- OAS start age
- monthly essential spending
- monthly discretionary spending
- annual net cash and annual growth for each resolved employment phase
- monthly amount and indexing for each resolved contribution phase
- inflation
- return assumption by planner account type
- projection end age

Resetting a field restores the currently loaded live baseline.

Reset all restores the entire live baseline.

Refreshing Lunch Money rebuilds the baseline and clears or explicitly rebases temporary overrides. It must not silently preserve overrides against a changed baseline.

Saving scenarios is out of scope.

## Calculation explanations and auditability

Every major summary card, main chart, annual ledger, resolved cash-flow value, and the Lunch Money account section exposes:

- a one- or two-sentence accessible tooltip describing meaning
- an `Explain` action that opens a focus-trapped modal drawer
- deterministic formula steps and exact current values
- Lunch Money, local configuration, Canadian reference, temporary override, and projection source labels
- effective dates, the transaction window, assumptions, caveats, and data tables

Explanation documents are typed domain output. They consume the same current baseline, active phase inputs, overrides, projection result, dollar mode, and selected allocation year as the report. Shared presentation-data builders feed both chart/ledger rendering and explanation tables. The Assets at retirement explanation includes the exact snapshot, accumulation bridge, employment path, contribution path, and any long-current-income warning. A reconciliation confirmation is shown only after exact model-precision agreement.

The baseline API schema `1.4` includes aggregate cash-flow audit evidence, resolved phase provenance, concrete CPP/OAS inputs with dated source and statutory-rule provenance, projection-only account provenance, and surplus-policy provenance:

- income, essential spending, and discretionary spending grouped by category and account
- investment contributions grouped by account with funding and derivation source
- normalized reviewed recurring-expense items with category/account names

The audit excludes raw transaction payloads, transaction IDs, credentials, and tokens. It remains outside the default export allowlist, so raw Lunch Money identifiers are not added to JSON or CSV.

Temporary overrides replace the active explanation input while retaining the refreshed value as evidence. Resetting one control or all controls removes the temporary source immediately. Dollar-mode and allocation-year changes also update an open explanation.

Phase overrides affect an amount, growth, or indexing field only. Phase boundaries remain YAML-only to prevent browser-created gaps or overlaps. Refresh clears every override and re-resolves any `live_baseline` phase.

Covered targets are the five summary cards, annual spending, annual funding, outflows, account burndown, asset allocation, the annual ledger, five resolved cash-flow rows, the account section, and dedicated CPP and OAS calculations. Per-cell, per-account-row, and per-chart-bar explanations remain intentionally deferred.

## Reports

Retain these report views when backed by live inputs:

- annual spending projection
- stacked annual cash inflow
- stacked annual cash outflow
- account-level financial-asset burndown
- CPP, OAS, retirement, and RRIF milestone markers
- asset allocation at a selected year
- annual projection ledger
- today's-dollar and future-dollar views

The primary goal metric must use financial assets, not total net worth including non-liquid real assets.

Real assets are out of scope for the MVP unless they are represented as an explicit one-time future inflow in local configuration.

## API surface

Only these endpoints are required:

```text
GET  /api/v1/health
GET  /api/v1/lunchmoney/status
GET  /api/v1/baseline/current
POST /api/v1/projections
POST /api/v1/exports/projection
POST /api/v1/exports/projection-csv
```

### `GET /api/v1/health`

Returns application health and whether required configuration is present. It must not claim that Lunch Money is healthy unless a Lunch Money request has succeeded.

### `GET /api/v1/lunchmoney/status`

Validates the configured token through a read-only request and returns a sanitized status. It must never return the token.

### `GET /api/v1/baseline/current`

Fetches current Lunch Money data, loads local configuration, derives and resolves the baseline, and returns:

- projection inputs
- field provenance
- connection status
- data-through date
- transaction window
- warnings
- unmapped accounts
- unmapped categories

### Projection and export endpoints

Projection endpoints accept validated inputs generated from the live baseline plus temporary overrides.

Exports must include:

- data-through date
- resolved baseline
- provenance
- active overrides
- warnings
- projection result

They must not attach demonstration provenance.

Both ordinary export formats are automatically anonymized. No raw or private export mode exists. A deterministic per-export alias context replaces included account, employment phase, contribution phase, event, recurring, category, warning, and unmapped-record identifiers and descriptive text with generic aliases based only on type and order.

The JSON transformation is typed and allowlisted. It must not copy arbitrary source objects recursively. Every source-system record identifier—including recurring-item IDs—is replaced by a deterministic export-local alias such as `employment_phase_1`, `contribution_phase_1`, `recurring_expense_1`, `event_1`, or `category_1`. No raw numeric or string source record ID is retained.

Financial context is preserved through analytical amounts, balances, dates, ages, account types, classifications, directions, growth and return assumptions, contribution funding, warning codes and severities, provenance source types and effective dates, benefit calculation summaries, safe public Canadian references, and reconciliation bridges. Private account, institution, employer, category, event, recurring, warning, and phase text is replaced with generic aliases. Provenance descriptions use fixed safe wording derived from source type and compatibility state.

Schema `6.0` JSON remains the complete analysis export and includes resolved aliased phases and accounts, account origins, concrete CPP/OAS and surplus-policy calculation summaries, safe public reference metadata, the exact retirement snapshot, accumulation bridges, and metadata confirming automatic anonymization. CSV is one conventional flat annual table with exactly one header and one row per projection period. It includes the partial-period label, generic employment-phase alias, annual employment cash, flat CPP/OAS basis columns, contribution totals, withdrawals, spending, tax, surplus flows, policy settings, reserve target, per-account policy allocations, aggregate balances, financial assets, net worth, milestones, and per-account balance columns keyed only by export-local account references. CSV must not contain metadata preambles, blank section separators, phase arrays, embedded JSON, private labels, or multiple table schemas. Both formats are designed for external financial analysis without manual identifier editing.

## Docker runtime

The MVP runs as one application container.

Remove PostgreSQL and `DATABASE_URL` from the active runtime configuration.

Docker Compose must mount the private configuration file read-only and pass the Lunch Money token through an environment variable.

Example runtime inputs:

```text
LUNCHMONEY_API_TOKEN
PLANNER_CONFIG_PATH=/app/config/planner.local.yaml
```

CI and GHCR publishing remain in scope.

## Explicit non-goals

The MVP does not include:

- PostgreSQL
- migrations
- saved baselines
- saved scenarios
- background synchronization
- scheduled jobs
- household or spouse modelling
- automated Canadian reference ingestion
- full federal and provincial tax rules
- Monte Carlo simulation
- sequence-of-returns modelling
- tax-optimized withdrawal strategies
- automatic TFSA or RRSP classification
- real-estate modelling
- server-generated PDF files
- CCP or data-source-aggregator integration

These may be considered only after the end-to-end MVP is working and validated.

## Acceptance criteria

The MVP is complete only when all criteria below pass.

### Connection and data

- [ ] With no token, the application shows a blocking missing-token state and no charts.
- [ ] With an invalid token, the application shows the sanitized Lunch Money error and no charts.
- [ ] With a valid token, the status endpoint confirms a successful read-only request.
- [ ] The current-baseline endpoint retrieves real accounts, categories, recurring items, and trailing transactions.
- [ ] The response includes a data-through date and transaction count.
- [ ] No production runtime module imports test or demonstration fixtures.

### Mapping and derivation

- [ ] Included account balances match the mapped Lunch Money account balances.
- [ ] Unmapped accounts are visible and are not silently included.
- [ ] Unmapped required categories are visible and are not silently classified.
- [ ] Essential and discretionary spending are derived from the configured transaction window.
- [ ] Income is derived from mapped income transactions.
- [ ] Investment contributions are derived from mapped transactions or explicitly labelled manual configuration.
- [ ] Manual contributions require an explicit cash-funded or income-withheld choice, always increase the investment balance, and reduce available cash only when cash-funded.
- [ ] Transfers and excluded transactions are not counted as spending or income.

### Projection and interface

- [ ] The dashboard renders only after a live baseline has loaded successfully.
- [ ] The dashboard contains no `Member A`, `Member B`, or generic demonstration values.
- [ ] The displayed starting balances match the baseline endpoint.
- [ ] The charts, summary cards, and annual ledger all derive from the same projection result.
- [ ] CPP and OAS appear as separate income streams at their configured start ages.
- [ ] Lunch Money-derived employment income is identified as net deposited cash and is not taxed a second time.
- [ ] Projection calendar years, future events, milestones, and annual rows align with the live data-through month.
- [ ] Positive cash uses the explicit surplus reserve and excess strategy, never account ordering.
- [ ] Targeted event inflows deposit only their own amount and are not allocated twice.
- [ ] Projection-only accounts remain distinct from imported Lunch Money balances and open at zero.
- [ ] The main goal comparison uses financial assets rather than total net worth including real assets.
- [ ] Calculator reset returns to the currently loaded live baseline.
- [ ] Refreshing after Lunch Money data changes produces a changed baseline.

### Exports and safety

- [ ] JSON and CSV exports use the same live baseline and active overrides shown in the interface.
- [ ] Exports include provenance, warnings, and data-through date.
- [ ] No export contains the Lunch Money token.
- [ ] Neither export contains raw Lunch Money identifiers, numeric account or category IDs, source record IDs, account numbers supplied as source metadata, or credentials.
- [ ] JSON and CSV automatically replace private account, institution, employer, category, event, recurring-expense, warning, and phase text with deterministic generic aliases.
- [ ] The JSON export boundary uses an explicit typed allowlist rather than recursively copying arbitrary source objects.
- [ ] JSON uses one consistent deterministic alias context throughout the document without retaining original descriptive labels.
- [ ] CSV contains exactly one header and one consistently shaped row per annual projection period, using only export-local per-account keys.
- [ ] The application-facing Lunch Money integration exposes read operations only.
- [ ] No Lunch Money mutation request is issued in tests or runtime code.

### Runtime and validation

- [ ] The application runs without PostgreSQL.
- [ ] Docker Compose starts only the planner application for the MVP.
- [ ] Type checking, tests, lint, production build, and Docker build pass in CI.
- [ ] An end-to-end smoke test proves valid token -> live baseline -> projection -> charts and exports.

## Completion rule

A polished interface, passing unit tests, or successful Docker build is not sufficient by itself.

The MVP is complete only when the valid-token end-to-end path has been demonstrated using real Lunch Money responses and every acceptance criterion above has either passed or been explicitly removed from this source-of-truth document before implementation.
