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

### Editing planner YAML in the dashboard

**Scenario controls** is the dashboard's single planner-configuration entry point. It opens the guided temporary controls by default. Select **Edit YAML** in that same drawer to load and review the advanced persistent configuration, then use **Back to scenario controls** to return without discarding either the YAML draft or temporary scenario overrides. Switching views never validates, reverts, applies, or saves automatically.

In the YAML view, **Validate** parses the editor text and runs the complete planner configuration validator without changing the file. **Revert changes** always reloads the latest contents from disk, including edits made outside the dashboard. If the live baseline cannot be built, **Repair planner config** opens this same drawer directly in YAML view; the guided controls remain unavailable until repair and baseline reload succeed.

Saving is disabled by default. To enable the explicit **Save config** action for local development, set this in `.env` and restart the application:

```text
PLANNER_CONFIG_WRITE_ENABLED=true
```

A save validates first, prepares complete temporary config and backup files, then checks the active file version again immediately before either replacement. A detected conflict returns 409, cleans up both temporary files, and changes neither the active file nor its existing backup. After that final check succeeds, the prior active text replaces `planner.local.yaml.bak` before the submitted YAML atomically replaces the active file. If backup replacement fails, the active file is not replaced; if active replacement subsequently fails, the backup retains the prior active text for recovery. Comments and formatting are preserved. Use **Revert changes** to load an externally edited version before saving again.

After a successful save, the dashboard reloads the active baseline and projection and clears temporary scenario overrides. If live baseline derivation fails after the file save, the old projection is removed, the dashboard enters its blocking state, and the unified configuration drawer stays open in YAML view so the configuration can be repaired.

### Applying a scenario to the YAML draft

Scenario controls still change only the current browser projection. Each control shows its temporary scenario value, its refreshed baseline value, and a human-readable source such as `planner.local.yaml`, a Canadian reference, or a live Lunch Money baseline.

**Apply scenario to config** is a deliberate draft operation. It validates the current YAML editor text, previews every active override against an explicit application-owned persistence classification, and patches supported scalar values into that in-browser draft. It never calls the save endpoint and remains available when config writes are disabled. **Save config** is still the only disk-write action.

The draft operation preserves comments, key order, quoted mapping keys, unrelated whitespace, and existing unsaved manual edits. Numeric replacements are canonical decimal text: ordinary percentage-point input such as `5.8` becomes `0.058` in YAML without binary floating-point tails, while meaningful precision and currency cents remain intact. The guided percentage inputs likewise remove meaningless display tails without changing their numeric domain values. View switching and closing and reopening the drawer retain the YAML draft and temporary scenario state; **Revert changes** intentionally replaces only the YAML draft with the latest file from disk.

Preview and apply resolve every destination against the YAML draft's current mode and structure, not merely the loaded baseline. A missing optional block, changed phase/account/liability identity, incompatible configured source, or simple/advanced mode mismatch is shown as scenario-only with a reason instead of failing later during an otherwise predictable patch. The review separates the active resolved baseline, each scalar's actual current YAML value or `live_baseline` source, and the proposed scenario value. Multi-scalar assumptions list every application-owned destination separately. After application, the summary is labelled as the last scenario application; if the YAML is then edited manually, a notice identifies the draft itself as the source of truth. Another successful application refreshes that summary, while Revert or a successful save/reload clears it.

Direct bindings cover exact scalar assumptions whose destination is unambiguous in the active simple or advanced configuration: projection and benefit ages; the minimum terminal financial-assets balance; inflation and account returns; operating and reserve targets/indexing; configured TFSA/RRSP starting room; employment amounts, growth, and RRSP-room inputs; personal, workplace, and reserve-building contribution phases; configured residence value/appreciation; and liability rates/payments. Phase, account, and liability destinations resolve through stable configured IDs or roles, never browser-supplied YAML paths or display order.

If an employment or contribution value currently uses `live_baseline` in the YAML draft, applying opens one accessible review dialog. The dialog shows the sentinel, the active resolved baseline, and the proposed fixed value. **Cancel** changes nothing. **Keep live baseline** applies ordinary values but leaves live-derived fields and their scenario overrides temporary. **Replace with fixed values** changes those YAML scalars to fixed numbers and warns that future Lunch Money changes will no longer update them automatically.

