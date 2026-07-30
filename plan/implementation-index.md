# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#24 Derive retirement funding requirement](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/24)
- Open maintenance pull request: None
- Pull request state: Open draft
- Active implementation: Retirement funding requirement and terminal balance
- Status: Local validation complete; hosted verification pending
- Implementation branch: `agent/add-retirement-funding-requirement`
- Validated implementation commit: `188d69e67b8a389930fe928ea27ed9a35e598f94`
- Synthetic validation: Passed — 428 synthetic tests, including 20 focused solver cases plus configuration, compatibility provenance, exact retirement-boundary composition and continuation, terminal criteria, account-type differences, liabilities, benefits, spending phases, deterministic exact-cent proof, unavailable/infeasible outcomes, projection-completion status, partial annual-period boundaries, dashboard, explanation, schema, JSON allowlist, CSV rectangularity, and privacy coverage. The focused corrections prove that an underfunded post-retirement liability produces an available requirement and shortfall without recording an unpaid payment as paid; a positive last-completed balance is not presented as surviving to terminal age; terminal balances are unavailable after an early stop; and a pre-retirement liability failure remains fail-closed. Typecheck, lint, production build, local Docker image build, Docker Compose validation, container health, private local smoke validation, and `git diff --check` passed. Hosted verification is pending on the corrected head.
- Latest merged `main`: `61a0dc20f879f19c662e237f49858263b8626c80`
- Last completed capability: Explicit scenario-to-config bindings
- Last completed pull request: [#20 Apply scenario overrides to the YAML config draft](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/20)
- Last completed maintenance correction: Retirement bridge ending precision
- Last maintenance pull request: [#23 Fix retirement bridge reconciliation against raw balances](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/23)
- Last completed synthetic validation: Passed — 396 synthetic tests for the merged retirement bridge ending-precision correction; its one-cent integrity threshold and financial calculations remained unchanged
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed for configuration loading, ordinary projection, retirement-requirement calculation, and dashboard-shell availability without publishing private values
- Remaining step: independently review draft pull request #24
- Next action: verify the requirement uses the shared monthly engine, exact retirement-boundary account composition, the lowest passing cent, and a visibly provisional flat-tax result before merge; Canadian retirement taxes and RRIF minimums remain next

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
| 8 | Retirement funding requirement and terminal balance | Spending phases and retirement projection | In progress | [#24](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/24) |
| 9 | RRIF minimum withdrawals and Canadian retirement taxes | Surplus policy, debt model, spending phases, and requirement contract | Planned | — |
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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Independently review draft PR #24 for the retirement funding requirement and terminal balance using synthetic data only. Confirm that it reuses the ordinary monthly engine without recursive solving, preserves projected retirement account composition, excludes residence equity, finds and proves the lowest passing cent, keeps the owner goal separate, and labels the flat-tax result provisional. Canadian retirement taxes and RRIF minimums remain the next capability.
