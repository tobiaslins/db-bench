import { after, NextResponse } from "next/server";
import { isCronRequest, monitorTargets, recordBenchRequest } from "../monitor";
import { getAdapter } from "./adapters";
import { getBenchEnvInfo } from "./env-info";
import { runBench } from "./runner";
import type { BenchRequest } from "./types";

// Every run on a deployment (the cron, the console, a curl) adds to the /monitor data. Local dev doesn't, so laptop timings stay out.
function recordAfterResponse(request: Request, provider: string, body: BenchRequest, outcome: { result?: unknown; error?: string }) {
  if (!process.env.VERCEL_REGION || !monitorTargets.some((target) => target.provider === provider)) return;

  const env = getBenchEnvInfo(provider);
  after(() =>
    recordBenchRequest({
      provider,
      request: body,
      source: isCronRequest(request) ? "cron" : "manual",
      region: env.region,
      jazzVersion: env.jazz.packageVersion,
      ...outcome,
    }).catch((error) => console.error("Failed to record benchmark samples", error)),
  );
}

export async function handleBenchRequest(request: Request, provider: string) {
  const body = (await request.json().catch(() => ({}))) as BenchRequest;

  try {
    const adapter = getAdapter(provider);
    const result = await runBench(adapter, body);
    recordAfterResponse(request, adapter.name, body, { result });

    return NextResponse.json({
      provider: adapter.name,
      operation: body.operation ?? "suite",
      env: getBenchEnvInfo(adapter.name),
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown benchmark error";
    recordAfterResponse(request, provider, body, { error: message });

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
