# Report model

A projection produces one annual row for every simulated calendar year.

Each row contains:

- income by employment, CPP, OAS, pension, and other sources
- withdrawals by cash, TFSA, RRSP/RRIF, and non-registered account
- outflows for essential spending, discretionary spending, one-time events, tax, contributions, and unmet spending
- ending balances by account category
- asset allocation across cash, fixed income, and equity
- combined-household and per-member views
- milestone labels for retirement, benefit start dates, and RRIF conversion age

The interface renders the following reports from that output:

- annual expense projection
- stacked cash-inflow chart
- stacked cash-outflow chart
- account-level net-worth burndown
- allocation at a selected year
- assumptions and provenance
- deterministic observations
- annual projection ledger

JSON is the canonical export. CSV is a flattened annual ledger. The printable report can be saved as PDF through the browser print flow.
