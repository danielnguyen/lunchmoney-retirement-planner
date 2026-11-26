# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Active implementation: inverse retirement discretionary spending capacity (#35)
- Branch: `openhands/issue-35`, starting main `37b39bf12f38719d75252ee6e3e423d750c5419d`
- Predecessor: #39 completed in merged [PR #40](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/40); no open PR at start
- Status: implementation and synthetic validation complete; draft exact-head review and hosted Docker validation required
- Change: optional common-scale inverse search through the existing monthly retirement continuation and validation; dashboard selection, today-dollar phase capacities, effective assumptions and explicit unavailable states
- Preserved: essentials, unselected spending, static withdrawal priority, mandatory RRIF rules, forward projection and JSON/CSV contracts; no private configuration accessed
- Validation: `npm test` passed 669 tests in 39 files; typecheck, lint, production build and Compose config passed. Final targeted checks are recorded below.
- Local Docker build: ordinary user lacks socket permission; sudo BuildKit fails because container bind mounts are not permitted. Hosted Docker validation is required before readiness; no waiver requested.
- Independent review: pending through `openhands-review` on the pushed head. GitHub owns current head and checks.
- Merge, deployment and private-data operations remain owner actions. #36 remains separate and depends on this work.

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
| 10 | Deterministic return paths and sequence-risk scenarios | Reconciled deterministic projection | Completed | [#33](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/33) |
| 11 | Tax-aware retirement withdrawal strategies | Annual Canadian tax, RRIF, non-registered tax, retirement requirement, and deterministic return paths | Planned | — |
| 12 | Structured housing transitions | Net-worth, debt, spending, and event models | Planned | — |

| — | Inverse retirement spending capacity (#35) | Shared monthly engine and retirement requirement | In progress | — |
| — | Configurable scenario comparison (#37) | Shared monthly projection and configured phases | Completed | [#38](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/38) |

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

Read `AGENTS.md`, the roadmap, this index and relevant projection code. #39 is
merged in PR #40. #35 is the current bounded delivery; recover its exact draft head,
checks and independent review from GitHub. Do not begin #36 until this PR is merged.
Local Docker validation is blocked by container mount permissions; hosted Docker
and independent exact-head review remain required before readiness.

## Issue #35 execution record

- Predecessor #39 completed in merged PR #40; main baseline
  `37b39bf12f38719d75252ee6e3e423d750c5419d`. No open PR at start.
- Active work: optional inverse retirement discretionary spending capacity on
  `openhands/issue-35`; scope and validation contract recorded in roadmap before code.
- Read repository AGENTS.md, roadmap, implementation index, Git-managed plan guide,
  projection/requirement/comparison code and synthetic tests.
- Read shared AGENTS.md, WORKFLOW.md, AUTHORITY.md, ENGINEERING.md and
  integrations/openhands.md at `07079695e12e52afe374cd754a7295817e957e1e`.
- Issue body SHA-256 matched the trusted dispatch contract. Only synthetic data
  permitted; no private planner files accessed. Validation and review pending.
- Final checks after effective-assumption display changes: 15 focused inverse/API/dashboard tests passed; lint, typecheck and production build passed again. The earlier complete suite passed 669/669 tests, including existing synthetic tax, benefit, liability, return-path and export-privacy regressions.
- Required Docker check attempted both normally and with local sudo: socket permission denied, then BuildKit bind-mount operation not permitted. Existing PR Docker CI is the pending validation path; this draft is not ready until it passes and independent review completes.
- Built-server regression: `node --import tsx tests/export-http.ts` passed all eight synthetic HTTP/export boundary checks after the final build.

## PR #41 CI correction

- Resumed the clean `openhands/issue-35` checkout at requested head
  `b1b64b3fd7b0b68ea48922826aa627b3229b2756`; GitHub confirmed the same draft head.
- Read current reviews, inline comments, discussion and check results. No submitted
  reviews or inline findings existed; discussion deferred review until CI completed.
- Failed validate run `45723700058`: save-conflict dashboard test exceeded its
  existing 5-second limit (668 other tests passed). Hosted Docker run `45723699994`
  passed on that head. Shared policy remains at the previously read revision
  `07079695e12e52afe374cd754a7295817e957e1e`.
- Bounded correction: scope the failing test's queries to the open configuration
  drawer, avoiding full dashboard scans. Retain all assertions, actual dashboard
  and projection engine, timeout, retry limits and CI workflow. No product changes.
- Focused test passed before and after the correction (2.69s and 2.24s locally).
  Full validation of the correction and independent review of its new head follow.
- Correction validation: all 669 tests in 39 files passed; typecheck, lint,
  production build, Compose config and eight built-server HTTP export checks passed.
  Hosted checks and independent review must confirm the new exact head.
