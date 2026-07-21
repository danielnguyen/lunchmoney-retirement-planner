# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: None
- Pull request state: None
- Active capability: Operating-cash target and automatic excess sweep
- Status: Next
- Implementation branch: `agent/add-operating-cash-target-and-sweep`
- Latest validated implementation head: Not yet available
- Synthetic validation: Pending
- Last completed capability: Employment-income today-dollar semantics correction
- Last completed pull request: [#14 Correct employment-income today-dollar semantics](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/14)
- Last completed synthetic validation: Passed — 276 tests plus focused employment-income, registered-room, explanation, export, privacy, and one-cent reconciliation coverage; typecheck, lint, production build, Docker image build, Docker Compose validation, and `git diff --check` passed
- Last completed private migration: Passed — residence, liability, historical-payment replacement, and share-safe export behaviour were validated locally without publishing private values
- Last completed private smoke test: Passed — the live baseline, projection, balance sheet, bridges, and privacy checks completed successfully without publishing private values
- Remaining step: implement Operating-cash target and automatic excess sweep
- Next action: implement Operating-cash target and automatic excess sweep from the latest synchronized `main`

## Planned implementation sequence

| Order | Capability | Primary dependency | Status | Pull request |
|---|---|---|---|---|
| 1 | Government benefits | Phased income model | Completed | [#8](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/8) |
| 2 | Surplus allocation policy | Government benefits | Completed | [#9](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/9) |
| 3 | Registered-account room and contribution waterfall | Surplus allocation policy | Completed | [#10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) |
| 4 | Net worth, real estate, and debt amortization | Registered-account contribution model | Completed | [#11](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11) |
| 5 | Employment-income today-dollar semantics correction | Existing employment-income phase model | Completed | [#14](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/14) |
| 6 | Operating-cash target and automatic excess sweep | Surplus allocation and contribution waterfall | Next | — |
| 7 | General spending phases | Corrected income and cash policies | Planned | — |
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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Confirm no implementation pull request is open, synchronize the latest `main`, and implement Operating-cash target and automatic excess sweep on a capability-named branch using synthetic data only.

Repository and pull-request state are authoritative if they conflict with this index; correct stale tracking before implementation.
