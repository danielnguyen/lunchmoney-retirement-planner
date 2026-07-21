# Lunch Money Retirement Planner

A self-hosted, single-person retirement projection built from current Lunch Money balances and trailing transaction data.

The end-to-end MVP is defined in [plan/README.md](plan/README.md). The runtime never substitutes demonstration data. If the Lunch Money token, private configuration, or required mappings are missing, the dashboard shows a blocking error and no charts.

## What the MVP does

- Connects to Lunch Money API v2 with retrieval methods only
- Fetches manual accounts, Plaid accounts, categories, recurring items, and paginated trailing transactions on demand
- Derives financial-account and liability balances, net deposited employment cash, non-debt spending, historical debt-payment evidence, investment contributions, recurring expenses, and a data-through date
- Requires explicit account and category mappings; unmapped live records are shown with the identifiers needed to configure them
- Runs a deterministic monthly, single-person retirement projection with explicit employment assumptions, registered-room pools, and named savings plans
- Shows annual cash flow, explicit savings, financial assets, residence value, liabilities, home equity, total net worth, allocation, milestones, and an annual ledger
- Explains every major summary, chart, ledger, cash-flow input, and account section with reconciled formulas, values, dates, and provenance
- Supports temporary browser overrides, per-field reset, reset all, and explicit refresh
- Exports an automatically anonymized resolved baseline, provenance, warnings, active overrides, and projection as JSON or CSV
- Runs without a database, persistence, jobs, or caching

## Requirements

- Node.js 22 or later
- npm
- A Lunch Money API v2 token
- A private planner configuration file

## Local setup

```bash
cp .env.example .env
cp config/planner.example.yaml config/planner.local.yaml
npm install
npm run dev
```

Set `LUNCHMONEY_API_TOKEN` in `.env`. Replace every placeholder in `config/planner.local.yaml`; that file is Git-ignored and must remain private. YAML is the canonical human-maintained format so opaque account and category IDs can be documented with comments. Existing JSON configuration remains supported only when `PLANNER_CONFIG_PATH` explicitly points to a `.json` file.

Open `http://localhost:3000`.

### Mapping Lunch Money records

Account keys should be source-scoped so manual and Plaid IDs cannot collide:

```text
manual:<lunch-money-account-id>
plaid:<lunch-money-account-id>
```

Numeric account keys are accepted only when that ID is unique across both account sources. Use the source-scoped form for durable configuration. Cash transactions with no associated account use the special key `cash`.

The easiest configuration workflow is:

1. Copy the example config and start the app.
2. Refresh. The blocking state lists every unmapped account ID and name.
3. Map every account to `cash`, `tfsa`, `rrsp`, `non_registered`, `debt`, or `exclude`.
4. Refresh again. The blocking state lists categories used by included accounts in the trailing window and reviewed recurring items.
5. Map each listed category to `essential`, `discretionary`, `income`, `investment_contribution`, `debt_payment`, `transfer`, or `exclude`.
6. Assign the required account roles, then replace the generic room, savings-plan, reserve, government-benefit, goal, return, allocation, tax, and pension assumptions.

Credit-card payments and internal movements must be mapped as `transfer` or `exclude`; the planner does not infer them from a payee or account name. Categories marked “exclude from totals” in Lunch Money are ignored automatically.

In the simple primary format, historical investment transfers may be classified as `transfer`; explicit savings plans drive projected deposits and no account ID is repeated in category configuration. Account-targeted contribution categories remain available only with the advanced compatibility format.

### Income and savings phases

Do not assume that today’s Lunch Money income will continue unchanged until retirement. Configure contiguous employment phases from the current age through the retirement age. `startAge` is inclusive, `endAge` is exclusive, and boundaries must align to projection months. `live_baseline` resolves to the annualized net deposited employment income in the current Lunch Money transaction window; a later salary is never inferred automatically:

```yaml
employmentIncomePhases:
  - id: current-income
    label: Current income
    startAge: 38
    endAge: 41
    annualNetCashToday: live_baseline
    annualGrowth: 0
    rrspRoom:
      eligibleEarnedIncomeToday: 100000
      pensionAdjustmentToday: 0
      otherReductionToday: 0
      annualGrowth: 0
  - id: future-income
    label: Expected future income
    startAge: 41
    endAge: 62
    annualNetCashToday: 72000
    annualGrowth: 0.02
    rrspRoom:
      eligibleEarnedIncomeToday: 110000
      pensionAdjustmentToday: 0
      otherReductionToday: 0
      annualGrowth: 0.02
```

