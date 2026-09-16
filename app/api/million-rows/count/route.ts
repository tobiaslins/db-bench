import { NextResponse } from "next/server";
import { getJazzContext } from "../../../../lib/bench/adapters/jazz";
import { jazzApp } from "../../../../lib/bench/adapters/jazz-app";
import {
  DEMO_OWNER_COUNT,
  DEMO_ROWS_PER_OWNER,
  clampInt,
  demoOwnerId,
  demoOwnerSession,
  normalizeTier,
  timeoutMs,
  withTimeout,
} from "../../../../lib/million-rows-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoRowRecord = typeof jazzApp.demoRows._rowType;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerIndex = clampInt(url.searchParams.get("ownerIndex"), 0, 0, DEMO_OWNER_COUNT - 1);
  const limit = clampInt(url.searchParams.get("limit"), DEMO_ROWS_PER_OWNER, 1, DEMO_ROWS_PER_OWNER);
  const tier = normalizeTier(url.searchParams.get("tier"));
  const waitTimeoutMs = timeoutMs(url.searchParams.get("timeoutMs"));
  const debug = url.searchParams.get("debug") === "1";
  const profile = url.searchParams.get("profile") === "1";
  const startedAt = performance.now();
  const marks: Record<string, number> = {};

  function mark(name: string) {
    marks[name] = Number((performance.now() - startedAt).toFixed(3));
  }

  try {
    const ownerId = demoOwnerId(ownerIndex);
    mark("parsed");
    const db = getJazzContext().forSession(demoOwnerSession(ownerIndex));
    mark("sessionDb");

    if (profile) {
      const results = [];

      for (const limit of [50, 250, 500, 1_000, 2_500, 5_000, 10_000]) {
        const query = jazzApp.demoRows
          .where({ ownerId })
          .select("id")
          .orderBy("createdAt", "desc")
          .offset(0)
          .limit(limit);
        const queryStartedAt = performance.now();
        const rows = await withTimeout(
          db.all(query, {
            tier,
          }),
          waitTimeoutMs,
          `Count profile read ${limit} for ${tier}`,
        ) as DemoRowRecord[];

        results.push({
          limit,
          rows: rows.length,
          ms: Number((performance.now() - queryStartedAt).toFixed(3)),
        });
      }

      mark("profile");

      return NextResponse.json({
      ownerIndex,
      ownerId,
      tier,
        timeoutMs: waitTimeoutMs,
        method: "select-id-page-and-count-profile",
        results,
        ms: Number((performance.now() - startedAt).toFixed(3)),
        debug: debug ? marks : undefined,
      });
    }

    const query = jazzApp.demoRows
      .where({ ownerId })
      .select("id")
      .orderBy("createdAt", "desc")
      .offset(0)
      .limit(limit);
    mark("queryBuilt");
    const rows = await withTimeout(
      db.all(query, {
        tier,
      }),
      waitTimeoutMs,
      `Count read for ${tier}`,
    ) as DemoRowRecord[];
    mark("dbAll");

    return NextResponse.json({
      ownerIndex,
      ownerId,
      limit,
      count: rows.length,
      tier,
      timeoutMs: waitTimeoutMs,
      method: "select-id-page-and-count",
      ms: Number((performance.now() - startedAt).toFixed(3)),
      debug: debug ? marks : undefined,
    });
  } catch (error) {
    mark("error");
    return NextResponse.json(
      {
        ownerIndex,
        ownerId: demoOwnerId(ownerIndex),
        limit,
        tier,
        timeoutMs: waitTimeoutMs,
        debug: debug ? marks : undefined,
        error: error instanceof Error ? error.message : "Unknown count error",
      },
      { status: 400 },
    );
  }
}
