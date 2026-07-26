# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: None
- Open maintenance pull request: [#21 Fix aggregate bridge reconciliation rounding](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/21)
- Pull request state: Open draft
- Active correction: Aggregate bridge reconciliation rounding
- Status: Ready for independent review
- Implementation branch: `agent/fix-bridge-reconciliation-rounding`
- Latest validated implementation head: `e8541a6986b201d06b1fbe8612bd136a712d0d50`
- Synthetic validation: Passed — 390 synthetic tests including aggregate-versus-component cent rounding, genuine discrepancy retention, and a long repeated mortgage-payment schedule; typecheck, lint, production build, and hosted Docker image build passed
- Last completed capability: Explicit scenario-to-config bindings
- Last completed pull request: [#20 Apply scenario overrides to the YAML config draft](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/20)
- Last maintenance pull request: [#18 Correct TFSA annual-limit forecasting](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/18)
- Last completed synthetic validation: Passed — 387 synthetic tests plus typecheck, lint, production build, Docker image build, Docker Compose validation, standalone scenario/config API smoke testing, and `git diff --check`
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Last completed private smoke test: Not run for the operating-cash capability
- Remaining step: independently review draft pull request #21
- Next action: confirm the aggregate reconciliation correction preserves the one-cent integrity threshold without component-rounding false positives

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
| 8 | Retirement funding requirement and terminal balance | Spending phases and retirement projection | Planned | — |
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

When work begins, record the branch, pull-request link, current status, latest validated implementation head, validation state, remaining private step, and next action.

When a capability merges:

1. mark it **Completed** and retain the merged pull-request link;
2. mark exactly one following capability **Next**;
3. clear the open pull-request and branch fields; and
4. record the latest merged `main`, last completed validation state, and next action.

Planning order is project-management shorthand only. Production names must describe the underlying financial capability rather than roadmap sequence labels.

## New-conversation handoff

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Independently review draft PR #21 for aggregate bridge reconciliation rounding using synthetic data only. The correction must preserve the one-cent integrity threshold while preventing component-wise rounding from manufacturing false multi-cent bridge differences.
