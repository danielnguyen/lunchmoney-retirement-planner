export type BaselineSourceType =
  | "local_configuration"
  | "lunchmoney_derived"
  | "canadian_reference";

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
  referenceUrl?: string;
};

export type BaselineCandidateSet<T> = {
  localConfiguration?: BaselineValue<T>;
  lunchMoneyDerived?: BaselineValue<T>;
  canadianReference?: BaselineValue<T>;
};
