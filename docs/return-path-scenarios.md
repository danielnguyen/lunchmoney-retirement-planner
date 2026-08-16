# Deterministic return-path scenarios

The planner can model an explicitly configured sequence of investment returns and, optionally, inflation rates. This is intended for deterministic sequence-of-returns stress testing around retirement.

A return-path scenario is **not** a forecast, Monte Carlo simulation, historical sample, confidence level, or probability of success. It answers a narrower question: what does the configured retirement plan do if these exact rates occur in this exact order?

All examples in this document are synthetic. Real scenario assumptions belong in the ignored private planner configuration.

## Compatibility behaviour

If no `returnScenario` or account `returnPath` is configured, projection behaviour is unchanged: each account uses its existing constant `annualReturn`, and inflation uses the existing constant annual inflation assumption.

A configured path overrides the constant assumption only for dates explicitly present in the path. Dates outside the path continue to use the account's `annualReturn` or the plan's constant annual inflation rate. This makes a short stress window possible without restating every later year.

## Scenario label

Any active account return path or inflation path requires a top-level scenario label:

```yaml
returnScenario:
  label: Synthetic early-retirement decline
```

The label is local planning text. Public exports must not use it as identifying descriptive text.

## Annual account-return path

An annual path applies the configured annual return to every projected month in that calendar year by converting it to an equivalent compounded monthly rate.

```yaml
accountMappings:
  "plaid:synthetic-investment":
    include: true
    type: tfsa
    roles: [personal_tfsa]
    withdrawalPriority: 3
    returnPath:
      mode: annual
      entries:
        - calendarYear: 2043
          annualReturn: -0.20
        - calendarYear: 2044
          annualReturn: 0.04
        - calendarYear: 2045
          annualReturn: 0.08
```

For example, an annual return of `-0.20` is converted to the monthly rate whose twelve-month compound result is exactly `-20%`, subject only to ordinary floating-point arithmetic.

Annual entries must be unique and strictly increasing by calendar year.

## Monthly account-return path

A monthly path uses the configured monthly return directly:

```yaml
accountMappings:
  "plaid:synthetic-investment":
    include: true
    type: tfsa
    roles: [personal_tfsa]
    withdrawalPriority: 3
    returnPath:
      mode: monthly
      entries:
        - calendarMonth: "2043-02"
          monthlyReturn: -0.12
        - calendarMonth: "2043-03"
          monthlyReturn: -0.08
        - calendarMonth: "2043-04"
          monthlyReturn: 0.03
```

Monthly entries use `YYYY-MM`, must be unique and strictly increasing, and apply only to the named month.

## Projection-only accounts

Advanced configurations may place the same `returnPath` block on a `projectionAccounts` entry. The path attaches to the resolved projection account before calculation just as it does for an imported account.

## Inflation path

Inflation is separate from investment returns. A stress scenario can therefore change inflation without implying a corresponding market return, or vice versa.

Annual inflation example:

```yaml
returnScenario:
  label: Synthetic inflation and market stress
  inflationPath:
    mode: annual
    entries:
      - calendarYear: 2043
        annualInflation: 0.05
      - calendarYear: 2044
        annualInflation: 0.04
```

Monthly inflation example:

```yaml
returnScenario:
  label: Synthetic monthly inflation stress
  inflationPath:
    mode: monthly
    entries:
      - calendarMonth: "2043-02"
        monthlyInflation: 0.005
      - calendarMonth: "2043-03"
        monthlyInflation: 0.004
```

The inflation factor is accumulated month by month when a path is active. Outside explicitly configured dates, the existing annual inflation assumption supplies the fallback monthly rate.

## Validation boundaries

The planner rejects a deterministic path when:

- the scenario label is missing or empty;
- a scenario contains neither an account return path nor an inflation path;
- path entries are empty, duplicated, or not strictly increasing;
- a monthly date is not valid `YYYY-MM` text;
- a path entry falls outside the resolved projection period;
- an account path is attached to a debt, real-estate, excluded, or otherwise non-financial account;
- an investment return is below `-99%` or above `100%`; or
- inflation is below `-20%` or above `50%`.

These bounds are validation limits, not recommended assumptions.

## Sequence-of-returns interpretation

Two return sequences can have the same compounded return and still create different retirement outcomes once withdrawals occur between those returns.

A synthetic two-month example illustrates the mechanism:

- sequence A: `-20%`, then `+25%`;
- sequence B: `+25%`, then `-20%`.

Both sequences compound to zero cumulative investment return before withdrawals because `0.80 × 1.25 = 1.00`. If a retiree withdraws cash after each monthly return, however, the second return is applied to a different remaining balance. The planner's sequence-risk tests exercise exactly this case through the normal monthly withdrawal engine.

## Shared projection boundary

Return paths do not create a second stress-test calculator. The resolved monthly rate is supplied to the existing projection engine before that month's cash flows. As a result, the same path-driven balances feed:

- spending and account withdrawals;
- Canadian tax and OAS recovery calculations;
- RRSP/RRIF balances and statutory RRIF minimums;
- non-registered market value, distributions, ACB, and dispositions;
- liability and cash-flow funding decisions;
- annual balance sheets and ledgers;
- financial-assets and net-worth bridges; and
- retirement-funding requirement candidate simulations.

The requirement solver therefore cannot accidentally test a smooth constant return while the ordinary projection displays a stressed path.

## Rebalancing boundary

The existing planner models one total return per financial account. A `returnPath` replaces that account-level total-return assumption for the configured date; it does not introduce security-level or asset-class return paths and does not perform hidden rebalancing inside the account.

If a future capability models asset-class-specific paths and rebalancing, that must be an explicit extension rather than inferred from the current `allocation` metadata.

## Useful deterministic stress cases

A private plan can represent scenarios such as:

- a decline immediately before retirement;
- a decline during the first retired year;
- a multi-year recovery after an early decline;
- several years of below-baseline returns;
- temporarily higher inflation during the retirement bridge; or
- the same compounded return delivered in a different order.

The planner deliberately does not assign probabilities to these scenarios. Probability-of-success reporting remains a separate later capability.
