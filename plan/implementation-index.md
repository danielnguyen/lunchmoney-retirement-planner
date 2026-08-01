# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: None
- Open maintenance pull request: [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- Pull request state: Open, draft, and unmerged; local validation passed and independent review remains
- Active implementation: Compact application shell, PR 1 of the planned four-PR dashboard redesign
- Status: Locally validated draft maintenance implementation; hosted validation and independent review remain
- Implementation branch: `agent/compact-application-shell`
- Starting merged-main SHA: `65348a20f3dd34f5da0fba47573ba06515be172c`
- Validated implementation commit: `b7d61e127c77cc320c6a46e97e914275c2760348`
- Final tracking head: Determined from the live GitHub PR head after the tracking-only commit; not duplicated here because embedding a commit's own SHA is recursive
- Change: The oversized report hero and fragmented connection/report controls are replaced by one compact semantic application shell. Existing scenario, mapping, print, JSON export, projection, and presentation behaviour remains shared and unchanged below the shell.
- Synthetic validation: Passed — 40 focused dashboard, configuration, and runtime tests across 4 files; 566 tests across the complete 32-file suite. Typecheck, lint, production build, diff check, Docker image build, Compose validation, isolated container startup, schema-aware health smoke, and clean container removal passed. Hosted workflows remain to be recorded on the final head.
- Latest merged `main`: `65348a20f3dd34f5da0fba47573ba06515be172c`
- Last completed capability stage: Simplified non-registered taxation and supported-model tax-completeness migration
- Last completed pull request: [#27 Add simplified non-registered taxation](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/27)
- PR #27 merge commit: `65348a20f3dd34f5da0fba47573ba06515be172c`
- Last completed maintenance correction: Retirement bridge ending precision
- Last maintenance pull request: [#23 Fix retirement bridge reconciliation against raw balances](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/23)
- Last completed synthetic validation: Passed — 396 synthetic tests for the merged retirement bridge ending-precision correction; its one-cent integrity threshold and financial calculations remained unchanged
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: hosted validation and independent review of draft PR #28
- Next action: validate and review draft PR #28; after merge, continue the separately scoped dashboard redesign without changing the accepted financial roadmap order

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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Continue the compact application-shell maintenance work on `agent/compact-application-shell` from merged-main anchor `65348a20f3dd34f5da0fba47573ba06515be172c`, using synthetic data only. Keep the work limited to PR 1 of the four-PR dashboard redesign: compact header, semantic in-page navigation, consolidated connection/report controls, neutral charcoal shell, existing mint accent, responsive wrapping, print-safe controls, and unchanged financial calculations, APIs, schemas, exports, summary content, charts, and section order. The retirement-summary, technical-detail, and full visual/accessibility redesign work remains separately scoped.
