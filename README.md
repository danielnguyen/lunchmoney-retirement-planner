# Lunch Money Retirement Planner

A self-hosted, single-person retirement projection built from current Lunch Money balances and trailing transaction data.

The end-to-end MVP is defined in [plan/README.md](plan/README.md). The runtime never substitutes demonstration data. If the Lunch Money token, private configuration, or required mappings are missing, the dashboard shows a blocking error and no charts.

## What the MVP does

- Connects to Lunch Money API v2 with retrieval methods only
- Fetches manual accounts, Plaid accounts, categories, recurring items, and paginated trailing transactions on demand
- Derives account balances, net deposited employment cash, essential and discretionary spending, investment contributions, recurring expenses, and a data-through date
- Requires explicit account and category mappings; unmapped live records are shown with the identifiers needed to configure them
- Runs a deterministic monthly, single-person retirement projection with explicit employment-income and account-contribution phases
- Shows annual spending, cash inflow, cash outflow, account-level financial assets, allocation, milestones, and an annual ledger
- Explains every major summary, chart, ledger, cash-flow input, and account section with reconciled formulas, values, dates, and provenance
- Supports temporary browser overrides, per-field reset, reset all, and explicit refresh
- Exports the resolved live baseline, provenance, warnings, active overrides, and projection as JSON or CSV
- Runs without a database, persistence, jobs, or caching

## Requirements

- Node.js 22 or later
- npm
- A Lunch Money API v2 token
- A private planner configuration file

## Local setup

```bash
cp .env.example .env
cp config/planner.example.yaml config/planner.local.yaml
npm install
npm run dev
```

Set `LUNCHMONEY_API_TOKEN` in `.env`. Replace every placeholder in `config/planner.local.yaml`; that file is Git-ignored and must remain private. YAML is the canonical human-maintained format so opaque account and category IDs can be documented with comments. Existing JSON configuration remains supported only when `PLANNER_CONFIG_PATH` explicitly points to a `.json` file.

Open `http://localhost:3000`.

### Mapping Lunch Money records

Account keys should be source-scoped so manual and Plaid IDs cannot collide:

```text
manual:<lunch-money-account-id>
plaid:<lunch-money-account-id>
```

Numeric account keys are accepted only when that ID is unique across both account sources. Use the source-scoped form for durable configuration. Cash transactions with no associated account use the special key `cash`.

The easiest configuration workflow is:

1. Copy the example config and start the app.
2. Refresh. The blocking state lists every unmapped account ID and name.
3. Map every account to `cash`, `tfsa`, `rrsp`, `non_registered`, `debt`, or `exclude`.
4. Refresh again. The blocking state lists categories used by included accounts in the trailing window and reviewed recurring items.
5. Map each listed category to `essential`, `discretionary`, `income`, `investment_contribution`, `transfer`, or `exclude`.
6. Replace the generic ages, benefit amounts, goal, returns, allocation, tax, pension, and milestone assumptions.

Credit-card payments and internal movements must be mapped as `transfer` or `exclude`; the planner does not infer them from a payee or account name. Categories marked “exclude from totals” in Lunch Money are ignored automatically.

An investment-contribution category can identify its target account and transaction direction:

```yaml
"replace-with-contribution-category-id": # Registered investment deposit
  classification: investment_contribution
  contributionAccountId: "plaid:replace-with-investment-account-id"
  contributionDirection: debit
```

### Income and contribution phases

Do not assume that today’s Lunch Money income will continue unchanged until retirement. Configure contiguous employment phases from the current age through the retirement age. `startAge` is inclusive, `endAge` is exclusive, and boundaries must align to projection months. `live_baseline` resolves to the annualized net deposited employment income in the current Lunch Money transaction window; a later salary is never inferred automatically:

```yaml
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
```

Investment accounts may define non-overlapping contribution phases. Gaps mean zero contribution. Funding and indexing belong to each phase, allowing a workplace contribution to end and another saving pattern to begin at the same career transition:

```yaml
"manual:replace-with-investment-account-id": # Synthetic retirement account
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
```

Every contribution increases its target investment balance. Only cash-funded contributions reduce available cash. Income-withheld contributions are external additions that were withheld before the net employment deposit reached Lunch Money.

Existing YAML and JSON files remain compatible. Without employment phases, the runtime normalizes current Lunch Money income plus `assumptions.incomeGrowth` into one phase through retirement. Without contribution phases, a positive account-level `monthlyContribution`, `contributionFunding`, and `assumptions.contributionIndexing` become one phase. These scalar fields are migration inputs, not the preferred model. A current-income fallback or explicit `live_baseline` phase longer than five years produces a visible warning.

## Refresh and reset behavior

The baseline endpoint fetches Lunch Money again on every request. The dashboard’s refresh action rebuilds the baseline and clears all browser overrides. Resetting a field or using Reset all restores values from the most recently refreshed baseline, never compiled constants.

## Calculation explanations

Major report headings include a short accessible information tooltip and an `Explain` control. Tooltips describe what a result means in one or two sentences. `Explain` opens a keyboard-accessible drawer containing the formula or calculation steps, exact displayed values, source badges, dates, active assumptions, caveats, and the data behind charts.

