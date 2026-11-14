import "server-only";

import { getPool } from "./bench/adapters/postgres";
import { clampInteger } from "./bench/items";
import type { BenchOperation, BenchProvider, BenchRequest, JazzDurabilityTier } from "./bench/types";

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
    // Samples recorded before manual runs were tracked all came from the cron.
    await getPool().query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'cron'`);
    await getPool().query(`CREATE INDEX IF NOT EXISTS ${tableName}_run_at_idx ON ${tableName} (run_at DESC)`);
  })();
  schemaReady.catch(() => (schemaReady = undefined));

  return schemaReady;
}

export type SampleSource = "cron" | "manual";

type Sample = {
  runId: string;
  source: SampleSource;
  provider: string;
  tier: string;
  operation: string;
  ms: number | null;
  region: string | null;
  jazzVersion: string | null;
  error: string | null;
};

type SuiteResponse = {
  env?: { region?: string | null; jazz?: { packageVersion?: string } };
  result?: unknown;
  error?: string;
};

async function insertSamples(samples: Sample[]) {
  if (samples.length === 0) return;

  await ensureSchema();

  const columns = 9;
  const placeholders = samples.map((_, index) => `(${Array.from({ length: columns }, (_, column) => `$${index * columns + column + 1}`).join(", ")})`);
  await getPool().query(
    `INSERT INTO ${tableName} (run_id, source, provider, tier, operation, ms, region, jazz_version, error) VALUES ${placeholders.join(", ")}`,
    samples.flatMap((sample) => [sample.runId, sample.source, sample.provider, sample.tier, sample.operation, sample.ms, sample.region, sample.jazzVersion, sample.error]),
  );
}

export function isCronRequest(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

// Name a single operation so it lines up with the suite's: `create` of 1000 is `create1k`, top-N with n=10 is plain `selectTopN`/`updateTopN`.
// Other sizes get their own names so they don't skew the comparable series.
function sampleOperationName(operation: BenchOperation, request: BenchRequest) {
  const count = clampInteger(request.count, 100, 1000);
  const n = clampInteger(request.n, 10, 1000);

  if (operation === "create") return count === 1000 ? "create1k" : `create:count=${count}`;
  if (operation === "selectTopN" || operation === "updateTopN") return n === 10 ? operation : `${operation}:n=${n}`;

  return operation;
}

function readMs(value: unknown) {
  return typeof value === "object" && value !== null && typeof (value as { ms?: unknown }).ms === "number" ? (value as { ms: number }).ms : null;
}

/** Records the timings of one `/api/bench/*` request, whether the cron or a person ran it. */
export async function recordBenchRequest(options: {
  provider: string;
  request: BenchRequest;
  source: SampleSource;
  result?: unknown;
  error?: string;
  region: string | null;
  jazzVersion: string | null;
}) {
  const { provider, request, source, result, error, region, jazzVersion } = options;
  const operation = request.operation ?? "suite";
  const base = {
    runId: request.runId || `${source}-${Date.now()}`,
    source,
    provider,
    tier: provider.startsWith("jazz") ? (request.jazzDurabilityTier ?? "global") : "-",
    region,
    jazzVersion: provider.startsWith("jazz") ? jazzVersion : null,
  };

  if (error || result === undefined) {
    await insertSamples([{ ...base, operation, ms: null, error: error ?? "No result" }]);
    return;
  }

  if (operation !== "suite") {
    const ms = readMs(result);
    if (ms !== null) await insertSamples([{ ...base, operation: sampleOperationName(operation, request), ms, error: null }]);
    return;
  }

  const suite = result as Record<string, unknown>;
  const n = clampInteger(request.n, 10, 1000);
  await insertSamples(
    monitorOperations.flatMap((name) => {
      const ms = readMs(suite[name]);
      const named = (name === "selectTopN" || name === "updateTopN") && n !== 10 ? `${name}:n=${n}` : name;
      return ms === null ? [] : [{ ...base, operation: named, ms, error: null }];
    }),
  );
}

// The bench route records the suite's own timings (see recordBenchRequest); the cron adds what only it can see:
// the whole request's wall time, and failures that never reached the route's handler.
async function runTarget(origin: string, runId: string, target: MonitorTarget): Promise<Sample[]> {
  const base = { runId, source: "cron" as const, provider: target.provider, tier: target.tier ?? "-" };
  const startedAt = performance.now();

  try {
    const response = await fetch(`${origin}/api/bench/${target.provider}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.CRON_SECRET}` },
      body: JSON.stringify({ operation: "suite", count: 1000, n: 10, runId, jazzDurabilityTier: target.tier }),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as SuiteResponse | null;

    // Only the bench handler answers with `env`; anything else (a platform 401, a crash page) never got to record itself.
    if (!body?.env) {
      const detail = body && typeof body === "object" && "message" in body ? `: ${String(body.message)}` : "";
      return [{ ...base, operation: "suite", ms: null, region: null, jazzVersion: null, error: `HTTP ${response.status}${detail}` }];
    }

    const region = body.env?.region ?? null;
    const jazzVersion = target.provider.startsWith("jazz") ? (body.env?.jazz?.packageVersion ?? null) : null;

    if (body.error) return [];

    return [{ ...base, operation: "request", ms: Number((performance.now() - startedAt).toFixed(3)), region, jazzVersion, error: null }];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown monitor error";
    return [{ ...base, operation: "suite", ms: null, region: null, jazzVersion: null, error: message }];
  }
}

export async function runMonitor(origin: string) {
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

  await insertSamples(samples);

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
  cronRuns: number;
  manualRuns: number;
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
      `SELECT provider, tier, count(DISTINCT run_id) FILTER (WHERE source = 'cron')::int AS cron_runs,
         count(DISTINCT run_id) FILTER (WHERE source = 'manual')::int AS manual_runs, count(*) FILTER (WHERE error IS NOT NULL)::int AS errors,
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
    cronRuns: row.cron_runs,
    manualRuns: row.manual_runs,
    errors: row.errors,
    lastRunAt: row.last_run_at,
    lastError: row.last_error,
  }));

  return { rows, targets };
}
