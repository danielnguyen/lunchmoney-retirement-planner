# Retirement planning strategy

This document records the planning philosophy the project is intended to support. It is deliberately generic and public-safe: exact ages, balances, income, spending, account identifiers, employers, contribution room, tax evidence, benefit estimates, and other personal facts belong only in the ignored private planner configuration.

The strategy is a decision framework, not a set of hidden planner defaults. The projection engine must calculate only from explicit resolved inputs and must not infer that this strategy applies to every user.

## Objectives

The reference strategy is for a Canadian household or individual considering retirement before all public retirement benefits have begun. The plan should answer four separate questions:

1. Can the configured assets fund the bridge from employment income to later retirement income?
2. Does the plan remain viable under explicitly adverse early-retirement return sequences?
3. Can registered withdrawals be timed more deliberately to improve the lifetime tax path instead of merely minimizing current-year tax?
4. Does the plan still preserve the configured terminal financial-asset objective without relying on unrealized home equity?

A large portfolio balance by itself is not treated as proof that retirement is affordable. Spending, taxes, withdrawal source, return order, public benefits, liabilities, and longevity remain part of the same projection.

## Accumulation strategy

During employment, the strategy is to keep cash roles explicit and then direct genuine investable surplus through registered accounts before taxable overflow, subject to available contribution room and the configured savings policies.

- Keep an explicit operating-cash target for ordinary liquidity.
- Maintain a separately defined emergency reserve rather than treating all cash as investable.
- Honour required liabilities before discretionary saving or investment.
- Apply workplace and personal registered contributions only within modelled room.
- Route personal investing through the configured TFSA, RRSP, and taxable order rather than assuming every positive cash-flow dollar is invested.
- Treat the primary residence and other non-financial assets as net-worth assets, not as retirement-funding assets unless an explicit transaction realizes spendable proceeds.

The planner may model different future employment and savings periods, but it must not infer career changes, future compensation, contribution levels, or housing decisions.

## Retirement bridge strategy

Early retirement creates a period in which employment income has stopped but CPP, OAS, pensions, or other later income may not yet have started. The strategy treats this bridge as a first-class planning period rather than assuming retirement cash flow is uniform from the first retired month onward.

- Spending during the bridge comes from explicit spending phases and liabilities, not a generic percentage of portfolio value.
- CPP and OAS start ages remain explicit scenario inputs; the strategy does not assume that delaying either benefit is always optimal.
- Cash and investment withdrawals must be sufficient on an after-tax basis.
- A plan should expose how much of each bridge year is funded by cash, TFSA, RRSP/RRIF, taxable assets, pensions, and government benefits.
- A plan that succeeds only under a smooth constant-return path should not be described as robust until it has also been evaluated under explicit adverse return sequences.

## Sequence-risk strategy

A deterministic average return hides the timing risk created when poor investment returns occur near the start of retirement while withdrawals are already happening. The planner should therefore support deterministic stress scenarios in addition to its ordinary constant-return projection.

Useful stress cases include:

- a material decline immediately before retirement;
- a material decline during the first retired year;
- a multi-year recovery after an early decline;
- a prolonged low-return period; and
- the same long-run average return delivered in a different order.

These scenarios are stress tests, not probabilities. The project must not convert them into confidence percentages or probability-of-success claims without a separate probabilistic model.

A strategy may also test explicit defensive responses, such as temporarily lower discretionary spending or deliberately retained liquidity, but the planner must not silently activate those responses after a market decline.

## Tax-aware retirement withdrawal strategy

Static account withdrawal priority remains a useful deterministic baseline, but it is not sufficient for lifetime tax planning. A low-income bridge period may create an opportunity to recognize registered income before CPP, OAS, pensions, and mandatory RRIF withdrawals layer together later.

The strategy therefore evaluates deliberate RRSP/RRIF withdrawals separately from withdrawals needed only to pay current spending.

A tax-aware strategy may:

- withdraw taxable registered funds during an explicitly configured lower-income window even when immediate spending does not require the full gross withdrawal;
- compare the incremental tax paid now with projected later tax, RRIF minimums, and OAS recovery exposure;
- route after-tax excess cash according to explicit rules, including available TFSA room, taxable investment, reserve replenishment, or retained cash;
- preserve TFSA assets when doing so improves later flexibility, while still allowing TFSA withdrawals when they are the better configured choice; and
- avoid an early registered withdrawal when the lifetime projection does not show a benefit after tax, lost tax deferral, future growth, and terminal assets are considered.

The strategy is not "empty the RRSP early" and is not "always use RRSP before TFSA." The decision must be calculated against the configured scenario. A deliberate withdrawal is justified only when its modelled trade-off is visible.

## Strategy comparisons

When tax-aware withdrawal modelling is implemented, the planner should be able to compare at least these deterministic policies using identical non-withdrawal assumptions:

- the existing static account-priority baseline;
- spending-needs-only withdrawals under an alternative explicit priority;
- a configured registered-income target or tax-bracket ceiling during selected years; and
- a tax-aware strategy that permits registered withdrawals above immediate spending needs and routes the after-tax excess explicitly.

Useful comparison outputs include:

- total modelled lifetime tax;
- OAS recovery tax;
- gross and net registered withdrawals by year;
- RRSP/RRIF balance at conversion and later ages;
- TFSA and taxable balances;
- terminal financial assets;
- any unfunded spending or liability month;
- retirement-funding requirement and margin; and
- the same outputs under each configured return-path stress scenario.

The optimizer, if one is added, must optimize an explicitly named objective. "Tax efficient" is not a sufficient objective by itself because minimizing lifetime tax can conflict with maximizing terminal assets, preserving liquidity, or meeting a terminal balance target.

## Spending strategy

Retirement spending does not have to be flat, but the planner should not assume a universal retirement-spending smile. Known lifestyle changes belong in explicit spending phases.

A configuration may choose higher discretionary spending while health and mobility are strong, lower spending later, and higher essential spending for anticipated care or housing needs. Those are owner assumptions, not demographic forecasts supplied by the planner.

Flexible-spending stress cases should remain scenarios. The ordinary projection must continue to fund the configured spending path rather than assuming the owner will cut spending whenever markets perform poorly.

## Government benefits and RRIFs

CPP and OAS claim ages, benefit amounts, eligibility, indexing, RRSP-to-RRIF conversion, and statutory RRIF minimums remain explicit projection inputs or dated statutory references.

The withdrawal strategy must evaluate how taxable registered income interacts with CPP, OAS, pensions, credits, and OAS recovery. It must not optimize one account in isolation from the annual tax ledger.

## Housing boundary

The strategy does not count unrealized home equity as spendable retirement funding. A later downsizing, sale, purchase, or relocation may materially change the plan, but those proceeds enter retirement funding only through an explicit structured housing transaction.

This keeps the core retirement question conservative: the investment and cash portfolio should stand on its own unless the owner has deliberately configured a housing transition.

## Decision standard

A scenario is useful when the planner can show, from one reconciled monthly engine:

- the retirement bridge is funded;
- required liabilities and configured spending are paid;
- taxes and mandatory registered withdrawals are included;
- the selected withdrawal strategy is explicit;
- the selected deterministic return path is explicit;
- the projection reaches the configured terminal age and balance objective; and
- every material amount can be traced to private configuration, Lunch Money evidence, a dated public reference, or a temporary scenario override.

Deterministic stress tests increase the usefulness of that conclusion, but they still do not establish a statistical probability of success.

## Privacy boundary

This public strategy intentionally contains no real personal financial values. The following must remain private and must not be copied into this document, source code, fixtures, screenshots, commits, logs, pull requests, or public exports:

- exact current or retirement ages tied to a real person;
- account balances or account identifiers;
- salary, employer, or employment history;
- spending totals or merchant history;
- contribution room and contribution amounts;
- mortgage or other debt balances and terms;
- personal CPP or pension estimates;
- tax-return or tax-slip values; and
- private scenario exports.

Public examples and tests should use obviously synthetic values. The ignored private YAML remains the authoritative place for a real user's strategy parameters.
## Implemented configured comparison

