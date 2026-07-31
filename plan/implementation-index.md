# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#25 Add annual Canadian retirement taxation](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/25)
- Open maintenance pull request: None
- Pull request state: Open draft
- Active implementation: Annual Canadian retirement taxation for an Ontario resident
- Status: Ready for independent review
- Implementation branch: `agent/add-annual-canadian-retirement-tax`
- Validated implementation commit: `5f6d27517239657592e6b3aaadfd4decac8c9aab`
- Synthetic validation: Passed — 493 synthetic tests, including 32 focused configuration, flat/Canadian tax integration, JSON allowlist, nominal/real rectangular CSV, and export-privacy tests. Flat compatibility now exports provisional status from the shared taxation summary and leaves Canadian annual reconciliation explicitly not applicable; Canadian annual rows preserve their shared reconciliation result. Typecheck, lint, production build, local Docker image build, Docker Compose validation, planner-container startup, health endpoint smoke, clean planner-container removal, private flat-compatibility smoke, and `git diff --check` passed. Hosted CI and Docker image build are pending on the corrected branch head. All committed values are synthetic.
- Latest merged `main`: `d5765c736cc1688302710f57359ecf947e347352`
- Last completed capability: Retirement funding requirement and terminal balance
- Last completed pull request: [#24 Derive retirement funding requirement](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/24)
- Last completed maintenance correction: Retirement bridge ending precision
- Last maintenance pull request: [#23 Fix retirement bridge reconciliation against raw balances](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/23)
- Last completed synthetic validation: Passed — 396 synthetic tests for the merged retirement bridge ending-precision correction; its one-cent integrity threshold and financial calculations remained unchanged
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Flat compatibility passed without reporting private values; Canadian annual mode was not run because the private configuration does not supply the explicit new inputs
- Remaining step: hosted CI and Docker validation on the corrected final head, followed by independent review of draft pull request #25
- Next action: independently review annual Canadian tax; after merge, implement RRIF conversion and statutory minimum withdrawals in the immediate next stage, then simplified non-registered taxation and final migration

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
| 9 | RRIF minimum withdrawals and Canadian retirement taxes | Surplus policy, debt model, spending phases, and requirement contract | In progress — annual-tax stage | [#25](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/25) |
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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. Continue or independently review the annual Canadian retirement-tax implementation using synthetic data only. Confirm dated 2026 Canada/Ontario references, annual YTD full-versus-embedded-versus-funded tax, annual OAS recovery, exact-cent taxable-withdrawal gross-up, shared requirement-engine reuse, partial-year evidence, export privacy, and flat compatibility. RRIF conversion/minimum withdrawals remain the immediate next stage; simplified non-registered taxation follows.
