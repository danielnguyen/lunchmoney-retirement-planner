# Lunch Money Retirement Planner

A self-hosted, single-person retirement projection built from current Lunch Money balances and trailing transaction data.

The end-to-end MVP is defined in [plan/README.md](plan/README.md). The runtime never substitutes demonstration data. If the Lunch Money token, private configuration, or required mappings are missing, the dashboard shows a blocking error and no charts.

## What the MVP does

- Connects to Lunch Money API v2 with retrieval methods only
- Fetches manual accounts, Plaid accounts, categories, recurring items, and paginated trailing transactions on demand
- Derives account balances, net deposited employment cash, essential and discretionary spending, investment contributions, recurring expenses, and a data-through date
- Requires explicit account and category mappings; unmapped live records are shown with the identifiers needed to configure them
- Runs a deterministic monthly, single-person retirement projection with explicit employment-income phases, account-contribution phases, and surplus allocation
- Shows annual spending, cash inflow, cash outflow, surplus allocation, account-level financial assets, allocation, milestones, and an annual ledger
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
5. Map each listed category to `essential`, `discretionary`, `income`, `investment_contribution`, `transfer`, or `exclude`.
6. Replace the generic ages, government-benefit sources, surplus policy, projection-only accounts, goal, returns, allocation, tax, pension, and milestone assumptions.

Credit-card payments and internal movements must be mapped as `transfer` or `exclude`; the planner does not infer them from a payee or account name. Categories marked “exclude from totals” in Lunch Money are ignored automatically.

An investment-contribution category can identify its target account and transaction direction:

```yaml
"replace-with-contribution-category-id": # Registered investment deposit
  classification: investment_contribution
  contributionAccountId: "plaid:replace-with-investment-account-id"
  contributionDirection: debit
```

### Income and contribution phases

Do not assume that today’s Lunch Money income will continue unchanged until retirement. Configure contiguous employment phases from the current age through the retirement age. `startAge` is inclusive, `endAge` is exclusive, and boundaries must align to projection months. `live_baseline` resolves to the annualized net deposited employment income in the current Lunch Money transaction window; a later salary is never inferred automatically:

```yaml
employmentIncomePhases:
  - id: current-income
    label: Current income
    startAge: 38
    endAge: 41
    annualNetCashToday: live_baseline
    annualGrowth: 0
  - id: future-income
    label: Expected future income
    startAge: 41
    endAge: 62
    annualNetCashToday: 72000
    annualGrowth: 0.02
```

Investment accounts may define non-overlapping contribution phases. Gaps mean zero contribution. Funding and indexing belong to each phase, allowing a workplace contribution to end and another saving pattern to begin at the same career transition:

```yaml
"manual:replace-with-investment-account-id": # Synthetic retirement account
  include: true
  type: rrsp
  withdrawalPriority: 2
  contributionPhases:
    - id: current-plan
      label: Current plan
      startAge: 38
      endAge: 41
      monthlyAmountToday: live_baseline
      funding: income_withheld
      indexingRate: 0
    - id: later-saving
      label: Later saving
      startAge: 41
      endAge: 62
      monthlyAmountToday: 500
      funding: cash
      indexingRate: 0.02
```

Within explicit `contributionPhases`, `live_baseline` resolves only from mapped Lunch Money contribution transactions for that account. Explicit phases cannot be combined with legacy account-level `monthlyContribution` or `contributionFunding` fields.

Every contribution increases its target investment balance. Only cash-funded contributions reduce available cash. Income-withheld contributions are external additions that were withheld before the net employment deposit reached Lunch Money.

Existing employment and contribution scalar fields remain compatibility inputs after the required surplus policy is added. Without employment phases, the runtime normalizes current Lunch Money income plus `assumptions.incomeGrowth` into one phase through retirement. When `contributionPhases` are omitted, a positive account-level `monthlyContribution`, `contributionFunding`, and `assumptions.contributionIndexing` become one compatibility phase. These scalar fields are migration inputs, not an alternate source for an explicit phase. A current-income fallback or explicit `live_baseline` phase longer than five years produces a visible warning while its active amount still matches the refreshed Lunch Money baseline.

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

### Surplus allocation and projection-only accounts

`surplusAllocation` is required. There is no compatibility default and no first-cash-account fallback. The policy names the explicit cash accounts whose combined balance counts toward the reserve, the one member account that receives refills and retained excess, a target reserve in today’s dollars, its indexing rate, and either `retain_as_cash`, an explicit non-registered destination, or the room-constrained contribution waterfall.

Optional `projectionAccounts` are explicit planner accounts appended after imported accounts. Their IDs begin with `projection:`, their opening balance is fixed at zero, and their label, type, return, withdrawal priority, allocation, and contribution phases are all configured. They participate in projection returns, contributions, withdrawals, charts, explanations, and exports, but never appear as imported Lunch Money balances.

Each positive month compares the indexed target with the combined current balance of all configured reserve accounts. Any shortfall is deposited into the explicit refill account; remaining excess stays in that account or moves to the configured non-registered account. A targeted event inflow deposits only its own amount into its target; unrelated employment cash and untargeted inflows continue through the surplus policy. Routing is an internal allocation of external net cash, so it does not add a bridge term or change total financial assets at the allocation moment. Account-specific returns can change future assets after routing.

### Registered-account room and contribution waterfall

The planner uses one global TFSA room pool across every TFSA account and one global RRSP deduction-room pool across every RRSP/RRIF account. Starting room is an explicit owner-supplied `official_estimate`, `configured_amount`, or `explicit_zero`; it is never inferred from account balances, transaction history, account age, net deposited income, or bundled Canadian limits. Starting room already represents the partial projection-start calendar year, so new room is first added at the following January boundary.