Each simple employment phase explicitly provides RRSP-eligible earned income, pension adjustment, other reduction, and growth. Net deposited cash is separate and is never substituted for those room-generation inputs. Explicit zero is valid; omission is not.

Lifestyle spending phases are independent of employment phases. Each phase multiplies the live trailing essential and discretionary baselines, and the global inflation assumption continues to index the adjusted amounts. `1` keeps a baseline unchanged; `0.60` means 60% of that baseline, or a 40% reduction. Configured phases must continuously cover `currentAge` through `projectionEndAge`, with inclusive starts, exclusive ends, and month-aligned boundaries. Omitting `spendingPhases` preserves the historical full-projection `1 / 1` behaviour.

```yaml
savingsPolicy:
  personalInvesting:
    order: [personal_tfsa, personal_rrsp, taxable]
    phases:
    - id: current-plan
      label: Current plan
      startAge: 38
      endAge: 41
      monthlyAmountToday: 1000
      indexingRate: 0
```

Simple personal and reserve plans are cash funded. Workplace RRSP plans are income withheld. Plan phases are non-overlapping, gaps mean zero, and only configured plan amounts may be invested. The low-level account contribution format remains supported only as advanced compatibility and cannot be mixed with simple mode.

### Government benefits

CPP and OAS are resolved from explicit, dated configuration. CPP accepts an official estimate entered privately, a configured planning amount, the bundled published Canadian average for new beneficiaries at age 65, or an explicit zero. The generic average is always labelled as a reference—not a personal estimate or entitlement. OAS resolves a configured or bundled full amount separately from explicit `full`, `partial`, or `none` eligibility:

The bundled CPP reference is CAD 877.01 per month effective 2026-04-01 ([Government of Canada CPP amounts](https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html)). The bundled full OAS amount for ages 65–74 is CAD 751.97 per month effective 2026-07-01 ([Government of Canada quarterly OAS statistics](https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-july-september.html)).

```yaml
governmentBenefits:
  cpp:
    startAge: 65
    indexingRate: 0.02
    amountAt65:
      source: canadian_reference
  oas:
    startAge: 65
    indexingRate: 0.02
    fullAmountAt65:
      source: canadian_reference
    eligibility:
      mode: partial
      qualifyingResidenceYearsAfter18: 20
```

Partial OAS is the asserted qualifying residence years divided by 40; the planner does not infer eligibility or evaluate special residence rules and international agreements. CPP uses the statutory 0.6% monthly reduction before 65 and 0.7% monthly increase after 65. OAS uses the statutory 0.6% monthly delayed-claim increase and a permanent 10% increase beginning in the first modelled month after age 75. The dashboard’s CPP and OAS explanations show the dated basis, exact factors, eligibility, indexing, annual amount, caveats, and active start-age override.

Legacy CPP/OAS scalar fields remain compatibility inputs only. A complete legacy set normalizes deterministically into the concrete benefit model; legacy zero amounts remain zero and produce migration warnings. Canonical `governmentBenefits` cannot be mixed with legacy benefit fields.

For migration, replace the legacy top-level ages and amounts plus `assumptions.cppIndexing` / `assumptions.oasIndexing` with one canonical block. A non-zero legacy CPP amount becomes `amountAt65.source: configured_amount` with the same amount and an explicit effective date; a non-zero legacy OAS amount becomes `fullAmountAt65.source: configured_amount`, with eligibility stated separately. Use `explicit_zero` for intentional zero CPP and `eligibility.mode: none` for intentional zero OAS. Do not copy statement filenames, account numbers, document IDs, or identifying descriptions into the configuration.

### Account roles and simple savings policy

The primary configuration assigns account types and roles under `accountMappings`. Included accounts receive roles for operating cash, reserve membership and refill, personal TFSA, personal RRSP, workplace RRSP, optionally personal taxable, and optionally an imported primary residence. Roles are unique where required, type checked, and rejected on excluded accounts. Personal and workplace RRSP roles must be different accounts. The only simple account reference outside those keys is the exact source account in an optional liability payment matcher.

