# Repository contribution rules

This file defines stable repository-wide operating rules for contributors and automated coding tools.

Product behaviour and acceptance criteria live in [`plan/roadmap.md`](plan/roadmap.md). Current roadmap delivery state lives in [`plan/implementation-index.md`](plan/implementation-index.md). Those files and the current implementation are authoritative; conversational memory is not.

## Before changing the repository

- Check for existing open pull requests and report any merge-order or dependency concern.
- Keep only one roadmap implementation pull request open at a time.
- Read the relevant roadmap section, implementation index, documentation, and affected code before planning changes.
- Start new work from the latest `main` on a short-lived capability-named branch.
- Define the purpose, allowed files or file categories, forbidden files, validation commands, and explicit non-goals before implementation.
- Stop and report the issue rather than improvising when the work requires an unlisted file, a wider architectural decision, an unrelated cleanup, or a new planning artifact.

## Architecture and naming

- Use names that describe the actual financial or product concept.
- Roadmap ordering is project-management shorthand, not production architecture.
- Do not introduce names such as `Phase1`, `PhaseA`, sequence-numbered directories, generic phase enums, phase API fields, phase schema versions, or phase-labelled runtime abstractions.
- The word `phase` is appropriate only for a real time-bounded financial concept, such as employment-income phases, contribution phases, or spending phases.
- Do not add files, abstractions, scripts, dependencies, endpoints, or configuration fields merely for anticipated future flexibility.
- Prefer editing an established seam over creating parallel mechanisms.
- Resolved typed domain inputs and projection results are the source of truth. UI components, explanations, charts, ledgers, and exports must not recreate financial formulas independently.
- Preserve backward compatibility only when its behaviour is deterministic, tested, and documented.

## Financial model integrity

- Do not silently invent defaults, infer personal facts, or present generic references as personal values.
- Retain provenance for every material resolved input, including source type, description, effective date, overrides, and compatibility fallbacks where applicable.
- Important balances and flows must reconcile within one cent before being labelled reconciled.
- Tests, schemas, documentation, or similarly named commands are not substitutes for required runtime behaviour.
- Keep required behaviour separate from suggested implementation details.

## Privacy and public-repository safety

- Do not read, print, log, quote, commit, upload, or include in pull-request text any private planner configuration, credentials, tokens, statements, exports, account identifiers, balances, income, spending, debts, employer details, or other identifying financial information.
- Treat `config/planner.local.json`, `config/planner.local.yaml`, and `config/planner.local.yml` as local-only and off-limits unless an explicit private local smoke test is requested.
- Even during an explicitly requested private smoke test, private values must not appear in source, fixtures, screenshots, logs, commits, documentation, exports, or pull-request text.
- Public examples, fixtures, screenshots, and tests must use clearly synthetic data.
- Preserve the typed export allowlist and removal of credentials and raw source-system identifiers.

## Pull-request workflow

- Keep changes bounded to one coherent capability or correction.
- Do not commit directly to `main` unless explicitly instructed.
- Update `plan/implementation-index.md` when roadmap work opens, becomes blocked, changes validation state, or merges.
- Do not begin the next roadmap capability until the current implementation pull request is merged.
- Do not mark a pull request ready, merge it, or enable auto-merge without explicit instruction.
- Report the pull-request link, changed files, validation performed, and any unresolved deviation.

## Validation

Run the relevant focused tests while iterating. Before reporting an implementation as ready, run and report:

- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `docker build -t lunchmoney-retirement-planner:validation .`
- `docker compose config --quiet`
- relevant synthetic end-to-end and export-privacy checks

If a validation step cannot be run, say so plainly. Do not describe unexecuted validation as passed.
