# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: [#32 Plan sequence risk and tax-aware retirement drawdown](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/32)
- Planning branch: `agent/plan-retirement-risk-and-drawdown`
- Planning status: In progress — roadmap and public-safe retirement strategy are under review
- Open implementation pull request: None
- Open maintenance pull request: None
- Pull request state: PR #32 is open, draft, unmerged, and planning-only; no roadmap implementation pull request is open
- Active implementation: None
- Status: PR #32 keeps deterministic return paths and sequence-risk scenarios as the next implementation capability, promotes tax-aware retirement withdrawal strategies to follow them, moves structured housing transitions after both, and records the public strategy boundary without personal financial values
- Implementation branch: None
- Starting synchronized-main SHA: `c10e8c255fd8d7a0370be547e64b350f310db386`
- Validated implementation commit: None — this pull request changes planning/documentation only
- Exact final PR head: Determined from GitHub rather than duplicated here so tracking updates do not recursively obsolete their own recorded head
- Change: Refresh roadmap status after the completed Canadian annual tax, RRIF, and simplified non-registered tax work; define deterministic sequence-risk as the next runtime capability; add a distinct tax-aware retirement-withdrawal contract that preserves static withdrawal priority as a compatibility baseline; and add `docs/retirement-strategy.md` as a generic public reference for accumulation, bridge years, stress paths, registered drawdown, spending, benefits, and housing boundaries
- Browser-validation state: Not applicable to this planning-only change
- Preserved contracts: Projection and solver calculations, tax and RRIF behaviour, non-registered taxation, taxable-account and savings policies, registered room, balances, withdrawal priority, warning classification and serialization, Lunch Money ingestion, scenario overrides, YAML configuration semantics, APIs, schemas, JSON and CSV export structures, export filenames, and exported numeric values are unchanged
- Synthetic validation: Runtime tests were not run because PR #32 changes documentation/planning only and this session has no local checkout or GitHub CLI. Connector comparison confirmed the branch started from current `main`; committed content is limited to roadmap/strategy/tracking documentation and contains no private planner values.
- Latest synchronized `main` at planning start: `c10e8c255fd8d7a0370be547e64b350f310db386`
- Last completed dashboard redesign stage: PR 4, [#31 Polish the retirement planner dashboard](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/31)
- PR #31 merge commit: `376d0a5912ac6e7070eed91bcdb5ef5982358385`
- Previous completed dashboard redesign stage: PR 3, [#30 Organize technical plan details](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30)
- PR #30 merge commit: `b7223466dce4c47faa295aa9555ca40f69623895`
- Previous completed dashboard redesign stage: PR 2, [#29 Clarify the retirement overview](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/29)
- PR #29 merge commit: `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`
- Previous dashboard redesign stage: PR 1, [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- PR #28 merge commit: `4dff690e63e567802d220df04c6478010d494307`
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: Review and merge planning PR #32 before beginning the next roadmap implementation
- Next action: After PR #32 merges, begin deterministic return paths and sequence-risk scenarios from a freshly synchronized `main`; begin tax-aware retirement withdrawal strategies only after that implementation merges

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
| 10 | Deterministic return paths and sequence-risk scenarios | Reconciled deterministic projection | Next | — |
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

> Read `AGENTS.md`, `plan/roadmap.md`, `plan/implementation-index.md`, and `docs/retirement-strategy.md`. Draft planning PR [#32](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/32) is open on `agent/plan-retirement-risk-and-drawdown`; it keeps deterministic return paths and sequence-risk scenarios as the next implementation capability and promotes tax-aware retirement withdrawal strategies to follow them before structured housing transitions. The public strategy document contains no personal financial values and private YAML remains authoritative for real parameters. Do not begin implementation until PR #32 is reviewed and merged. After merge, start deterministic return paths and sequence-risk scenarios from a freshly synchronized `main`; tax-aware drawdown follows only after that implementation merges.