`savingsPolicy` contains named personal, reserve-building, and workplace plans without account IDs or route arrays. Workplace RRSP runs first, consumes the one global RRSP room pool, and leaves any overflow visibly unallocated. Personal cash then follows TFSA → personal RRSP → taxable and never enters the workplace RRSP. Reserve-building savings remain in the refill account until the indexed combined reserve target is reached; any crossing amount follows the personal order in the same month. Only these explicit plans are planned investments. The explicit unplanned-cash policy either retains remaining positive cash in operating cash or tops up the indexed operating and combined reserve targets before sweeping true excess through the personal order.

When no included account has `personal_taxable`, the compiler creates a deterministic projection-only non-registered destination. It inherits the configured non-registered return and allocation, derives the next withdrawal priority, has no independent contribution phase, and opens at exactly zero. A later imported `personal_taxable` role replaces it without changing the policy. Projection-only accounts remain distinct from imported Lunch Money balances everywhere.

### Residence, liabilities, and net worth

The preferred residence source is an included Lunch Money manual asset mapped as `type: real_estate` with the unique `primary_residence` role. Its imported balance and balance date become the opening value and valuation date, while `annualAppreciation` remains an explicit planning assumption. The top-level `primaryResidence` block remains a fallback for a home not represented in Lunch Money; the imported and fallback forms cannot be combined. A linked debt mapping uses the `primary_mortgage` role plus either an amortizing schedule or an explicit payoff-at-projection-start treatment. A mortgage-free residence needs no linked liability. Financial accounts contain only cash and investments; imported residences and debts resolve once into non-financial assets and liabilities.

Amortizing schedules retain the entered payment amount and frequency, convert it to a monthly equivalent, split each payment between interest and principal, apply dated lump sums, reduce the last payment to the exact amount due, and stop at payoff. Enter the annual rate printed by the lender and select the convention stated in the agreement: standard Canadian mortgages normally use a nominal annual rate compounded semi-annually, while `effective_annual` is available for agreements that explicitly quote an effective annual rate. The schedule effective date must be on or before projection start; the imported opening balance remains authoritative and historical principal is not replayed.

Required liability payments are funded from current-month cash and then the established withdrawal order before ordinary spending and cash-funded saving. The liability schedule is committed only after its full required payment is funded. The full funded payment leaves financial assets. Interest is consumption; principal reduces financial assets and the liability together, so principal has no direct net-worth effect. Impossible or post-payoff lump sums fail instead of disappearing silently. Rate renewals, refinancing, future debt origination, and property sales are not modelled.

The primary example removes debt return, allocation, and withdrawal-priority fields because liabilities are not investments. Legacy zero return, all-zero allocation, and debt priority values are accepted only as ignored migration compatibility; non-zero debt return/allocation and every untreated positive debt are rejected.

When mortgage payments share a broad spending category, configure `historicalPayment.mode: payee_and_source_account` on the amortizing liability. A transaction matches only the exact included source account, a debit/outflow direction, and the exact payee after trimming, case-folding, and collapsing whitespace. Amount, date, cadence, substring, and fuzzy matching are never selectors. Matching runs before categories, so the mortgage evidence is removed while unrelated transactions in the same category remain ordinary spending. A reviewed recurring mortgage item matching the same exact pair is also prevented from reintroducing the payment.

A dedicated `debt_payment` category remains supported, as does an explicit assertion that payments are already excluded or transfers. Exactly one of these three handling sources is required for a positive amortizing liability. Historical evidence is retained for comparison, while the configured schedule supplies future payments exactly once. A material difference between the historical monthly evidence and the configured monthly equivalent produces a warning. Raw matcher payees and source-account references do not cross the projection or export boundary.

The report keeps two distinct measures:

```text
retirement funding assets = cash + TFSA + RRSP/RRIF + non-registered investments
total net worth = financial assets + non-financial assets - liabilities
```

Home equity is residence value less its linked mortgage. It contributes to total net worth but is not available for retirement withdrawals and cannot extend depletion age without a future explicit sale or conversion capability.

### Simplified registered room

`registeredRoom` asks only for user-supplied TFSA and RRSP room available at projection start plus required effective dates. These values are remaining contribution room—not account balances, annual limits, or lifetime contributions. For February–December projection starts, RRSP `currentYearBeforePlanStart` provides eligible earned income, pension adjustment, and other reduction accumulated since January 1. January starts may omit that block; its internal values are then zero. Room is never inferred from balances, transactions, account age, or net deposited employment cash.

