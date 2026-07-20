# Project Roadmap

This is the living roadmap for Lunch Money Retirement Planner.

It records planned modelling and product capabilities without embedding any private financial scenario, personal target, account detail, employer information, or identifying data. Public examples and tests must remain synthetic.

## How to use this document

Roadmap items use these statuses:

- **Completed** — merged and validated
- **In progress** — implementation exists in an open pull request
- **Planned** — accepted next work
- **Later** — useful work intentionally deferred

Each major capability should normally be delivered in its own pull request. Adjacent items may be combined only when their model contracts cannot be separated safely.

## Product standard

The planner should become a high-confidence deterministic calculator: given accurate inputs and explicit assumptions, it should calculate the stated scenario consistently, reconcile important results, and avoid material hidden behaviour.

This standard is different from probability-of-success reporting. A single deterministic projection cannot establish a success probability. Sequence-of-returns and probabilistic modelling remain later roadmap items.

## Current foundation

### Completed

- Read-only Lunch Money baseline for accounts, categories, recurring items, and paginated transactions
- Explicit account and category mappings through private local configuration
- Single-person monthly projection with nominal and today-dollar views
- Account-level balances, contributions, returns, allocations, and withdrawal priority
- Employment income treated as net deposited cash rather than taxed again
- Cash-funded and income-withheld contribution semantics
- Calendar-anchored partial-year reporting
- Typed JSON export and conventional flat CSV export
- Source-identifier and credential removal at the export boundary
- Accessible tooltips and inspectable calculation explanations
- Cash-flow audit evidence grouped by category and account
- Explicit employment-income phases with inclusive starts and exclusive ends
- Per-account contribution phases with phase-local funding and indexing
- Exact retirement-boundary snapshots covering the final working month
- Start-to-retirement accumulation bridges that reconcile to the retirement snapshot
- Temporary phase overrides and reset behaviour
- Deterministic compatibility normalization for legacy scalar inputs

The phased income and contribution model is the foundation for the planned modelling work below.

---

## Planned modelling roadmap

### 1. Government benefits

#### Goal

Resolve CPP and OAS into explicit, dated, inspectable retirement-income inputs instead of silently defaulting to zero or presenting generic reference values as personal entitlements.

#### CPP requirements

Support these source modes:

1. Official estimate supplied through private configuration
2. Explicit configured amount when an official estimate is unavailable
3. Dated Canadian reference value used only as a clearly labelled fallback

Retain:

- monthly amount at age 65 in today’s dollars
- source type and description
- effective date
- claim age
- early or delayed claim adjustment
- indexing assumption

A generic maximum, average, or reference value must never be described as a personal CPP entitlement.

#### OAS requirements

Support:

- full OAS amount at age 65 in today’s dollars
- qualifying Canadian-residence years after age 18
- explicit full or partial eligibility
- claim age
- delayed-claim adjustment
- permanent 10% increase beginning in the first modelled month after the age-75 boundary
- indexing assumption

When residence years are supplied, calculate the eligible fraction deterministically. When eligibility is unknown, require an explicit assumption or clearly labelled reference fallback.

#### Explanations

CPP and OAS explanations must show:

- base amount at age 65
- claim-age adjustment
- eligibility fraction where applicable
- indexing
- gross annual benefit
- tax treatment
- source and effective date

#### Acceptance criteria

- CPP and OAS cannot remain zero without an explicit zero assumption or visible warning.
- Official estimates remain distinguishable from generic references.
- Claim-age adjustments reconcile exactly to projected monthly benefits.
- OAS partial eligibility reconciles to the configured residence fraction.
- OAS increases by exactly 10% beginning in the first modelled month after the age-75 boundary.
- Dashboard, ledger, charts, explanations, JSON, and CSV use the same resolved values.
- Private statements and external credentials are never committed or exported.

---

### 2. Surplus allocation policy

#### Goal

Replace the implicit behaviour that sends every positive monthly cash flow to the first cash account with an explicit and inspectable allocation policy.

#### Required policy model

The resolved policy must include:

- target cash reserve in today’s dollars
- reserve indexing
- destination for cash above the reserve
- explicit handling when no valid destination exists

#### Projection-only accounts

Allow explicitly configured projection accounts with zero opening balance, such as a future non-registered investment account. They must:

- remain clearly distinguished from Lunch Money accounts
- have explicit return, allocation, contribution, and withdrawal assumptions
- use deterministic export-local identifiers
- never be presented as imported balances

#### Monthly behaviour

For each positive monthly surplus:

