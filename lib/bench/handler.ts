import { NextResponse } from "next/server";
import { getAdapter } from "./adapters";
import { getBenchEnvInfo } from "./env-info";
import { runBench } from "./runner";
import type { BenchRequest } from "./types";

export async function handleBenchRequest(request: Request, provider: string) {
  const body = (await request.json().catch(() => ({}))) as BenchRequest;

  try {
    const adapter = getAdapter(provider);
    const result = await runBench(adapter, body);

    return NextResponse.json({
      provider: adapter.name,
      operation: body.operation ?? "suite",
      env: getBenchEnvInfo(adapter.name),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown benchmark error";

    return NextResponse.json(
      {
        provider,
        env: getBenchEnvInfo(provider),
        error: message,
      },
      { status: 400 },
    );
  }
}