Absolute essential/discretionary spending remains scenario-only because YAML controls lifestyle through spending-phase multipliers rather than a fixed imported baseline. An imported Lunch Money residence balance is also scenario-only; only its configured appreciation assumption is directly bindable. Any other value without one deterministic destination is skipped with a reason rather than written to a generic override block.

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

### Retirement funding requirement

The dashboard distinguishes projected financial assets at retirement, the independently derived requirement, and the resulting funding margin or shortfall. `retirementGoal` remains your own round-number marker and is never used as a solver input. Configure the today-dollar terminal criterion separately:

```yaml
retirementRequirement:
  minimumEndingFinancialAssetsToday: 0
```

The solver tests integer cents at the exact end of the final working month and finds the lowest amount that funds the configured retirement spending, benefits, liabilities, one-time outflows, withdrawals, returns, tax compatibility model, and surplus rules through `projectionEndAge`, while leaving at least the configured terminal balance. It uses the same monthly engine as the ordinary projection and verifies that one cent less fails. Existing configurations that omit the block receive a visible backward-compatible zero-dollar terminal minimum; this is not described as an owner-configured value.

Candidate totals are distributed across cash, TFSA, RRSP/RRIF, and non-registered accounts using their exact projected retirement-boundary weights. Account type, return, withdrawal priority, allocation, and identity are preserved, with any residual cent assigned deterministically. Residence value, other non-financial assets, home equity, and liabilities are excluded from the funding composition. If the projected financial accounts cannot provide a valid positive composition, the requirement is shown as unavailable instead of inventing weights.

The requirement uses the active tax mode. It remains provisional in Canadian annual mode because statutory RRIF minimum withdrawals and non-registered investment-income taxation are not included yet.

### Annual Canadian retirement tax

Existing configurations continue to use `flat_compatibility` unless they explicitly opt into the annual Canada/Ontario model. Canadian mode uses dated official 2026 federal and Ontario brackets, credits, surtax, health-premium, and OAS-recovery references. Future indexed reference amounts use a distinct configured forecast rate; fixed statutory values and rates remain fixed.

```yaml
tax:
  mode: canadian_annual
  province: ON
  referenceYear: 2026
  futureIndexingRate: 0.02
  pensionIncomeCreditEligible: true
  openingTaxYearBeforeProjectionMonth:
    calendarYear: 2026
    throughMonth: 6
    income:
      employment: 55000
      cpp: 0
      oas: 0
      pension: 0
      rrspWithdrawals: 0
      rrifWithdrawals: 0
      otherTaxableIncome: 0
```

Each employment phase has three deliberately separate amounts: `annualNetCashToday` enters the budget as already-net deposited cash; `annualTaxableEmploymentIncomeToday` establishes annual bracket and credit context without adding cash; and `rrspRoom.eligibleEarnedIncomeToday` generates future RRSP room without determining tax. Canadian mode requires taxable employment explicitly. Configured pension income receives the pension-income credit only when `pensionIncomeCreditEligible` is explicitly true; CPP, OAS, and ordinary RRSP withdrawals are not treated as eligible pension income.

For a mid-year projection start, opening context is required through the preceding month. It affects the annual brackets but is neither deposited nor taxed again inside the projection. Each modelled month recognizes the cumulative annual federal/Ontario liability beyond tax already embedded in opening and net-employment income. If later embedded employment context reprices that cumulative amount downward, the ledger records the signed tax adjustment explicitly while the cumulative funded liability remains non-negative. OAS recovery uses supported annual income rather than a monthly proxy. Taxable RRSP cash needs use a bounded integer-cent search for the lowest gross withdrawal whose incremental-tax-adjusted proceeds pass; cash and TFSA withdrawals remain tax free, while non-registered investment-income tax is explicitly deferred.

The annual tax result is a deterministic planning estimate rather than full tax-return preparation. It does not model RRIF conversion/minimum withdrawals, non-registered interest/dividend/capital-gain tax, arbitrary deductions, or refundable credits. Partial years use full annual credit amounts and are labelled partial estimates. Official reference provenance is included in the shared result and exports.

