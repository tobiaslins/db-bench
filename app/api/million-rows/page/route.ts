import { NextResponse } from "next/server";
import { getJazzContext } from "../../../../lib/bench/adapters/jazz";
import { jazzApp } from "../../../../lib/bench/adapters/jazz-app";
import {
  DEMO_OWNER_COUNT,
  DEMO_ROWS_PER_OWNER,
  DEMO_TOTAL_ROWS,
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
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 250);
  const offset = clampInt(url.searchParams.get("offset"), 0, 0, DEMO_ROWS_PER_OWNER - 1);
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
      const options = {
        tier,
      } as const;
      const variants = [
        ["where-limit50", jazzApp.demoRows.where({ ownerId }).limit(50)],
        ["where-order-desc-limit50", jazzApp.demoRows.where({ ownerId }).orderBy("createdAt", "desc").limit(50)],
        ["where-order-asc-limit50", jazzApp.demoRows.where({ ownerId }).orderBy("createdAt", "asc").limit(50)],
        [
          "where-order-desc-offset1000",
          jazzApp.demoRows.where({ ownerId }).orderBy("createdAt", "desc").offset(1000).limit(50),
        ],
        [
          "where-order-desc-offset4900",
          jazzApp.demoRows.where({ ownerId }).orderBy("createdAt", "desc").offset(4900).limit(50),
        ],
        [
          "where-select-order-desc-limit50",
          jazzApp.demoRows.where({ ownerId }).select("id", "createdAt", "ordinal").orderBy("createdAt", "desc").limit(50),
        ],
      ] as const;
      const results = [];

      for (const [name, variant] of variants) {
        const variantStartedAt = performance.now();
        const rows = (await withTimeout(
          db.all(variant, options),
          waitTimeoutMs,
          `Profile read ${name} for ${tier}`,
        )) as DemoRowRecord[];
        results.push({
          name,
          ms: Number((performance.now() - variantStartedAt).toFixed(3)),
          rows: rows.length,
        });
      }

      mark("profile");

      return NextResponse.json({
        ownerIndex,
        ownerId,
        tier,
        timeoutMs: waitTimeoutMs,
        results,
        ms: Number((performance.now() - startedAt).toFixed(3)),
        debug: debug ? marks : undefined,
      });
    }

    const query = jazzApp.demoRows.where({ ownerId }).orderBy("createdAt", "desc").offset(offset).limit(limit);
    mark("queryBuilt");
    const rows = await withTimeout(
      db.all(query, {
        tier,
      }),
      waitTimeoutMs,
      `Page read for ${tier}`,
    ) as DemoRowRecord[];
    mark("dbAll");

    return NextResponse.json({
      ownerIndex,
      ownerId,
      offset,
      limit,
      rows,
      rowCount: rows.length,
      rowsPerOwner: DEMO_ROWS_PER_OWNER,
      totalOwners: DEMO_OWNER_COUNT,
      totalRows: DEMO_TOTAL_ROWS,
      tier,
      timeoutMs: waitTimeoutMs,
      ms: Number((performance.now() - startedAt).toFixed(3)),
      debug: debug ? marks : undefined,
    });
  } catch (error) {
    mark("error");
    return NextResponse.json(
      {
        ownerIndex,
        ownerId: demoOwnerId(ownerIndex),
        offset,
        limit,
        tier,
        timeoutMs: waitTimeoutMs,
        debug: debug ? marks : undefined,
        error: error instanceof Error ? error.message : "Unknown page error",
      },
      { status: 400 },
    );
  }
}
