# Implementation Index

This document is the operational handoff for active roadmap delivery.

Repository-wide contribution and implementation rules are defined in [`AGENTS.md`](../AGENTS.md). Use [`plan/roadmap.md`](./roadmap.md) for detailed capability requirements and acceptance criteria. Use this index to record the current implementation position, pull-request sequence, dependencies, and next action.

Public content must remain generic. Do not add private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open implementation pull request: [#10 Add registered-account room and contribution waterfall](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10)
- Pull request state: Open draft
- Active capability: Registered-account room and contribution waterfall
- Status: In progress
- Branch: `agent/add-registered-account-room`
- Latest validated implementation head: `63bc545c0890ccff93b1711e8524516be4f938ba`
- Synthetic validation: Passed — 12 test files and 208 tests, typecheck, lint, production build, Docker image build, Compose configuration validation, diff check, focused simple parsing/compiler, plain-language example guidance, the `currentYearBeforePlanStart` simple-field migration, January and partial-year room handling, explicit-savings, reserve-transition, workplace-priority, taxable-destination, controls, long-horizon cent-stable nominal/real explanation reconciliation, one-cent-plus and cancellation-resistant negative checks, bridge checks, advanced-compatibility and mixed-mode checks, and adversarial JSON/real-CSV/nominal-CSV privacy review
- Repository-owner private migration: Passed in the ignored local file
- Private live smoke test: Passed — schema, live baseline and projection, dashboard/API, controls and override/reset/refresh, nominal and real explanations, contribution and room reconciliation, nominal and real bridges, and anonymized JSON/real-CSV/nominal-CSV checks
- Remaining step: final review before marking draft PR #10 ready
- Next action: complete final review before marking draft PR #10 ready
- Last completed capability: Surplus allocation policy

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
| 3 | Registered-account room and contribution waterfall | Surplus allocation policy | In progress | [#10](https://github.com/danielnguyen/lunchmoney-retirement-planner/pull/10) |
| 4 | Debt amortization and spending phases | Phased contribution model | Planned | — |
| 5 | RRIF minimum withdrawals and Canadian taxes | Surplus allocation policy and debt/spending model | Planned | — |

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
