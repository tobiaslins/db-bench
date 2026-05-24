import { NextResponse } from "next/server";
import { getAdapter } from "../../../../lib/bench/adapters";
import { runBench } from "../../../../lib/bench/runner";
import type { BenchRequest } from "../../../../lib/bench/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const body = (await request.json().catch(() => ({}))) as BenchRequest;

  try {
    const adapter = getAdapter(provider);
    const result = await runBench(adapter, body);

    return NextResponse.json({
      provider: adapter.name,
      operation: body.operation ?? "suite",
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown benchmark error";

    return NextResponse.json(
      {
        provider,
        error: message,
      },
      { status: 400 },
    );
  }
}
