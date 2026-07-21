# Project Roadmap

## Purpose and product standard

Lunch Money Retirement Planner is intended to be a high-confidence deterministic calculator. Given accurate source data and explicit assumptions, it should calculate the stated scenario consistently, reconcile important results, retain provenance, and avoid material hidden behaviour.

This standard is distinct from probability-of-success reporting. A deterministic projection does not establish a success probability. Sequence-of-returns analysis, Monte Carlo simulation, and other probabilistic methods remain later capabilities.

Public planning material, examples, and tests must remain synthetic and must not contain private financial scenarios, account details, employer information, credentials, or identifying data.

## Status summary

| Order | Capability | Status | Delivery |
|---|---|---|---|
| 1 | Government benefits | Completed | [PR #8](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/8) |
| 2 | Surplus allocation policy | Completed | [PR #9](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/9) |
| 3 | Registered-account room and contribution waterfall | Completed | [PR #10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) |
| 4 | Net worth, real estate, and debt amortization | Completed | [PR #11](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11) |
| 5 | Employment-income today-dollar semantics correction | **Next** | — |
| 6 | Operating-cash target and automatic excess sweep | Planned | — |
| 7 | General spending phases | Planned | — |
| 8 | Retirement funding requirement and terminal balance | Planned | — |
| 9 | RRIF minimum withdrawals and Canadian retirement taxes | Planned | — |
| 10 | Deterministic return paths and sequence-risk scenarios | Planned | — |
| 11 | Structured housing transitions | Planned | — |

Status and delivery metadata for the active implementation belongs in [`implementation-index.md`](./implementation-index.md). The numbered order above is planning shorthand only; product and implementation names must describe their financial capability.

The accepted order is ranked by trustworthiness value and dependency. Known semantic correctness defects come before new modelling breadth. Explicit cash policy comes before interpreting projected asset totals. Spending phases define the retirement cash-flow path required by the funding-requirement calculation. The retirement requirement must remain visibly provisional under compatibility tax assumptions until the Canadian retirement-tax capability lands. Deterministic shock paths remain distinct from probability-of-success reporting.

## Completed foundation

### Core baseline and projection foundation

The completed foundation provides:

- read-only Lunch Money ingestion for accounts, categories, recurring items, and paginated transactions;
- explicit account and category mappings through ignored local configuration;
- a deterministic monthly, single-person projection with nominal and today-dollar views;
- account-level balances, returns, allocations, contributions, and withdrawal priority;
- employment income represented as net deposited cash, with distinct cash-funded and income-withheld contribution semantics;
- explicit employment-income and account-contribution phases with inclusive starts, exclusive ends, and phase-local funding, indexing, or growth;
- calendar-anchored partial-year reporting and exact retirement-boundary snapshots;
- start-to-retirement bridges and annual ledgers that reconcile to shared projection results;
- cash-flow audit evidence grouped by category and account;
- accessible explanations, provenance, temporary overrides, reset behaviour, and deterministic legacy normalization; and
- typed allowlisted JSON plus a conventional rectangular annual CSV with source identifiers and credentials removed.

Resolved typed inputs and projection results are the durable source of truth for the dashboard, charts, explanations, ledger, and exports.

### Government benefits

[PR #8](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/8) made CPP and OAS explicit, dated, inspectable retirement-income inputs.

- CPP supports an owner-supplied official estimate, an explicit configured amount, or a clearly labelled dated Canadian reference fallback. The amount-at-65 basis, claim age, early or delayed adjustment, indexing, source, and effective date remain visible.
- OAS retains its dated amount-at-65 basis, explicit full or partial eligibility, qualifying Canadian-residence years after age 18 and resulting fraction where applicable, claim-age adjustment, indexing, and the permanent increase after the age-75 boundary.
- Generic maximum, average, or reference amounts are never presented as personal entitlements, and zero benefits require explicit evidence or a visible warning.
- Calculations, explanations, dashboard values, ledger rows, and exports use the same resolved benefit results, tax treatment, and provenance.

### Surplus allocation policy

[PR #9](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/9) replaced account-order-dependent positive-cash handling with an explicit reserve and excess-allocation policy.

- The policy identifies the cash accounts counted toward a today-dollar indexed reserve target and the account that receives reserve refills.
- Remaining excess follows the resolved strategy, while projection-only investment accounts open at zero, retain explicit return/allocation/withdrawal assumptions, and remain distinct from imported Lunch Money balances. Invalid policy destinations block projection.
- Targeted event inflows remain isolated from unrelated monthly cash, policy deposits reconcile by destination, and internal routing does not create financial assets.
- Dashboard controls, explanations, annual rows, JSON, and rectangular CSV use shared policy results with deterministic export aliases.

### Registered-account room and contribution waterfall

[PR #10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) added one global TFSA room pool, one global RRSP room pool, and room-constrained contribution routing.

- Starting room is explicit, dated, and authoritative for the projection-start position rather than inferred from balances or added to the current year twice. Annual room generation, carry-forward, TFSA next-year withdrawal restoration, RRSP eligible earned income, dated statutory caps, pension adjustments, and other reductions remain inspectable.
- Workplace RRSP contributions receive first claim on global RRSP room and unsupported overflow remains unallocated.
- Personal investing follows TFSA, personal RRSP, then taxable; personal cash never uses the workplace RRSP.
- Reserve-building savings remain cash until the indexed combined target is reached and redirect through the personal order at the exact crossing boundary.
- Only explicit savings plans are invested. Unplanned positive cash remains operating cash, and a missing real taxable destination resolves to a deterministic zero-balance projection-only account.
- Simple intent-based configuration and advanced routing compatibility are mutually exclusive, deterministic, and resolved before calculation.

### Net worth, real estate, and debt amortization

[PR #11](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11) established a complete balance-sheet contract while keeping retirement funding separate from net worth.

- Financial accounts, non-financial assets, and liabilities are distinct resolved concepts. Total net worth is financial assets plus non-financial assets minus liabilities, and home equity is residence value minus linked mortgage. Retirement-funding assets contain only cash and investments; residence equity remains unavailable to withdrawals.
- A primary residence may come from one imported real-estate account or an explicit fallback valuation, with mutually exclusive sources and explicit appreciation.
- Positive liabilities require explicit payoff treatment. Amortizing schedules preserve rate convention, payment amount and frequency, monthly equivalent, effective date, lump sums, interest, principal, closing balance, and payoff date.
- Required liability payments are funded before ordinary spending or cash-funded savings. Principal reduces financial assets and liabilities together without being counted as consumption; interest remains an expense; payments stop at payoff.
- Historical mortgage payments are replaced exactly once. Dedicated categories, an explicit already-excluded assertion, or exact normalized payee-plus-source matching are mutually exclusive handling choices. Exact matching occurs before ordinary category and reviewed-recurring classification so unrelated mixed-category spending remains intact.
- Financial-assets, liability-schedule, balance-sheet, and total-net-worth results reconcile within one cent and feed the same dashboard, explanations, annual rows, JSON, and CSV.

## Next capability: Employment-income today-dollar semantics correction

### Goal

Make future employment-income phases honour the documented today-dollar contract at the projection start rather than silently rebasing their amounts at each phase boundary.

### Model contract

- `annualNetCashToday` and other employment-income fields explicitly labelled as today-dollar amounts use the projection start as their real-value reference date.
- A future phase with annual growth equal to inflation produces the configured today-dollar amount in each complete future year.
- Phase-local growth begins from the correct elapsed time since the projection start while phase selection remains inclusive at the start and exclusive at the end.
- Partial first and final phase years use the existing calendar-month semantics without a hidden full-year shift.
- RRSP-room eligible earned income follows the same documented today-dollar basis as the employment cash amount unless a distinct basis is explicitly introduced and named.
- Any retained legacy interpretation is a visible, deterministic compatibility mode and never silently changes an existing field’s meaning.

### Presentation, provenance, and exports

- Explanations identify the configured today-dollar amount, projection-start reference date, active phase, growth assumption, inflation assumption, and resulting nominal and real amount.
- Dashboard values, annual rows, bridges, JSON, and CSV consume the corrected shared projection result.
- Scenario output clearly distinguishes the resolved baseline from active inputs and lists every active override delta.

### Acceptance criteria

- A synthetic future phase configured with equal growth and inflation remains constant in today dollars across complete future years.
- A zero-growth future phase declines in today dollars only through inflation, without an additional phase-start rebasing error.
- Integer-age, fractional-age, mid-year, partial-year, and adjacent-phase boundaries are covered by synthetic tests.
- Employment cash, eligible earned income, room generation, annual ledgers, bridges, explanations, JSON, and CSV agree within one cent.
- Existing public examples and migrations retain deterministic, documented behaviour without private data.

## Planned capability: Operating-cash target and automatic excess sweep

### Goal

Separate the amount intentionally retained for normal operating cash from the emergency reserve and route cash above both explicit targets through the existing registered-account contribution waterfall.

### Model contract

- The policy distinguishes an indexed operating-cash target from the indexed combined reserve target.
- Every cash account has an explicit role: operating cash, reserve member, reserve refill destination, or an allowed combination.
- Cash first satisfies required outflows, then configured contribution plans, then the operating and reserve targets according to an explicit order.
- Unplanned positive cash above the applicable targets may be retained or swept through the existing personal TFSA, personal RRSP, and taxable order.
- The exact target-crossing month is calculated without double-counting existing cash or creating financial assets through internal routing.
- A sweep never consumes cash needed for a required liability payment, current-month spending, configured contribution, or configured minimum operating balance.

### Presentation and exports

- Dashboard, explanations, annual rows, JSON, and CSV expose the operating target, reserve target, balances counted toward each target, retained amount, swept amount, destination accounts, and any unfunded target amount.
- Active overrides and compatibility behaviour remain explicit and share-safe.

### Acceptance criteria

- Cash below either applicable target is not swept.
- Cash above both targets is swept at the exact monthly boundary under the selected policy.
- The retained operating balance, reserve balance, and invested excess reconcile within one cent.
- Synthetic tests cover overlapping cash roles, exact target crossings, partial months, insufficient cash, registered-room exhaustion, taxable overflow, and retain-versus-sweep policies.
- Existing configurations that retain unplanned cash preserve that behaviour through an explicit compatibility value rather than a silent default.

## Planned capability: General spending phases

### Goal

Model non-debt lifestyle expenses that change over time without coupling them to liability amortization or inferring personal life events.

Essential and discretionary spending must remain distinct throughout baseline resolution, monthly projection, presentation, explanations, and exports.

### Model contract

- Spending is represented by explicit time-bounded phases for essential and discretionary expenses.
- Each phase has an inclusive start and exclusive end aligned to projection months.
- Each phase supplies an explicit amount basis and an explicit inflation or phase-local growth assumption.
- A phase may use the current Lunch Money spending baseline only when configuration explicitly requests that source; omission must not silently select live baseline spending.
- Configuration may represent known transitions such as employment-related costs, temporary household costs, later-life healthcare or care costs, and other owner-specified lifestyle changes.
- The planner never predicts career, family, health, care, or lifestyle events automatically.
- Resolved typed spending inputs remain the source of truth; presentation layers do not independently reconstruct phase selection or growth.

### Boundaries and validation

- Phase selection changes at the exact configured projection-month boundary.
- Overlaps and gaps are validated explicitly rather than resolved by ordering or silent fallback. Any intentionally inactive interval must be represented unambiguously.
- Phase ages, dates, amounts, and growth assumptions must be finite, internally consistent, and within established project bounds.
- Inclusive-start and exclusive-end semantics must hold for integer and fractional ages and for mid-calendar-year transitions.
- Essential and discretionary phases are validated independently while preserving their separate totals.
- The planner must not infer phase boundaries from transaction cadence, payees, account names, employment changes, or demographic assumptions.

### Baseline and compatibility behaviour

- Lunch Money remains evidence for current non-debt essential and discretionary spending.
- Debt payments and liability schedules remain outside general spending phases. Historical mortgage payments replaced by a liability schedule must not re-enter essential or discretionary spending.
- Investment contributions and internal transfers are not lifestyle spending.
- Configured future phases reconcile to their explicit configuration and, when selected, the relevant baseline evidence and provenance.
- If current scalar spending inputs remain supported, their compatibility behaviour must be deterministic, visible, documented, and normalized into the same resolved phase model before projection.
- Missing or incompatible evidence must produce a clear validation or unavailable-evidence state rather than an invented amount.

### Projection, presentation, and export behaviour

- Monthly spending changes exactly when a configured phase starts or ends.
- Partial first and final years remain anchored to calendar months, and annual totals include only the active months in each phase.
- Nominal and today-dollar views apply the same phase timing and differ only through the established inflation/display semantics.
- Financial-asset and net-worth bridges subtract the same non-debt spending results used by the monthly projection.
- Dashboard summaries, annual charts, ledger rows, explanations, JSON, and CSV consume the shared projected spending results.
- Explanations identify the active phase, essential and discretionary amounts, growth assumption, source, effective boundary, and any active override.
- JSON remains typed and anonymized; CSV remains one rectangular annual scalar table without nested phase objects or private labels.
- Temporary controls, reset, and refresh behaviour must preserve the existing provenance contract if phase assumptions are exposed as overrides.

### Non-goals

This capability does not add:

- automatic career, family, healthcare, care, or lifestyle forecasting;
- mortgage, debt-amortization, refinancing, or property-cost submodels;
- RRIF minimum withdrawals or a progressive Canadian tax engine;
- stochastic, sequence-of-returns, or probability-of-success modelling; or
- a generic event or rules engine.

### Acceptance criteria

- Essential and discretionary spending change at exact inclusive-start, exclusive-end monthly boundaries.
- Partial first years, partial final years, and fractional-age transitions use the projection’s existing calendar semantics.
- Gaps and overlaps cannot silently select or omit spending.
- Every phase has explicit growth and an inspectable source; live baseline values are used only when requested.
- Debt payments, liability schedules, contributions, and transfers are not duplicated as lifestyle spending.
- Current scalar compatibility, if retained, resolves deterministically into the same typed inputs.
- Monthly results, annual presentation, explanations, nominal and real bridges, JSON, and CSV agree within one cent.
- Synthetic tests cover boundary months, gaps, overlaps, baseline-selected and configured amounts, phase-local growth, partial years, compatibility, privacy, and negative reconciliation cases.
- No personal transition is inferred automatically.

## Planned capability: Retirement funding requirement and terminal balance

### Goal

Derive the minimum financial assets required at the retirement boundary for the configured spending, benefits, taxes, liabilities, longevity, account composition, and ending-balance objective, then compare that requirement with projected retirement assets.

### Requirement contract

- The owner explicitly configures the terminal age and minimum ending financial-assets balance in today dollars.
- Residence value and home equity remain excluded from retirement funding unless a structured housing transition explicitly makes proceeds available.
- The requirement uses the same monthly retirement projection, spending phases, liability schedules, government benefits, withdrawal priorities, tax model, and surplus policy as the ordinary projection.
- Cash, TFSA, RRSP or RRIF, and non-registered dollars are not treated as interchangeable. The solved requirement uses an explicit retirement-boundary account composition or a documented scaling rule based on the projected composition.
- The solver finds the minimum retirement-boundary funding amount that satisfies required outflows and the terminal balance without hidden rounding cushions.
- Until the Canadian retirement-tax capability is complete, any result using the flat-rate compatibility model is clearly labelled provisional and must not be described as fully tax-aware.

### Outputs

Expose, in today dollars:

- projected financial assets at retirement;
- required financial assets at retirement;
- margin or shortfall;
- configured terminal age and terminal balance;
- retirement-boundary account composition used by the solver;
- the binding depletion or terminal constraint; and
- the active spending, benefit, tax, liability, return, and housing assumptions.

The configured round-number goal remains available as an owner marker but is not presented as the derived retirement requirement.

### Acceptance criteria

- The solver converges deterministically to the minimum passing amount within one cent or an explicitly documented numerical tolerance smaller than the display precision.
- Adding one cent below the accepted requirement fails the configured criterion in synthetic boundary tests.
- Projected-versus-required margin uses the same retirement date and today-dollar basis.
- Requirement results recompute when spending, benefits, taxes, returns, liabilities, terminal criteria, account composition, or active overrides change.
- Dashboard, explanations, annual results, JSON, and CSV do not present a configured goal as a derived requirement.
- Synthetic tests cover zero and nonzero terminal balances, different account compositions, mortgage overlap, public-benefit starts, flat-tax compatibility, and unavailable or infeasible scenarios.

## Planned capability: RRIF minimum withdrawals and Canadian retirement taxes

### Goal

Model mandatory registered-account withdrawals and a materially more realistic deterministic Canadian retirement-tax path.

### RRIF conversion and minimum withdrawals

- Convert RRSP treatment to RRIF treatment at the configured conversion age.
- Calculate statutory minimum withdrawals from dated age-based factors with source and effective-date provenance.
- Ensure actual annual withdrawals are never below the applicable minimum while allowing larger withdrawals when cash flow requires them.
- Tax RRIF withdrawals as ordinary income.
- Route cash remaining after spending and tax through the active surplus policy.
- Make the RRIF milestone reflect actual conversion and withdrawal behaviour rather than a label alone.

### Tax model

Replace the single flat effective retirement-income rate with a deterministic Canadian model that includes at least:

- annual federal brackets and configured provincial brackets;
- the basic personal amount;
- the age amount where applicable;
- the pension-income amount where applicable;
- CPP and OAS taxation;
- RRSP and RRIF taxation;
- TFSA tax-free treatment; and
- OAS recovery tax based on relevant taxable income, including registered withdrawals.

Non-registered taxation may initially use explicit simplified assumptions for interest, eligible dividends, capital gains, and adjusted cost base. Every simplification must be labelled, sourced, and tested.

### Tax-year semantics

- Accumulate taxable income by calendar tax year rather than independently applying annual rules each month.
- Apply annual brackets, credits, and recovery tax to the relevant tax year.
- Reconcile annual tax to the projection’s cash flows and withdrawal decisions.
- Handle partial first and final years explicitly without silently applying a full-year assumption.
- Keep nominal statutory inputs, reference years, indexation, and future forecasts inspectable.

### Explanations and exports

For each annual period, expose:

- taxable income by source;
- deductions and credits modelled;
- federal and provincial tax;
- OAS recovery tax;
- total tax and effective tax rate; and
- RRIF minimum and actual withdrawal.

Dashboard, explanations, annual rows, JSON, and rectangular CSV must use the same tax and RRIF results. Statutory sources, reference dates, forecast assumptions, and compatibility behaviour must retain provenance and share-safe aliases.

### Acceptance criteria

- RRIF minimum withdrawals begin at the configured statutory age and use dated factors.
- Actual RRIF withdrawals are never below the required minimum, while larger cash-flow withdrawals remain possible.
- Excess RRIF cash follows the surplus policy.
- RRIF, RRSP, CPP, and OAS taxable income is included correctly; TFSA withdrawals remain tax-free.
- OAS recovery tax includes applicable taxable registered withdrawals.
- Federal tax, provincial tax, credits, recovery tax, and total tax reconcile by annual period within one cent.
- Partial-year and tax-year boundary behaviour is explicit and tested.
- Tax rules, dated references, simplifications, and forecasts remain visible in provenance, explanations, and exports.
- The flat-rate model remains only as explicitly labelled deterministic compatibility or is removed through a documented migration.

## Planned capability: Deterministic return paths and sequence-risk scenarios

### Goal

Test explicitly configured adverse return sequences without presenting a probability-of-success claim.

### Model contract

- Accounts may use a constant annual return or an explicit dated monthly or annual return path.
- Return paths apply through the shared monthly projection and never through chart-only or report-only calculations.
- The owner may configure deterministic scenarios such as a decline immediately before retirement, a decline immediately after retirement, a slow recovery, or a prolonged low-return period.
- Inflation assumptions remain separate from investment returns and may also use an explicit deterministic path when configured.
- Constant-return compatibility remains visible and deterministic.

### Acceptance criteria

- Identical long-run average returns with different orderings produce appropriately different withdrawal outcomes.
- Return-path boundaries, partial years, account-specific paths, rebalancing assumptions, and retirement transitions are tested with synthetic data.
- Monthly balances, annual rows, bridges, explanations, JSON, and CSV consume the same path-driven returns and reconcile within one cent.
- Results are labelled deterministic scenarios, not probabilities, confidence levels, or forecasts.

## Planned capability: Structured housing transitions

### Goal

Model an explicit sale, purchase, downsize, relocation, or mortgage transition without treating home equity as continuously spendable retirement funding.

### Model contract

- A transition specifies its date, affected property and liability, sale proceeds or purchase price, transaction costs, mortgage payoff or origination, and destination or source of remaining cash.
- Residence value becomes retirement funding only when a configured transaction produces spendable proceeds.
- Property appreciation, mortgage schedules, closing costs, bridge periods, and post-transition housing spending remain explicit.
- Generic one-time events do not silently perform coordinated asset, liability, and cash-flow changes.
- The planner never predicts a move, sale, purchase, partner contribution, or downsize automatically.

### Acceptance criteria

- Sale proceeds reconcile to property value less linked liability payoff and configured transaction costs.
- A purchase or refinance creates the configured asset and liability at the exact boundary without duplicating cash flows.
- Home equity remains excluded before the transition and only realized net proceeds become retirement funding afterward.
- Synthetic tests cover sale-only, purchase-only, same-month sale and purchase, downsize, insufficient cash, mortgage payoff, and cancelled or invalid transitions.
- Dashboard, explanations, bridges, annual rows, JSON, and CSV use the same structured transition results.

## Cross-cutting requirements

### One source of truth

- Calculations consume resolved typed inputs.
- UI components and explanation layers do not recreate financial formulas.
- Dashboard, charts, ledger, explanations, and exports consume the same projection result.

### Reconciliation

- Material balances and flows reconcile within one cent at relevant monthly, annual, retirement, and aggregate boundaries.
- A success label appears only after every required equality passes.
- Missing evidence produces an honest validation or unavailable-evidence state.

### Provenance and compatibility

- Every material resolved value retains source type, source description, effective date, active override where applicable, and compatibility fallback where applicable.
- Every scenario, dashboard summary, explanation, and export identifies whether it represents resolved baseline inputs or active inputs and lists active override deltas.
- Compatibility is retained only when deterministic, visible, tested, and documented.
- Schema migrations are explicit and do not silently reinterpret financial meaning.

### Privacy and exports

- Private YAML remains ignored by Git and excluded from Docker build contexts.
- Public documentation, fixtures, screenshots, commits, logs, and pull-request text use synthetic, non-identifying data only.
- JSON remains typed and allowlisted.
- CSV remains one rectangular annual table without embedded objects, arrays, metadata preambles, or multiple schemas.
- Raw source-system identifiers, account numbers, credentials, statements, private labels, and private configuration text do not cross export boundaries.
- Account, phase, benefit, debt, room, and tax references use deterministic export-local identifiers.

### Validation

Each implementation pull request must run and report:

- unit and regression tests;
- typecheck and lint;
- production build;
- Docker image build and Docker Compose validation;
- relevant synthetic end-to-end checks;
- one-cent reconciliation checks; and
- JSON and nominal/real CSV privacy checks.

Private financial data must never appear in fixtures, screenshots, logs, commits, documentation, or pull-request text.

## Deterministic-confidence exit criteria

The accepted deterministic roadmap is complete when an accurately configured scenario can demonstrate that:

- today-dollar employment-income semantics remain consistent across current and future phase boundaries;
- government benefits are explicit, dated, and officially sourced or clearly labelled as references;
- positive cash follows explicit operating, reserve, savings, and investment policies;
- registered contributions never exceed modelled room;
- net worth includes non-financial assets and liabilities, debts amortize, and debt-linked payments end at payoff;
- non-debt expenses change at configured lifecycle boundaries;
- projected retirement funding is compared with a derived requirement using explicit terminal criteria and account composition;
- RRIF minimums and annual Canadian retirement taxes are modelled consistently;
- configured adverse return paths use the same reconciled projection without probability claims;
- structured housing transitions realize home equity only through explicit transactions;
- starting assets, accumulation, retirement balances, withdrawals, spending, taxes, liabilities, and ending assets reconcile;
- every major result traces to Lunch Money evidence, local configuration, dated public reference data, or a temporary override;
- baseline inputs, active inputs, and override deltas are never conflated; and
- no material financial behaviour depends on account ordering, silent fallbacks, or inferred personal events.

At that point, the planner may be described as a high-confidence deterministic calculator when its inputs and assumptions are accurate. Probabilistic confidence remains a separate product claim and roadmap.

## Later roadmap

The following remain separate later capabilities:

- transaction-coverage and exclusion reconciliation;
- Monte Carlo simulation;
- historical rolling-return analysis;
- probability-of-success reporting;
- household and spouse modelling;
- tax-optimized withdrawal strategies;
- automatic career, spending, or life-event forecasting; and
- full tax-return fidelity.

These items may be promoted as priorities evolve, but probabilistic modelling must remain distinct from deterministic projection confidence.