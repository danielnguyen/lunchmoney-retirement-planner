# Deterministic Model Confidence Roadmap

This roadmap defines the next five modelling upgrades required before the planner should be treated as a high-confidence deterministic retirement calculator.

The target is **mechanical confidence**: given accurate inputs and explicit assumptions, the engine should calculate the stated scenario consistently, reconcile every important result, and avoid materially unrealistic hidden behaviour.

This is not a claim that a single deterministic projection has a 90% probability of succeeding. Probability-of-success reporting requires sequence-of-returns or Monte Carlo modelling and remains a later phase.

## Prerequisite

The phased employment-income and contribution model must be merged before this roadmap begins. The roadmap assumes the engine already supports:

- resolved employment-income phases
- per-account contribution phases
- exact retirement-boundary snapshots
- accumulation bridges
- deterministic explanations and provenance

## Roadmap overview

| Order | Capability | Primary distortion removed |
|---|---|---|
| 1 | Government benefits | Retirement income is understated when CPP and OAS remain zero or are guessed without evidence |
| 2 | Surplus allocation policy | Every unspent dollar is silently accumulated in the first cash account |
| 3 | Registered-account room and contribution waterfall | TFSA and RRSP contributions can continue beyond available contribution room |
| 4 | Debt amortization and spending phases | Debts and associated expenses can remain unchanged for decades; spending cannot reflect lifecycle changes |
| 5 | RRIF minimum withdrawals and improved Canadian taxes | Mandatory withdrawals, taxable income, credits, and OAS recovery tax are materially simplified |

Each capability should be delivered as a separate pull request unless implementation evidence shows that two adjacent capabilities cannot be safely separated.

---

## 1. Government benefits

### Goal

Resolve CPP and OAS into explicit, dated, inspectable retirement-income inputs instead of silently defaulting to zero or treating generic reference values as personal estimates.

### CPP

Support these source modes:

1. **User-provided estimate** from an official CPP statement or benefit estimate
2. **Explicit configured amount** when the official estimate is unavailable
3. **Dated Canadian reference default** used only as a clearly labelled fallback

The model must retain:

- monthly amount at age 65 in today’s dollars
- source type and description
- effective date
- claim age
- early or delayed claim adjustment
- indexing assumption

The planner must never describe a generic maximum, average, or reference amount as the user’s personal CPP entitlement.

### OAS

Support:

- full OAS amount at age 65 in today’s dollars
- qualifying Canadian-residence years after age 18
- explicit full or partial eligibility
- claim age
- delayed-claim adjustment
- indexing assumption

When residence years are supplied, calculate the eligible fraction deterministically. When eligibility is unknown, require an explicit assumption or clearly labelled reference fallback.

### Explanations

The CPP and OAS explanations must show:

- the base amount at age 65
- claim-age adjustment
- eligibility fraction where applicable
- indexing
- gross annual benefit
- simplified or detailed tax treatment
- source and effective date

### Acceptance criteria

- CPP and OAS can no longer remain zero without an explicit zero assumption or visible warning.
- Official user-provided estimates remain distinguishable from generic references.
- Claim-age adjustments reconcile exactly to projected monthly benefits.
- OAS partial eligibility reconciles to the configured residence fraction.
- Dashboard, annual ledger, accumulation/withdrawal views, explanations, JSON, and CSV use the same resolved values.
- No external account credentials or private statements are committed or exported.

---

## 2. Surplus allocation policy

### Goal

Replace the implicit “deposit all positive cash flow into the first cash account” behaviour with an explicit and inspectable allocation policy.

### Required policy model

Add a policy conceptually similar to:

```yaml
surplusPolicy:
  cashReserveToday: 50000
  cashReserveIndexingRate: 0.02
  excess:
    strategy: target_account
    targetAccountId: future-non-registered
```

The exact schema may differ, but the resolved model must include:

- target cash reserve in today’s dollars
- reserve indexing
- destination for cash above the reserve
- explicit handling when no valid destination exists

### Projection-only accounts

Allow explicitly configured projection accounts with zero opening balance, such as a future non-registered investment account. They must:

- remain clearly distinguished from Lunch Money accounts
- have explicit return, allocation, contribution, and withdrawal assumptions
- use deterministic export-local identifiers
- never be presented as imported balances

### Monthly behaviour

For each positive monthly surplus:

1. Refill the indexed cash reserve.
2. Allocate remaining surplus according to the configured strategy.
3. Record the amount retained as cash and the amount swept elsewhere.
4. Block or warn when the policy has nowhere valid to send excess cash.

