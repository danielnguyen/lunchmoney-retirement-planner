# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open roadmap planning pull request: None
- Planning branch: None
- Planning status: None
- Open implementation pull request: [#31 Polish the retirement planner dashboard](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/31)
- Open maintenance pull request: None
- Pull request state: Open, draft, mergeable, and unmerged; exact live-head hosted validation results are retained in the pull-request description
- Active implementation: Final dashboard visual, responsive, print, typography, and accessibility polish
- Status: PR 4 of 4 is implemented and validated locally and in hosted workflows; the planned dashboard redesign will be complete after review and merge
- Implementation branch: `agent/final-dashboard-polish`
- Starting synchronized-main SHA: `343e3af4cc689b37e44312ba1507d68a45ec5fc7`
- Validated implementation commit: `79294d84e3e38f5252a0ccab51890e51fbff0fc8`
- Accessibility and print-contrast correction commit: `59e5c0da316ff2e29094e1c6803950e510538bb0`
- Exact final PR head: Retained in the pull-request description because recording a tracking commit's own SHA would recursively create another head
- Change: Consolidate the application around compact neutral surfaces, mint/teal primary accents, consistent spacing/radius/focus tokens, and a 14px user-facing typography floor. Flatten the Retirement outlook composition, present supporting figures as one divided 4/2/1-column grid, keep the calculated minimum secondary, standardize report and chart presentation, centralize chart colours, and label chart figures from visible headings. Reorder the six same-page navigation destinations, add Plan details, remove static `aria-current`, add a focus-visible skip link whose Retirement outlook target receives programmatic fragment focus, and provide pressed-state semantics for the renamed inflation-adjusted/future-dollar controls. Improve contained responsive tables, viewport-bounded drawers, long-value wrapping, 40/44px interaction targets, reduced-motion handling, Assumptions and data sources wording, and printable disclosure/table behaviour. The final correction gives visible nested report surfaces light print backgrounds and makes chart text plus the light screen series visible on white paper while preserving PR 3 evidence and the established screen palette.
- Browser-validation state: Firefox is installed, but no existing browser automation or screenshot harness can exercise the live-data dashboard, drawers, disclosures, zoom, and print preview. Meaningful browser validation was unavailable without adding a dependency or accessing private configuration; neither was done. Focused jsdom and CSS/source tests cover the structural, interaction, responsive, and print contracts.
- Preserved contracts: Projection and solver calculations, tax and RRIF behaviour, taxable-account and savings policies, registered room, balances, warning classification and serialization, Lunch Money ingestion, scenario overrides, YAML configuration semantics, APIs, schemas, JSON and CSV export structures, export filenames, and exported numeric values are unchanged.
- Synthetic validation: Passed locally — 54 focused visual/layout/accessibility/print, dashboard, and explanation tests; 42 focused configuration and drawer tests; 81 focused export/privacy/runtime tests; 589 tests across the complete 32-file suite; typecheck, lint, production build, diff check, Docker image build, Compose validation, isolated schema-aware health smoke with the public synthetic example (`5.0` baseline schema and `13.0` projection schema), and clean container and temporary-file removal. No private planner configuration or values were accessed.
- Latest merged `main`: `343e3af4cc689b37e44312ba1507d68a45ec5fc7`
- Last completed dashboard redesign stage: PR 3, [#30 Organize technical plan details](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/30)
- PR #30 merge commit: `b7223466dce4c47faa295aa9555ca40f69623895`
- Previous completed dashboard redesign stage: PR 2, [#29 Clarify the retirement overview](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/29)
- PR #29 merge commit: `e1989aceaf4ba31ef9154eedb5e2dd6afdb722ff`
- Previous dashboard redesign stage: PR 1, [#28 Compact the retirement planner application shell](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/28)
- PR #28 merge commit: `4dff690e63e567802d220df04c6478010d494307`
- Last completed private migration: Passed — the operating-cash policy was updated and validated locally without publishing private values
- Private smoke state: Passed — the unchanged private configuration normalized through non-registered compatibility without reporting values. Simplified private mode was not run because explicit ACB and distribution assumptions are absent.
- Remaining step: Keep PR #31 draft and unmerged for review
- Next action: Hand off PR #31 with its exact final head and hosted results retained in the pull-request description

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

> Read `AGENTS.md`, `plan/roadmap.md`, and `plan/implementation-index.md`. PRs #28, #29, and #30 completed the compact shell, retirement overview, and Plan details hierarchy. Draft [PR #31](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/31) is PR 4 of 4 and contains the final visual-system, responsive, print, typography, and accessibility polish from synchronized starting commit `343e3af4cc689b37e44312ba1507d68a45ec5fc7`. Local and hosted validation passed without private configuration access or financial-contract changes; the exact final head and hosted run results are retained in the pull-request description. Keep the pull request draft and unmerged for review.
