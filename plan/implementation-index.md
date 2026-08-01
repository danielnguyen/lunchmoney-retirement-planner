# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: None
- Open maintenance pull request: None
- Pull request state: [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28) merged and completed
- Active implementation: None
- Status: Compact application shell completed; PR 2 of the dashboard redesign has not started
- Implementation branch: None
- Starting merged-main SHA: `65348a20f3dd34f5da0fba47573ba06515be172c`
- Correction starting PR head: `87e21309b8ddb9d71608c2a3a5981a8368186faa`
- Validated implementation commit: `eb814a0d493b8063d87dc56073ab61e461474ad8`
- Final PR head: `deab621542cabf7818da579c546df8f46486d72a`
- PR #28 merge commit: `4dff690e63e567802d220df04c6478010d494307`
- Change: The oversized report hero and fragmented connection/report controls are replaced by one compact semantic application shell. The corrected responsive contract keeps desktop and stacked-tablet anchor targets clear, makes the header non-sticky at 620px and below, and keeps critical shell text at approximately 0.875rem or larger. Existing scenario, mapping, print, JSON export, projection, and presentation behaviour remains shared and unchanged below the shell.
- Synthetic validation: Passed — 41 focused dashboard, configuration, and runtime tests across 4 files; 567 tests across the complete 32-file suite. Typecheck, lint, production build, diff check, Docker image build, Compose validation, isolated container startup, schema-aware health smoke, and clean container removal passed. Hosted CI and Docker workflow state for the exact live final head is retained in the pull-request description because another tracking commit would create a new head recursively.
- Latest merged `main`: `4dff690e63e567802d220df04c6478010d494307`
- Last completed capability stage: Simplified non-registered taxation and supported-model tax-completeness migration
- Last completed pull request: [#27 Add simplified non-registered taxation](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/27)
- PR #27 merge commit: `65348a20f3dd34f5da0fba47573ba06515be172c`
- Last completed maintenance: Compact retirement planner application shell
- Last maintenance pull request: [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- Last completed synthetic validation: Passed — 41 focused dashboard, configuration, and runtime tests across 4 files; 567 tests across the complete 32-file suite; all required local, container, health, hosted CI, and hosted Docker validation passed on the exact final PR head
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: None for PR #28
- Next action: wait for explicit scope for PR 2 of the dashboard redesign; do not begin it implicitly

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
| 9 | RRIF minimum withdrawals and Canadian retirement taxes | Surplus policy, debt model, spending phases, and requirement contract | Completed | [#25 annual tax](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/25), [#26 RRIF](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/26), [#27 non-registered tax](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/27) |
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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. PR #28 completed the compact application shell as PR 1 of the four-PR dashboard redesign. Confirm synchronized `main`, a clean worktree, and no open pull request before beginning any separately authorized follow-up. PR 2 has not started; do not infer its retirement-summary scope from conversational history. The technical-detail and comprehensive visual/accessibility redesign work also remains separately scoped.
