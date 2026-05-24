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

export function BenchConsole() {
  const [provider, setProvider] = useState<BenchProvider>("jazz");
  const [operation, setOperation] = useState<BenchOperation>("suite");
  const [count, setCount] = useState(100);
  const [n, setN] = useState(10);
  const [id, setId] = useState("");
  const [jazzDurabilityTier, setJazzDurabilityTier] = useState<JazzDurabilityTier>("global");
  const [status, setStatus] = useState<RunState>("idle");
  const [response, setResponse] = useState<BenchResponse | null>(null);

  const timings = useMemo(() => collectTimings(response?.result), [response]);

  async function run(nextOperation = operation, overrides: Partial<{ count: number; n: number }> = {}) {
    setStatus("running");
    setResponse(null);

    const body = {
      operation: nextOperation,
      count: overrides.count ?? count,
      n: overrides.n ?? n,
      id: id || undefined,
      jazzDurabilityTier: provider === "jazz" ? jazzDurabilityTier : undefined,
    };

    const result = (await fetch(`/api/bench/${provider}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((res) => res.json())) as BenchResponse;

    const firstId = findFirstId(result);
    if (firstId) setId(firstId);

    setResponse(result);
    setStatus(result.error ? "error" : "done");
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>DB Bench</h1>
          <p>Turso and Jazz alpha benchmark runner</p>
        </div>
        <div className={`status status-${status}`}>{status}</div>
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

          <button className="primary" disabled={status === "running"} type="submit">
            {status === "running" ? "Running..." : "Run"}
          </button>

          <div className="quick">
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
    </main>
  );
}
