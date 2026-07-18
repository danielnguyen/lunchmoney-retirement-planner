import type { ExplanationTarget } from "./types";

export const explanationTooltips: Record<ExplanationTarget, string> = {
  "starting-financial-assets":
    "The included cash and investment balances imported at the start of the projection. Debt is not counted as a financial asset.",
  "assets-at-retirement":
    "Projected cash and investment balances at the end of the final working month, immediately before the first fully retired month, in today’s dollars.",
  "retirement-goal":
    "The financial-asset target used for the retirement comparison. Real property is outside this goal.",
  "goal-gap":
    "Assets at retirement minus the retirement goal. A positive value is above the goal; a negative value is below it.",
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
    "How positive unassigned monthly cash refills the explicit indexed reserve and then remains in cash or moves to the configured non-registered account.",
  "registered-account-room":
    "How one shared TFSA pool and one shared RRSP pool constrain planned and surplus-funded contributions, redirects, and unallocated amounts.",
};
