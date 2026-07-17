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
- CPP start age
- OAS start age
- CPP amount at age 65 or an explicit reference default
- OAS amount at age 65 or an explicit reference default

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
currentAge: 40
retirementAge: 65
projectionEndAge: 95
cppStartAge: 65
oasStartAge: 65
accountMappings:
  "manual:lunch-money-account-id": # Employer retirement account
    include: true
    type: rrsp
    monthlyContribution: 500
    contributionFunding: income_withheld
categoryMappings:
  "lunch-money-category-id": essential # Groceries
assumptions:
  inflation: 0.02
  cashReturn: 0.02
  tfsaReturn: 0.05
  rrspReturn: 0.05
  nonRegisteredReturn: 0.05
```

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

If a reliable contribution value cannot be derived, the local configuration may provide an explicit `monthlyContribution` for the mapped account. That account mapping must also set `contributionFunding` to `cash` or `income_withheld`; the runtime must reject a manual contribution without this choice. The source must be shown as manual rather than Lunch Money-derived.

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

- net deposited employment cash before retirement
- CPP beginning at the configured age
- OAS beginning at the configured age
- optional manually configured pension income

Required outflows:

- essential spending
- discretionary spending
- simplified taxes
- investment contributions before retirement
- portfolio withdrawals after cash-flow shortfalls

Required milestones:

- retirement
- CPP start
- OAS start
- RRIF conversion age

The existing simplified tax model may remain for the MVP, but the interface and exports must identify it as a simplified assumption. It applies to gross retirement income such as CPP, OAS, pension income, and taxable RRSP/RRIF withdrawals, not to Lunch Money-derived net employment cash.

The first projected month is the calendar month containing the live baseline data-through date. Future events, retirement, CPP, OAS, RRIF milestones, calendar years, and annual ledger rows must use that real calendar anchor. The first and last annual rows may therefore represent partial calendar years.

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

- retirement age
- CPP start age
- OAS start age
- monthly essential spending
- monthly discretionary spending
- monthly contribution by included investment account
- inflation
- return assumption by planner account type
- projection end age

Resetting a field restores the currently loaded live baseline.

Reset all restores the entire live baseline.

Refreshing Lunch Money rebuilds the baseline and clears or explicitly rebases temporary overrides. It must not silently preserve overrides against a changed baseline.

Saving scenarios is out of scope.

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

Both export formats omit raw Lunch Money and other source-system identifiers and credentials by default. A deterministic per-export account map replaces every included account ID with a cross-reference key such as `cash_1`, `tfsa_1`, or `rrsp_1`, while each account object and alias entry retains the original descriptive account label. Raw Lunch Money account identifiers, numeric account IDs, account numbers supplied as source metadata, credential values, and identifiers embedded in provenance keys, overrides, warning references, event targets, contribution targets, unmapped-record IDs, or annual account-balance maps must not appear.

The JSON transformation is typed and allowlisted. It must not copy arbitrary source objects recursively. Every source-system record identifier—including recurring-item IDs—is replaced by a deterministic export-local alias such as `recurring_expense_1`, `event_1`, or `category_1`. No raw numeric or string source record ID is retained.

Descriptive financial context is preserved. Account labels and names, future-event labels, recurring-item descriptions, warning names and messages, provenance descriptions, and other user-facing financial labels remain in JSON so the exported plan can be understood and analyzed. Known source-system identifiers and credentials are removed if they occur inside retained descriptions. The export also preserves analytical amounts, dates, classifications, directions, warning codes and severities, safe target references, provenance source types, effective dates, and safe field references.

JSON remains the complete analysis export and includes explicit metadata describing its typed identifier-removal transformation and the preservation of descriptive financial text. CSV is one conventional flat annual table with exactly one header and one row per projection period. It includes the partial-period label, annual flows, withdrawals, spending, tax, contributions, aggregate balances, financial assets, net worth, milestones, and optional per-account balance columns keyed only by export-local account references. CSV must not contain metadata preambles, blank section separators, embedded JSON, or multiple table schemas.

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
- [ ] The main goal comparison uses financial assets rather than total net worth including real assets.
- [ ] Calculator reset returns to the currently loaded live baseline.
- [ ] Refreshing after Lunch Money data changes produces a changed baseline.

### Exports and safety

- [ ] JSON and CSV exports use the same live baseline and active overrides shown in the interface.
- [ ] Exports include provenance, warnings, and data-through date.
- [ ] No export contains the Lunch Money token.
- [ ] Neither export contains raw Lunch Money identifiers, numeric account or category IDs, source record IDs, account numbers supplied as source metadata, or credentials.
- [ ] JSON preserves descriptive account, event, recurring-expense, warning, and provenance text needed for analysis.
- [ ] The JSON export boundary uses an explicit typed allowlist rather than recursively copying arbitrary source objects.
- [ ] JSON uses one consistent deterministic account-reference map throughout the document while retaining each original descriptive account label.
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
