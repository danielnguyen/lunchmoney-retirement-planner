import { getLunchMoneyStatus } from "@/src/domain/baseline/load";
import { runtimeErrorResponse } from "@/src/runtime/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getLunchMoneyStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return runtimeErrorResponse(error, "lunchmoney_status_failed");
  }
}
