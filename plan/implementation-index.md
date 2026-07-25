# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#20 Apply scenario overrides to the YAML config draft](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/20)
- Pull request state: Open draft
- Active capability: Explicit scenario-to-config bindings
- Status: Ready for independent re-review
- Implementation branch: `agent/scenario-config-bindings`
- Latest validated implementation head: `e81551a0fe1cf241e9fe3a3745f938eea87a573a`
- Synthetic validation: Passed — 387 synthetic tests including canonical numeric patching, draft-aware simple/advanced structural classification, actual YAML before-values, multi-destination review, stale-summary transitions, explicit persistence classification, live-source confirmation, runtime safeguards, and export privacy; typecheck, lint, production build, Docker image build, Docker Compose validation, standalone scenario/config API smoke test, and `git diff --check` passed
- Last completed capability: Precise scenario inputs and editable local YAML configuration
- Last completed pull request: [#19 Add editable planner config and precise scenario inputs](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/19)
- Last maintenance pull request: [#18 Correct TFSA annual-limit forecasting](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/18)
- Last completed synthetic validation: Passed — 283 tests plus focused configuration, baseline, projection, presentation, explanation, controls, one-cent reconciliation, JSON anonymization, and rectangular real/nominal CSV privacy coverage; typecheck, lint, production build, Docker image build, Docker Compose validation, and `git diff --check` passed
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Last completed private smoke test: Not run for the operating-cash capability
- Remaining step: independently re-review draft pull request #20
- Next action: re-review the corrected explicit scenario-to-config draft workflow; applying remains separate from saving configuration

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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Independently review draft PR #20 for explicit scenario-to-config bindings using synthetic data only. Applying supported overrides updates only the in-browser YAML draft; saving remains a separate action.

Repository and pull-request state are authoritative if they conflict with this index; correct stale tracking before implementation.
