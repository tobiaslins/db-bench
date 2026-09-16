"use client";

import { useEffect, useMemo, useState } from "react";
import { JazzProvider, useAll } from "jazz-tools/react";
import { jazzApp } from "../../lib/bench/adapters/jazz-app";
import type { JazzDurabilityTier } from "../../lib/bench/types";

type JazzClientRowsProps = {
  appId: string;
  serverUrl?: string;
};

const tiers: JazzDurabilityTier[] = ["edge", "global", "local"];

function RowsView({ appId, initialRunId, serverUrl }: { appId: string; initialRunId: string; serverUrl?: string }) {
  const [runId, setRunId] = useState(initialRunId);
  const [limit, setLimit] = useState(25);
  const [tier, setTier] = useState<JazzDurabilityTier>("edge");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [firstLoadMs, setFirstLoadMs] = useState<number | null>(null);
  const [lastUpdateMs, setLastUpdateMs] = useState<number | null>(null);

  const queryKey = `${runId.trim()}|${limit}|${tier}`;
  const query = useMemo(() => {
    const trimmed = runId.trim();
    if (!trimmed) return undefined;

    return jazzApp.benchItems.where({ runId: trimmed }).orderBy("ordinal", "desc").limit(limit);
  }, [limit, runId]);

  const result = useAll(query, { tier });
  const rows = result.data;

  useEffect(() => {
    if (!runId.trim()) {
      setStartedAt(null);
      setFirstLoadMs(null);
      setLastUpdateMs(null);
      return;
    }

    setStartedAt(performance.now());
    setFirstLoadMs(null);
    setLastUpdateMs(null);
  }, [queryKey, runId]);

  useEffect(() => {
    if (!rows || startedAt === null) return;

    const elapsed = Number((performance.now() - startedAt).toFixed(3));
    setLastUpdateMs(elapsed);
    setFirstLoadMs((current) => current ?? elapsed);
  }, [rows, startedAt]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Jazz Client Rows</h1>
          <p>Rendered directly in the browser with useAll</p>
          <p className="envLine">app={appId} server={serverUrl ?? "none"}</p>
        </div>
        <a className="textLink" href="/">
          Benchmark
        </a>
      </header>

      <section className="workspace">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <label>
            Run ID
            <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="run-..." />
          </label>

          <label>
            Limit
            <input min="1" max="1000" type="number" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
          </label>

          <fieldset>
            <legend>Read Tier</legend>
            <div className="segmented three">
              {tiers.map((item) => (
                <button className={item === tier ? "active" : ""} key={item} onClick={() => setTier(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="metricStack">
            <div>
              <span>First load</span>
              <strong>{firstLoadMs === null ? "-" : `${firstLoadMs.toFixed(3)} ms`}</strong>
            </div>
            <div>
              <span>Last update</span>
              <strong>{lastUpdateMs === null ? "-" : `${lastUpdateMs.toFixed(3)} ms`}</strong>
            </div>
          </div>
        </form>

        <section className="panel results">
          <div className="resultHeader">
            <h2>Rows</h2>
            <span>{result.isLoading ? "loading" : `${rows?.length ?? 0}`}</span>
          </div>

          {result.error ? <div className="errorBox">{result.error.message}</div> : null}
          <pre>{rows ? JSON.stringify(rows, null, 2) : "Waiting for Jazz subscription..."}</pre>
        </section>
      </section>
    </main>
  );
}

export function JazzClientRows({ appId, serverUrl }: JazzClientRowsProps) {
  const [mounted, setMounted] = useState(false);
  const providerProps = useMemo(
    () => ({
      appId,
      serverUrl: serverUrl ?? "http://localhost:1625/",
      driver: { type: "persistent" as const },
      dbName: `db-bench-client-${appId}`,
      initial: "local-first" as const,
    }),
    [appId, serverUrl],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <main className="shell">Loading Jazz...</main>;
  }

  return (
    <JazzProvider {...providerProps} fallback={<main className="shell">Loading Jazz...</main>}>
      <RowsView appId={appId} initialRunId="" serverUrl={serverUrl} />
    </JazzProvider>
  );
}