Do not automatically sweep excess into TFSA or RRSP until registered-account room is modelled.

### Explanations

Show:

- total surplus generated
- amount retained in cash
- amount redirected to each destination
- active reserve target
- policy source
- effect on retirement assets and allocation

### Acceptance criteria

- The engine no longer selects the first cash account implicitly.
- Cash reserve and excess allocation are first-class resolved inputs.
- Total financial assets are unchanged by internal transfers.
- Account composition and investment returns change consistently with the policy.
- The accumulation bridge remains reconciled.
- Active overrides and resets update the policy explanations immediately.
- Export privacy and deterministic account aliasing remain intact.

---

## 3. Registered-account room and contribution waterfall

### Goal

Prevent the engine from making impossible TFSA or RRSP contributions and model where planned savings go after registered room is exhausted.

### TFSA room

Support:

- starting available TFSA room
- annual new room
- optional carry-forward assumptions
- room consumed by projected contributions
- no contribution after room reaches zero unless new room becomes available

The annual room value must be explicitly configured or resolved from a dated Canadian reference. Historical personal room must never be inferred from current balances alone.

### RRSP room

Support:

- starting available RRSP deduction room
- new annual room generated from eligible earned income
- annual statutory cap from dated reference data
- configurable pension adjustment or other room reduction
- room consumed by projected contributions

The model may remain simplified, but its simplifications must be visible and deterministic.

### Contribution waterfall

Allow a savings policy such as:

```text
TFSA until available room is exhausted
→ RRSP until available room is exhausted
→ non-registered account
→ cash only when no investment destination is configured
```

The waterfall must distinguish:

- cash-funded contributions
- income-withheld contributions
- contribution phase intent
- actual contribution after room constraints
- redirected or unallocated amounts

### Explanations

For each registered account and annual period, show:

- opening room
- new room
- planned contribution
- allowed contribution
- closing room
- overflow destination

### Acceptance criteria

- TFSA and RRSP balances cannot receive contributions beyond modelled room.
- Room generation and consumption reconcile by year.
- A planned contribution above available room is redirected or visibly left unallocated according to policy.
- Income-withheld contributions retain their existing cash-flow semantics.
- The annual ledger and exports expose planned, allowed, and redirected contributions without embedding nested JSON in CSV.
- Compatibility behaviour is explicit for configurations that omit room modelling.

---

## 4. Debt amortization and spending phases

### Goal

Model debts and lifestyle expenses as changing over time rather than carrying current balances and spending indefinitely.

### Debt schedules

Add explicit amortization schedules for mapped debts that materially affect the plan.

A debt schedule should support:

- opening principal
- interest rate
- regular payment
- payment frequency or monthly equivalent
- start date
- expected payoff date or amortization period
- optional lump-sum payments
- renewal or rate-change phases when configured

The engine must distinguish:

- interest expense
- principal repayment
- remaining debt balance
- payoff date

Debt balances must not simply receive a zero return and remain nominally fixed.

### Spending phases

Support explicit essential and discretionary spending phases, conceptually:

```yaml
spendingPhases:
  - id: current-household
    label: Current household
    startAge: 40
    endAge: 45
    monthlyEssentialToday: live_baseline
    monthlyDiscretionaryToday: live_baseline

  - id: early-retirement
    label: Early retirement
    startAge: 55
    endAge: 75
    monthlyEssentialToday: 4000
    monthlyDiscretionaryToday: 1800
```

Required semantics:

- starts are inclusive and ends are exclusive
- phases are month-aligned
- gaps and overlaps follow explicit validation rules
- inflation or phase-local growth is explicit
- current Lunch Money spending may seed only the phase that intentionally uses it

### Expense transitions

Allow specific expenses to end or begin with lifecycle events, including:

- debt payments ending at payoff
- employment-related costs ending at retirement
- temporary household expenses
- later-life healthcare or care costs
- known one-time replacements or assessments

Do not automatically infer life events.

### Explanations

Show:

- active spending phase by period
- phase transition dates
- debt payment, interest, and principal components
- debt payoff effects on future spending
- one-time and recurring expense sources

### Acceptance criteria

- Debt balances reconcile to amortization schedules.
- Principal repayment reduces debt but is not counted as consumption twice.
- Interest remains an expense.
- Spending changes exactly at configured phase boundaries.
- Debt-linked spending stops or changes when the debt schedule requires it.
- The annual ledger separately exposes debt principal, debt interest, and other spending where useful.
- Explanations reconcile current spending back to Lunch Money audit evidence and future phases back to configuration.

