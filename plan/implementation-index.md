# Implementation Index

This document is the operational handoff for active roadmap delivery.

Repository-wide contribution and implementation rules are defined in [`AGENTS.md`](../AGENTS.md). Use [`plan/roadmap.md`](./roadmap.md) for detailed capability requirements and acceptance criteria. Use this index to record the current implementation position, pull-request sequence, dependencies, and next action.

Public content must remain generic. Do not add private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open implementation pull request: [#11 Add real net worth and debt amortization](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11)
- Pull request state: Open draft
- Active capability: Net worth, real estate, and debt amortization
- Status: In progress
- Branch: `agent/add-net-worth-and-debt-amortization`
- Latest validated implementation head: `d4d8b6365000adf49578c1c5c2e53e934e069708`
- Synthetic validation: Passed — 262 tests, full-width report layout with one accessible drawer-only scenario-controls tree at every viewport width, grouped zero-balance/payoff/amortizing liability explanations, imported residence and exact mortgage-payment matching coverage, nominal/real bridge reconciliation, typecheck, lint, production build, Docker image build, Docker Compose validation, JSON and CSV privacy/shape checks, and `git diff --check`
- Repository-owner private migration: Outstanding
- Private live smoke test: Outstanding
- Remaining step: final public review, then migrate private residence/liability and exact historical-payment matching inputs and run the explicitly authorized private smoke test
- Next action: final public review of draft PR #11, followed by a separately authorized private migration and live smoke test
- Last completed capability: Registered-account room and contribution waterfall

## Terminology boundary

The numbered sequence in this document is project-management shorthand only. It does not define a code architecture or naming convention.

Do not introduce roadmap-oriented names such as `Phase1`, `PhaseA`, `government-benefits-phase`, phase-numbered directories, phase enums, phase API fields, phase schema versions, or generic phase abstractions merely because this index uses an ordered sequence.

Implementation names must describe the actual financial or product concept, such as government benefits, surplus policy, contribution room, debt schedules, spending phases, RRIF withdrawals, or tax calculation.

The word `phase` remains appropriate only where it is part of the financial domain model—for example, employment-income phases, contribution phases, or spending phases with explicit time boundaries. Roadmap sequencing must not spread that term into unrelated code.

Branches, pull-request titles, commits, tests, documentation headings, types, functions, files, and directories should use capability-specific language rather than sequence numbers.

## Planned implementation sequence

| Sequence | Capability | Primary dependency | Status | Pull request |
|---|---|---|---|---|
| 1 | Government benefits | Phased income model | Completed | [#8](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/8) |
| 2 | Surplus allocation policy | Government benefits | Completed | [#9](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/9) |
| 3 | Registered-account room and contribution waterfall | Surplus allocation policy | Completed | [#10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) |
| 4 | Net worth, real estate, and debt amortization | Registered-account contribution model | In progress | [#11](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/11) |
| 5 | General spending phases | Net-worth and debt model | Planned | — |
| 6 | RRIF minimum withdrawals and Canadian taxes | Surplus policy, debt model, and spending phases | Planned | — |

## Delivery rules

1. Follow the repository-wide rules in `AGENTS.md`.
2. Keep only one implementation pull request open at a time.
3. Start each implementation branch from the latest `main`.
4. Do not begin the next capability until the previous implementation pull request is merged.
5. Update this index when a pull request opens, changes status, is blocked, or merges.
6. Keep detailed requirements in `plan/roadmap.md`; link to them rather than duplicating them here.
7. Run synthetic validation before private local smoke testing.
8. Never place private financial data in source, fixtures, screenshots, logs, commits, exports, documentation, or pull-request text.
9. Before opening a new pull request, check the repository for existing open pull requests and report any merge-order or dependency concern.
10. Use capability-specific implementation names; do not encode roadmap sequence numbers into the product or codebase.

## Status meanings

- **Next** — the next capability to start after confirming no open implementation pull request exists.
- **In progress** — implementation exists in an open pull request.
- **Blocked** — work has stopped pending a recorded dependency or decision.
- **Completed** — merged and validated.
- **Planned** — accepted work that has not started.

## Capability handoff record

When work begins, replace the relevant row and current-position fields with:

- branch name
- pull-request number and link
- current status
- latest validated head commit
- remaining validation or private smoke-test step
- explicit next action

When the capability merges:

1. Mark it **Completed** and retain the merged pull-request link.
2. Mark the following capability **Next**.
3. Clear the open implementation pull-request field.
4. Record the next action from the latest merged `main`.

## New-conversation handoff

Start a new conversation with:

> Read `AGENTS.md`, `plan/implementation-index.md`, and `plan/roadmap.md`. Check the repository for open pull requests, verify that the index is current, and continue from the recorded next action. Treat roadmap sequence labels as planning shorthand only; use capability-specific implementation names. Do not use or publish private financial data.

The repository state is authoritative when it conflicts with this index. Correct the index before proceeding.
