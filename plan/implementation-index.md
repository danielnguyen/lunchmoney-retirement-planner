# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Active implementation: conditional FIRE milestones (#47), branch `openhands/issue-47`.
- Clean main baseline `4ff755971aac8345a854bdbca40fbe427b4fcb3b`; PR #49 merged
  2026-11-28 with independent exact-head approval and successful CI/Docker checks.
- No open PR at execution start. #46 is complete; #48 remains held.
- Scope: existing monthly engine/configured career assumptions, projection API,
  dashboard/charts/controls, synthetic tests and existing documentation.
- Excluded: inverse income solver, new financial engine, optimization, private data,
  dependencies, CI permissions, merge and deployment.
- Draft PR: [#50](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/50).
  Independent exact-head review and hosted validation are requested on the final
  head; only the owner may mark ready, merge or deploy. #47 browser evidence is
  recorded below; #46 had not verified real-browser geometry.

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
| 11 | Tax-aware retirement withdrawal strategies | Annual Canadian tax, RRIF, non-registered tax, retirement requirement, and deterministic return paths | Completed | [#44](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/44) |
| 12 | Structured housing transitions | Net-worth, debt, spending, and event models | Planned | — |

| — | Inverse retirement spending capacity (#35) | Shared monthly engine and retirement requirement | Completed | [#41](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/41) |
| — | Conditional FIRE milestones (#47) | Career transitions and shared monthly engine | In progress | [#50](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/50) |
| — | Career transitions and editable FIRE presets (#46) | Scenario comparison and shared monthly engine | Completed | [#49](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/49) |
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

Resume #47 on its existing branch/PR. Recover current GitHub head, checks and
independent review; #46 merged in #49. Do not begin #48.

## Issue #36 execution record

- Live issue body SHA-256 matched the trusted task contract; branch clean and at
  current main before edits. #35/#39 closed and no open implementation PR found.
- Read shared AGENTS.md, WORKFLOW.md, AUTHORITY.md, ENGINEERING.md and
  integrations/openhands.md at `07079695e12e52afe374cd754a7295817e957e1e`.
- Read repository AGENTS.md, roadmap, index, plan guide, architecture and retirement
  strategy, PR #32 contract, monthly projection, inverse solver and synthetic tests.
- Storage gate: 144 GB free, over 11.5 million free inodes in workspace/cache filesystems.
- No private configuration read. All fixtures and examples are synthetic.
- Initial focused checks caught test-fixture errors and demonstrated that retaining
  bridge surplus at a lower return can reduce terminal after-tax assets; the
  comparison explicitly preserves this trade-off rather than claiming optimality.

- Inverse integration found a real sub-cent exhausted-balance defect in planned
  gross draws. Monthly planned gross is now floored to cents before annual tax
  recognition; the unchanged inverse safety checks and regression pass.
- Synthetic coverage includes bridge benefit and lower-return downside, conversion-year
  elective RRIF draws, uncapped statutory payments, OAS recovery, room-limited TFSA
  overflow and taxable ACB routing, adverse return/inflation paths, partial years,
  terminal floors, default compatibility, infeasible cash, inverse integration,
  dashboard ledger and allowlisted rectangular exports.
- Full suite: 708/708 tests in 42 files passed. Final table-style adjustment also
  passed its focused dashboard test. Typecheck, lint, production build, Compose
  configuration and all eight production HTTP export checks passed.
- Local Docker command failed with permission denied at the Docker socket; no
  privilege escalation or workflow-permission changes. Existing PR-hosted Docker
  validation must pass on the final head. Independent review is requested via
  `openhands-review` only after the branch is pushed and draft opened.

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

## PR #44 hosted validation correction

- Initial head `85f6ae4b5144cd5604a1ff2af7c4d85fa7066eec`: hosted Docker
  succeeded (run `45915007034`); CI run `45915007074` failed five existing
  five-second test budgets (three new drawdown cases and two dashboard cases).
- Removed an unnecessary baseline funding-requirement search from strategy
  comparison; it needs only the shared monthly simulation and terminal-liquidation
  evaluation. Added cumulative OAS recovery to the comparison instead of computing
  another full projection solely for that assertion. Default strategy simulations
  do not allocate bridge-only lifecycle checks.
- The direct compatibility fixture uses a shorter horizon; separate lifetime/RRIF
  cases retain the full horizon. Narrowed queries in the two implicated dashboard
  tests, preserving all assertions, the real handlers and five-second budgets.
  These bounded test-file edits address observed CI failures without changing
  config-sync behavior or workflow permissions.
- Correction: 24 focused tests passed; full 708/708 tests in 42 files passed.
  Typecheck, lint, build, Compose and eight production HTTP export checks passed.
  Hosted CI/Docker and independent review must confirm the corrected exact head.

## Issue #46 execution record

- Verified live issue SHA-256 `056644e212d269aef31d5f59b5b394191f68e659676d789b64d0ffce3190bf54`.
- Worker read shared AGENTS.md, WORKFLOW.md, AUTHORITY.md, ENGINEERING.md,
  integrations/openhands.md and integrations/chatgpt.md at
  `07079695e12e52afe374cd754a7295817e957e1e`.
- Read target AGENTS.md, roadmap, implementation index, plan guide, architecture,
  retirement strategy, Git-managed config instructions, #37/PR #38 and PR #44 state,
  comparison/parser/editor, monthly engine, tax ledger and synthetic tests.
- Checkout is isolated from the automation bundle; origin has no credentials.
  Verified branch and main before editing. No existing changes or private config read.
- Storage preflight: 142 GB free and more than 11 million free inodes.
- Reused comparison materialization and the shared monthly engine, annual tax and
  retirement requirement. No alternate financial engine or new runtime dependency.
- Directly implicated new files: career scenario materialization, dated payroll
  approximation, career controls and focused synthetic tests. Existing monthly
  engine changes are limited to opt-in career indexing and surplus retention.
- Initial focused checks exposed a duplicated spending-phase ID after moving
  retirement and empty savings routes after removing all career contributions.
  Both are corrected without weakening validation; zero-saving routes remain explicit.
- Gross estimates deliberately disclose the existing tax model's payroll-credit
  limitations and partial-year annualization. Unknown employer-match taxation requires
  explicit overrides; no actual employer benefits or CPP entitlement are invented.

- Canonical task-brief SHA-256 (sorted JSON keys, compact separators):
  `5d5e14ed79c6210069122aa8217ad9b5ce9d767020257f1cd3d72d3f33238063`.
- Self-review identified retained cash as a possible hidden dependency on continued
  saving. Coast now also runs the existing engine without uncommitted surplus from
  first Coast through retirement; it cannot certify a cash-savings-dependent plan.
- Final local validation: 739 tests in 44 files passed; typecheck, lint and
  production build passed. Focused coverage includes real UI-to-API calculations,
  full-horizon cash ledgers, no-saving Coast counterfactuals, Barista intervals,
  payroll/room/withholding, CPP sensitivity, config examples and adverse paths.
- Local Docker build was attempted and denied at `/var/run/docker.sock`; no
  escalation. Compose config passed. Existing PR Docker CI must validate the final
  head before readiness. Chromium could not establish a local debugging connection;
  no browser geometry pass is claimed. The attempted browser harness was removed;
  accessible controls and UI-to-engine behavior are covered by jsdom tests.
- Export privacy regressions passed in the full suite. All eight built-server
  HTTP/export boundary checks passed after the final production build.

- Published draft PR #49 from the tested implementation commit `d39691be411f759152bf53bc8d9da2eac65dc790`.
  This documentation-only follow-up records the PR link. GitHub owns the final head
  and changing check/review status. Request `openhands-review` after this update is pushed.
- Git author metadata was absent in the checkout. Used the repository's existing
  OpenHands bot attribution through per-command environment variables; no Git
  configuration was changed.

## PR #49 review corrections

- Resumed a clean checkout at requested head `47595843d95e7e55c2233dcab12da9a63f176516`.
  Issue hash, current main and shared policy revision remain unchanged from the
  execution record above. Read current review, both inline findings, discussion
  and checks directly from GitHub; no failing checks or other open PRs were present.
- Career cash retention now funds separate operating/reserve targets before
  retaining the remainder, without investment sweeping. Target-funding attribution
  reflects actual transfers; total cash and contribution reconciliation remains
  exact to the cent. Ordinary non-career policy behavior is unchanged.
- Reserve and unallocated-withholding eligibility use each scenario's own career
  configuration. Adding an alternative changes the ledger horizon without changing
  baseline feasibility, lifetime viability, warnings, summary or first shortfall.
- Four synthetic regression cases fail against the reviewed implementation and
  pass with the fixes. Coverage includes both simple unplanned-cash policies,
  separate reserve accounts, actual and no-saving Coast flows, and independent
  baseline reserve/withholding cases. Reused the existing simple-policy fixture setup.
- Validation: all 743 tests in 44 files, typecheck, lint, production build, Compose
  config and eight production HTTP/export checks passed. The strengthened isolated
  withholding regression also passed after the full-suite run. Local Docker build
  remains denied by socket permissions; hosted exact-head Docker validation is
  required. No browser geometry validation is claimed for these domain corrections.
- Scope remains two domain files, the existing career test file and this index.
  Reply to both review findings, push this correction on the existing draft PR and
  reapply `openhands-review`; owner alone controls readiness, merge and deployment.

## Issue #47 execution record

- Live issue SHA-256 verified:
  `36090f9817f0a27d76b9986d02bacf8febc66adb9cb145f1f1eed368591c300f`.
- Read shared AGENTS.md, WORKFLOW.md, AUTHORITY.md, ENGINEERING.md,
  integrations/chatgpt.md and integrations/openhands.md at
  `f3e619116a87fa872269460aa70c74ef9157ee4f`.
- Read target AGENTS.md, roadmap/index, plan guide, architecture, retirement
  strategy, #46 and PR #49 merge/review/check evidence, career materialization,
  comparison, projection/requirement/return paths, UI/API and synthetic tests.
- Separate clean checkout at current main, repository identity verified, origin
  credential-free. Branch created before edits; automation bundle untouched.
  No private planner configuration read. Storage: 140 GB and 11 million inodes free.
- Scope includes opening-boundary retirement support because Full FIRE can already
  meet conditions at projection start. Candidate checks reuse the existing monthly
  engine without paying for an inverse asset-requirement search at every date.
- Initial tests caught incorrect synthetic field/type names and an empty annual
  report at an immediate unfunded debt boundary. Forward funding checks now report
  that stopped candidate without requiring an annual report row. No assertions or
  budgets were weakened.
- First complete validation: 752 tests in 46 files passed, typecheck, lint,
  production build and Compose config passed. Additional boundary/UI validation
  follows; final evidence is recorded below.
- Local Docker build denied access to `/var/run/docker.sock`; no escalation.
  Hosted exact-head Docker is required before readiness; independent review and
  owner-only merge/deployment remain unchanged.
- Real Chromium testing found duplicate sibling React keys between the new panel
  and comparison, causing remounts. Added a unique panel key and a dashboard
  integration regression with both features enabled. A fresh browser run passed
  synthetic baseline interception plus real projection HTTP, three cards, chart
  labels and panel geometry at mobile (390) and desktop (1440) viewport widths,
  with no runtime exceptions. This is new #47 evidence, not a retroactive #46 pass.
- `components/spending-capacity.tsx` is directly implicated only to export its
  existing read-only path-rate renderer for the milestone assumptions view.
- Final domain/API suite: 757/757 tests in 46 files passed. Typecheck, lint and
  production build passed. The expanded mobile form check then exposed controls
  outside the inherited comparison-card width rules; scoped milestone styles fix
  that overflow. Focused milestone/career UI regressions and the production browser
  were rerun after that style change.
- Final production Chromium run passed at 390×844 and 1440×1000: opt-in calculation,
  configured Coast/Barista terms, three result cards, conditional chart markers,
  expanded mobile controls/cards fitting the viewport, no panel horizontal overflow
  and no runtime exceptions. Baseline responses were synthetic; projections used
  the real built HTTP route. No live financial data or private config was used.
- All eight built-server HTTP export privacy/boundary checks and Compose validation
  passed after the final build. Hosted exact-head Docker/CI and independent review
  remain pending publication. Git author metadata was absent; commits use the
  repository's existing OpenHands attribution via per-command environment variables,
  without changing Git configuration.

- Published draft PR #50 from implementation commit
  `f2ff15c` (use GitHub for the full current head). This documentation follow-up
  records the PR link; apply `openhands-review` after pushing it so the independent
  reviewer receives the final head. Hosted checks and review state live on the PR.
