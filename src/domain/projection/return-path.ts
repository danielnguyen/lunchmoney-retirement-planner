export type AnnualReturnPathEntry = {
  calendarYear: number;
  annualReturn: number;
};

export type MonthlyReturnPathEntry = {
  calendarMonth: string;
  monthlyReturn: number;
};

export type DeterministicReturnPath =
  | {
      mode: "annual";
      source: "explicit_configuration";
      entries: AnnualReturnPathEntry[];
    }
  | {
      mode: "monthly";
      source: "explicit_configuration";
      entries: MonthlyReturnPathEntry[];
    };

export type AnnualInflationPathEntry = {
  calendarYear: number;
  annualInflation: number;
};

export type MonthlyInflationPathEntry = {
  calendarMonth: string;
  monthlyInflation: number;
};

export type DeterministicInflationPath =
  | {
      mode: "annual";
      source: "explicit_configuration";
      entries: AnnualInflationPathEntry[];
    }
  | {
      mode: "monthly";
      source: "explicit_configuration";
      entries: MonthlyInflationPathEntry[];
    };

export type ResolvedMonthlyReturn = {
  monthlyReturn: number;
  source: "constant_annual_fallback" | "annual_path" | "monthly_path";
  configuredRate: number;
};

const MONTHS_PER_YEAR = 12;

export function annualRateToMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / MONTHS_PER_YEAR) - 1;
}

export function calendarMonthKey(
  startYear: number,
  startMonth: number,
  projectionMonth: number,
): { calendarYear: number; calendarMonth: number; key: string } {
  const calendarMonthIndex = startMonth - 1 + projectionMonth - 1;
  const calendarYear =
    startYear + Math.floor(calendarMonthIndex / MONTHS_PER_YEAR);
  const calendarMonth = (calendarMonthIndex % MONTHS_PER_YEAR) + 1;
  return {
    calendarYear,
    calendarMonth,
    key: `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
  };
}

export function resolveMonthlyReturn(input: {
  fallbackAnnualReturn: number;
  path?: DeterministicReturnPath;
  calendarYear: number;
  calendarMonth: number;
}): ResolvedMonthlyReturn {
  const key = `${input.calendarYear}-${String(input.calendarMonth).padStart(2, "0")}`;
  if (input.path?.mode === "annual") {
    const entry = input.path.entries.find(
      (candidate) => candidate.calendarYear === input.calendarYear,
    );
    if (entry) {
      return {
        monthlyReturn: annualRateToMonthlyRate(entry.annualReturn),
        source: "annual_path",
        configuredRate: entry.annualReturn,
      };
    }
  } else if (input.path?.mode === "monthly") {
    const entry = input.path.entries.find(
      (candidate) => candidate.calendarMonth === key,
    );
    if (entry) {
      return {
        monthlyReturn: entry.monthlyReturn,
        source: "monthly_path",
        configuredRate: entry.monthlyReturn,
      };
    }
  }
  return {
    monthlyReturn: annualRateToMonthlyRate(input.fallbackAnnualReturn),
    source: "constant_annual_fallback",
    configuredRate: input.fallbackAnnualReturn,
  };
}

function resolveMonthlyInflation(input: {
  fallbackAnnualInflation: number;
  path?: DeterministicInflationPath;
  calendarYear: number;
  calendarMonth: number;
}): number {
  const key = `${input.calendarYear}-${String(input.calendarMonth).padStart(2, "0")}`;
  if (input.path?.mode === "annual") {
    const entry = input.path.entries.find(
      (candidate) => candidate.calendarYear === input.calendarYear,
    );
    if (entry) return annualRateToMonthlyRate(entry.annualInflation);
  } else if (input.path?.mode === "monthly") {
    const entry = input.path.entries.find(
      (candidate) => candidate.calendarMonth === key,
    );
    if (entry) return entry.monthlyInflation;
  }
  return annualRateToMonthlyRate(input.fallbackAnnualInflation);
}

export function buildInflationFactors(input: {
  fallbackAnnualInflation: number;
  path?: DeterministicInflationPath;
  startYear: number;
  startMonth: number;
  totalMonths: number;
}): number[] {
  if (!input.path) {
    return Array.from({ length: input.totalMonths + 1 }, (_, month) =>
      Math.pow(
        1 + input.fallbackAnnualInflation,
        month / MONTHS_PER_YEAR,
      ),
    );
  }
  const factors = new Array<number>(input.totalMonths + 1);
  factors[0] = 1;
  for (let month = 1; month <= input.totalMonths; month += 1) {
    const calendar = calendarMonthKey(
      input.startYear,
      input.startMonth,
      month,
    );
    const monthlyInflation = resolveMonthlyInflation({
      fallbackAnnualInflation: input.fallbackAnnualInflation,
      path: input.path,
      calendarYear: calendar.calendarYear,
      calendarMonth: calendar.calendarMonth,
    });
    factors[month] = factors[month - 1]! * (1 + monthlyInflation);
  }
  return factors;
}
