# Implementation Index

This document is the operational handoff for roadmap delivery. Detailed capability contracts live in [`roadmap.md`](./roadmap.md); repository-wide contribution rules live in [`AGENTS.md`](../AGENTS.md).

Public tracking must remain generic and must not contain private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Active correction: FIRE and career-income funding/performance (#52), branch
  `openhands/issue-52`, based on clean main `4fb152ee5c3cad763bb36be685e4ccba6479a338`.
- PR #51 is merged. #48 remains open for owner deployed acceptance; its deployed
  findings are addressed here. No other open PR at execution start.
- Scope: career materialization, shared monthly funding/search and implicated tax
  preview reuse, minimal calculation controls/evidence, synthetic tests and docs.
- No new config schema, dependencies, infrastructure, page redesign, private data,
  workflow changes, merge or deployment. Independent exact-head review and hosted
  checks follow the draft PR; owner retains deployed acceptance.

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
| — | Required employment income (#48) | Career scenarios and conditional funding checks | Merged; deployed acceptance pending | [#51](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/51) |
| — | Conditional FIRE milestones (#47) | Career transitions and shared monthly engine | Completed | [#50](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/50) |
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

Resume #52 on its existing branch/PR and recover current GitHub head, checks and
independent review. Keep #48 open until the owner verifies the deployed correction.
Do not begin another capability or the deferred page redesign.

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

## PR #50 review correction

- Resumed the clean existing branch at requested head
  `93168c28b8187848c3519ab70f53af9212ea7962`; main remains
  `4ff755971aac8345a854bdbca40fbe427b4fcb3b`. PR #50 is the only open PR.
  Re-read issue/comments, PR discussion/review/inline finding and checks, target
  rules/roadmap/index and shared rules at unchanged `f3e619116a87fa872269460aa70c74ef9157ee4f`.
  The issue body still matches the recorded dispatch hash.
- Addressed review comment 4725561249: global CPP scaling can change accumulation
  before a candidate. Use the review's explicit unavailable alternative when a
  changed multiplier would affect CPP payable before the transition, including
  the engine's month-end claim boundary. Do not skip an unsupported candidate and
  falsely claim a later date is earliest. Opening transitions, unchanged CPP and
  transitions before CPP starts remain supported. No dated benefit model added.
- Bounded files: milestone materializer, its synthetic tests, existing strategy
  documentation and this execution index. No UI, engine, dependencies, private
  configuration or export behavior changed.
- Three new strategy regressions compare all 12 monthly pre-transition flows and
  balances with baseline for supported unchanged CPP, reject reduced CPP for a
  future candidate, and verify unavailable search results retain earlier failures.
  They cover opening transitions and claim-age boundaries. The initial regression
  helper passed the baseline directly to the engine's normalizing validator;
  cloning that independent probe input corrected the test's mutation assertion.
- Validation: 17 focused tests and all 760 tests in 46 files passed; typecheck,
  lint, production build, eight production HTTP export checks, Compose config and
  diff whitespace passed. Local Docker again denied socket access; hosted checks
  must validate the revised head. No new browser geometry claim is made for this
  domain-only correction. Non-monotonic coverage remains an evaluator-grid test,
  not evidence of a financially non-monotonic example.
- Next: push this correction to the existing draft, reply to the inline finding,
  and remove/reapply `openhands-review` for independent review of the new head.
  Owner-only ready/merge/deploy restrictions remain in force.


## Issue #48 execution record

- Verified live issue SHA-256 `3dcf26529648fab6dd71a5885692a42749be9a86cba5753af4ba06df4e0fd100`.
- Read shared AGENTS, WORKFLOW, AUTHORITY, ENGINEERING and ChatGPT/OpenHands
  integration rules at `f3e619116a87fa872269460aa70c74ef9157ee4f`.
- Read target AGENTS, roadmap/index, plan guide, architecture/strategy, #46/#47,
  PR #50 merge/review/checks, career/payroll, milestone/inverse/funding engine,
  route/dashboard and synthetic fixtures. No nested instructions found.
- Separate clean checkout from main `429a5f4a26e0e7e584658f3a4dcc4fdf25339091`,
  credential-free origin and expected branch verified. Automation bundle untouched.
  Storage: 136 GB and more than 11 million inodes free. No private config read.
- Reuse the career materializer and extract shared forward constraints from FIRE
  evaluation; existing milestone response shape is preserved. No new payroll model.
- Bound search to supported gross relations, explicit cap/resolution, 61 dates,
  2 million simulated months and 30 seconds. Report unavailable remaining points,
  sampled reversals, cap exhaustion and adjacent lower failures without global claims.
- Initial focused checks exposed floating-point assertion precision and incomplete
  synthetic stress metadata; corrected the fixtures/assertions without weakening
  cent reconciliation or product constraints. Export tests target new analysis
  fields rather than the pre-existing exported employment-income ledger field.
- Validation and independent review pending; owner-only readiness/merge/deploy.
- Final validation: 783 tests in 48 files, typecheck, lint, production build,
  Compose config and all eight production HTTP export checks passed.
- Production Chromium passed at 390px and 1440px with synthetic baseline
  interception and real projection HTTP: opt-in calculation, expanded job controls,
  chart/accessible table, no panel/control overflow, opt-out and no runtime exceptions.
  The reproducible test uses a temporary browser profile/config/cache, cleaned on exit.
- Analytical and full-engine fixtures cover zero/capped/unavailable boundaries,
  fresh adjacent failure checks, tax/CPP/EI thresholds, RRSP earned room/withholding,
  unchanged prefixes, CPP guard, debt/reserves/terminal floor, adverse return paths,
  month-end real-dollar indexing, temporary overrides and export privacy.
  Nonmonotonic counterexamples are evaluator-grid tests, not a financial proof of
  monotonicity. The UI explicitly disclaims a global minimum across unsampled islands.
- Local Docker build failed with permission denied at the Docker socket. No
  escalation; hosted exact-head Docker/CI and independent review remain required.
- Generated next-env build changes were restored; no unignored build/scratch output
  retained. Git author metadata is supplied per command using existing OpenHands
  attribution because the checkout has no configured identity; Git config unchanged.

- Published draft PR #51 from implementation commit `7d74844`. This documentation
  update records the PR; request `openhands-review` after pushing its final head.
  Current hosted checks and independent review state remain on GitHub.

## PR #51 review correction

- Resumed the clean existing branch at requested head
  `6241287e16054c3af0857f148db3abc551518433`; main remains `429a5f4`.
  PR #51 is the only open implementation PR; no new PR or deployment.
- Read current issue, discussion, both reviews, both inline findings and checks
  directly from GitHub. Original-head CI and Docker pass. Re-read shared AGENTS,
  WORKFLOW, AUTHORITY, ENGINEERING and ChatGPT/OpenHands integration rules at
  `f3e619116a87fa872269460aa70c74ef9157ee4f`, plus target AGENTS and roadmap/index.
  Current issue body SHA-256 (gh body output including trailing newline):
  `6b1e59d4fe3146a0b40ef2ccb799426d4aa1fe43162f1f795446c43b9d2fc07e`.
- Corrected shared FIRE/income eligibility for optional cash/room-capped personal
  savings. Kept unchanged ordinary flows, mandatory withholding, required career
  savings, outflow, withdrawal and terminal-floor constraints.
- Applied the recorded reserve decision: allow recovered historical buildup,
  require recovery before later transition, and retain subsequent/retirement checks.
  Synthetic cash-cap and recovered-reserve retirement boundaries match ordinary
  forward terminal assets (270,000 and 220,000 respectively); month flows match.
  A later retirement reserve breach still fails with its actual month and amount.
- Both inline findings addressed: each failed income trial now retains dated,
  categorized, quantified evidence and a next action, including early-stopping
  debt failures. Living-cost evidence describes its own funding constraint.
  Income and FIRE evidence show amounts; search qualifications remain intact.
- Scope remains projection domain/types, existing components, tests and plan docs.
  Scenario comparison summary/link changes are directly implicated by the
  acceptance hold's request to discover ordinary pay and retirement controls.
  Search limits/technical assumptions remain collapsed; no broader UI overhaul.
- Initial new tests exposed an incorrectly assumed early-retirement pass (a later
  reserve breach is real) and ordinary projection normalization in a fixture.
  Corrected test setup/expectations without relaxing safeguards. The first full
  suite also identified old UI label assertions; updated those assertions.
- Final executed validation: 792 tests across 48 files, typecheck, lint, production
  build, Compose config, synthetic production Chromium at 390px and 1440px,
  and eight production HTTP export checks pass. Browser checks include real API
  failure diagnostics, collapsed evidence, expanded controls and opt-out.
- Local Docker build denied access to /var/run/docker.sock; no escalation.
  New-head hosted Docker/CI and independent review remain required. Restore
  generated next-env declaration; retain only ignored build/dependency output.
  Issue #48 remains subject to owner deployed acceptance after merge.

## PR #51 opening-transition correction

- Continued from clean exact head `47d435a05c4954167227257f5e62712654eb24f8`
  on the existing branch. Current issue, all reviews/inline comments/discussion and
  checks read directly from GitHub. The latest independent review confirms the
  prior two fixes and identifies one remaining opening-reserve defect.
- Shared policy revision remains `f3e619116a87fa872269460aa70c74ef9157ee4f`;
  the previously read shared instructions still apply. Re-read target AGENTS,
  relevant roadmap/index and affected engine/evaluator/tests. Main and the issue
  body hash recorded above are unchanged. PR #51 remains the only open PR.
- Bounded scope: shared reserve calculation, career eligibility, existing synthetic
  tests/browser/API checks and roadmap/index. No dependencies, workflows, private
  configuration, new PR, readiness, merge or deployment changes.
- Reuse the engine's reserve-account, indexed-target and operating-cash calculation
  for opening eligibility. Immediate transitions now fail before salary, returns
  or events can refill the reserve. Later-transition and subsequent-month checks
  remain intact; ordinary forward monthly calculations use the same extracted rule.
- Regressions cover immediate income and Full/Coast/Barista candidates, first-month
  salary replenishment, funded-opening and recovered-later controls, and shared
  versus separate operating-cash reserve accounts. API and production-browser
  checks retain the opening month and quantified 1,000 reserve shortfall.
- Executed: 797 tests in 48 files, typecheck, lint, production build, Compose,
  production Chromium at 390px/1440px and eight HTTP export/privacy checks pass.
  Local Docker build denied socket access; no escalation. Hosted new-head
  CI/Docker and independent exact-head review remain required.
- Prior independent findings need no further changes: the latest review confirms
  their fixes, and the full regression suite still passes. Owner deployed
  acceptance remains pending after merge; #48 stays open.


## Issue #52 execution record

- Live issue SHA-256 matched `8a4d9b3fc483b04610fdc46dca9f8f11dedced79995176f2532d72504be155fe`.
- Read shared AGENTS, WORKFLOW, AUTHORITY, ENGINEERING and OpenHands/ChatGPT guidance
  at `f3e619116a87fa872269460aa70c74ef9157ee4f`; read target AGENTS, roadmap/index,
  architecture/strategy, #48 discussion, PR #51 review history and affected code/tests.
- Separate clean target checkout and credential-free origin verified before edits.
  Main was `4fb152ee5c3cad763bb36be685e4ccba6479a338`; automation bundle untouched.
- Baseline CPU profile identified unnecessary report aggregation/cloning and repeated
  tax work. Funding-only checks now skip report construction. Debt liquidation
  previews run only when debt exceeds current cash; withdrawal previews reuse the
  unchanged embedded tax calculation. No formula, solver precision, sample count,
  annual grid coverage or request budget was relaxed.
- Existing phase schema preserves working spending and personal saving, including
  clipping/indexing and explicit account overrides. No employer terms are inferred.
  Reserve protection ends at full retirement, with required outflows/floor retained.
- Repeatable benchmark: `node --import tsx tests/career-analysis-performance.ts`.
  Synthetic ages 40–95, retirement 65, 26 annual grid points, four accounts,
  annual Canadian tax, statutory RRIF, taxable distributions/ACB, mortgage and three
  spending phases. Baseline was instrumented only to count simulations in an
  isolated main worktree. Measurements are local wall times, not service guarantees.

| Case | Main income elapsed / completed / simulations / payload | Revised income elapsed / completed / simulations / payload |
|---|---|---|
| Fundable | 30.045s / 15 of 26 / 543 / 138,901 bytes | 12.318s / 26 of 26 / 675 / 50,789 bytes |
| Unfundable terminal floor | 30.035s / 19 of 26 / 513 / 171,688 bytes | 12.058s / 26 of 26 / 675 / 47,862 bytes |

- Main FIRE: 6.418s/78 candidates (all not found); revised: 1.649s/65 candidates,
  all three conditional milestones found. Negative floor: main 6.225s, revised
  1.966s, all 78 candidates tested and no passing milestone. Changed results reflect
  the deliberate funding/preset corrections, not just performance changes.
- Browser requests require explicit calculation, retain stale-result invalidation,
  and prevent resubmission during a calculation. Compact income evidence retains
  range endpoints and boundary/failure witnesses plus sample counts. Work counts
  charge each invoked simulation's full horizon even when it stops early.
- Production HTTP benchmark: income 11.041s (fundable) / 10.381s (negative), all
  26 points complete in each; FIRE 1.542s / 1.774s. Same counts and payloads as above.
- The complete ordinary long-horizon projection deep-equals main's result, including
  report and financial fields. No ordinary projection/export behavior change found.
- Chromium production acceptance passed at 390px and 1440px: 26-point chart/table,
  expanded assumptions, negative reserve evidence, opt-out and no runtime exceptions.
  Repeated edits during calculation made only one income request; a 20ms browser
  heartbeat continued. A harness selector initially matched another disabled button;
  correcting it allowed the intended busy-state check to run. Firefox is not installed;
  no Firefox acceptance or cause of the reported crash is claimed.
- Local Docker build was attempted and denied at the Docker socket. No escalation
  or waiver; exact-head hosted Docker must pass. Compose config and all eight
  production HTTP export/privacy checks passed. Final repository checks and
  independent review status are recorded below.

- Final local checks: 805 tests across 48 files, typecheck, lint and production build
  passed. Focused regressions include funded retirement spend-down, real outflow and
  floor failures, opening/recovered/working reserves, multi-phase monthly parity,
  mortgage/saving and explicit overrides, independent payroll/adjacent salary
  checks, request budgets, repeated edits, tax-preview parity and export privacy.
- Git identity was absent; commits use the existing OpenHands bot attribution via
  per-command environment variables without changing Git configuration.
- Draft PR publication and `openhands-review` request follow this tested change.
  Hosted Docker/CI and independent exact-head review must confirm it; #48 remains
  open for owner deployed acceptance. No merge, deployment or Git Sync performed.
