import type { ExplanationTarget } from "./types";

export const explanationTooltips: Record<ExplanationTarget, string> = {
  "starting-financial-assets":
    "The included cash and investment balances imported at the start of the projection. Debt is not counted as a financial asset.",
  "assets-at-retirement":
    "Projected cash and investment balances at the end of the final working month, immediately before the first fully retired month, in today’s dollars.",
  "retirement-requirement":
    "The lowest retirement-boundary financial-assets amount that funds the configured retirement cash flows and minimum terminal balance through the terminal age.",
  "retirement-funding-margin":
    "Projected retirement financial assets minus the independently derived retirement requirement. The label states whether the result is a margin or shortfall.",
  "annual-tax":
    "The active tax model and shared annual evidence for full, embedded, and projection-funded tax.",
  "retirement-goal":
    "Your configured round-number marker. It remains separate from the mathematically derived retirement requirement.",
  "goal-gap":
    "Projected retirement financial assets minus your owner goal marker; this remains separate from the derived funding margin.",
  "financial-assets-duration":
    "How long projected cash and investment balances remain above zero in this deterministic scenario.",
  "annual-spending":
    "Projected essential and discretionary spending in each labelled period using the selected dollar view.",
  "annual-funding":
    "The income and account withdrawals used to fund each projected period, plus the simplified retirement-tax line.",
  "annual-outflows":
    "Projected spending, one-time costs, retirement tax, and cash-funded contributions for each labelled period.",
  "account-burndown":
    "How each included cash or investment account changes over the projection alongside total financial assets and the goal.",
  "asset-allocation":
    "The modelled cash, fixed-income, and equity mix for the selected projection year.",
  "annual-ledger":
    "The annual projection rows used by the report charts, including flows, ending balances, and milestones.",
  "baseline-income":
    "The current monthly net employment cash derived from mapped Lunch Money transactions. Configured phases may use different future income.",
  "baseline-essential":
    "The active monthly essential-spending input, refreshed from mapped Lunch Money transactions unless temporarily overridden.",
  "baseline-discretionary":
    "The active monthly discretionary-spending input, refreshed from mapped Lunch Money transactions unless temporarily overridden.",
  "baseline-contributions":
    "Monthly additions to included investment accounts, whether transaction-derived or configured manually.",
  "baseline-recurring":
    "Reviewed recurring essential and discretionary items normalized to monthly amounts.",
  "lunchmoney-accounts":
    "The included Lunch Money accounts and the local planning assumptions applied to each one.",
  "cpp-benefit":
    "The modelled CPP amount after applying the configured claim age to the dated amount-at-65 basis.",
  "oas-benefit":
    "The modelled OAS amount after applying explicit eligibility and claim-age adjustments to the dated full amount.",
  "surplus-allocation":
    "How explicit savings and remaining positive cash are retained or routed under the resolved simple or advanced policy.",
  "registered-account-room":
    "How one shared TFSA pool and one shared RRSP pool constrain explicit or advanced contribution plans, redirects, and unallocated amounts.",
  "home-equity-at-retirement":
    "The projected residence value at retirement minus the linked mortgage balance. Home equity is included in net worth but unavailable for retirement withdrawals.",
  "liabilities-at-retirement":
    "The mortgage balance plus other outstanding liabilities at the retirement snapshot.",
  "total-net-worth":
    "Financial assets plus non-financial assets minus liabilities. Home equity is included here but is not available for retirement withdrawals.",
  "liability-schedule":
    "How configured payments split between interest and principal, when lump sums apply, and when each liability is paid off.",
};
