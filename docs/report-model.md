# Report model

A projection simulates monthly intervals for one person, beginning in the live baseline data-through month, and produces calendar-year rows through the configured projection end age. The first and last rows may cover partial calendar years.

Each annual row contains:

- the active employment-phase label and net deposited employment cash, CPP, OAS, pension, and one-time income
- withdrawals from cash, TFSA, RRSP/RRIF, and non-registered accounts
- essential spending, discretionary spending, one-time outflows, simplified tax, planned/actual/redirected/unallocated contributions, and unmet spending
- global TFSA and RRSP opening room, new room, withdrawal restoration where applicable, room-generation evidence, room-consuming deposits, and closing room
- generated surplus, reserve refill, retained cash, redirected surplus, active reserve target, and per-account policy allocations
- pooled balances and each included account’s balance
- financial assets, debt, and net worth
- cash, fixed-income, and equity allocation
- retirement, CPP, OAS, and RRIF milestone labels
- nominal and inflation-adjusted views

The dashboard retains these live-data-backed reports:

- annual spending projection
- stacked annual cash inflow
- stacked annual cash outflow
- annual surplus allocation with retained/redirected bars and the active reserve-target line
- annual registered room and contribution routing
- account-level financial-asset burndown
- asset allocation at a selected year
- deterministic observations
- annual projection ledger
- resolved baseline and provenance details

Every major calculated report target has two inspectability levels:

- a brief accessible tooltip that explains meaning
- a full calculation drawer with exact steps, source badges, dates, assumptions, caveats, and reconciled data

The summary cards, registered-room and existing main charts, annual ledger, cash-flow provenance values, and Lunch Money account section are covered. Chart explanations include the exact shared annual dataset in the active Today’s/Future dollar view. The asset-allocation explanation follows the selected year.

The retirement goal and goal gap use financial assets. They do not include debt offsets or non-liquid real assets.

Lunch Money-derived employment income is net cash after payroll deductions, so the simplified effective tax rate is not applied to it again. Resolved employment phases cover every working month from the inclusive current age through the exclusive retirement age. The active phase supplies annual today-dollar net cash and phase-local growth. A later phase does not inherit growth accumulated in an earlier phase, and the planner never invents a future salary.

Each included investment account has its own non-overlapping contribution phases. A gap means zero contribution. Funding and phase-local indexing may change at a phase boundary. Contributions always increase their target investment balance; only cash-funded contributions appear as cash outflows. Income-withheld contributions are external additions because they are not part of net deposited cash.

Within an explicit contribution phase, `live_baseline` resolves only from mapped Lunch Money contribution transactions for that account. When contribution phases are omitted, positive legacy account-level contribution fields normalize into one compatibility phase. Explicit contribution phases and legacy contribution fields cannot be combined.

Human-maintained account mappings, category mappings, assumptions, allocations, and future events use the canonical commented YAML planner configuration. YAML and legacy JSON inputs pass through the same validation and produce the same report model.

Cash-flow audit evidence records the aggregate category/account contribution to each derived value without retaining raw transactions. Lunch Money amounts and names remain distinguishable from local YAML assumptions, compatibility fallbacks, temporary browser overrides, Canadian references, and projection output. Imported accounts use origin `lunchmoney`; projection-only configured accounts use origin `projection_configuration`, have a fixed zero opening balance, and never appear in imported baseline balances. The baseline schema is `1.5`; the projection and export schemas are `7.0`.

Government benefits are concrete resolved inputs. CPP retains a dated amount-at-65 basis, claim age, indexing, and the statutory claim factor. OAS retains a dated full amount, explicit `full`, `partial`, or `none` eligibility, claim age, indexing, and the permanent age-75 increase. Partial eligibility is qualifying residence years divided by 40; special residence rules and international agreements are not evaluated. The calculation result—not React code—produces the base, factors, monthly and annual claim amounts, and OAS age-75 amount used in the dashboard explanations.

Surplus allocation is also a concrete resolved input. The engine never selects the first cash account. Each positive unassigned month compares the combined balance of the explicit reserve-account set with `targetCashReserveToday × indexedFactor(reserveIndexingRate, month)`. It deposits any shortfall and retained excess into the explicit refill account, or sends redirected excess to one explicit non-registered destination. Direct-account mode rejects TFSA, RRSP/RRIF, debt, and cash destinations; registered routing is available only through the room-constrained waterfall. Targeted event inflows deposit only their own amounts into their targets, and direct targeted inflows into registered accounts are blocked.

Registered room is global by program, not per account. Starting room is explicit and is not inferred from balances or net deposited employment cash. The first partial projection year uses starting room as-is; later January boundaries apply dated or forecast TFSA limits, next-year TFSA withdrawal restoration, and RRSP room generated from explicit prior-year eligible earned income at 18%, capped and reduced by explicit pension-adjustment and other-reduction values. Published limits and configured forecasts remain distinct.

Each contribution phase remains the source of a planned amount and funding type. Ordered routes record source deposits, redirects, actual deposits, and unallocated amounts. Cash-funded unallocated amounts remain in cash; income-withheld unallocated amounts enter neither cash nor assets. Planned routes precede surplus-funded contributions, and RRSP routing stops at the configured RRIF conversion age.

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

Cash-funded contributions and surplus routing do not appear as additive terms in this bridge because they are transfers between financial accounts. Routing is asset-neutral at the allocation moment, while later account-specific returns can change future financial assets. An explanation claims reconciliation only when the account sum, bridge, and surplus flows match the exact displayed values within one cent.

JSON is the canonical, complete analysis export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, and complete projection. It is built by a typed allowlist and is automatically anonymized on every request. Imported and projection-only account IDs, labels, surplus policy references, period allocation maps, result summaries, provenance, and override keys use consistent export-local aliases such as `cash_1` and `non_registered_1`; employment phases, contribution phases, events, recurring expenses, categories, warnings, and unmapped records receive deterministic generic aliases based only on type and order. The resolved reserve-account set remains a typed JSON array containing only sanitized export-local account aliases.

CSV is a conventional automatically anonymized annual analysis table: exactly one header and one row per projection period. It includes scalar TFSA/RRSP room ledgers, planned/actual/redirected/unallocated contribution totals, and deterministic per-account planned, actual, redirected, surplus-funded, balance, reserve-membership, and surplus-allocation columns. Policy account cells contain generic aliases only. CSV has no metadata preamble, blank section, route or phase arrays, delimited lists, embedded JSON, or second schema.

Both formats preserve financial values, assumptions, dates, benefit calculations, reconciliation bridges, and allowlisted public Canadian reference metadata while removing raw source-system IDs, credentials, and user-authored descriptive text. Account, institution, employer, category, event, recurring, warning, and phase text is replaced with generic aliases; provenance descriptions come from a small safe vocabulary. There is no raw or private export mode. The files are intended to be shareable for external financial analysis without manual identifier editing.
