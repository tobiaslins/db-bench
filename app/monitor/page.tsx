import {
  getMonitorSeries,
  getMonitorStats,
  monitorOperations,
  monitorTargets,
  monitorWindowMinutes,
  monitorWindows,
  seriesBucketMinutes,
  type MonitorWindow,
  type PercentileRow,
} from "../../lib/monitor";
import { LatencyChart } from "./latency-chart";

export const dynamic = "force-dynamic";

const percentiles = ["p50", "p75", "p95", "p99", "max"] as const;
const operations = [...monitorOperations, "request"] as const;

const operationLabels: Record<(typeof operations)[number], string> = {
  createOne: "createOne",
  create1k: "create1k",
  select10: "select10",
  selectTopN: "selectTopN (n=10)",
  getById: "getById",
  updateById: "updateById",
  updateTopN: "updateTopN (n=10)",
  request: "whole suite request (from cron)",
};

function targetLabel(provider: string, tier: string) {
  return tier === "-" ? provider : `${provider} · ${tier}`;
}

function formatMs(value: number) {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatAgo(date: Date | null) {
  if (!date) return "never";
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const requested = (await searchParams).window;
  const window: MonitorWindow = typeof requested === "string" && requested in monitorWindows ? (requested as MonitorWindow) : "24h";
  const [{ rows, targets }, series] = await Promise.all([getMonitorStats(window), getMonitorSeries(window)]);
  const end = new Date();
  const start = new Date(end.getTime() - monitorWindowMinutes[window] * 60_000);
  const chartTargets = monitorTargets.map(({ provider, tier = "-" }) => ({ provider, tier }));

  const rowFor = (operation: string, provider: string, tier: string): PercentileRow | undefined =>
    rows.find((row) => row.operation === operation && row.provider === provider && row.tier === tier);
  const summaryFor = (provider: string, tier: string) => targets.find((target) => target.provider === provider && target.tier === tier);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Monitor</h1>
          <p>Benchmark suite every 15 minutes, plus every run from the console · latency percentiles in ms over the last {monitorWindows[window]}</p>
        </div>
        <div className="topActions">
          <a className="textLink" href="/">
            Bench Console
          </a>
          <div className="segmented monitorWindows">
            {(Object.keys(monitorWindows) as MonitorWindow[]).map((item) => (
              <a className={item === window ? "active" : ""} href={`/monitor?window=${item}`} key={item}>
                {item}
              </a>
            ))}
          </div>
        </div>
      </header>

      <section className="panel compareWrap">
        <div className="tableScroller">
          <table className="compareTable">
            <thead>
              <tr>
                <th>Target</th>
                <th>Region</th>
                <th>Cron runs</th>
                <th>Manual runs</th>
                <th>Errors</th>
                <th>Last run</th>
              </tr>
            </thead>
            <tbody>
              {monitorTargets.map(({ provider, tier = "-" }) => {
                const summary = summaryFor(provider, tier);
                const region = rows.find((row) => row.provider === provider && row.tier === tier)?.region ?? "—";

                return (
                  <tr key={`${provider}-${tier}`}>
                    <td>{targetLabel(provider, tier)}</td>
                    <td className="monoCell">{region}</td>
                    <td>{summary?.cronRuns ?? 0}</td>
                    <td>{summary?.manualRuns ?? 0}</td>
                    <td className={summary?.errors ? "errorCell" : ""} title={summary?.lastError ?? undefined}>
                      {summary?.errors ?? 0}
                    </td>
                    <td>{formatAgo(summary?.lastRunAt ?? null)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <LatencyChart
        bucketMinutes={seriesBucketMinutes[window]}
        end={end.toISOString()}
        operations={operations.map((operation) => ({ id: operation, label: operationLabels[operation] }))}
        points={series}
        start={start.toISOString()}
        targets={chartTargets}
      />

      {rows.length === 0 ? (
        <section className="panel compareWrap">
          <p className="hintText monitorEmpty">No samples in this window yet. The cron runs every 15 minutes, and runs from the console count too.</p>
        </section>
      ) : (
        operations.map((operation) => {
          const operationRows = monitorTargets.map(({ provider, tier = "-" }) => ({ provider, tier, row: rowFor(operation, provider, tier) }));
          const best = Object.fromEntries(
            percentiles.map((percentile) => [
              percentile,
              // Local-tier Jazz never waits on the network, so the highlight compares network-bound targets only.
              Math.min(...operationRows.flatMap(({ tier, row }) => (row && tier !== "local" ? [row[percentile]] : []))),
            ]),
          );

          return (
            <section className="panel compareWrap" key={operation}>
              <h2 className="monitorHeading">{operationLabels[operation]}</h2>
              <div className="tableScroller">
                <table className="compareTable">
                  <thead>
                    <tr>
                      <th>Target</th>
                      {percentiles.map((percentile) => (
                        <th key={percentile}>{percentile}</th>
                      ))}
                      <th>n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operationRows.map(({ provider, tier, row }) => (
                      <tr key={`${provider}-${tier}`}>
                        <td>{targetLabel(provider, tier)}</td>
                        {percentiles.map((percentile) => (
                          <td className={row && tier !== "local" && row[percentile] === best[percentile] ? "winnerCell monoCell" : "monoCell"} key={percentile}>
                            {row ? formatMs(row[percentile]) : "—"}
                          </td>
                        ))}
                        <td>{row?.count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
