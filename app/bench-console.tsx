"use client";

import { useMemo, useState } from "react";
import type { BenchOperation, BenchProvider, JazzDurabilityTier } from "../lib/bench/types";

type BenchResponse = {
  provider?: BenchProvider;
  operation?: BenchOperation;
  result?: unknown;
  error?: string;
};

type RunState = "idle" | "running" | "done" | "error";
type CompareState = "idle" | "running" | "done" | "error";
type CompareRow = {
  operation: string;
  jazzMs: number | null;
  tursoMs: number | null;
  winner: BenchProvider | "tie" | "none";
};
type CompareResult = {
  jazz: BenchResponse;
  turso: BenchResponse;
  rows: CompareRow[];
};

const providers: BenchProvider[] = ["jazz", "turso"];
const operations: BenchOperation[] = ["suite", "create", "select10", "selectTopN", "getById", "updateTopN", "updateById"];
const jazzDurabilityTiers: JazzDurabilityTier[] = ["global", "edge", "local"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function findFirstId(response: BenchResponse): string | null {
  const result = response.result;

  if (!isRecord(result)) return null;

  const direct = result.result;
  if (isRecord(direct) && typeof direct.firstId === "string") {
    return direct.firstId;
  }

  const create = result.create;
  if (isRecord(create) && isRecord(create.result) && typeof create.result.firstId === "string") {
    return create.result.firstId;
  }

  return null;
}

function findRunId(response: BenchResponse): string | null {
  const result = response.result;

  if (!isRecord(result)) return null;

  const direct = result.result;
  if (isRecord(direct) && typeof direct.runId === "string") {
    return direct.runId;
  }

  const create = result.create;
  if (isRecord(create) && isRecord(create.result) && typeof create.result.runId === "string") {
    return create.result.runId;
  }

  return null;
}

function collectTimings(value: unknown, prefix = ""): Array<{ label: string; ms: number }> {
  if (!isRecord(value)) return [];

  const timings: Array<{ label: string; ms: number }> = [];

  if (typeof value.ms === "number") {
    timings.push({ label: prefix || "operation", ms: value.ms });
  }

  for (const [key, nested] of Object.entries(value)) {
    if (isRecord(nested)) {
      timings.push(...collectTimings(nested, prefix ? `${prefix}.${key}` : key));
    }
  }

  return timings;
}

function suiteTiming(response: BenchResponse, key: string): number | null {
  const result = response.result;
  if (!isRecord(result)) return null;

  const entry = result[key];
  if (!isRecord(entry) || typeof entry.ms !== "number") return null;

  return entry.ms;
}

function buildCompareRows(jazz: BenchResponse, turso: BenchResponse): CompareRow[] {
  return ["create", "select10", "selectTopN", "getById", "updateById", "updateTopN"].map((operation) => {
    const jazzMs = suiteTiming(jazz, operation);
    const tursoMs = suiteTiming(turso, operation);
    let winner: CompareRow["winner"] = "none";

    if (jazzMs !== null && tursoMs !== null) {
      winner = jazzMs === tursoMs ? "tie" : jazzMs < tursoMs ? "jazz" : "turso";
    }

    return {
      operation,
      jazzMs,
      tursoMs,
      winner,
    };
  });
}

function formatMs(ms: number | null): string {
  return ms === null ? "-" : `${ms.toFixed(3)} ms`;
}

export function BenchConsole() {
  const [provider, setProvider] = useState<BenchProvider>("jazz");
  const [operation, setOperation] = useState<BenchOperation>("suite");
  const [count, setCount] = useState(100);
  const [n, setN] = useState(10);
  const [id, setId] = useState("");
  const [runId, setRunId] = useState("");
  const [jazzDurabilityTier, setJazzDurabilityTier] = useState<JazzDurabilityTier>("global");
  const [status, setStatus] = useState<RunState>("idle");
  const [compareStatus, setCompareStatus] = useState<CompareState>("idle");
  const [response, setResponse] = useState<BenchResponse | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);

  const timings = useMemo(() => collectTimings(response?.result), [response]);

  async function run(nextOperation = operation, overrides: Partial<{ count: number; n: number }> = {}) {
    setStatus("running");
    setResponse(null);

    const body = {
      operation: nextOperation,
      count: overrides.count ?? count,
      n: overrides.n ?? n,
      id: id || undefined,
      runId: runId || undefined,
      jazzDurabilityTier: provider === "jazz" ? jazzDurabilityTier : undefined,
    };

    const result = (await fetch(`/api/bench/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => res.json())) as BenchResponse;

    const firstId = findFirstId(result);
    if (firstId) setId(firstId);
    const nextRunId = findRunId(result);
    if (nextRunId) setRunId(nextRunId);

    setResponse(result);
    setStatus(result.error ? "error" : "done");
  }

  async function runProviderSuite(nextProvider: BenchProvider, nextRunId: string) {
    const body = {
      operation: "suite",
      count,
      n,
      runId: nextRunId,
      jazzDurabilityTier: nextProvider === "jazz" ? jazzDurabilityTier : undefined,
    };

    return (await fetch(`/api/bench/${nextProvider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => res.json())) as BenchResponse;
  }

  async function runAll() {
    setCompareStatus("running");
    setCompareResult(null);

    const nextRunId = `compare-${Date.now()}`;
    const [jazz, turso] = await Promise.all([runProviderSuite("jazz", nextRunId), runProviderSuite("turso", nextRunId)]);
    const hasError = Boolean(jazz.error || turso.error);

    setRunId(nextRunId);
    setCompareResult({
      jazz,
      turso,
      rows: buildCompareRows(jazz, turso),
    });
    setCompareStatus(hasError ? "error" : "done");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>DB Bench</h1>
          <p>Turso and Jazz alpha benchmark runner</p>
        </div>
        <div className="topActions">
          <a className="textLink" href="/jazz-client">
            Jazz Client Rows
          </a>
          <div className={`status status-${status}`}>{status}</div>
        </div>
      </header>

      <section className="workspace">
        <form
          className="panel controls"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <fieldset>
            <legend>Provider</legend>
            <div className="segmented">
              {providers.map((item) => (
                <button
                  className={item === provider ? "active" : ""}
                  key={item}
                  onClick={() => setProvider(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <label>
            Operation
            <select value={operation} onChange={(event) => setOperation(event.target.value as BenchOperation)}>
              {operations.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          {provider === "jazz" ? (
            <fieldset>
              <legend>Jazz Durability</legend>
              <div className="segmented three">
                {jazzDurabilityTiers.map((item) => (
                  <button
                    className={item === jazzDurabilityTier ? "active" : ""}
                    key={item}
                    onClick={() => setJazzDurabilityTier(item)}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <div className="grid2">
            <label>
              Count
              <input min="1" max="1000" type="number" value={count} onChange={(event) => setCount(Number(event.target.value))} />
            </label>
            <label>
              Top N
              <input min="1" max="1000" type="number" value={n} onChange={(event) => setN(Number(event.target.value))} />
            </label>
          </div>

          <label>
            Row ID
            <input value={id} onChange={(event) => setId(event.target.value)} placeholder="auto-filled after create/suite" />
          </label>

          <label>
            Run ID
            <input value={runId} onChange={(event) => setRunId(event.target.value)} placeholder="auto-filled after create/suite" />
          </label>

          <button className="primary" disabled={status === "running"} type="submit">
            {status === "running" ? "Running..." : "Run"}
          </button>

          <button className="secondary" disabled={compareStatus === "running"} type="button" onClick={() => void runAll()}>
            {compareStatus === "running" ? "Running All..." : "Run All Compare"}
          </button>

          <div className="quick">
            <button type="button" onClick={() => setRunId("")}>
              New Run
            </button>
            <button type="button" onClick={() => void run("suite")}>
              Suite
            </button>
            <button type="button" onClick={() => void run("create", { count: 100 })}>
              Create 100
            </button>
            <button type="button" onClick={() => void run("create", { count: 1000 })}>
              Create 1k
            </button>
            <button type="button" onClick={() => void run("select10")}>
              Select 10
            </button>
            <button type="button" onClick={() => void run("selectTopN")}>
              Top N
            </button>
            <button type="button" onClick={() => void run("getById")}>
              By ID
            </button>
            <button type="button" onClick={() => void run("updateTopN")}>
              Update N
            </button>
            <button type="button" onClick={() => void run("updateById")}>
              Update ID
            </button>
          </div>
        </form>

        <section className="panel results">
          <div className="resultHeader">
            <h2>Results</h2>
            {response?.provider ? <span>{response.provider}</span> : null}
          </div>

          {response?.error ? <div className="errorBox">{response.error}</div> : null}

          {timings.length > 0 ? (
            <div className="timings">
              {timings.map((timing) => (
                <div key={timing.label}>
                  <span>{timing.label}</span>
                  <strong>{timing.ms.toFixed(3)} ms</strong>
                </div>
              ))}
            </div>
          ) : null}

          <pre>{response ? JSON.stringify(response, null, 2) : "Run a benchmark to see output."}</pre>
        </section>
      </section>

      <section className="compareWrap panel">
        <div className="resultHeader">
          <h2>Compare</h2>
          <span>{compareStatus}</span>
        </div>

        {compareResult?.jazz.error ? <div className="errorBox">Jazz: {compareResult.jazz.error}</div> : null}
        {compareResult?.turso.error ? <div className="errorBox">Turso: {compareResult.turso.error}</div> : null}

        <div className="tableScroller">
          <table className="compareTable">
            <thead>
              <tr>
                <th>Operation</th>
                <th>Jazz</th>
                <th>Turso</th>
                <th>Faster</th>
              </tr>
            </thead>
            <tbody>
              {compareResult ? (
                compareResult.rows.map((row) => (
                  <tr key={row.operation}>
                    <td>{row.operation}</td>
                    <td className={row.winner === "jazz" ? "winnerCell" : ""}>{formatMs(row.jazzMs)}</td>
                    <td className={row.winner === "turso" ? "winnerCell" : ""}>{formatMs(row.tursoMs)}</td>
                    <td>{row.winner === "none" ? "-" : row.winner}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Run all to compare both providers.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