1. Refill the indexed cash reserve.
2. Allocate remaining surplus according to the configured strategy.
3. Record the amount retained as cash and the amount routed elsewhere.
4. Block or warn when no valid destination exists.

Do not automatically route excess into TFSA or RRSP until registered-account room is modelled.

#### Explanations

Show:

- total surplus generated
- amount retained in cash
- amount redirected to each destination
- active reserve target
- policy source
- effect on retirement assets and allocation

#### Acceptance criteria

- The engine no longer selects the first cash account implicitly.
- Cash reserve and excess allocation are first-class resolved inputs.
- Internal transfers do not change total financial assets.
- Account composition and investment returns change consistently with the policy.
- Accumulation bridges remain reconciled.
- Overrides and resets update policy explanations immediately.
- Export privacy and deterministic account aliasing remain intact.

---

### 3. Registered-account room and contribution waterfall

#### Goal

Prevent impossible TFSA or RRSP contributions and model where planned savings go after registered room is exhausted.

The primary owner-facing model is intent based: account IDs occur only as `accountMappings` keys with roles, starting room is an amount plus date, every employment phase explicitly supplies RRSP room-generation assumptions, and named personal, reserve-building, and workplace plans omit source/destination arrays. A compiler resolves that simple model into the detailed projection inputs. The existing low-level route model remains mutually exclusive advanced compatibility.

#### TFSA room

Support:

- starting available room
- annual new room
- optional carry-forward assumptions
- room consumed by projected contributions
- contribution suspension when room reaches zero until new room becomes available

The annual room amount must be explicitly configured or resolved from dated Canadian reference data. Historical room must never be inferred from current balances alone.

#### RRSP room

Support:

- starting available deduction room
- new annual room generated from eligible earned income
- annual statutory cap from dated reference data
- configurable pension adjustment or other room reduction
- room consumed by projected contributions

The model may remain simplified, but all simplifications must be visible and deterministic.

#### Contribution waterfall

The canonical personal order is:

1. TFSA while room is available
2. RRSP while room is available
3. Non-registered investments

Workplace RRSP contributions run first against the global RRSP room pool, overflow remains unallocated, and personal cash never uses the workplace account. If no real personal taxable account is assigned, create a deterministic zero-balance projection-only destination. Reserve-building savings stay cash until the indexed combined target is reached and redirect any same-month crossing amount through the personal order. Only explicit plan amounts are invested; remaining positive cash stays in operating cash.

The resolved waterfall must distinguish:

- planned contribution
- allowed contribution after room constraints
- cash-funded contribution
- income-withheld contribution
- redirected amount
- unallocated amount

#### Explanations

For each registered account and annual period, show:

- opening room
- new room
- planned contribution
- allowed contribution
- closing room
- overflow destination

#### Acceptance criteria

- TFSA and RRSP balances cannot receive contributions beyond modelled room.
- Room generation and consumption reconcile by year.
- Planned contributions above available room are redirected or visibly left unallocated according to policy.
- Income-withheld contributions retain their cash-flow semantics.
- Ledger and exports expose planned, allowed, and redirected contributions without nested JSON in CSV.
- Compatibility behaviour is explicit when room modelling is omitted.
- Simple and advanced configuration cannot mix.
- Account roles compile to deterministic routes without repeating IDs.
- Workplace RRSP has first room priority and overflow is unallocated.
- Unplanned positive cash is retained rather than invested.
- The automatic taxable destination remains projection-only and opens at zero.

---

### 4. Net worth, real estate, and debt amortization

#### Goal

Make projected net worth conceptually and mathematically complete by separating
financial accounts, non-financial assets, and liabilities, then replacing
static positive debt with explicit payoff behaviour.

The model must distinguish:

- retirement-funding financial assets that are available to the withdrawal
  engine
- non-financial assets, beginning with a primary residence
- liabilities, including a linked primary mortgage
- home equity
- total assets, total liabilities, and total net worth

Home equity is part of net worth but is not available for retirement
withdrawals until a later explicit sale or conversion capability is added.

#### Primary residence and balance sheet

Support an explicit current residence value, valuation date, and nominal
appreciation assumption. The residence remains unavailable to withdrawals.

The resolved balance sheet must reconcile:

```text
retirement funding assets
= cash + TFSA + RRSP/RRIF + non-registered investments

total assets
= retirement funding assets + non-financial assets

total liabilities
= the sum of liability balances

home equity
= residence value - linked mortgage balance

total net worth
= total assets - total liabilities
```

