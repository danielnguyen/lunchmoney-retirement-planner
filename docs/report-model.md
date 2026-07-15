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

JSON is the canonical export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, and complete projection. CSV begins with equivalent metadata sections and then includes the flattened annual ledger with dynamic account columns.