Statutory calculations retain raw nominal precision and round the aggregate annual liability once; any presentation-cent residual is assigned deterministically to Ontario net tax so the displayed components still reconcile. The 2026 OAS recovery threshold is identified as an official published estimate rather than a final amount. Primary references: [CRA 2026 federal/Ontario payroll tables](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html), [CRA payroll formulas](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4127-payroll-deductions-formulas/t4127-jul/t4127-jul-payroll-deductions-formulas.html), [federal TD1 credits](https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1.html), [Ontario TD1 credits](https://www.canada.ca/en/revenue-agency/services/forms-publications/td1-personal-tax-credits-returns/td1-forms-pay-received-on-january-1-later/td1on.html), and [OAS recovery tax](https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/recovery-tax.html).

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

The baseline endpoint fetches Lunch Money again on every request. The dashboard’s refresh action rebuilds the baseline and clears all browser overrides. Resetting a field or using Reset all restores values from the most recently refreshed baseline, never compiled constants. Non-age numeric controls retain character-by-character draft text locally: only complete, finite, in-range values update projection inputs, and percentage points convert to decimal domain rates only at that commit boundary. Empty, transitional, invalid, and out-of-range drafts leave the current scenario value unchanged, expose accessible validation feedback, and restore that value on blur when still invalid.

## Calculation explanations

Major report headings include a short accessible information tooltip and an `Explain` control. Tooltips describe what a result means in one or two sentences. `Explain` opens a keyboard-accessible drawer containing the formula or calculation steps, exact displayed values, source badges, dates, active assumptions, caveats, and the data behind charts.

Explanations are deterministic documents built from the same current baseline, active projection inputs, temporary overrides, projection result, dollar mode, and selected allocation year as the visible report. A reconciliation message appears only when the builder’s arithmetic matches the displayed value. Changing or resetting a calculator override, switching Today’s/Future dollars, or changing the allocation year updates the open explanation immediately.

Registered-room ledgers are always labelled and displayed in nominal regulatory dollars. The general Today’s/Future dollar toggle continues to convert ordinary cash flows and balances but does not deflate TFSA or RRSP room, limits, caps, adjustments, reductions, or room-consuming deposits. The savings explanation shows the resolved policy preview, explicit plan amounts, reserve retention and redirect, workplace overflow, unplanned retained cash, per-account deposits, and all reconciliation equations.

The exact `retirementSnapshot` keeps end-of-final-working-month balances and allocation. Its flow fields describe only that final working month, identified by `flowPeriod`; cumulative activity from today through retirement belongs to `financialAssetsBridge`.

Baseline schema `3.0` includes aggregate cash-flow and debt-payment audit evidence, typed imported non-financial-asset balances, distinct financial accounts, non-financial assets and liabilities, simple/advanced mode, the resolved terminal-balance criterion and compatibility source, resolved tax mode and opening-year context, resolved employment, savings, and lifestyle-spending phases, concrete CPP/OAS inputs, registered room, routing, and field-level provenance. It contains category/account names and reconciled aggregates—not raw transactions, transaction IDs, raw liability matcher text, credentials, tokens, or private statement metadata.

The Retirement funding assets explanation uses the exact end-of-final-working-month snapshot and the financial-assets bridge. Separate total-net-worth and liability-schedule explanations show the three-part balance sheet, residence appreciation, interest/principal split, historical-payment replacement, payoff boundary, and a cent-stable net-worth bridge. Cash-funded contributions and principal repayment are internal balance-sheet movements; only interest is consumption. Success labels appear only when the shared result reconciles within one cent.

Covered targets are the summary cards, main charts including annual explicit savings/retained cash and registered room, annual ledger, cash-flow provenance rows, imported and projection-only account sections, the resolved savings policy, registered contribution routing, and concrete CPP and OAS benefit calculations.

## API

```http
GET  /api/v1/health
GET  /api/v1/lunchmoney/status
GET  /api/v1/baseline/current
GET  /api/v1/config/current
POST /api/v1/config/current
PUT  /api/v1/config/current
POST /api/v1/config/current/scenario-draft
POST /api/v1/projections
POST /api/v1/exports/projection
POST /api/v1/exports/projection-csv
```

`GET /api/v1/health` reports whether the token and planner file are configured. It deliberately reports Lunch Money as `not_checked` until a read request succeeds.

`GET /api/v1/lunchmoney/status` validates the token with a read-only categories request and returns a sanitized result.

`GET /api/v1/baseline/current` returns schema `3.0` projection inputs, simple/advanced mode, terminal-balance and tax provenance, role/compiler, phase, benefit, financial-account, imported non-financial-asset, liability, savings-policy, registered-room, and waterfall provenance; derived values; cash-flow and debt-payment audit evidence; warnings; and mapping details.

The current-config API is dynamic and uncached. `GET` returns only the active YAML text, a display-safe filename, write capability, and a content hash. `POST` validates submitted YAML without saving. `PUT` is available only when `PLANNER_CONFIG_WRITE_ENABLED=true`; it accepts YAML and the expected content hash, never a browser-supplied path.

`POST /api/v1/config/current/scenario-draft` is also dynamic and uncached. It compares the supplied content version with the active file, validates the supplied YAML and resolved projection baseline, rejects unknown/out-of-range overrides and unexpected request fields, and derives all editable scalar destinations from the shared server-owned control inventory. Preview returns direct, live-conversion, and scenario-only classifications without changing its input. Apply returns patched YAML text only; it does not read a caller-selected path or write any file.

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

Schema `11.0` JSON is the complete analysis document and uses a typed allowlist with export-local aliases; it never recursively copies source objects. JSON retains typed non-financial assets, liabilities and schedules, debt-payment evidence, lifestyle-spending phases, balance sheets, financial-assets and net-worth bridges, the retirement requirement and anonymized account composition, annual tax evidence, room ledgers, routes, and policy results with sanitized references. The flat CSV keeps one row per annual period with stable scalar requirement, tax, composition, balance-sheet, liability-flow, explicit-plan, unplanned-cash, room, contribution, and deterministic per-account fields. It never embeds schedules, role lists, route arrays, phase arrays, maps, JSON, or delimited lists in cells. Both formats remain automatically anonymized.

## Docker Compose

Create the private files before starting Compose:

```bash
cp .env.example .env
cp config/planner.example.yaml config/planner.local.yaml
docker compose up --build
```

Compose starts one planner container, passes the token and explicit write flag through the environment, and mounts the local `config` directory at `/app/config` with the Fedora-compatible `:rw,Z` SELinux option. The directory mount is required because atomic save replaces the file with a completed temporary file and writes the adjacent backup. Ensure the local `config` directory and planner file are writable by the container user before enabling saves. Application writes still remain disabled unless `PLANNER_CONFIG_WRITE_ENABLED=true`. PostgreSQL is not used.

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
- Every file under `config/` except the clearly synthetic `planner.example.yaml`, plus `.env`, is ignored by Git and the Docker build context.
- The application persists only an explicitly saved active YAML configuration and its backup. Imported Lunch Money baselines, scenarios, transactions, and account data are not persisted.

## Projection scope

Lunch Money income transactions are modelled as net deposited employment cash and are not taxed again. Each working month selects one resolved employment phase; growth is phase-local and employment becomes zero after the exact retirement boundary. Each investment account independently selects its active contribution phase and stops contributing at retirement. Tax is either the explicit flat compatibility model or the annual federal/Ontario model described above. The projection calendar starts in the baseline data-through month, so the first and last annual rows may be partial calendar years. CPP/OAS claim timing, explicit OAS eligibility, and the OAS age-75 increase are deterministic; CPP entitlement is not calculated from contribution history. RRIF conversion remains only a milestone; statutory minimum withdrawals are not enforced, and Canadian-mode requirement results remain provisional. Monte Carlo simulation, optimized withdrawals, housing transitions, households, saved scenarios, background synchronization, and server-generated PDFs are outside the MVP.

See [docs/architecture.md](docs/architecture.md) and [docs/report-model.md](docs/report-model.md) for implementation details.

## Published container image

Pushes to `main` and manual workflow runs publish:

- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:latest`
- `ghcr.io/danielnguyen/lunchmoney-retirement-planner:<short-commit-sha>`

## License

MIT
