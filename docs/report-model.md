# Report model

A projection simulates monthly intervals for one person, beginning in the live baseline data-through month, and produces calendar-year rows through the configured projection end age. The first and last rows may cover partial calendar years.

Each annual row contains:

- the active employment-phase label and net deposited employment cash, CPP, OAS, pension, and one-time income
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

Every major calculated report target has two inspectability levels:

- a brief accessible tooltip that explains meaning
- a full calculation drawer with exact steps, source badges, dates, assumptions, caveats, and reconciled data

The five summary cards, five main charts, annual ledger, cash-flow provenance values, and Lunch Money account section are covered. Chart explanations include the exact shared annual dataset in the active Today’s/Future dollar view. The asset-allocation explanation follows the selected year. Individual table cells, account rows, and chart bars are intentionally deferred.

The retirement goal and goal gap use financial assets. They do not include debt offsets or non-liquid real assets.

Lunch Money-derived employment income is net cash after payroll deductions, so the simplified effective tax rate is not applied to it again. Resolved employment phases cover every working month from the inclusive current age through the exclusive retirement age. The active phase supplies annual today-dollar net cash and phase-local growth. A later phase does not inherit growth accumulated in an earlier phase, and the planner never invents a future salary.

Each included investment account has its own non-overlapping contribution phases. A gap means zero contribution. Funding and phase-local indexing may change at a phase boundary. Contributions always increase their target investment balance; only cash-funded contributions appear as cash outflows. Income-withheld contributions are external additions because they are not part of net deposited cash.

Within an explicit contribution phase, `live_baseline` resolves only from mapped Lunch Money contribution transactions for that account. When contribution phases are omitted, positive legacy account-level contribution fields normalize into one compatibility phase. Explicit contribution phases and legacy contribution fields cannot be combined.

Human-maintained account mappings, category mappings, assumptions, allocations, and future events use the canonical commented YAML planner configuration. YAML and legacy JSON inputs pass through the same validation and produce the same report model.

Cash-flow audit evidence records the aggregate category/account contribution to each derived value without retaining raw transactions. Lunch Money amounts and names remain distinguishable from local YAML assumptions, compatibility fallbacks, temporary browser overrides, Canadian references, and projection output. The baseline schema is `1.3`; the projection and export schemas are `5.0`.

Government benefits are concrete resolved inputs. CPP retains a dated amount-at-65 basis, claim age, indexing, and the statutory claim factor. OAS retains a dated full amount, explicit `full`, `partial`, or `none` eligibility, claim age, indexing, and the permanent age-75 increase. Partial eligibility is qualifying residence years divided by 40; special residence rules and international agreements are not evaluated. The calculation result—not React code—produces the base, factors, monthly and annual claim amounts, and OAS age-75 amount used in the dashboard explanations.

The retirement summary uses an exact snapshot at the end of the final working month, immediately before the first fully retired month. Snapshot balances, account balances, and allocation are point-in-time values. Snapshot income, withdrawals, outflows, contributions, and account contributions cover only the final working month; `flowPeriod` identifies that `YYYY-MM` period. The cumulative start-to-retirement activity remains in the financial-assets bridge. The explanation first reconciles cash + TFSA + RRSP/RRIF + non-registered balances, then shows the scenario’s employment and contribution paths and a today-dollar accumulation bridge:

```text
starting financial assets
+ employment net cash
+ CPP/OAS/pension
+ other inflows
+ income-withheld contributions
+ investment returns
− essential spending
− discretionary spending
− one-time outflows
− taxes
= assets at retirement
```

Cash-funded contributions do not appear in this bridge because they are transfers between financial accounts. An explanation claims reconciliation only when both the account sum and bridge match the exact displayed value within one cent.

JSON is the canonical, complete analysis export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, and complete projection. It is built by a typed allowlist and is automatically anonymized on every request. Account references are replaced consistently with export-local keys such as `tfsa_1`; employment phases, contribution phases, events, recurring expenses, categories, warnings, and unmapped records receive deterministic generic aliases based only on type and order.

CSV is a conventional automatically anonymized annual analysis table: exactly one header and one row per projection period. It includes the partial-period label, generic active-employment-phase alias, income streams, flat CPP/OAS basis and factor columns, withdrawals, spending, tax, separate cash-funded and income-withheld contribution totals, aggregate balances, financial assets, net worth, milestones, and optional `account_tfsa_1`-style balance columns. It has no metadata preamble, blank section, embedded phase arrays or JSON, or second schema.

Both formats preserve financial values, assumptions, dates, benefit calculations, reconciliation bridges, and allowlisted public Canadian reference metadata while removing raw source-system IDs, credentials, and user-authored descriptive text. Account, institution, employer, category, event, recurring, warning, and phase text is replaced with generic aliases; provenance descriptions come from a small safe vocabulary. There is no raw or private export mode. The files are intended to be shareable for external financial analysis without manual identifier editing.
