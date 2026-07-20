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

Both normal export routes always create one deterministic anonymization context per request; no raw, private, or opt-out export path exists. A typed, allowlisted transformation constructs the export model field by field and never recursively copies the baseline or projection request. Imported and projection-only accounts, non-financial assets, liabilities, employment phases, contribution and savings phases, events, recurring expenses, categories, warnings, and unmapped records receive generic export-local aliases based only on type and encounter order. Those aliases are applied consistently to baseline inputs, active inputs, projection inputs, role-compiled policy references, liability schedules and debt-payment evidence, account and liability maps, balance sheets, bridges, provenance, overrides, and targets.

No source-system record ID crosses the export boundary, including recurring-item IDs. User-controlled text such as names, account or institution descriptions, employers, phase labels, future-event labels, recurring payees or merchants, street addresses, notes, warning text, and connection messages is dropped or replaced with deterministic generic labels. The boundary retains allowlisted analytical amounts, dates, types, classifications, directions, source types, effective dates, public Canadian reference kinds and URLs, safe field references, projection output, and fixed application-generated milestone text.

The detailed category/account audit structure is available to the local dashboard but is not copied into exports. JSON includes only the explicitly transformed debt-payment summary needed to prove schedule replacement, with liability aliases and no category, account, institution, or transaction identifiers. Export construction remains a typed allowlist and ignores additive baseline fields unless they receive an explicit share-safe transformation.

## Baseline derivation

Account mappings are explicit and source-scoped. Category mappings classify only transactions and reviewed recurring items associated with included accounts. Transfers, excluded mappings, Lunch Money categories excluded from totals, pending transactions, deletion-pending transactions, split parents, and group parents are not counted.

The transaction endpoint is requested with group children included, then group parents are discarded. Split parents remain excluded by the API default, so child transactions are counted once.

Positive Lunch Money amounts are debits and negative amounts are credits. Spending uses signed debit totals so refunds reduce spending. Income reverses the sign so credits are positive. Contribution mappings explicitly select debit or credit direction and identify a target investment account. Before category classification, an optional liability-local matcher selects only debit records whose canonical source account and normalized exact payee both match. Normalization trims, collapses whitespace, and ignores case; it never uses substrings, fuzzy text, amount, date, cadence, or category. Matched records become debt-payment audit evidence, while unrelated same-category records continue through ordinary classification. Matching reviewed recurring items are suppressed so they cannot reintroduce the scheduled payment. Dedicated `debt_payment` mappings remain supported and deduplicate mirrored negative records.

Mapped income is treated as net deposited employment cash. The primary simple configuration assigns account roles once under `accountMappings`, supplies simple starting room, explicit employment RRSP-room assumptions, and named personal, reserve-building, and workplace plans. A capability-specific compiler resolves those owner concepts into the existing detailed account, registered-room, waterfall, surplus, and contribution inputs before projection validation. The resolved inputs remain authoritative, and the engine never receives unresolved source strings.

Simple and advanced modes are mutually exclusive. The existing detailed `projectionAccounts`, `registeredAccountRoom`, `contributionWaterfall`, `surplusAllocation`, account contribution phases, and starting-room source unions remain advanced compatibility. Explicit employment phases are contiguous from current age through retirement; savings phases are independently non-overlapping and may contain gaps. Role selection, compiler output, phase fields, automatic taxable creation, and statutory defaults receive provenance. A current Lunch Money income phase longer than five years produces a non-blocking warning.

Included debts are resolved separately from financial accounts. A positive debt requires an explicit amortizing or payoff-at-start treatment; a zero balance may remain zero. Amortizing treatment retains an explicit rate convention. The shared rate helper supports the standard Canadian nominal annual mortgage rate compounded semi-annually and an explicitly quoted effective annual rate. An included `real_estate` mapping with the unique `primary_residence` role imports its Lunch Money balance and balance date into the non-financial-asset model; the manual top-level residence is a mutually exclusive fallback. The optional unique `primary_mortgage` role links either residence source to an amortizing liability. Legacy zero debt return/allocation/priority fields and the old already-excluded handling scalar are deterministic migration boundaries; non-zero investment assumptions, mixed historical-payment sources, or a silent static positive debt are rejected.

Missing account mappings, required category mappings, liability treatments or historical-payment assertions, contribution targets, cash accounts, or account assumptions create a configuration-required response. No projection input is returned from an incomplete baseline.

The baseline API schema is `1.7`. Its `cashFlowAudit` structure groups mapped transactions by category and account for income, non-debt essential spending, non-debt discretionary spending, and historical debt payments; records resolved contribution values by account, funding mode, and source; and retains normalized reviewed recurring-item context. A typed imported non-financial-asset baseline record preserves residence value/date provenance without pretending the residence is a financial account. Imported financial accounts, residences, and liabilities retain Lunch Money provenance, while the manual residence fallback and automatic taxable account retain projection-configuration provenance. Resolved inputs contain distinct financial-account, non-financial-asset and liability collections plus the policy, room, waterfall and benefit models. Raw liability matcher payees and source references remain baseline-only matching inputs and are not copied into resolved projection inputs or exports.

## Explanation boundary