The bundled TFSA limit is CAD 7,000 for 2026. Later TFSA limits are deterministic forecasts using configured indexing and rounding until a published reference is added. TFSA withdrawals restore room only at the next January boundary. RRSP room uses explicit eligible earned income attached to each employment phase—never Lunch Money net deposited cash—plus explicit pre-projection start-year totals. Those nested inputs are required whenever RRSP/RRIF is reachable through a source route, overflow route, or the active surplus waterfall; omission never silently means zero. January projection starts require all pre-start totals to be zero because there are no earlier months in that calendar year. Each January adds `min(18% × prior-year eligible earned income, annual cap) − pension adjustment − other room reduction`, floored at zero. Published RRSP caps are CAD 33,810 for 2026 and CAD 35,390 for 2027; later caps are labelled configured forecasts.

References: [CRA TFSA room and annual limits](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html), [CRA TFSA withdrawal restoration](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/how.html), [published RRSP dollar limits](https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html), and [CRA RRSP deduction-limit formula](https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/rrsps-related-plans/contributing-a-rrsp-prpp/contributions-affect-your-rrsp-prpp-deduction-limit.html).

`contributionWaterfall.routes` preserve each contribution phase’s source and funding type. Route order is priority, the source account is first, registered destinations consume shared room immediately, and a final non-registered destination may accept overflow. Planned-route allowed deposits and surplus-funded deposits remain distinct; total actual deposits include both. Every surplus-funded investment deposit is cash funded and appears once in contribution outflow reporting without becoming a bridge expense. Cash-funded unallocated amounts remain in monthly cash; income-withheld unallocated amounts enter neither cash nor financial assets. If the canonical waterfall is omitted, each source receives a visible fixed-source compatibility route and registered overflow remains unallocated. Positive registered contributions without a room model are blocked.

Surplus mode `allocate_through_contribution_waterfall` refills the cash reserve first, then uses the configured destination order. Planned contributions consume room before surplus; surplus that cannot be invested is retained in the reserve refill account. Direct targeted inflows into TFSA or RRSP/RRIF are rejected because room-free registered transfers are not modelled.

## Refresh and reset behavior

The baseline endpoint fetches Lunch Money again on every request. The dashboard’s refresh action rebuilds the baseline and clears all browser overrides. Resetting a field or using Reset all restores values from the most recently refreshed baseline, never compiled constants.

## Calculation explanations

Major report headings include a short accessible information tooltip and an `Explain` control. Tooltips describe what a result means in one or two sentences. `Explain` opens a keyboard-accessible drawer containing the formula or calculation steps, exact displayed values, source badges, dates, active assumptions, caveats, and the data behind charts.

Explanations are deterministic documents built from the same current baseline, active projection inputs, temporary overrides, projection result, dollar mode, and selected allocation year as the visible report. A reconciliation message appears only when the builder’s arithmetic matches the displayed value. Changing or resetting a calculator override, switching Today’s/Future dollars, or changing the allocation year updates the open explanation immediately.

Registered-room ledgers are always labelled and displayed in nominal regulatory dollars. The general Today’s/Future dollar toggle continues to convert ordinary cash flows and balances but does not deflate TFSA or RRSP room, limits, caps, adjustments, reductions, or room-consuming deposits.

The exact `retirementSnapshot` keeps end-of-final-working-month balances and allocation. Its flow fields describe only that final working month, identified by `flowPeriod`; cumulative activity from today through retirement belongs to `financialAssetsBridge`.

Baseline schema `1.5` includes aggregate cash-flow audit evidence, resolved employment and contribution phases, concrete CPP/OAS inputs, projection-only accounts, the surplus policy, registered room, waterfall routing, and field-level provenance. It contains category/account names and reconciled aggregates—not raw transactions, transaction IDs, credentials, tokens, or private statement metadata.

The Assets at retirement explanation uses the exact end-of-final-working-month snapshot. It shows both the account-type sum and a today-dollar accumulation bridge from starting financial assets through income, public benefits, income-withheld contributions, returns, spending, events, and taxes. Cash-funded contributions are internal transfers and do not change the bridge total. A success label appears only when the bridge and displayed card value agree within one cent.

Covered targets are the summary cards, main charts including annual surplus allocation and registered room, annual ledger, cash-flow provenance rows, imported and projection-only account sections, surplus policy, registered contribution routing, and concrete CPP and OAS benefit calculations.

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

`GET /api/v1/baseline/current` returns schema `1.5` projection inputs, phase, government-benefit, projection-account, surplus-policy, registered-room, and waterfall provenance, derived values, aggregate cash-flow audit evidence, transaction window, records analysed, warnings, and mapping details.

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

Every normal JSON and CSV export is automatically anonymized; there is no raw or private export mode. Financial amounts, dates, account types and origins, assumptions, CPP/OAS and surplus calculation summaries, public Canadian reference metadata, the exact retirement snapshot, and both accumulation bridges remain available for analysis. Imported and projection-only account IDs, policy references, account and institution labels, employer, category, event, recurring-expense, warning, and employment/contribution-phase text are replaced with stable generic aliases based only on record type and order.

Schema `7.0` JSON is the complete analysis document and uses a typed allowlist with export-local aliases; it never recursively copies source objects. JSON retains typed room ledgers and route arrays containing only sanitized aliases. The flat CSV keeps one row per annual period with scalar TFSA/RRSP room and contribution fields plus deterministic per-account planned, actual, redirected, surplus-funded, reserve-membership, balance, and surplus-allocation columns. It never embeds route arrays, phase arrays, maps, JSON, or delimited lists in cells. Both formats remain automatically anonymized.

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
