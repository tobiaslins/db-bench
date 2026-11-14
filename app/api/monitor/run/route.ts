import { NextResponse } from "next/server";
import { runMonitor } from "../../../../lib/monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called by the Vercel Cron in vercel.json, which sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Vercel Cron calls the deployment's own URL, which Deployment Protection guards; the production domain is public.
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const result = await runMonitor(productionHost ? `https://${productionHost}` : new URL(request.url).origin);

  return NextResponse.json(result);
}
