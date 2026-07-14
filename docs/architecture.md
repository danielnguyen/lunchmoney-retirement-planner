# Architecture

The application is a TypeScript modular monolith. The browser interface, versioned HTTP API, data import boundary, deterministic projection engine, and export services live in one deployable application.

## Runtime boundaries

```text
Lunch Money API          Canadian reference sources
       |                           |
       v                           v
read-only adapter            reference adapters
       |                           |
       +------------+--------------+
                    v
             baseline resolver
                    |
                    v
          deterministic projection engine
                    |
       +------------+-------------+
       |                          |
       v                          v
 report interface            versioned API
       |                          |
       +------------+-------------+
                    v
          immutable snapshot exports
```

External data sources do not call the projection engine directly. They are normalized into explicit baseline values with provenance.

## Projection model

The engine simulates monthly intervals and emits annual report rows. It models:

- household members with independent retirement, CPP, OAS, pension, and income dates
- cash, TFSA, RRSP/RRIF, non-registered, real-asset, and debt balances
- account-level returns, contributions, ownership, allocation, and withdrawal priority
- essential and discretionary spending
- one-time inflows and outflows
- simplified income tax and OAS recovery-tax assumptions
- nominal and inflation-adjusted views
- combined-household and per-member report views

The annual output is the single source used by charts, tables, APIs, observations, and exports.

## Baseline resolution

Each field resolves in this order:

1. saved baseline
2. Lunch Money-derived observation
3. dated Canadian reference
4. application fallback

Scenario changes are stored separately as overrides. Resetting a control removes its override and restores the resolved baseline.

## Calculation boundaries

The current tax calculation is intentionally an explicit effective-rate model. It is suitable for scenario visualization but is not a substitute for a complete provincial and federal tax engine. The data model leaves room for a later rules-based implementation.

RRSP/RRIF balances share one account category. The engine marks the configured conversion age but does not yet enforce statutory RRIF minimum withdrawals.
