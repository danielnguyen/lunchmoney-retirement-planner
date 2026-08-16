# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: PR [#32 Plan sequence risk and tax-aware retirement drawdown](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/32) merged successfully
- Open implementation pull request: [#33 Add deterministic return path scenarios](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/33)
- Open maintenance pull request: None
- Pull request state: PR #33 is open, draft, unmerged, mergeable, and the only roadmap implementation pull request
- Active implementation: Deterministic return paths and sequence-risk scenarios
- Status: Implementation complete on the validated code head; final tracking-only head is revalidating before review
- Implementation branch: `agent/deterministic-return-paths`
- Starting synchronized-main SHA: `8456aa04145760437bbd51e845756828b77cbbbe`
- Validated implementation commit: `3ab20d8b68029c0f8fa51910be73f27cb1894e86`
- Exact final PR head: Determined from GitHub rather than duplicated here so tracking updates do not recursively obsolete their own recorded head
- Change: Add explicitly labelled annual or monthly deterministic account-return paths and optional inflation paths that feed the existing monthly projection and retirement-requirement engines while retaining constant annual assumptions outside configured path dates. Add strict date/rate validation, private-config provenance, synthetic sequence-order regression coverage, and public-safe configuration documentation.
- Browser-validation state: Not applicable; PR #33 adds no new interactive control surface
- Preserved contracts: Tax and RRIF calculations, non-registered taxation, liability scheduling, contribution room, savings and surplus policy, withdrawal priority, Lunch Money ingestion, and private-data boundaries remain unchanged except that configured return/inflation paths change the monthly rates supplied to the existing financial engine
- Synthetic validation: Passed on implementation commit `3ab20d8b68029c0f8fa51910be73f27cb1894e86` through hosted CI run 180 — typecheck, complete test suite including deterministic sequence-order regressions, lint, and production build all succeeded. Hosted Docker run 174 also succeeded. Exact `docker compose config --quiet` could not be executed in this session because the available container environment has no Docker executable; the Compose file is unchanged by PR #33. No private planner configuration or values were accessed.
- Latest synchronized `main` at implementation start: `8456aa04145760437bbd51e845756828b77cbbbe`
- Last completed planning change: [#32 Plan sequence risk and tax-aware retirement drawdown](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/32)
- Last completed dashboard redesign stage: PR 4, [#31 Polish the retirement planner dashboard](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/31)
- PR #31 merge commit: `376d0a5912ac6e7070eed91bcdb5ef5982358385`
- Previous completed dashboard redesign stage: PR 3, [#30 Organize technical plan details](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30)
- PR #30 merge commit: `b7223466dce4c47faa295aa9555ca40f69623895`
- Previous completed dashboard redesign stage: PR 2, [#29 Clarify the retirement overview](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/29)
- PR #29 merge commit: `e1989aceaf4ba31ef9154eed91bcdb722ff`
- Previous dashboard redesign stage: PR 1, [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- PR #28 merge commit: `4dff690e63e567802d220df04c6478010d494307`
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Not run for PR #33; no private scenario activation or private financial values were required to validate this public deterministic capability
- Remaining step: Confirm hosted CI and Docker validation on the final tracking-only PR head, then review PR #33 before merge
- Next action: Merge PR #33 only after review. Tax-aware retirement withdrawal strategies remain planned and must not begin until PR #33 merges.

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
| 10 | Deterministic return paths and sequence-risk scenarios | Reconciled deterministic projection | In progress | [#33](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/33) |
| 11 | Tax-aware retirement withdrawal strategies | Annual Canadian tax, RRIF, non-registered tax, retirement requirement, and deterministic return paths | Planned | — |
| 12 | Structured housing transitions | Net-worth, debt, spending, and event models | Planned | — |

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

> Read `AGENTS.md`, `plan/roadmap.md`, `plan/implementation-index.md`, `docs/retirement-strategy.md`, and `docs/return-path-scenarios.md`. Planning PR [#32](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/32) is merged. Draft implementation PR [#33](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/33) is open on `agent/deterministic-return-paths` from main `8456aa04145760437bbd51e845756828b77cbbbe`. The validated implementation commit is `3ab20d8b68029c0f8fa51910be73f27cb1894e86`; hosted CI run 180 and Docker run 174 passed on it. PR #33 implements explicit deterministic annual/monthly investment-return paths and optional inflation paths through the shared monthly projection and retirement-requirement engines, with synthetic sequence-order regression coverage and no private financial values. Confirm the final tracking-only head validation before review or merge. Tax-aware retirement withdrawal strategies remain next after PR #33 merges.