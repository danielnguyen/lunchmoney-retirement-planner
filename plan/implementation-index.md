# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: None
- Open maintenance pull request: [#23 Fix retirement bridge reconciliation against raw balances](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/23)
- Pull request state: Open draft
- Active maintenance: Retirement bridge ending precision
- Status: Ready for independent review
- Implementation branch: `agent/fix-retirement-bridge-ending-precision`
- Validated implementation commit: `34db62369beacc3d1a8083519bc2d69c2035ec3a`
- Synthetic validation: Passed — 396 synthetic tests, including four focused bridge-reconciliation cases covering the raw retirement ending balance, display-rounded snapshot reconstruction, genuine discrepancy detection, and the long mortgage schedule; typecheck, lint, production build, local Docker image build, Docker Compose validation, container health, private local smoke validation, and `git diff --check` passed. `npm ci` was unavailable because the repository has no lockfile. The one-cent integrity threshold remains unchanged, and no projection assumptions, cash flows, or financial calculations changed.
- Latest merged `main`: `da16e1d75ea48f8d59c41e2c05baeae1e36e41d0`
- Last completed capability: Explicit scenario-to-config bindings
- Last completed pull request: [#20 Apply scenario overrides to the YAML config draft](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/20)
- Last maintenance pull request: [#22 Unify scenario controls and YAML configuration](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/22)
- Last completed synthetic validation: Passed — 395 synthetic tests including unified configuration-drawer, state-preservation, blocking-repair, accessibility, percentage-input, and runtime-safety coverage; typecheck, lint, production build, local Docker image build, Docker Compose validation, hosted CI, and hosted Docker image build passed
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Last completed private smoke test: Passed for the retirement bridge ending-precision correction without publishing private values
- Remaining step: independently review draft pull request #23 and verify hosted workflows on its final head
- Next action: confirm bridge endings reconcile against raw retirement state while the retirement snapshot remains display-rounded

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

When work begins, record the branch, pull-request link, current status, validated implementation commit, validation state, remaining private step, and next action. The current pull-request head is determined from GitHub rather than duplicated here.

When a capability merges:

1. mark it **Completed** and retain the merged pull-request link;
2. mark exactly one following capability **Next**;
3. clear the open pull-request and branch fields; and
4. record the latest merged `main`, last completed validation state, and next action.

Planning order is project-management shorthand only. Production names must describe the underlying financial capability rather than roadmap sequence labels.

## New-conversation handoff

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Independently review draft PR #23 for the retirement bridge ending-precision correction using synthetic data only. Confirm that bridge endings use raw retirement state, snapshots remain display-rounded, genuine discrepancies still fail at the unchanged one-cent threshold, and no projection assumptions or cash flows changed.