The compiler adds statutory carry-forward, TFSA next-calendar-year withdrawal restoration, dated Canadian references, and deterministic forecast mechanics as internal resolved assumptions with provenance. New room is first added at the next January boundary. Each January’s RRSP addition is `min(18% × prior-year eligible earned income, annual cap) − pension adjustment − other reduction`, floored at zero. Published limits remain distinct from forecasts.

References: [CRA TFSA room and annual limits](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html), [CRA TFSA withdrawal restoration](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/how.html), [published RRSP dollar limits](https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html), and [CRA RRSP deduction-limit formula](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html).

### Compiler boundary and advanced compatibility

The configuration loader accepts either the simple owner format or the existing detailed format. It rejects any mixture with one clear error. Simple roles, room, employment RRSP assumptions, and savings plans compile once at the baseline boundary into the existing typed `projectionAccounts`, `registeredAccountRoom`, `contributionWaterfall`, `surplusAllocation`, and account contribution inputs. Those resolved inputs remain authoritative; React does not calculate routes.

Advanced compatibility retains explicit `projectionAccounts`, `registeredAccountRoom`, `contributionWaterfall`, `surplusAllocation`, account-level contribution phases, account-targeted contribution categories and events, and starting-room source unions. Advanced mode preserves its existing sweep behavior. It is intentionally absent from the primary example.

## Refresh and reset behavior

The baseline endpoint fetches Lunch Money again on every request. The dashboard’s refresh action rebuilds the baseline and clears all browser overrides. Resetting a field or using Reset all restores values from the most recently refreshed baseline, never compiled constants.

## Calculation explanations

Major report headings include a short accessible information tooltip and an `Explain` control. Tooltips describe what a result means in one or two sentences. `Explain` opens a keyboard-accessible drawer containing the formula or calculation steps, exact displayed values, source badges, dates, active assumptions, caveats, and the data behind charts.

Explanations are deterministic documents built from the same current baseline, active projection inputs, temporary overrides, projection result, dollar mode, and selected allocation year as the visible report. A reconciliation message appears only when the builder’s arithmetic matches the displayed value. Changing or resetting a calculator override, switching Today’s/Future dollars, or changing the allocation year updates the open explanation immediately.

Registered-room ledgers are always labelled and displayed in nominal regulatory dollars. The general Today’s/Future dollar toggle continues to convert ordinary cash flows and balances but does not deflate TFSA or RRSP room, limits, caps, adjustments, reductions, or room-consuming deposits. The savings explanation shows the resolved policy preview, explicit plan amounts, reserve retention and redirect, workplace overflow, unplanned retained cash, per-account deposits, and all reconciliation equations.

The exact `retirementSnapshot` keeps end-of-final-working-month balances and allocation. Its flow fields describe only that final working month, identified by `flowPeriod`; cumulative activity from today through retirement belongs to `financialAssetsBridge`.

Baseline schema `1.8` includes aggregate cash-flow and debt-payment audit evidence, typed imported non-financial-asset balances, distinct financial accounts, non-financial assets and liabilities, simple/advanced mode, resolved employment, savings, and lifestyle-spending phases, concrete CPP/OAS inputs, registered room, routing, and field-level provenance. It contains category/account names and reconciled aggregates—not raw transactions, transaction IDs, raw liability matcher text, credentials, tokens, or private statement metadata.

The Retirement funding assets explanation uses the exact end-of-final-working-month snapshot and the financial-assets bridge. Separate total-net-worth and liability-schedule explanations show the three-part balance sheet, residence appreciation, interest/principal split, historical-payment replacement, payoff boundary, and a cent-stable net-worth bridge. Cash-funded contributions and principal repayment are internal balance-sheet movements; only interest is consumption. Success labels appear only when the shared result reconciles within one cent.

Covered targets are the summary cards, main charts including annual explicit savings/retained cash and registered room, annual ledger, cash-flow provenance rows, imported and projection-only account sections, the resolved savings policy, registered contribution routing, and concrete CPP and OAS benefit calculations.

## API

