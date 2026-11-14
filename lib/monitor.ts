import "server-only";

import { getPool } from "./bench/adapters/postgres";
import type { BenchProvider, JazzDurabilityTier } from "./bench/types";

export type MonitorTarget = {
  provider: BenchProvider;
  tier?: JazzDurabilityTier;
};

export const monitorTargets: MonitorTarget[] = [
  { provider: "jazz", tier: "global" },
  { provider: "jazz", tier: "local" },
  { provider: "jazz-vercel", tier: "global" },
  { provider: "jazz-vercel", tier: "local" },
  { provider: "postgres" },
  { provider: "turso" },
];

export const monitorOperations = ["createOne", "create1k", "select10", "selectTopN", "getById", "updateById", "updateTopN"] as const;

export const monitorWindows = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
} as const;

export type MonitorWindow = keyof typeof monitorWindows;

const tableName = "bench_monitor_samples";

let schemaReady: Promise<void> | undefined;

function ensureSchema() {
  schemaReady ??= (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id BIGSERIAL PRIMARY KEY,
        run_id TEXT NOT NULL,
        run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        provider TEXT NOT NULL,
        tier TEXT NOT NULL,
        operation TEXT NOT NULL,
        ms DOUBLE PRECISION,
        region TEXT,
        jazz_version TEXT,
        error TEXT
      )
    `);
    await getPool().query(`CREATE INDEX IF NOT EXISTS ${tableName}_run_at_idx ON ${tableName} (run_at DESC)`);
  })();
  schemaReady.catch(() => (schemaReady = undefined));

  return schemaReady;
}

type Sample = {
  provider: BenchProvider;
  tier: string;
  operation: string;
  ms: number | null;
  region: string | null;
  jazzVersion: string | null;
  error: string | null;
};

type SuiteResponse = {
  env?: { region?: string | null; jazz?: { packageVersion?: string } };
  result?: Record<string, { ms?: number } | null>;
  error?: string;
};

async function runTarget(origin: string, runId: string, target: MonitorTarget): Promise<Sample[]> {
  const tier = target.tier ?? "-";
  const startedAt = performance.now();

  try {
    const response = await fetch(`${origin}/api/bench/${target.provider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "suite", count: 1000, n: 10, runId, jazzDurabilityTier: target.tier }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({ error: `HTTP ${response.status}` }))) as SuiteResponse;
    const region = body.env?.region ?? null;
    const jazzVersion = target.provider.startsWith("jazz") ? (body.env?.jazz?.packageVersion ?? null) : null;

    if (body.error || !body.result) {
      return [{ provider: target.provider, tier, operation: "suite", ms: null, region, jazzVersion, error: body.error ?? `HTTP ${response.status}` }];
    }

    const samples: Sample[] = monitorOperations.flatMap((operation) => {
      const ms = body.result?.[operation]?.ms;
      return typeof ms === "number" ? [{ provider: target.provider, tier, operation, ms, region, jazzVersion, error: null }] : [];
    });

    // Wall time of the whole request as seen from the cron function, including any cold start.
    samples.push({
      provider: target.provider,
      tier,
      operation: "request",
      ms: Number((performance.now() - startedAt).toFixed(3)),
      region,
      jazzVersion,
      error: null,
    });

    return samples;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown monitor error";
    return [{ provider: target.provider, tier, operation: "suite", ms: null, region: null, jazzVersion: null, error: message }];
  }
}

export async function runMonitor(origin: string) {
  await ensureSchema();

  const runId = `monitor-${Date.now()}`;
  const byProvider = new Map<BenchProvider, MonitorTarget[]>();
  for (const target of monitorTargets) byProvider.set(target.provider, [...(byProvider.get(target.provider) ?? []), target]);

  // Providers run in parallel (each in its own region); a provider's tiers run one after another so they don't contend.
  const results = await Promise.all(
    [...byProvider.values()].map(async (targets) => {
      const samples: Sample[] = [];
      for (const target of targets) samples.push(...(await runTarget(origin, runId, target)));
      return samples;
    }),
  );
  const samples = results.flat();

  if (samples.length > 0) {
    const columns = 8;
    const placeholders = samples.map((_, index) => `(${Array.from({ length: columns }, (_, column) => `$${index * columns + column + 1}`).join(", ")})`);
    await getPool().query(
      `INSERT INTO ${tableName} (run_id, provider, tier, operation, ms, region, jazz_version, error) VALUES ${placeholders.join(", ")}`,
      samples.flatMap((sample) => [runId, sample.provider, sample.tier, sample.operation, sample.ms, sample.region, sample.jazzVersion, sample.error]),
    );
  }

  return { runId, samples: samples.length, errors: samples.filter((sample) => sample.error).map((sample) => `${sample.provider}/${sample.tier}: ${sample.error}`) };
}

export type PercentileRow = {
  provider: string;
  tier: string;
  operation: string;
  region: string | null;
  count: number;
  p50: number;
  p75: number;
  p95: number;
  p99: number;
  max: number;
};

export type TargetSummary = {
  provider: string;
  tier: string;
  runs: number;
  errors: number;
  lastRunAt: Date | null;
  lastError: string | null;
};

export async function getMonitorStats(window: MonitorWindow) {
  await ensureSchema();

  const interval = monitorWindows[window];
  const [percentiles, summaries] = await Promise.all([
    getPool().query(
      `SELECT provider, tier, operation, mode() WITHIN GROUP (ORDER BY region) AS region, count(*)::int AS count,
         percentile_cont(ARRAY[0.5, 0.75, 0.95, 0.99]) WITHIN GROUP (ORDER BY ms) AS p, max(ms) AS max
       FROM ${tableName}
       WHERE run_at > now() - $1::interval AND ms IS NOT NULL
       GROUP BY provider, tier, operation`,
      [interval],
    ),
    getPool().query(
      `SELECT provider, tier, count(DISTINCT run_id)::int AS runs, count(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
         max(run_at) AS last_run_at, (array_agg(error ORDER BY run_at DESC) FILTER (WHERE error IS NOT NULL))[1] AS last_error
       FROM ${tableName}
       WHERE run_at > now() - $1::interval
       GROUP BY provider, tier`,
      [interval],
    ),
  ]);

  const rows: PercentileRow[] = percentiles.rows.map((row) => ({
    provider: row.provider,
    tier: row.tier,
    operation: row.operation,
    region: row.region,
    count: row.count,
    p50: row.p[0],
    p75: row.p[1],
    p95: row.p[2],
    p99: row.p[3],
    max: row.max,
  }));
  const targets: TargetSummary[] = summaries.rows.map((row) => ({
    provider: row.provider,
    tier: row.tier,
    runs: row.runs,
    errors: row.errors,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
  }));

  return { rows, targets };
}