Liabilities must not remain inside the resolved financial-account collection,
and the same opening debt must never appear in both places.

#### Debt schedules and spending replacement

Support explicit amortization schedules for mapped debts that materially affect the projection.

A schedule should support:

- opening principal
- interest rate
- explicit interest-rate convention
- regular payment
- payment frequency or monthly equivalent
- start date
- optional lump-sum payments

The schedule effective date must be on or before projection start for an
imported opening liability. The imported balance remains authoritative; the
projection must not replay historical amortization or imply future debt
origination. Required liability demand must be fully funded before the
liability closing balance is committed, and a configured lump sum must be
consumed exactly once or rejected clearly.

The engine must distinguish:

- interest expense
- principal repayment
- lump-sum principal repayment
- total liability cash payment
- remaining debt balance
- payoff date

Principal repayment reduces financial assets and the liability equally, so it
has no direct net-worth effect. Interest is consumption. The full payment still
leaves the financial portfolio, and payments stop automatically at payoff.

Historical debt-payment categories must be excluded from essential and
discretionary spending, retained as audit evidence, and replaced exactly once
by the configured schedule. The planner must not infer future interest rates,
payments, or amortization terms from transaction history.

#### Explanations

Show:

- retirement-funding assets, non-financial assets, liabilities, home equity,
  and total net worth
- the total-net-worth formula and bridge
- residence value and appreciation provenance
- opening liability principal and treatment
- entered payment amount and frequency plus its monthly equivalent
- debt payment, interest, and principal components
- lump sums, closing balance, and payoff date
- historical-payment replacement evidence
- the limitation that residence equity cannot fund retirement
- the limitation that mortgage renewal and rate-change phases are not yet
  modelled

#### Acceptance criteria

- Financial accounts contain only cash, TFSA, RRSP/RRIF, and non-registered
  assets.
- The residence is a typed non-financial asset and is unavailable to
  withdrawals.
- Imported debts resolve once as typed liabilities with explicit treatment.
- Debt balances reconcile to amortization schedules.
- Principal repayment reduces debt without being counted as consumption twice.
- Interest remains an expense.
- Debt-linked spending stops at payoff.
- Historical debt payments are replaced by the schedule exactly once.
- Financial-assets and net-worth bridges both reconcile within one cent.
- Dashboard, explanations, annual rows, JSON, and rectangular CSV consume the
  same balance-sheet result.
- Total net worth includes the residence and liabilities, while retirement
  depletion continues to use financial assets only.
- Static positive debt cannot run silently.

---

### 5. General spending phases

#### Goal

Model non-debt lifestyle expenses that change over time without coupling them
to liability amortization.

Support explicit essential and discretionary spending phases with:

- inclusive starts and exclusive ends
- projection-month-aligned boundaries
- explicit gap and overlap validation
- explicit inflation or phase-local growth
- optional use of the current Lunch Money spending baseline only when the
  configured phase requests it

Allow configured transitions for employment-related costs, temporary
household expenses, later-life healthcare or care costs, and other known
lifestyle changes. The planner must not infer personal life events
automatically.

Acceptance requires spending to change at exact configured boundaries and
future phases to reconcile to their explicit configuration and baseline
evidence.

---

### 6. RRIF minimum withdrawals and improved Canadian taxes

#### Goal

Model mandatory registered-account withdrawals and a materially more realistic Canadian retirement-tax path.

#### RRIF conversion and minimum withdrawals

At the configured conversion age:

- convert RRSP treatment to RRIF treatment
- calculate the statutory minimum withdrawal using dated age-based factors
- withdraw at least the minimum each year
- allow larger withdrawals when cash flow requires them
- tax RRIF withdrawals as ordinary income
- route excess after spending and tax through the active surplus policy

The RRIF milestone must represent real model behaviour rather than a label only.

#### Tax model

Replace the single flat effective rate for retirement income with a deterministic Canadian tax model that includes at least:

- federal brackets
- configured provincial brackets
- basic personal amount
- age amount where applicable
- pension-income amount where applicable
- CPP and OAS taxation
- RRSP and RRIF taxation
- TFSA tax-free treatment
- OAS recovery tax based on relevant taxable income, including RRIF withdrawals

Non-registered taxation may initially use explicit simplified assumptions for:

- interest
- eligible dividends
- capital gains
- adjusted cost base

Every simplification must be labelled and covered by tests.

#### Tax-year semantics

Tax must be calculated on annual taxable income rather than independently per month when that would produce materially different results.

The engine should:

1. Accumulate taxable income by tax year.
2. Apply annual brackets, credits, and recovery tax.
3. Reconcile annual tax to projection cash flows.
4. Handle partial first and final years explicitly.

#### Explanations

For each annual period, show:

- taxable income by source
- deductions and credits modelled
- federal tax
- provincial tax
- OAS recovery tax
- total tax
- effective tax rate
- RRIF minimum and actual withdrawal

#### Acceptance criteria

- RRIF minimum withdrawals begin at the configured statutory age and use dated factors.
- Actual RRIF withdrawal is never below the required minimum.
- Excess RRIF cash follows the surplus policy.
- Taxable income and tax reconcile by annual period.
- OAS recovery tax includes taxable registered withdrawals.
- TFSA withdrawals remain tax-free.
- Tax rules and reference dates are visible in provenance and exports.
- The flat-rate model remains only as an explicitly labelled compatibility mode or is removed through a documented migration.

---

## Cross-cutting requirements

Every roadmap capability must preserve the planner’s existing trust boundary.

### One source of truth

- Projection calculations consume resolved typed inputs.
- UI components do not recreate financial formulas.
- Explanations, charts, ledgers, and exports use the same projection result.

### Reconciliation

- Important balances and flows reconcile within one cent.
- A success label appears only after reconciliation.
- Missing evidence produces an honest unavailable-evidence state.

### Provenance

Every resolved value records:

- source type
- source description
- effective date
- active override where applicable
- compatibility fallback where applicable

### Configuration and compatibility

- Canonical public examples use synthetic data only.
- Private YAML remains ignored by Git and Docker build contexts.
- Schema migrations are explicit.
- Legacy inputs remain supported only when compatibility behaviour is deterministic and documented.

### Exports and privacy

- JSON remains typed and allowlisted.
- CSV remains one rectangular annual table.
- Raw source-system identifiers, account numbers, credentials, statements, and private configuration are not exposed.
- New account, phase, benefit, debt, room, and tax references use deterministic export-local keys.
- Public documentation, fixtures, screenshots, commits, logs, and pull-request text contain no private financial values or identifying scenario details.

### Validation

Each implementation pull request must run:

- unit and regression tests
- typecheck
- lint
- production build
- Docker build
- Docker Compose validation
- synthetic end-to-end smoke tests
- export privacy checks

No implementation pull request may use private financial data in fixtures, screenshots, logs, commits, or pull-request text.

---

## Delivery sequence

### Phase A — Government benefits

Resolve CPP and OAS inputs, provenance, claim-age behaviour, explanations, and exports.

### Phase B — Surplus policy

Add indexed cash reserve, projection-only investment destinations, explicit surplus routing, and reconciliation.

### Phase C — Contribution room

Add TFSA/RRSP room ledgers and a configurable contribution waterfall.

### Phase D — Net worth and debt amortization

Add the residence balance sheet, liability schedules, debt-payment spending
replacement, home equity, and reconciled total net worth.

### Phase E — General spending phases

Add explicit non-debt lifestyle spending transitions.

### Phase F — RRIF and taxes

Add statutory RRIF minimums and annual Canadian retirement-tax calculations.

Implementation should pause after each phase for synthetic review and private local smoke testing before proceeding.

---

## Deterministic-confidence exit criteria

The current planned sequence is complete when the planner can demonstrate all of the following for an accurately configured scenario:

- Government benefits are explicit, dated, and officially sourced or clearly labelled as references.
- Positive surplus follows an explicit reserve and investment policy.
- Registered contributions never exceed modelled room.
- Net worth includes non-financial assets and liabilities, debts amortize, and
  debt-linked payments end at payoff.
- Non-debt expenses change at configured lifecycle boundaries.
- RRIF minimums and annual retirement taxes are modelled consistently.
- Starting assets, accumulation, retirement balances, withdrawals, taxes, and ending assets reconcile.
- Every major result can be traced to Lunch Money data, private configuration, dated reference data, or a temporary override.
- No material financial behaviour depends on implicit account ordering or silent fallback logic.

At that point, the planner may be described as a high-confidence deterministic calculator when its assumptions are accurate.

## Later roadmap

The following remain separate later capabilities:

- transaction-coverage and exclusion reconciliation
- sequence-of-returns modelling
- Monte Carlo simulation
- historical rolling-return analysis
- probability-of-success reporting
- household and spouse modelling
- tax-optimized withdrawal strategies
- automatic career, spending, or life-event forecasting
- full tax-return fidelity

These items should be added or promoted as implementation priorities evolve.