```http
GET  /api/v1/health
GET  /api/v1/lunchmoney/status
GET  /api/v1/baseline/current
POST /api/v1/projections
POST /api/v1/exports/projection
POST /api/v1/exports/projection-csv
```

`GET /api/v1/health` reports whether the token and planner file are configured. It deliberately reports Lunch Money as `not_checked` until a read request succeeds.

`GET /api/v1/lunchmoney/status` validates the token with a read-only categories request and returns a sanitized result.

`GET /api/v1/baseline/current` returns schema `1.8` projection inputs, simple/advanced mode, role/compiler, phase, benefit, financial-account, imported non-financial-asset, liability, savings-policy, registered-room, and waterfall provenance; derived values; cash-flow and debt-payment audit evidence; warnings; and mapping details.

Projection requests use this shape:

```json
{
  "inputs": {}
}
```

Export requests use the current baseline response, active inputs, and browser overrides:

```json
{
  "baseline": {},
  "inputs": {},
  "overrides": {}
}
```

Every normal JSON and CSV export is automatically anonymized; there is no raw or private export mode. Financial amounts, dates, account types and origins, assumptions, CPP/OAS and savings calculation summaries, sanitized policy preview, public Canadian reference metadata, the exact retirement snapshot, and both accumulation bridges remain available for analysis. Imported and projection-only account IDs, role and policy references, account and institution labels, employer, category, event, recurring-expense, warning, and employment/contribution/savings-phase text are replaced with stable generic aliases based only on record type and order.

Schema `9.0` JSON is the complete analysis document and uses a typed allowlist with export-local aliases; it never recursively copies source objects. JSON retains typed non-financial assets, liabilities and schedules, debt-payment evidence, lifestyle-spending phases, balance sheets, financial-assets and net-worth bridges, room ledgers, routes, and policy results with sanitized references. The flat CSV keeps one row per annual period with scalar balance-sheet, liability-flow, explicit-plan, unplanned-cash, room, contribution, and deterministic per-account fields. It never embeds schedules, role lists, route arrays, phase arrays, maps, JSON, or delimited lists in cells. Both formats remain automatically anonymized.

## Docker Compose

Create the private files before starting Compose:

```bash
cp .env.example .env
cp config/planner.example.yaml config/planner.local.yaml
docker compose up --build
```

Compose starts one planner container, passes the token through the environment, and mounts `config/planner.local.yaml` read-only at `/app/config/planner.local.yaml`. The mount retains the Fedora-compatible `:ro,Z` SELinux option. PostgreSQL is not used.

## Validation

```bash
npm run typecheck
npm test
npm run lint
npm run build
docker build -t lunchmoney-retirement-planner .
```

Tests use synthetic fixtures under `tests/`. Production modules do not import them.

## Security and data handling

- The Lunch Money token remains server-side.
- The token is never logged, returned by an API, or included in an export.
- JSON and CSV exports use deterministic export-local aliases and exclude all source-system IDs and user-controlled free text before serialization.
- The application-facing Lunch Money service exposes retrieval methods only.
- `config/planner.local.yaml`, `config/planner.local.yml`, `config/planner.local.json`, `.env`, and the private config in the Docker build context are ignored.
- No baseline, scenario, transaction, or account data is persisted by the application.

## Projection scope

Lunch Money income transactions are modelled as net deposited employment cash and are not taxed again. Each working month selects one resolved employment phase; growth is phase-local and employment becomes zero after the exact retirement boundary. Each investment account independently selects its active contribution phase and stops contributing at retirement. The simplified effective tax rate applies to gross retirement income and taxable RRSP/RRIF withdrawals; it is not a tax filing model. The projection calendar starts in the baseline data-through month, so the first and last annual rows may be partial calendar years. CPP/OAS claim timing, explicit OAS eligibility, and the OAS age-75 increase are deterministic; CPP entitlement is not calculated from contribution history. RRIF conversion is a milestone; statutory minimum withdrawals are not enforced. Monte Carlo simulation, optimized withdrawals, real estate, households, saved scenarios, background synchronization, and server-generated PDFs are outside the MVP.

See [docs/architecture.md](docs/architecture.md) and [docs/report-model.md](docs/report-model.md) for implementation details.

## Published container image

Pushes to `main` and manual workflow runs publish:

- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest`
- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:<short-commit-sha>`

## License

MIT