Domain-level explanation builders consume `CurrentBaseline`, active `ProjectionInputs`, the temporary override map, `ProjectionResult`, display mode, and selected allocation year. Shared annual chart and ledger presentation builders supply both the visible dashboard and explanation tables, preventing a second UI-only calculation path.

The builders emit typed deterministic documents containing plain-language meaning, arithmetic steps, source evidence, effective dates, exact tables, assumptions, caveats, and an optional numeric reconciliation. Presentation components render the same documents in one reusable accessible drawer. No runtime-generated or AI-generated prose is used.

An active phase amount, phase growth/indexing value, or other control that differs from the refreshed baseline is labelled `Temporary override`; its refreshed value remains visible as evidence. Resetting the field removes that source label without fetching Lunch Money again. Phase boundaries stay configuration-only so browser controls cannot create a gap or overlap. Today’s/Future dollars and the selected allocation year are inputs to explanation generation, so an open drawer updates with the report.

## Projection boundary

Projection schema `8.0` models one person, financial accounts, non-financial assets, explicit liabilities, employment and contribution phases, global TFSA and RRSP room pools, a resolved surplus policy, concrete CPP/OAS inputs, optional future events, and simplified tax assumptions. The same monthly engine produces account balances, residence appreciation, liability schedules, cash flow, retirement-funding assets, home equity and total net worth. Dashboard, presentation, explanations and exports consume that shared typed result.

At projection start, owner-supplied room is used without adding the current year again. A January simple-mode start may omit pre-projection RRSP totals and compiles them to explicit zeros; February–December requires them. Later January boundaries add the dated or forecast TFSA limit, restore prior-year TFSA withdrawals, and generate RRSP room from explicit prior-year eligible earned income, pension adjustment, other reduction, and the applicable cap. Every simple employment phase supplies the four RRSP-generation inputs, including explicit zeros.

Simple-mode monthly processing gives the workplace RRSP plan first claim on global RRSP room; its overflow is unallocated and never enters cash. The explicit personal plan then uses available cash through personal TFSA → personal RRSP → taxable. The reserve plan compares all reserve members after returns with the indexed target, retains only the funded shortfall in the refill account, and sends any same-month crossing amount through the personal order. If cash is insufficient, the unfunded amount is reported without creating a withdrawal. Remaining positive cash is deposited into operating cash and is never swept into investments. Advanced mode preserves its existing configured sweep behavior. No account-order lookup selects any policy account.

Required liability payment demand is calculated provisionally, funded first from current-month cash and then through the established account-withdrawal order, and committed only after it is fully funded. Ordinary spending follows the required-liability boundary, and simple cash-funded savings use only genuinely remaining positive cash. An amortizing liability applies interest, reduces the final regular payment to the exact amount due, then applies dated lump sums without allowing a negative balance. Every configured lump sum is either consumed once or rejected when it exceeds remaining principal, occurs after projected payoff, or falls outside the projection. The current schedule effective date must be on or before projection start; the imported opening balance is authoritative and historical amortization is not replayed. The full funded payment leaves financial assets; interest is consumption; principal lowers financial assets and the liability together. Payoff-at-start treatment clears the opening liability in month one. Payments cease automatically at payoff, and home equity is never offered to withdrawal logic.

The engine captures `retirementSnapshot` at the end of the final working month, immediately before the first fully retired month. It also accumulates nominal and real financial-assets and total-net-worth bridges to that boundary. The financial bridge subtracts the full liability cash payment. The net-worth bridge subtracts liability interest but cancels principal repayment through equal decreases in financial assets and liabilities. Cent-stable reconciliation covers every annual balance sheet, every liability schedule, both bridges, savings flows, room ledgers and account deposits.

Registered-room presentation is a dedicated nominal-regulatory dataset shared by its chart, table, explanation, JSON, and CSV. It is identical across general real and nominal display views, while ordinary income, outflow, contribution-flow, and balance fields retain the selected display mode.

CPP applies the statutory monthly reduction before age 65 or increase after 65. OAS multiplies the full amount by explicit eligibility and the delayed-claim factor, then applies the permanent 10% increase in the first modelled month after the age-75 boundary. Nominal indexing continues through the same monthly projection path, so charts, ledger rows, explanations, exports, and the financial-assets bridge share one result.

The simplified effective rate is applied to gross retirement income and taxable RRSP/RRIF withdrawals. It is not applied again to net deposited employment cash.

The retirement goal comparison and depletion age use retirement-funding financial assets—cash, TFSA, RRSP/RRIF, and non-registered accounts—not home equity or total net worth. Total net worth is separately defined as financial assets plus non-financial assets less liabilities.

Browser controls materialize temporary inputs from the current baseline and call the projection API. Owner-facing labels cover savings, room, reserve, residence value/appreciation, and amortizing-liability rate/payment assumptions; structural choices remain configuration-only. A field reset removes one override. Reset all removes every override. Refresh requests a new baseline and clears overrides.

## Runtime states

- Connected: a complete live baseline and projection are displayed.
- Configuration required: Lunch Money responded, but private configuration is incomplete; mapping details are displayed and charts are hidden.
- Connection failed: the token is missing, invalid, or an API request failed; the sanitized error is displayed and charts are hidden.
