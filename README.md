# Lunch Money Retirement Planner

A self-hosted retirement lifecycle report that combines imported Lunch Money data, source-aware defaults, explicit assumptions, and deterministic calculations.

## Current capabilities

- Combined-household and per-member projections
- Independent retirement, CPP, OAS, pension, and RRIF milestone ages
- Separate cash, TFSA, RRSP/RRIF, non-registered, real-asset, and debt balances
- Configurable account returns, contributions, allocation, and withdrawal priority
- Essential and discretionary expense projection
- Stacked annual cash-inflow and cash-outflow charts
- Account-level net-worth burndown with milestone markers
- Asset allocation at a selected year
- Today’s-dollar and future-dollar views
- Reversible calculator overrides with per-field and full reset
- Assumption and provenance report
- Inspectable annual projection ledger
- JSON and CSV exports plus printable HTML/PDF output
- Versioned projection APIs
- Read-only Lunch Money client boundary
- PostgreSQL persistence schema
- Docker and Docker Compose deployment

The included interface uses generic demonstration values. It contains no account data, credentials, or individualized assumptions.

## Architecture

The application is a TypeScript modular monolith:

```text
Next.js interface and route handlers
        |
        +-- baseline and reference resolver
        +-- deterministic monthly projection engine
        +-- Lunch Money read adapter
        +-- report and export services
        +-- PostgreSQL persistence boundary
```

The engine emits a detailed annual ledger. Every chart, table, API response, observation, and export derives from that same output.

See [docs/architecture.md](docs/architecture.md) and [docs/report-model.md](docs/report-model.md).

## Run locally

Requirements:

- Node.js 22 or later
- npm

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## Run with Docker Compose

```bash
cp .env.example .env
# Replace placeholder credentials in .env
docker compose up --build
```

The application is available at `http://localhost:3000`.

## Published container image

Pushes to `main` and manual workflow runs publish the application image to GitHub Container Registry with two tags:

- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest`
- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:<short-commit-sha>`

```bash
docker pull ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest
```

The immutable short-SHA tag is preferred when a deployment must remain pinned to a specific build.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

The pull-request workflow runs the same checks on a fresh Node.js 22 environment.

## API

### Health

```http
GET /api/v1/health
```

### Resolved defaults and provenance

```http
GET /api/v1/defaults/current
```

### Read the current resolved report

```http
GET /api/v1/projections/current
```

### Calculate a report

```http
POST /api/v1/projections
Content-Type: application/json
```

### Export a versioned JSON snapshot

```http
POST /api/v1/exports/projection
Content-Type: application/json
```

### Export the annual ledger as CSV

```http
POST /api/v1/exports/projection-csv
Content-Type: application/json
```

## Baseline sources

Every supported field records one source:

- Lunch Money-derived observation
- saved baseline
- Canadian reference
- application fallback

Canadian reference values identify whether they are population statistics, statutory defaults, or published assumptions. Values are not labelled as medians unless the underlying source is actually a median.

## Lunch Money boundary

The Lunch Money integration is intentionally read-only. The application client exposes retrieval operations for transactions, categories, accounts, and recurring items. The synchronization and persistence workflow is not connected in this release.

Lunch Money API v2 is currently in open alpha. The adapter is isolated so API changes do not affect the projection engine.

## Calculation scope

The current tax model uses explicit effective-rate and OAS recovery-tax assumptions. It is designed for transparent scenario comparison, not tax filing or individualized financial advice. A later rules engine can replace it without changing the report contract.

RRSP/RRIF conversion is represented as a milestone. Statutory minimum-withdrawal enforcement is not implemented yet.

## Current integration boundaries

- Live Lunch Money synchronization and database persistence are not connected.
- Canadian reference provenance is supported, but automated reference-data ingestion is not connected.
- External API authentication is reserved in configuration but is not enforced yet.
- Tax calculations are simplified and do not implement complete federal and provincial tax rules.

## Security

- Secrets are read from environment variables.
- Lunch Money credentials never enter browser state.
- Exports omit credentials and raw authentication metadata.
- External integrations use a separate application API token.
- Saved projections are immutable snapshots of their inputs, provenance, and results.

## License

MIT
