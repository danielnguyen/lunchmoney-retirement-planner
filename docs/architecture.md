# Architecture

The MVP is one Next.js application container with no database or background process.

## Runtime path

```text
LUNCHMONEY_API_TOKEN
        |
        v
read-only Lunch Money service ---- config/planner.local.yaml
        |                                      |
        +------------------+-------------------+
                           v
                 live baseline derivation
                           |
                 +---------+---------+
                 |                   |
                 v                   v
         cash-flow audit       provenance map
                 |                   |
                 +---------+---------+
                           |
                           v
               single-person projection API
                           |
             +-------------+-------------+
             |                           |
             v                           v
       report dashboard             JSON / CSV export
```

Every baseline request fetches current manual accounts, Plaid accounts, categories, recurring items, and all pages of the configured trailing transaction window. There is no cache or persisted copy.

## Trust boundaries

The Lunch Money token is read only while constructing the server-side SDK client. The application-facing `LunchMoneyReadService` exposes five retrieval methods and no mutation method. API errors are translated to sanitized runtime errors before they reach a route response.

Private assumptions and mappings are loaded from `PLANNER_CONFIG_PATH`, which defaults to `config/planner.local.yaml`. YAML is the canonical human-maintained format and allows opaque Lunch Money identifiers to carry nearby account/category comments. The loader selects YAML or JSON from the configured file extension; `.yaml` and `.yml` are supported, while `.json` remains available for an explicitly configured compatibility path. All private local variants are ignored by Git and the Docker build context.

Both export routes create one deterministic alias context per request. A typed, allowlisted transformation constructs the export model field by field; it never recursively copies the baseline or projection request. Included accounts, events, recurring expenses, categories, warnings, and unmapped records receive export-local aliases that are applied consistently to baseline inputs, active inputs, projection inputs, account-balance maps, provenance, overrides, contributions, and targets.

No source-system record ID crosses the export boundary, including recurring-item IDs. User-controlled text such as names, account descriptions, future-event labels, recurring payees or merchants, street addresses, notes, warning text, and connection messages is dropped or replaced with deterministic labels. The boundary retains only allowlisted analytical amounts, dates, types, classifications, directions, source types, safe field references, projection output, and fixed application-generated milestone text.

The audit structure is available to the local dashboard but is not added to JSON or CSV exports by default. Export construction remains a typed allowlist and ignores additive baseline fields unless they receive an explicit share-safe transformation.

## Baseline derivation

Account mappings are explicit and source-scoped. Category mappings classify only transactions and reviewed recurring items associated with included accounts. Transfers, excluded mappings, Lunch Money categories excluded from totals, pending transactions, deletion-pending transactions, split parents, and group parents are not counted.

The transaction endpoint is requested with group children included, then group parents are discarded. Split parents remain excluded by the API default, so child transactions are counted once.

Positive Lunch Money amounts are debits and negative amounts are credits. Spending uses signed debit totals so refunds reduce spending. Income reverses the sign so credits are positive. Contribution mappings explicitly select debit or credit direction and identify a target investment account.

Mapped income is treated as net deposited employment cash. Baseline resolution converts configured `live_baseline` values to concrete numeric employment and contribution phase fields before projection validation. The engine never receives unresolved source strings.

Explicit employment phases are contiguous from current age through retirement; contribution phases are independently non-overlapping per investment account and may contain zero-contribution gaps. Phase IDs, labels, boundaries, amount, growth or indexing, and funding receive field-level provenance. Legacy scalar income growth and account contribution fields are normalized deterministically into fallback phases and identified as compatibility behavior. A current Lunch Money income phase longer than five years produces a non-blocking warning.

Missing account mappings, required category mappings, contribution targets, cash accounts, or account assumptions create a configuration-required response. No projection input is returned from an incomplete baseline.

The baseline API schema is `1.2`. Its `cashFlowAudit` structure groups mapped transactions by category and account for income, essential spending, and discretionary spending; records resolved contribution values by account, funding mode, and source; and retains normalized reviewed recurring-item context. Each section reconciles to the existing derived metric. The resolved projection inputs add phase arrays and phase provenance but deliberately omit raw transaction payloads and individual transaction IDs.

## Explanation boundary

Domain-level explanation builders consume `CurrentBaseline`, active `ProjectionInputs`, the temporary override map, `ProjectionResult`, display mode, and selected allocation year. Shared annual chart and ledger presentation builders supply both the visible dashboard and explanation tables, preventing a second UI-only calculation path.

The builders emit typed deterministic documents containing plain-language meaning, arithmetic steps, source evidence, effective dates, exact tables, assumptions, caveats, and an optional numeric reconciliation. Presentation components render the same documents in one reusable accessible drawer. No runtime-generated or AI-generated prose is used.

An active phase amount, phase growth/indexing value, or other control that differs from the refreshed baseline is labelled `Temporary override`; its refreshed value remains visible as evidence. Resetting the field removes that source label without fetching Lunch Money again. Phase boundaries stay configuration-only so browser controls cannot create a gap or overlap. Today’s/Future dollars and the selected allocation year are inputs to explanation generation, so an open drawer updates with the report.

## Projection boundary

Projection schema `4.0` models one person, explicit resolved employment-income phases, per-account contribution phases, optional future events, and simplified tax assumptions. Its ISO start date is the live baseline data-through date. For each working-month interval, the engine selects the active employment phase and independently selects each account’s contribution phase. Growth and indexing restart at each phase boundary; employment and contributions stop after the final working month.

The engine captures `retirementSnapshot` at the end of the final working month, immediately before the first fully retired month. The Assets at retirement summary reads the exact real-dollar snapshot instead of the next calendar-year row. Calendar charts and the ledger continue to use annual snapshots.

The engine also accumulates nominal and real `financialAssetsBridge` records from opening financial assets to the exact retirement snapshot. Employment cash, public benefits and pension, future-event inflows, income-withheld contributions, actual non-debt returns, spending, one-time outflows, and taxes are recorded from the same monthly loop. Cash-funded contributions are excluded because they transfer value between financial accounts. Projection calculation fails its tests if either bridge misses the exact snapshot by more than one cent.

The simplified effective rate is applied to gross retirement income and taxable RRSP/RRIF withdrawals. It is not applied again to net deposited employment cash.

The retirement goal comparison uses financial assets—cash, TFSA, RRSP/RRIF, and non-registered accounts—not real assets or total net worth. Debt remains visible in the ledger but is not added to the goal asset total.

Browser controls materialize temporary inputs from the current baseline and call the projection API. Employment phase amounts/growth and contribution phase amounts/indexing are independently overrideable; phase boundaries are not. A field reset removes one override. Reset all removes every override. Refresh requests a new baseline, re-resolves `live_baseline`, and clears overrides.

## Runtime states

- Connected: a complete live baseline and projection are displayed.
- Configuration required: Lunch Money responded, but private configuration is incomplete; mapping details are displayed and charts are hidden.
- Connection failed: the token is missing, invalid, or an API request failed; the sanitized error is displayed and charts are hidden.
