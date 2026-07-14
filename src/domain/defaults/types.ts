export type BaselineSourceType =
  | "saved_personal_baseline"
  | "lunchmoney_derived"
  | "canadian_reference"
  | "application_fallback";

export type CanadianReferenceKind =
  | "population_median"
  | "population_average"
  | "statutory_program_default"
  | "published_planning_assumption";

export type BaselineValue<T> = {
  value: T;
  sourceType: BaselineSourceType;
  sourceDescription: string;
  effectiveDate: string;
  referenceKind?: CanadianReferenceKind;
};

export type BaselineCandidateSet<T> = {
  savedPersonalBaseline?: BaselineValue<T>;
  lunchMoneyDerived?: BaselineValue<T>;
  canadianReference?: BaselineValue<T>;
  applicationFallback: BaselineValue<T>;
};
