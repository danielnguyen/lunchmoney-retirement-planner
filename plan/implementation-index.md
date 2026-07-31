# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#27 Add simplified non-registered taxation](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/27)
- Open maintenance pull request: None
- Pull request state: Open, draft, mergeable, and unmerged; independent review remains
- Active implementation: Simplified non-registered investment taxation and final supported-model migration
- Status: Locally validated draft implementation; hosted validation in progress
- Implementation branch: `agent/add-non-registered-taxation`
- Starting merged-main SHA: `86d5c2a51618c74d883745cfbc054d0a8fc9fd3c`
- Validated implementation commit: `549d807542df101700567ba03dc4699e13af22f5`
- Final tracking head: Determined from the live GitHub PR head after the tracking-only commit; not duplicated here because embedding a commit's own SHA is recursive
- Synthetic validation: Passed locally — 267 focused tests across 15 official-reference, annual investment-tax, distribution, pooled-ACB, taxable-disposition, RRIF, retirement-requirement, configuration, dashboard, explanation, JSON allowlist, nominal/real rectangular CSV, and export-privacy files; 557 tests across the complete 32-file suite. Typecheck, lint, production build, diff check, Docker build, Compose validation, isolated container startup, schema-aware health smoke, and clean planner-container removal passed.
- Latest merged `main`: `86d5c2a51618c74d883745cfbc054d0a8fc9fd3c`
- Last completed capability stage: RRSP-to-RRIF conversion and statutory minimum withdrawals
- Last completed pull request: [#26 Add RRIF conversion and minimum withdrawals](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/26)
- PR #26 merge commit: `86d5c2a51618c74d883745cfbc054d0a8fc9fd3c`
- Last completed maintenance correction: Retirement bridge ending precision
- Last maintenance pull request: [#23 Fix retirement bridge reconciliation against raw balances](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/23)
- Last completed synthetic validation: Passed — 396 synthetic tests for the merged retirement bridge ending-precision correction; its one-cent integrity threshold and financial calculations remained unchanged
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: push this tracking-only update, verify hosted CI and Docker on the exact resulting PR head, then independent review
- Next action: validate draft PR #27; after merge, begin deterministic return paths and sequence-risk scenarios

## Planned implementation sequence

| Order | Capability | Primary dependency | Status | Pull request |
|---|---|---|---|---|
| 1 | Government benefits | Phased income model | Completed | [#8](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/8) |
| 2 | Surplus allocation policy | Government benefits | Completed | [#9](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/9) |
| 3 | Registered-account room and contribution waterfall | Surplus allocation policy | Completed | [#10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) |
| 4 | Net worth, real estate, and debt amortization | Registered-account contribution model | Completed | [#11](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11) |
| 5 | Employment-income today-dollar semantics correction | Existing employment-income phase model | Completed | [#14](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/14) |
| 6 | Operating-cash target and automatic excess sweep | Surplus allocation and contribution waterfall | Completed | [#15](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/15) |
| 7 | General spending phases | Corrected income and cash policies | Completed | [#16](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/16) |
| 8 | Retirement funding requirement and terminal balance | Spending phases and retirement projection | Completed | [#24](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/24) |
| 9 | RRIF minimum withdrawals and Canadian retirement taxes | Surplus policy, debt model, spending phases, and requirement contract | In progress — annual tax and RRIF stages completed; simplified non-registered tax final stage active | [#25 annual tax](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/25), [#26 RRIF](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/26), [#27 non-registered tax](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/27) |
| 10 | Deterministic return paths and sequence-risk scenarios | Reconciled deterministic projection | Planned | — |
| 11 | Structured housing transitions | Net-worth, debt, spending, and event models | Planned | — |

## Delivery rules

1. Keep only one roadmap implementation pull request open at a time.
2. Do not begin the next capability while another implementation pull request is open.
3. Start implementation branches from the latest synchronized `main` and use capability-specific names.
4. Keep detailed requirements in `roadmap.md` and transient delivery state in this index.
5. Update this index when roadmap work opens, a pull request opens, changes status, becomes blocked, or merges.
6. Run synthetic validation before any separately authorized private migration or smoke test.
7. Never publish private financial data in source, fixtures, screenshots, logs, commits, exports, documentation, or pull-request text.

## Status meanings

- **Next** — the one capability to start after confirming no implementation pull request is open.
- **In progress** — implementation exists in an open pull request.
- **Blocked** — delivery cannot proceed without a recorded dependency or owner decision.
- **Completed** — merged and validated.
- **Planned** — accepted work that follows the Next capability.

## Tracking transitions

When work begins, record the branch, pull-request link, current status, validated implementation commit, validation state, remaining private step, and next action. The current pull-request head is determined from GitHub rather than duplicated here.

When a capability merges:

1. mark it **Completed** and retain the merged pull-request link;
2. mark exactly one following capability **Next**;
3. clear the open pull-request and branch fields; and
4. record the latest merged `main`, last completed validation state, and next action.

Planning order is project-management shorthand only. Production names must describe the underlying financial capability rather than roadmap sequence labels.

## New-conversation handoff

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Continue the simplified non-registered taxation and supported-model migration on `agent/add-non-registered-taxation` from merged-main anchor `86d5c2a51618c74d883745cfbc054d0a8fc9fd3c`, using synthetic data only. Confirm compatibility normalization, return characterization, pooled ACB, reinvested distributions, all taxable deposit paths, proportional dispositions, signed exact-cent tax-adjusted withdrawals, rollback, RRIF-surplus routing, retirement-candidate ACB/FMV scaling, supported-model coverage, explanation/dashboard evidence, and JSON/CSV privacy. Deterministic return paths follow only after this capability merges.
