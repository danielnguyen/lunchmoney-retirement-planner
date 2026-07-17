export type RuntimeErrorDetails = Record<string, unknown>;

export class PlannerRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details: RuntimeErrorDetails = {},
  ) {
    super(message);
    this.name = "PlannerRuntimeError";
  }
}

export function runtimeErrorResponse(error: unknown, fallbackCode: string): Response {
  if (error instanceof PlannerRuntimeError) {
    return Response.json(
      { error: error.code, message: error.message, ...error.details },
      { status: error.status },
    );
  }
  return Response.json(
    {
      error: fallbackCode,
      message: "The planner could not complete the request.",
    },
    { status: 500 },
  );
}
