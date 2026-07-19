# Report model

A projection simulates monthly intervals for one person, beginning in the live baseline data-through month, and produces calendar-year rows through the configured projection end age. The first and last rows may cover partial calendar years.

Each annual row contains:

- the active employment-phase label and net deposited employment cash, CPP, OAS, pension, and one-time income
- withdrawals from cash, TFSA, RRSP/RRIF, and non-registered accounts
- essential spending, discretionary spending, one-time outflows, simplified tax, planned/actual/redirected/unallocated contributions, and unmet spending
- global TFSA and RRSP opening room, new room, withdrawal restoration where applicable, room-generation evidence, room-consuming deposits, and closing room
- positive cash available; explicit personal, reserve-building, and workplace planned/allowed/unallocated amounts; reserve retained/redirected/unfunded amounts; unplanned retained cash; total investment deposits; generated surplus, active reserve target, and per-account policy allocations
- pooled balances and each included account’s balance
- financial assets, debt, and net worth
- cash, fixed-income, and equity allocation
- retirement, CPP, OAS, and RRIF milestone labels
- nominal and inflation-adjusted views

The dashboard retains these live-data-backed reports:

- annual spending projection
- stacked annual cash inflow
- stacked annual cash outflow
- annual explicit savings and retained cash in simple mode, or annual surplus allocation in advanced mode, with the active reserve-target line
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

The primary configuration uses account roles and named savings plans. IDs appear only as `accountMappings` keys; simple room, employment RRSP assumptions, and savings policy contain no account route IDs. The baseline compiler produces the detailed resolved account phases, global room model, waterfall, surplus input, automatic taxable account when required, and policy discriminator. Simple and advanced configuration cannot mix.

The detailed account-level contribution, projection-account, registered-room, waterfall, and surplus format remains advanced compatibility. In either mode, cash-funded contributions are internal transfers and income-withheld deposits are external additions because they are not part of net deposited cash.

Human-maintained account roles, savings plans, room inputs, category mappings, assumptions, allocations, and future events use the canonical commented YAML planner configuration. YAML and legacy JSON inputs pass through the same validation and produce the same resolved report model.

Cash-flow audit evidence records the aggregate category/account contribution to each derived value without retaining raw transactions. Lunch Money amounts and names remain distinguishable from local YAML assumptions, compatibility fallbacks, temporary browser overrides, Canadian references, and projection output. Imported accounts use origin `lunchmoney`; projection-only configured accounts use origin `projection_configuration`, have a fixed zero opening balance, and never appear in imported baseline balances. The baseline schema is `1.5`; the projection and export schemas are `7.0`.

Government benefits are concrete resolved inputs. CPP retains a dated amount-at-65 basis, claim age, indexing, and the statutory claim factor. OAS retains a dated full amount, explicit `full`, `partial`, or `none` eligibility, claim age, indexing, and the permanent age-75 increase. Partial eligibility is qualifying residence years divided by 40; special residence rules and international agreements are not evaluated. The calculation result—not React code—produces the base, factors, monthly and annual claim amounts, and OAS age-75 amount used in the dashboard explanations.

Simple policy invests only explicit plan amounts. Workplace RRSP is processed first against the one global RRSP pool; overflow is unallocated and personal cash never uses that account. Personal savings follow TFSA → personal RRSP → taxable. Reserve-building savings compare the combined post-return reserve balance with `targetCashReserveToday × indexedFactor(reserveIndexingRate, month)`, retain only the funded shortfall in the refill account, and route a same-month crossing amount through the personal order. Remaining positive cash is retained in operating cash, which is a reserve member, rather than swept into investments. Insufficient cash leaves a visible unfunded plan amount and does not create a withdrawal.

Registered room is global by program, not per account. Simple starting room is an explicit amount and date, never inferred from balances or net deposited employment cash. A partial February–December start requires pre-start earned income, pension adjustment, and other reduction; January omission compiles to zeros. Statutory carry-forward, TFSA next-year restoration, Canadian references, and deterministic forecast mechanics are internal defaults with provenance. Every simple employment phase explicitly supplies eligible income, pension adjustment, other reduction, and growth.

The result retains planned, allowed, redirected, unallocated, cash-funded, income-withheld, total actual, and per-account details. It additionally exposes positive cash, each explicit plan, reserve retention/redirect/unfunded values, unplanned retained cash, and total investment deposits. Reconciliation requires funded reserve plan = reserve cash retained + reserve investment deposits; each planned amount = allowed + unallocated; total investments = personal allowed + workplace allowed + reserve investment deposits = cash funded + income withheld = summed account deposits; positive cash = personal allowed + funded reserve plan + unplanned retained cash; and both room and bridge equations.

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

JSON is the canonical, complete analysis export and includes the resolved baseline, derived baseline, provenance, warnings, active inputs, overrides, sanitized policy preview, and complete projection. It is built by a typed allowlist and is automatically anonymized on every request. Imported and projection-only account IDs, labels, role-compiled policy references, period allocation maps, result summaries, provenance, and override keys use consistent export-local aliases such as `cash_1` and `non_registered_1`; employment, contribution, and savings phases plus other descriptive records receive deterministic generic aliases. Typed JSON arrays contain sanitized aliases only.

CSV is a conventional automatically anonymized annual analysis table: exactly one header and one row per projection period. It includes scalar explicit-plan, reserve retained/redirected/unfunded, unplanned-cash, TFSA/RRSP room, contribution, and deterministic per-account fields. Registered-room columns remain nominal regulatory values in both real and nominal exports and are labelled with their basis. Policy account cells contain generic aliases only. CSV has no metadata preamble, blank section, role/route/phase arrays, maps, delimited lists, embedded JSON, or second schema.

Both formats preserve financial values, assumptions, dates, benefit calculations, reconciliation bridges, and allowlisted public Canadian reference metadata while removing raw source-system IDs, credentials, and user-authored descriptive text. Account, institution, employer, category, event, recurring, warning, and phase text is replaced with generic aliases; provenance descriptions come from a small safe vocabulary. There is no raw or private export mode. The files are intended to be shareable for external financial analysis without manual identifier editing.
