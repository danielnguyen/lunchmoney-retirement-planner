# Implementation Index

This document is the operational handoff for active roadmap delivery.

Use [`plan/roadmap.md`](./roadmap.md) for detailed capability requirements and acceptance criteria. Use this index to record the current implementation position, pull-request sequence, dependencies, and next action.

Public content must remain generic. Do not add private financial values, account details, employer information, identifying dates, private configuration, credentials, or real exported data.

## Current position

- Open implementation pull requests: none
- Next phase: Phase 1 — Government benefits
- Next action: prepare and execute the Phase 1 implementation prompt from the latest `main`
- Last completed foundation: phased employment income and per-account contribution phases

## Planned implementation sequence

| Sequence | Capability | Primary dependency | Status | Pull request |
|---|---|---|---|---|
| 1 | Government benefits | Phased income model | Next | — |
| 2 | Surplus allocation policy | Government benefits | Planned | — |
| 3 | Registered-account room and contribution waterfall | Surplus allocation policy | Planned | — |
| 4 | Debt amortization and spending phases | Phased contribution model | Planned | — |
| 5 | RRIF minimum withdrawals and Canadian taxes | Surplus allocation policy and debt/spending model | Planned | — |

## Delivery rules

1. Keep only one implementation pull request open at a time.
2. Start each implementation branch from the latest `main`.
3. Do not begin the next phase until the previous implementation pull request is merged.
4. Update this index when a pull request opens, changes status, is blocked, or merges.
5. Keep detailed requirements in `plan/roadmap.md`; link to them rather than duplicating them here.
6. Run synthetic validation before private local smoke testing.
7. Never place private financial data in source, fixtures, screenshots, logs, commits, exports, documentation, or pull-request text.
8. Before opening a new pull request, check the repository for existing open pull requests and report any merge-order or dependency concern.

## Status meanings

- **Next** — the next capability to start after confirming no open implementation pull request exists.
- **In progress** — implementation exists in an open pull request.
- **Blocked** — work has stopped pending a recorded dependency or decision.
- **Completed** — merged and validated.
- **Planned** — accepted work that has not started.

## Phase handoff record

When work begins, replace the relevant row and current-position fields with:

- branch name
- pull-request number and link
- current status
- latest validated head commit
- remaining validation or private smoke-test step
- explicit next action

When the phase merges:

1. Mark it **Completed** and retain the merged pull-request link.
2. Mark the following phase **Next**.
3. Clear the open implementation pull-request field.
4. Record the next action from the latest merged `main`.

## New-conversation handoff

Start a new conversation with:

> Read `plan/implementation-index.md` and `plan/roadmap.md`. Check the repository for open pull requests, verify that the index is current, and continue from the recorded next action. Do not use or publish private financial data.

The repository state is authoritative when it conflicts with this index. Correct the index before proceeding.
