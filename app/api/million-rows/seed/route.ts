import { NextResponse } from "next/server";
import { getJazzContext } from "../../../../lib/bench/adapters/jazz";
import { jazzApp } from "../../../../lib/bench/adapters/jazz-app";
import {
  DEMO_OWNER_COUNT,
  DEMO_ROWS_PER_OWNER,
  DEMO_SEED_BATCH_SIZE,
  clampInt,
  demoOwnerSession,
  demoRow,
  normalizeTier,
  timeoutMs,
  withTimeout,
} from "../../../../lib/million-rows-demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ownerStart = clampInt(body.ownerStart, 0, 0, DEMO_OWNER_COUNT - 1);
  const ownerCount = clampInt(body.ownerCount, 1, 1, Math.min(10, DEMO_OWNER_COUNT - ownerStart));
  const rowStart = clampInt(body.rowStart, 0, 0, DEMO_ROWS_PER_OWNER - 1);
  const rowCount = clampInt(body.rowCount, DEMO_ROWS_PER_OWNER, 1, DEMO_ROWS_PER_OWNER - rowStart);
  const tier = normalizeTier(body.tier);
  const waitTimeoutMs = timeoutMs(body.timeoutMs);
  const startedAt = performance.now();
  let rowsSeeded = 0;
  let transactions = 0;

  try {
    for (let ownerIndex = ownerStart; ownerIndex < ownerStart + ownerCount; ownerIndex += 1) {
      const db = getJazzContext().forSession(demoOwnerSession(ownerIndex));

      for (let batchStart = rowStart; batchStart < rowStart + rowCount; batchStart += DEMO_SEED_BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + DEMO_SEED_BATCH_SIZE, rowStart + rowCount);
        const commit = await db.transaction((tx: any) => {
          for (let ordinal = batchStart; ordinal < batchEnd; ordinal += 1) {
            const row = demoRow(ownerIndex, ordinal);
            tx.upsert(
              jazzApp.demoRows,
              row.id,
              {
                ownerId: row.ownerId,
                ownerIssuer: row.ownerIssuer,
                ownerSubject: row.ownerSubject,
                ownerIndex: row.ownerIndex,
                ordinal: row.ordinal,
                payload: row.payload,
                createdAt: row.createdAt,
              },
              { updatedAt: row.createdAt },
            );
          }
        });

        await withTimeout(commit.wait({ tier }), waitTimeoutMs, `Seed wait for ${tier}`);
        rowsSeeded += batchEnd - batchStart;
        transactions += 1;
      }
    }

    getJazzContext().flush();

    return NextResponse.json({
      ownerStart,
      ownerCount,
      rowStart,
      rowCount,
      rowsSeeded,
      transactions,
      batchSize: DEMO_SEED_BATCH_SIZE,
      totalOwners: DEMO_OWNER_COUNT,
      rowsPerOwner: DEMO_ROWS_PER_OWNER,
      tier,
      timeoutMs: waitTimeoutMs,
      ms: Number((performance.now() - startedAt).toFixed(3)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ownerStart,
        ownerCount,
        rowStart,
        rowCount,
        rowsSeeded,
        transactions,
        batchSize: DEMO_SEED_BATCH_SIZE,
        tier,
        timeoutMs: waitTimeoutMs,
        error: error instanceof Error ? error.message : "Unknown seed error",
      },
      { status: 400 },
    );
  }
}
