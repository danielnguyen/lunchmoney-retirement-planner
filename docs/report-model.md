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

JSON is the canonical, complete export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, and complete projection. It declares that it is share-safe and anonymized. Account references are replaced consistently with deterministic planner-type aliases such as `TFSA 1` and safe keys such as `tfsa_1`.

CSV is a conventional flat annual analysis table: exactly one header and one row per projection period. It includes the partial-period label, income streams, withdrawals, spending, tax, contributions, aggregate balances, financial assets, net worth, milestones, and optional `account_tfsa_1`-style balance columns. It has no metadata preamble, blank section, embedded JSON, or second schema.

Both formats are anonymized by default and contain no raw Lunch Money account identifiers, numeric account IDs, real account names, account numbers, or credentials.
