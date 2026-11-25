# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Active implementation: Private-Git planner YAML sync and saved-plan JSON retrieval (Issue #39)
- Implementation branch: `openhands/issue-39`
- Starting main SHA: `7ec7ed5e884891023cbcf82dbc7c1ee1e7c87682` (PR #38 merged)
- Status: Implementation and synthetic validation complete; draft independent review and hosted Docker validation required
- Open implementation pull request: Issue #39 draft on `openhands/issue-39`; use GitHub for its current URL and exact head
- Change: Explicit host-side Git revision activation through the existing YAML validator, atomic replacement, opt-in read-only Compose wiring, and a dedicated authenticated GET for the standard saved-plan JSON export
- Preserved contracts: Standalone config editing, temporary browser scenarios, browser JSON POST/CSV exports, shared baseline/projection logic, and typed privacy allowlist; no modelling changes
- Synthetic validation: `npm test` passed (651 tests across 37 files), including Git revisions/dirty checkout/failure preservation/rollback/CLI status, refresh through the real baseline loader, saved-plan export authentication/freshness/parity/privacy, and existing disabled-write/temporary-scenario regressions
- Production HTTP smoke: Built standalone server passed missing/wrong credential, query rejection, sanitized upstream failure and no-store checks with fake export credentials and no Lunch Money token
- Other validation: `npm run typecheck`, `npm run lint`, `npm run build`, default and Git-managed `docker compose config --quiet` passed; resolved Git-managed Compose also verified forced disabled writes and one read-only directory mount
- Docker validation: Local build attempted; ordinary user lacks socket permission, and the local daemon with sudo cannot perform BuildKit bind mounts. Hosted image build must pass; this is not a waiver.
- Private-data state: Only synthetic repositories, YAML, baseline readers, and fake export credentials used; no private configuration or deployment accessed
- Independent review: Required on the exact pushed head through `openhands-review`; GitHub owns current review findings and CI evidence
- Shared instructions read: `AGENTS.md`, `WORKFLOW.md`, `AUTHORITY.md`, `ENGINEERING.md`, and `integrations/openhands.md` at shared revision `07079695e12e52afe374cd754a7295817e957e1e`
- Last completed capability: Configurable scenario comparison, [PR #38](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/38), confirmed merged at `7ec7ed5e884891023cbcf82dbc7c1ee1e7c87682`; approved independent review on its final head and hosted CI/Docker success are recorded there
- Remaining step: Independent exact-head review and hosted Docker evidence, followed by owner merge decision; private Git setup, export connection provisioning, merge and deployment remain separate owner actions

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

Read `AGENTS.md`, the roadmap, this index and `docs/git-managed-planner.md`.
PR #38 is merged; its comparison capability is complete. Issue #39 is the active
bounded delivery on `openhands/issue-39`; #35 and #36 remain separate. Recover the
exact draft head, checks and independent review from GitHub. Do not begin another
roadmap implementation while this draft is open. Local Docker build is limited by
container mount permissions; verify hosted Docker evidence before readiness.