Issue #36 adds explicit `static_priority` and `planned_registered_bridge` choices
and an independent annual after-tax lifestyle target. The bridge amount is a
configured scenario, not an automatically optimized amount. Compare its lifetime
taxes and terminal liquidation assets with static priority, including adverse
paths and the terminal floor. A tax reduction alone is not evidence of improvement.
The [README](../README.md#retirement-spendable-cash-and-registered-bridge-withdrawals)
defines monthly indexing, partial periods, infeasibility and surplus routing.

## Career transitions, Coast and Barista scenarios

An optional `careerTransition` within an existing `scenarioComparison` definition
replaces employment, spending and savings from a selected transition age through
full retirement. Earlier baseline phases are preserved. Retirement spending keeps
its existing age boundaries; the first applicable retirement phase extends back
to an earlier retirement date. No baseline inputs are mutated. Add an unchanged
baseline definition (`spending: []`, `personalContributions: []`,
`contributionPolicy: configured_fixed_plan`) alongside alternatives.

The existing comparison offers reduced-income, Coast, Barista and combined
Coast-to-Barista starters. They illustrate half the first baseline employment
amounts, unchanged spending, inflation-paced growth, zero saving and zero employer
match. These are editable illustrations, not market averages, forecasts or
recommendations. Missing baseline taxable/eligible earnings use visible zero
placeholders that must be replaced before relying on the plan. Split and name phases, choose accumulation/Coast/Barista, and edit
income, spending, savings, full retirement and a lower CPP benefit test. A positive
result is conditional on those assumptions, including the active return path.

Each interval includes its start and excludes its end. Phases must be contiguous,
non-overlapping, ordered and aligned to projection months. Transition must fall
within the baseline working life; full retirement cannot exceed the horizon.
Career income and contributions are expressed in today's dollars, inflated using
the actual configured inflation path up to the phase start, then indexed using
that phase's annual growth. Existing baseline indexing remains unchanged.

Coast verification inspects actual monthly flows. Retirement investment deposits
(including required withholding, optional saving, employer additions and automatic
surplus investing) or withdrawals during Coast prevent verification. Required
outflows and both reserve and operating liquidity targets must be funded. Optional
cash-funded savings can be capped to zero under the cash-constrained policy; this
is disclosed in planned versus actual deposits. Required savings and withheld
amounts cannot remain unallocated. A Coast label alone never establishes success. Savings after the first Coast phase
also prevent verification, even if a later phase is named accumulation or Barista.
To avoid certifying a plan that depends on growing cash savings, a second run of
the same engine consumes uncommitted surplus above protected liquidity from the
first Coast phase through full retirement. It must meet working-life cash needs
and the retirement terminal floor without that saving. Its funding margin is shown
separately; the actual scenario ledger and balances remain unchanged.

Barista permits intentional spending-funded withdrawals only inside selected
Barista intervals. Withdrawals outside those working-life intervals, cash-funded
investments exceeding current available income, unfunded expenses, unserved debt
or a reserve breach fail the plan. Working-life cash feasibility is separate from
full-horizon viability, which also requires the shared retirement requirement and
terminal floor to pass. When any career scenario is selected, all comparison
allocation ledgers cover the full horizon, including the unchanged baseline.

### Hypothetical job terms

Choose either independent net/taxable/RRSP-room-eligible earnings or explicitly
select the Ontario gross-pay estimate. Net overrides are deposited cash **after**
payroll deductions and employee withholding; the engine never taxes that cash a
second time. Taxable employment still informs the annual tax brackets and benefit
recovery. RRSP-eligible earnings, pension adjustments and other room reductions are
separate and feed the existing registered-room ledger.

The gross estimate uses the existing annual Canada/Ontario income-tax model and
[CRA's January 2026 Ontario tables](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/t4032-payroll-deductions-tables/t4032on-jan/t4032on-january-general-information.html)
and [2026 payroll formulas](https://www.canada.ca/en/revenue-agency/services/forms-publications/payroll/payroll-deductions-t4127-payroll-deductions-formulas/t4127-jan-122nd-edition-effective-january-1-2026/t4127-jan-payroll-deductions-formulas-computer-programs.html).
It deducts employee CPP at 5.95% between $3,500 and $74,600, CPP2 at 4% between
$74,600 and $85,000, and EI at 1.63% up to $68,900. The supported age range is
18–64; other ages require explicit overrides.

This is an annual planning approximation, not payroll software: annualized net pay
is divided by 12, including partial years. It does not recompute annual caps across
jobs, partial-year refunds, or tax relief from CPP/EI credits, enhanced CPP or RRSP
deductions. The supported tax model therefore gives conservative net estimates.
For reproducible 2026 single-person cases with no other income or deductions:

| Annual gross | Estimated deposited cash before employee savings |
|---|---|
| $30,000 | $25,088.61 |
| $60,000 | $46,453.14 |
| $85,000 | $62,460.87 |

These are model outputs, not CRA paycheque quotes. The estimate is calculated in
2026 dollars and indexed as a phase amount; future payroll rules are not forecast.
The UI shows dated provenance, limitations and resolved net/taxable/eligible inputs.

Savings select existing contribution routes: in simple mode, personal TFSA for
cash-funded saving (then the existing waterfall), or workplace RRSP for withholding.
Employee and employer amounts are separately editable. Estimated gross mode
subtracts employee withholding once; net overrides already include it. Employer
match tax treatment is unavailable in estimated mode, so a nonzero employer amount
requires explicit net, taxable and eligible overrides that include those terms.
An illustrative dollar-for-dollar match can be entered as equal employee/employer
amounts, but is not presented as an employer promise or market average. Pension
valuation, unknown insurance benefits and taxable benefit valuation are unavailable;
enter their known cash costs and taxable effects through explicit overrides.

CPP entitlement is not recomputed from hypothetical earnings. The configured CPP
estimate remains under user control; a 0–1 multiplier offers an explicit lower
benefit sensitivity test. OAS, pension, liabilities, taxes, room, reserves, terminal
floor and deterministic return paths continue through the same monthly engine.

### Persistence and privacy

Comparison edits and preset selection stay temporary. Permanent definitions belong
in the owner's private Git-managed YAML. Use the existing explicit sync, or the
existing Save config action where enabled; no automatic writes or sync occur.
The commented example in `config/planner.example.yaml` shows the complete shape.
Comparison definitions and free-text employment/savings descriptions remain outside
the existing export allowlist. No new export or storage mechanism is introduced.
Automatic FIRE-date and minimum-income searches remain follow-up work.

## Conditional milestone search

The dashboard's opt-in milestone search reuses single-interval Coast/Barista
career assumptions and the same forward monthly simulation. It checks candidates
chronologically without a monotonicity assumption. The selectable grid is 1, 3 or
12 months, includes its final boundary, and has a maximum of 601 dates per strategy
and path. The range ends at the earlier of baseline and chosen full retirement:
the model does not invent accumulation employment beyond the configured baseline.

The original employment/saving/spending schedules remain intact before transition.
Coast also consumes uncommitted surplus above protected liquidity; the candidate
cannot rely on retained future cash to fund retirement. Barista permits spending
withdrawals but still checks cash-funded investing and required workplace terms.
Full FIRE stops employment and contributions at the candidate, including the
opening month, and starts the existing retirement spending assumptions then.
Retirement phases retain their later age boundaries, as in career comparison.
The floor is the configured unliquidated financial-asset floor, not home equity.

Candidate evidence includes every earlier failed grid date and terminal financial
assets. No result certifies intervening untested months. Different milestone
ordering is valid. Baseline constants and explicit dated return/inflation stress
paths are reported separately; neither is probabilistic. Sources, effective date,
job terms, CPP multiplier and active baseline controls are shown with the results.
The configured CPP estimate is not a forecast of entitlement from career earnings.
CPP multipliers apply to the whole projection. If a changed multiplier would alter
CPP payable during accumulation before a candidate (including its month-end claim
boundary), that milestone is unavailable. Set the multiplier to 1 to preserve
baseline CPP; dated CPP adjustments are not supported. Opening-month transitions
and candidates before CPP becomes payable still support changed multipliers.

No independent financial engine or inverse income solver is added. Forward checks
skip the unrelated inverse asset-requirement search. A simulation error makes the
milestone unavailable rather than producing a date. Existing exports do not include
these temporary definitions, candidate results or free-text job assumptions.
