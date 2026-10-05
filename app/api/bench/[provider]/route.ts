import { handleBenchRequest } from "../../../../lib/bench/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  return handleBenchRequest(request, provider);
}
