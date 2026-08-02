# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#30 Organize technical plan details](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30)
- Open maintenance pull request: None
- Pull request state: [#30 Organize technical plan details](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30) is open as a draft, mergeable, and unmerged; hosted validation is pending on the tracking head
- Active implementation: Technical plan-detail and warning-information hierarchy
- Status: PR 3 implementation, local validation, and draft publication are complete; hosted validation remains pending
- Implementation branch: `agent/organize-plan-details`
- Starting merged-main SHA: `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`
- Validated implementation commit: `186d60bf42f9b6d6da3e3d1d5c872803ea10ad3e`
- Exact final PR head: Retained in the pull-request description because recording a tracking commit's own SHA would recursively create another head
- Change: Let the Retirement outlook flow directly into the main charts and report, then provide the existing tax, RRIF, taxable-account, projection-completion, duration, and limitation evidence in five closed native disclosures under `Plan details`. Only warnings that call for review or configuration remain in the `Action needed` panel above the outlook; informational compatibility and calculation notices remain auditable in the detailed section. Existing annual-tax and financial-assets-duration explanation targets are preserved inside disclosure content, and closed disclosure evidence remains available in print.
- Follow-up boundary: PR 4 retains comprehensive visual-system, responsive, print, typography, and accessibility polish. This PR includes only the focused layout, disclosure, warning, and print-preservation styles required by the technical-detail reorganization.
- Preserved contracts: Projection and solver calculations, tax calculations, RRIF behaviour, savings policies, configuration behaviour, APIs, schemas, JSON and CSV export structures, export filenames, and exported numeric values are unchanged.
- Synthetic validation: Passed locally — 88 focused dashboard, warning, explanation, and print tests across 4 files; 574 tests across the complete 32-file suite; typecheck, lint, production build, diff check, Docker image build, Compose validation, isolated schema-aware health smoke with the public synthetic example, and clean container removal. No private planner configuration or values were accessed.
- Latest merged `main`: `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`
- Last completed dashboard redesign stage: PR 2, [#29 Clarify the retirement overview](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/29)
- PR #29 merge commit: `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`
- Previous dashboard redesign stage: PR 1, [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- PR #28 merge commit: `4dff690e63e567802d220df04c6478010d494307`
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: Push this tracking update, update the pull-request description with the exact final head, and confirm hosted CI and Docker validation on that head
- Next action: Keep PR #30 draft and unmerged; do not begin PR 4 work

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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. PRs #28 and #29 completed the compact shell and retirement overview. PR 3 is open as draft [#30](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30) on `agent/organize-plan-details` from synchronized `main` at `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`. Its scope is limited to the Plan details disclosures and actionable-warning hierarchy. PR 4 retains comprehensive visual-system, responsive, print, typography, and accessibility polish.
