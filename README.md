# Lunch Money Retirement Planner

A self-hosted, single-person retirement projection built from current Lunch Money balances and trailing transaction data.

The end-to-end MVP is defined in [plan/README.md](plan/README.md). The runtime never substitutes demonstration data. If the Lunch Money token, private configuration, or required mappings are missing, the dashboard shows a blocking error and no charts.

## What the MVP does

- Connects to Lunch Money API v2 with retrieval methods only
- Fetches manual accounts, Plaid accounts, categories, recurring items, and paginated trailing transactions on demand
- Derives account balances, monthly income, essential and discretionary spending, investment contributions, recurring expenses, and a data-through date
- Requires explicit account and category mappings; unmapped live records are shown with the identifiers needed to configure them
- Runs a deterministic monthly, single-person retirement projection
- Shows annual spending, cash inflow, cash outflow, account-level financial assets, allocation, milestones, and an annual ledger
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
cp config/planner.example.json config/planner.local.json
npm install
npm run dev
```

Set `LUNCHMONEY_API_TOKEN` in `.env`. Replace every placeholder in `config/planner.local.json`; that file is Git-ignored and must remain private.

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

```json
{
  "classification": "investment_contribution",
  "contributionAccountId": "plaid:123456",
  "contributionDirection": "debit"
}
```

Alternatively, an investment account mapping may provide an explicit `monthlyContribution`. The baseline and exports label that value as local configuration rather than Lunch Money-derived.

## Refresh and reset behavior

The baseline endpoint fetches Lunch Money again on every request. The dashboard’s refresh action rebuilds the baseline and clears all browser overrides. Resetting a field or using Reset all restores values from the most recently refreshed baseline, never compiled constants.

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

`GET /api/v1/baseline/current` returns projection inputs, provenance, derived values, transaction window, records analysed, warnings, and mapping details. Missing mappings return HTTP 422. An invalid token returns a sanitized HTTP 401 response.

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

## Docker Compose

Create the private files before starting Compose:

```bash
cp .env.example .env
cp config/planner.example.json config/planner.local.json
docker compose up --build
```

Compose starts one planner container, passes the token through the environment, and mounts `config/planner.local.json` read-only at `/app/config/planner.local.json`. PostgreSQL is not used.

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
- The application-facing Lunch Money service exposes retrieval methods only.
- `config/planner.local.json`, `.env`, and the private config in the Docker build context are ignored.
- No baseline, scenario, transaction, or account data is persisted by the application.

## Projection scope

The tax calculation is a simplified effective-rate assumption, not a tax filing model. CPP and OAS claim timing factors are deterministic. RRIF conversion is a milestone; statutory minimum withdrawals are not enforced. Monte Carlo simulation, optimized withdrawals, real estate, households, saved scenarios, background synchronization, and server-generated PDFs are outside the MVP.

See [docs/architecture.md](docs/architecture.md) and [docs/report-model.md](docs/report-model.md) for implementation details.

## Published container image

Pushes to `main` and manual workflow runs publish:

- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest`
- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:<short-commit-sha>`

## License

MIT
