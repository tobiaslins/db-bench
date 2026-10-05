import { handleBenchRequest } from "../../../../lib/bench/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleBenchRequest(request, "jazz");
}
