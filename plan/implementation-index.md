# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Active implementation: Configurable scenario comparison (Issue #37)
- Implementation branch: `openhands/issue-37`
- Starting main SHA: `a8f4c8d` (PR #34 merged)
- Status: Implementation complete; npm validation passes, Docker build blocked by container mount permissions; draft review required
- Open implementation pull request: [#38 Configurable side-by-side retirement scenario comparison](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/38), draft
- Change: Optional typed YAML definitions, stable financial-phase selectors, shared-engine cash-constrained contributions and monthly reconciliation, accessible comparison scorecards/charts and temporary edits
- Preserved contracts: Ordinary projection behavior without comparison, existing YAML persistence, typed export allowlist, liability schedules, tax strategy and retirement solver scope
- Synthetic validation: `npm test`: 620 tests passed across 35 files, including 22 comparison tests; `npm run typecheck`, `npm run lint`, `npm run build`, and `docker compose config --quiet` passed
- Browser-validation state: Synthetic jsdom dashboard/API integration passes; no real-browser automation available in this session
- Docker validation: Build attempted; container denies BuildKit bind mounts. Compose configuration validation passed. No validation waiver is implied.
- Private-data state: No private planner files or financial exports accessed
- Independent review: Required on the exact pushed head; draft PR receives `openhands-review` after the final tracking commit is pushed
- Last completed modelling capability: Deterministic return paths, PR [#33](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/33), confirmed merged on GitHub
- Remaining step: Independent review of the exact PR head and Docker build in a capable environment remain required before readiness; no merge or deployment

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

| — | Configurable scenario comparison (#37) | Shared monthly projection and configured phases | In progress | [#38](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/38) |

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

Read `AGENTS.md`, the roadmap, this index and the scenario comparison documentation
in README/architecture. PR #33 has merged. Issue #37 is the current independent
comparison capability on `openhands/issue-37`; #35 and #36 remain separate. Use
GitHub for the exact draft PR head and review state. Do not begin another roadmap
implementation while this draft is open. Docker build remains blocked by container
mount permissions and must pass in a capable validation environment before readiness.
