# Architecture

The MVP is one Next.js application container with no database or background process.

## Runtime path

```text
LUNCHMONEY_API_TOKEN
        |
        v
read-only Lunch Money service ---- config/planner.local.json
        |                                      |
        +------------------+-------------------+
                           v
                 live baseline derivation
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

Private assumptions and mappings are loaded from `PLANNER_CONFIG_PATH`, which defaults to `config/planner.local.json`. The local file is ignored by Git and the Docker build context.

Both export routes create one deterministic alias context per request. A typed, allowlisted transformation constructs the export model field by field; it never recursively copies the baseline or projection request. Included accounts, events, recurring expenses, categories, warnings, and unmapped records receive export-local aliases that are applied consistently to baseline inputs, active inputs, projection inputs, account-balance maps, provenance, overrides, contributions, and targets.

No source-system record ID crosses the export boundary, including recurring-item IDs. User-controlled text such as names, account descriptions, future-event labels, recurring payees or merchants, street addresses, notes, warning text, and connection messages is dropped or replaced with deterministic labels. The boundary retains only allowlisted analytical amounts, dates, types, classifications, directions, source types, safe field references, projection output, and fixed application-generated milestone text.

## Baseline derivation

Account mappings are explicit and source-scoped. Category mappings classify only transactions and reviewed recurring items associated with included accounts. Transfers, excluded mappings, Lunch Money categories excluded from totals, pending transactions, deletion-pending transactions, split parents, and group parents are not counted.

The transaction endpoint is requested with group children included, then group parents are discarded. Split parents remain excluded by the API default, so child transactions are counted once.

Positive Lunch Money amounts are debits and negative amounts are credits. Spending uses signed debit totals so refunds reduce spending. Income reverses the sign so credits are positive. Contribution mappings explicitly select debit or credit direction and identify a target investment account.

Mapped income is treated as net deposited employment cash. Manual contribution amounts require an account-level `contributionFunding` choice. Transaction-derived contributions default to cash-funded, while an explicit `income_withheld` mapping records a contribution that grows the investment balance without reducing the already-net employment cash flow.

Missing account mappings, required category mappings, contribution targets, cash accounts, or account assumptions create a configuration-required response. No projection input is returned from an incomplete baseline.

## Projection boundary

The projection input models one person, financial accounts, optional future events, and simplified tax assumptions. Its ISO start date is the live baseline data-through date. The monthly engine uses that calendar month for future events and milestones, emits partial first or last calendar-year rows where needed, and supplies the one annual ledger used by every chart, summary metric, observation, and export.

The simplified effective rate is applied to gross retirement income and taxable RRSP/RRIF withdrawals. It is not applied again to net deposited employment cash.

The retirement goal comparison uses financial assets—cash, TFSA, RRSP/RRIF, and non-registered accounts—not real assets or total net worth. Debt remains visible in the ledger but is not added to the goal asset total.

Browser controls materialize temporary inputs from the current baseline and call the projection API. A field reset removes one override. Reset all removes every override. Refresh requests a new baseline and clears overrides.

## Runtime states

- Connected: a complete live baseline and projection are displayed.
- Configuration required: Lunch Money responded, but private configuration is incomplete; mapping details are displayed and charts are hidden.
- Connection failed: the token is missing, invalid, or an API request failed; the sanitized error is displayed and charts are hidden.
