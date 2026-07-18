export const canadianCppReference = {
  monthlyAmountAt65Today: 877.01,
  effectiveDate: "2026-04-01",
  referenceKind: "population_average",
  description:
    "Published average monthly amount for new CPP beneficiaries at age 65; this is a generic Canadian reference, not a personal estimate or entitlement.",
  referenceUrl:
    "https://www.canada.ca/en/services/benefits/publicpensions/cpp/amount.html",
} as const;

export const canadianOasReference = {
  fullMonthlyAmountAt65Today: 751.97,
  effectiveDate: "2026-07-01",
  referenceKind: "statutory_program_default",
  description:
    "Published full monthly OAS amount for people ages 65–74; personal eligibility is resolved separately.",
  referenceUrl:
    "https://www.canada.ca/en/employment-social-development/programs/pensions/pension/statistics/2026-quarterly-july-september.html",
} as const;

export const cppClaimRules = {
  standardAge: 65,
  earliestAge: 60,
  latestAge: 70,
  reductionPerMonth: 0.006,
  increasePerMonth: 0.007,
  effectiveDate: "2026-04-01",
  referenceUrl:
    "https://www.canada.ca/en/services/benefits/publicpensions/cpp/when-start.html",
} as const;

export const oasClaimRules = {
  earliestAge: 65,
  latestAge: 70,
  increasePerMonth: 0.006,
  maximumDelayedIncrease: 0.36,
  age75IncreaseRate: 0.1,
  effectiveDate: "2026-07-01",
  delayedClaimReferenceUrl:
    "https://www.canada.ca/en/services/benefits/publicpensions/old-age-security/when-start.html",
  age75IncreaseReferenceUrl:
    "https://www.canada.ca/en/employment-social-development/programs/old-age-security/reports/oas-toolkit.html",
} as const;