Explanations are deterministic documents built from the same current baseline, active projection inputs, temporary overrides, projection result, dollar mode, and selected allocation year as the visible report. A reconciliation message appears only when the builder’s arithmetic matches the displayed value. Changing or resetting a calculator override, switching Today’s/Future dollars, or changing the allocation year updates the open explanation immediately.

Baseline schema `1.2` includes aggregate cash-flow audit evidence plus resolved employment and contribution phases and their provenance. It contains category/account names and reconciled aggregates—not raw transactions, transaction IDs, credentials, or tokens. The existing typed export allowlist does not automatically export the audit structure or raw Lunch Money identifiers.

The Assets at retirement explanation uses the exact end-of-final-working-month snapshot. It shows both the account-type sum and a today-dollar accumulation bridge from starting financial assets through income, public benefits, income-withheld contributions, returns, spending, events, and taxes. Cash-funded contributions are internal transfers and do not change the bridge total. A success label appears only when the bridge and displayed card value agree within one cent.

Covered targets are the five summary cards, five main charts, annual ledger, five cash-flow provenance rows, and the Lunch Money account section. Individual ledger cells, account rows, and chart bars intentionally do not receive separate controls in this iteration.

## API

```http
GET  /api/v1/health
GET  /api/v1/lunchmoney/status
GET  /api/v1/baseline/current
POST /api/v1/projections
POST /api/v1/exports/projection
POST /api/v1/exports/projection-csv
```

`GET /api/v1/health` reports whether the token and planner file are configured. It deliberately reports Lunch Money as `not_checked` until a read request succeeds.

`GET /api/v1/lunchmoney/status` validates the token with a read-only categories request and returns a sanitized result.

`GET /api/v1/baseline/current` returns schema `1.2` projection inputs, phase provenance, derived values, aggregate cash-flow audit evidence, transaction window, records analysed, warnings, and mapping details. Missing mappings return HTTP 422. An invalid token returns a sanitized HTTP 401 response.

Projection requests use this shape:

```json
{
  "inputs": {}
}
```

Export requests use the current baseline response, active inputs, and browser overrides:

```json
{
  "baseline": {},
  "inputs": {},
  "overrides": {}
}
```

Exports automatically omit Lunch Money and other source-system record identifiers, account IDs supplied as source metadata, tokens, authorization values, passwords, API keys, and other credentials. The schema `4.0` JSON export is the complete analysis document and uses a typed allowlist with deterministic export-local keys such as `cash_1`, `event_1`, and `recurring_expense_1`; it preserves resolved phases, the exact retirement snapshot, and both accumulation bridges without copying source objects recursively. Original descriptive labels remain available for financial analysis. The flat CSV keeps one row per annual period and adds the active employment-phase label plus separate cash-funded and income-withheld contribution totals; it never embeds phase arrays or JSON. Downloads use `retirement-projection-<date>.json`, `retirement-projection-real-<date>.csv`, and `retirement-projection-nominal-<date>.csv`.

## Docker Compose

Create the private files before starting Compose:

```bash
cp .env.example .env
cp config/planner.example.yaml config/planner.local.yaml
docker compose up --build
```

Compose starts one planner container, passes the token through the environment, and mounts `config/planner.local.yaml` read-only at `/app/config/planner.local.yaml`. The mount retains the Fedora-compatible `:ro,Z` SELinux option. PostgreSQL is not used.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
docker build -t lunchmoney-retirement-planner .
```

Tests use synthetic fixtures under `tests/`. Production modules do not import them.

## Security and data handling

- The Lunch Money token remains server-side.
- The token is never logged, returned by an API, or included in an export.
- JSON and CSV exports use deterministic export-local aliases and exclude all source-system IDs and user-controlled free text before serialization.
- The application-facing Lunch Money service exposes retrieval methods only.
- `config/planner.local.yaml`, `config/planner.local.yml`, `config/planner.local.json`, `.env`, and the private config in the Docker build context are ignored.
- No baseline, scenario, transaction, or account data is persisted by the application.

## Projection scope

Lunch Money income transactions are modelled as net deposited employment cash and are not taxed again. Each working month selects one resolved employment phase; growth is phase-local and employment becomes zero after the exact retirement boundary. Each investment account independently selects its active contribution phase and stops contributing at retirement. The simplified effective tax rate applies to gross retirement income and taxable RRSP/RRIF withdrawals; it is not a tax filing model. The projection calendar starts in the baseline data-through month, so the first and last annual rows may be partial calendar years. CPP and OAS claim timing factors are deterministic. RRIF conversion is a milestone; statutory minimum withdrawals are not enforced. Monte Carlo simulation, optimized withdrawals, real estate, households, saved scenarios, background synchronization, and server-generated PDFs are outside the MVP.

See [docs/architecture.md](docs/architecture.md) and [docs/report-model.md](docs/report-model.md) for implementation details.

## Published container image

Pushes to `main` and manual workflow runs publish:

- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest`
- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:<short-commit-sha>`

## License

MIT
