# Lunch Money Retirement Planner

A self-hosted retirement projection application that combines imported Lunch Money data, explicit assumptions, and deterministic calculations.

## Current capabilities

- Interactive accumulation and retirement projection graph
- Reversible calculator overrides with per-field reset and full reset
- Source-aware baseline resolution
- Deterministic monthly projection engine with yearly output
- Versioned projection and export APIs
- Read-only Lunch Money client boundary
- PostgreSQL schema for baselines, scenarios, imports, and snapshots
- Docker and Docker Compose deployment
- JSON projection snapshot export
- Automated tests for projection and baseline precedence

The included interface uses generic demonstration values. It does not contain account data, credentials, or individualized financial assumptions.

## Architecture

The application is a TypeScript modular monolith:

```text
Next.js UI and route handlers
        |
        +-- baseline resolver
        +-- deterministic projection engine
        +-- Lunch Money read adapter
        +-- export service
        +-- PostgreSQL persistence boundary
```

The projection engine is independent from the database and external APIs. It accepts validated inputs and returns reproducible monthly and yearly results.

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
# Replace the placeholder credentials in .env
docker compose up --build
```

The application is available at `http://localhost:3000`.

## Validation

```bash
npm run typecheck
npm test
npm run build
```

## API

### Health

```http
GET /api/v1/health
```

### Resolve current defaults

```http
GET /api/v1/defaults/current
```

### Calculate a projection

```http
POST /api/v1/projections
Content-Type: application/json
```

The request body is a `ProjectionInputs` object. The response contains the resolved summary and annual projection points.

### Export a projection snapshot

```http
POST /api/v1/exports/projection
Content-Type: application/json
```

The response is a versioned JSON document containing inputs, source metadata, summary values, and yearly results.

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `LUNCHMONEY_API_TOKEN` | Server-side Lunch Money API token |
| `PLANNER_API_READ_TOKEN` | Token reserved for authenticated read-only API access |
| `NEXT_PUBLIC_APP_NAME` | Display name for the application |

Tokens are server-side configuration and must not be committed or included in exports.

## Data-source rules

Each calculator baseline value records one source:

- Lunch Money-derived observation
- Saved user baseline
- Canadian reference value
- Application fallback

Scenario overrides are kept separate from the baseline. Resetting a field removes the override and restores the current resolved baseline.

Canadian reference values also record their reference type, such as a population statistic, statutory program default, or published planning assumption. The application does not label every reference value as a median when that description is not accurate.

## Lunch Money boundary

The Lunch Money integration is intentionally read-only. The application client exposes retrieval operations for transactions, categories, accounts, and recurring items. It does not expose mutation methods through the application service.

Lunch Money API v2 is currently in open alpha. The adapter is isolated so API changes do not affect the projection engine.

## Security

- Secrets are read from environment variables.
- Lunch Money credentials never enter browser state.
- Exports omit credentials and raw authentication metadata.
- External integrations should use a separate application API token.
- Saved projections are immutable snapshots of their inputs and outputs.

## License

MIT
