# Report model

A projection simulates monthly intervals for one person, beginning in the live baseline data-through month, and produces calendar-year rows through the configured projection end age. The first and last rows may cover partial calendar years.

Each annual row contains:

- net deposited employment cash, CPP, OAS, pension, and one-time income
- withdrawals from cash, TFSA, RRSP/RRIF, and non-registered accounts
- essential spending, discretionary spending, one-time outflows, simplified tax, contributions, and unmet spending
- pooled balances and each included account’s balance
- financial assets, debt, and net worth
- cash, fixed-income, and equity allocation
- retirement, CPP, OAS, and RRIF milestone labels
- nominal and inflation-adjusted views

The dashboard retains these live-data-backed reports:

- annual spending projection
- stacked annual cash inflow
- stacked annual cash outflow
- account-level financial-asset burndown
- asset allocation at a selected year
- deterministic observations
- annual projection ledger
- resolved baseline and provenance details

The retirement goal and goal gap use financial assets. They do not include debt offsets or non-liquid real assets.

Lunch Money-derived employment income is net cash after payroll deductions, so the simplified effective tax rate is not applied to it again. The rate applies to gross CPP, OAS, pension income, and taxable RRSP/RRIF withdrawals. Contributions always increase their target investment balance; only contributions configured as cash-funded appear as cash outflows.

JSON is the canonical, complete analysis export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, and complete projection. It is built by a typed allowlist. Account references are replaced consistently with deterministic export-local keys such as `tfsa_1`; every other source record receives an export-local key such as `event_1`, `recurring_expense_1`, or `category_1`.

CSV is a conventional flat annual analysis table: exactly one header and one row per projection period. It includes the partial-period label, income streams, withdrawals, spending, tax, contributions, aggregate balances, financial assets, net worth, milestones, and optional `account_tfsa_1`-style balance columns. It has no metadata preamble, blank section, embedded JSON, or second schema.

Both formats omit raw source-system record IDs, Lunch Money account and category identifiers, account numbers supplied as source metadata, tokens, authorization values, passwords, API keys, and other credentials. JSON retains original descriptive account labels, event labels, recurring descriptions, warning names and messages, and provenance descriptions so the financial context remains understandable. Known source identifiers and credentials are removed if they occur inside retained text. CSV remains a flat financial table and uses only export-local account keys in its optional per-account columns.
