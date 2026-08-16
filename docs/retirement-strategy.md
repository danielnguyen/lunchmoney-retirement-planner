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