---

## 5. RRIF minimum withdrawals and improved Canadian taxes

### Goal

Model mandatory registered-account withdrawals and a materially more realistic Canadian retirement-tax path.

### RRIF conversion and minimum withdrawals

At the configured conversion age:

- convert RRSP treatment to RRIF treatment
- calculate the statutory minimum withdrawal using dated age-based factors
- withdraw at least the minimum each year
- allow larger withdrawals when cash flow requires them
- tax RRIF withdrawals as ordinary income
- send excess after spending and tax through the active surplus policy

The milestone must represent real behavioural change rather than a label only.

### Tax model

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

Any simplification must be labelled and covered by tests.

### Tax-year semantics

Tax must be calculated on annual taxable income, not independently per month using annual thresholds divided by twelve when that creates materially different results.

The engine should:

1. Accumulate taxable income by tax year.
2. Apply annual brackets, credits, and recovery tax.
3. Reconcile annual tax to monthly or annual cash flows.
4. Handle partial first and final years explicitly.

### Explanations

For each annual period, show:

- taxable income by source
- deductions and credits modelled
- federal tax
- provincial tax
- OAS recovery tax
- total tax
- effective tax rate
- RRIF minimum and actual withdrawal

### Acceptance criteria

- RRIF minimum withdrawals begin at the configured statutory age and use dated factors.
- Actual RRIF withdrawal is never below the required minimum.
- Excess RRIF cash follows the surplus policy.
- Taxable income and tax reconcile by annual period.
- OAS recovery tax includes taxable registered withdrawals.
- TFSA withdrawals remain tax-free.
- Tax rules and reference dates are visible in provenance and exports.
- The simplified flat-rate model remains available only as an explicitly labelled compatibility mode or is removed through a documented migration.

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
- Legacy inputs remain supported only where the compatibility behaviour is deterministic and documented.

### Exports and privacy

- JSON remains typed and allowlisted.
- CSV remains one rectangular annual table.
- Raw Lunch Money identifiers, account numbers, credentials, and private configuration are not exposed.
- New account, phase, benefit, debt, room, and tax references use deterministic export-local keys.

### Validation

Each implementation PR must run:

- unit and regression tests
- typecheck
- lint
- production build
- Docker build
- Docker Compose validation
- synthetic end-to-end smoke tests
- export privacy checks

No implementation PR may use private financial data in fixtures, screenshots, logs, commits, or pull-request text.

---

## Delivery sequence

### PR A — Government benefits

Resolve CPP/OAS inputs, provenance, claim-age behaviour, explanations, and exports.

### PR B — Surplus policy

Add indexed cash reserve, projection-only investment destinations, explicit surplus routing, and reconciliation.

### PR C — Contribution room

Add TFSA/RRSP room ledgers and a configurable contribution waterfall.

### PR D — Debt and spending phases

Add debt amortization, debt-linked expense transitions, and lifecycle spending phases.

### PR E — RRIF and taxes

Add statutory RRIF minimums and annual Canadian retirement-tax calculations.

Implementation should pause after each PR for a synthetic review and a private live-data smoke test before proceeding.

---

## Deterministic-confidence exit criteria

The roadmap is complete when the planner can demonstrate all of the following for an accurately configured scenario:

- Government benefits are explicit, dated, and personally sourced or clearly labelled as references.
- Positive surplus follows an explicit reserve and investment policy.
- Registered contributions never exceed modelled room.
- Debts amortize and expenses change at configured lifecycle boundaries.
- RRIF minimums and annual retirement taxes are modelled consistently.
- Starting assets, accumulation, retirement balances, withdrawals, taxes, and ending assets reconcile.
- Every major result can be traced to Lunch Money data, configuration, dated reference data, or a temporary override.
- No material financial behaviour depends on implicit account ordering or silent fallback logic.

At that point, the planner may be described as a high-confidence deterministic calculator when its assumptions are accurate.

## Deferred after this roadmap

The following remain separate later capabilities:

- sequence-of-returns modelling
- Monte Carlo simulation
- historical rolling-return analysis
- probability-of-success reporting
- household and spouse modelling
- tax-optimized withdrawal strategies
- automatic career, spending, or life-event forecasting
- full tax-return fidelity

These should not be mixed into the five deterministic-confidence phases above.
