"use client";

import { useMemo, useRef, useState } from "react";
import type { DurabilityTier } from "jazz-tools";
import { DEMO_OWNER_COUNT, DEMO_ROWS_PER_OWNER, DEMO_TOTAL_ROWS } from "../../lib/million-rows-demo";

type SeedResponse = {
  ownerStart?: number;
  ownerCount?: number;
  rowCount?: number;
  rowsSeeded?: number;
  ms?: number;
  clientMs?: number;
  error?: string;
};

type DemoRow = {
  id: string;
  ownerId: string;
  ownerIndex: number;
  ordinal: number;
  payload: string;
  createdAt: number;
};

type PageResponse = {
  ownerIndex?: number;
  ownerId?: string;
  offset?: number;
  limit?: number;
  rows?: DemoRow[];
  rowCount?: number;
  ms?: number;
  clientMs?: number;
  error?: string;
};

type CountResponse = {
  ownerIndex?: number;
  ownerId?: string;
  count?: number;
  method?: string;
  ms?: number;
  clientMs?: number;
  error?: string;
};

type LoadState = "idle" | "running" | "done" | "error";

const tiers: DurabilityTier[] = ["edge", "global", "local"];

function fmt(value: number) {
  return Intl.NumberFormat("en-US").format(value);
}

function ms(value?: number) {
  return typeof value === "number" ? `${value.toFixed(3)} ms` : "-";
}

export function MillionRowsDemo() {
  const [ownerIndex, setOwnerIndex] = useState(0);
  const [seedOwnerStart, setSeedOwnerStart] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [offset, setOffset] = useState(0);
  const [seedTier, setSeedTier] = useState<DurabilityTier>("local");
  const [readTier, setReadTier] = useState<DurabilityTier>("local");
  const [seedStatus, setSeedStatus] = useState<LoadState>("idle");
  const [pageStatus, setPageStatus] = useState<LoadState>("idle");
  const [countStatus, setCountStatus] = useState<LoadState>("idle");
  const [seedResult, setSeedResult] = useState<SeedResponse | null>(null);
  const [pageResult, setPageResult] = useState<PageResponse | null>(null);
  const [countResult, setCountResult] = useState<CountResponse | null>(null);
  const [seededOwners, setSeededOwners] = useState(0);
  const pageRequestRef = useRef(0);
  const countRequestRef = useRef(0);
  const seededRows = useMemo(() => seededOwners * DEMO_ROWS_PER_OWNER, [seededOwners]);

  async function seedOwners(start: number, count: number) {
    const startedAt = performance.now();
    const response = (await fetch("/api/million-rows/seed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerStart: start, ownerCount: count, rowStart: 0, rowCount: DEMO_ROWS_PER_OWNER, tier: seedTier }),
    }).then((res) => res.json())) as SeedResponse;
    response.clientMs = performance.now() - startedAt;

    if (response.error) throw new Error(response.error);

    return response;
  }

  async function seedOne() {
    setSeedStatus("running");
    setSeedResult(null);

    try {
      const result = await seedOwners(seedOwnerStart, 1);
      setSeedResult(result);
      setSeededOwners((current) => Math.max(current, seedOwnerStart + 1));
      setOwnerIndex(seedOwnerStart);
      setSeedOwnerStart((current) => Math.min(current + 1, DEMO_OWNER_COUNT - 1));
      setSeedStatus("done");
    } catch (error) {
      setSeedResult({ error: error instanceof Error ? error.message : "Seed failed" });
      setSeedStatus("error");
    }
  }

  async function seedAll() {
    setSeedStatus("running");
    setSeedResult(null);

    try {
      for (let index = seedOwnerStart; index < DEMO_OWNER_COUNT; index += 1) {
        const result = await seedOwners(index, 1);
        setSeedResult(result);
        setSeededOwners(index + 1);
        setSeedOwnerStart(Math.min(index + 1, DEMO_OWNER_COUNT - 1));
      }
      setSeedStatus("done");
    } catch (error) {
      setSeedResult({ error: error instanceof Error ? error.message : "Seed failed" });
      setSeedStatus("error");
    }
  }

  async function loadPage(nextOffset = offset) {
    const requestId = pageRequestRef.current + 1;
    pageRequestRef.current = requestId;
    setPageStatus("running");
    setPageResult(null);

    try {
      const startedAt = performance.now();
      const params = new URLSearchParams({
        ownerIndex: String(ownerIndex),
        limit: String(pageSize),
        offset: String(nextOffset),
        tier: readTier,
      });
      const result = (await fetch(`/api/million-rows/page?${params}`).then((res) => res.json())) as PageResponse;
      result.clientMs = performance.now() - startedAt;

      if (requestId !== pageRequestRef.current) return;

      setPageResult(result);
      setPageStatus(result.error ? "error" : "done");
    } catch (error) {
      if (requestId !== pageRequestRef.current) return;

      setPageResult({ error: error instanceof Error ? error.message : "Page fetch failed" });
      setPageStatus("error");
    }
  }

  async function countRows() {
    const requestId = countRequestRef.current + 1;
    countRequestRef.current = requestId;
    setCountStatus("running");
    setCountResult(null);

    try {
      const startedAt = performance.now();
      const params = new URLSearchParams({
        ownerIndex: String(ownerIndex),
        tier: readTier,
      });
      const result = (await fetch(`/api/million-rows/count?${params}`).then((res) => res.json())) as CountResponse;
      result.clientMs = performance.now() - startedAt;

      if (requestId !== countRequestRef.current) return;

      setCountResult(result);
      setCountStatus(result.error ? "error" : "done");
    } catch (error) {
      if (requestId !== countRequestRef.current) return;

      setCountResult({ error: error instanceof Error ? error.message : "Count failed" });
      setCountStatus("error");
    }
  }

  function movePage(delta: number) {
    const nextOffset = Math.min(Math.max(offset + delta, 0), DEMO_ROWS_PER_OWNER - pageSize);
    setOffset(nextOffset);
    void loadPage(nextOffset);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>Million Rows</h1>
          <p>{fmt(DEMO_TOTAL_ROWS)} Jazz rows, {fmt(DEMO_OWNER_COUNT)} owners, {fmt(DEMO_ROWS_PER_OWNER)} rows each</p>
        </div>
        <div className="topActions">
          <a className="textLink" href="/">
            Benchmark
          </a>
          <a className="textLink" href="/jazz-client">
            Jazz Client Rows
          </a>
        </div>
      </header>

      <section className="workspace">
        <form className="panel controls" onSubmit={(event) => event.preventDefault()}>
          <fieldset>
            <legend>Seed Wait Tier</legend>
            <div className="segmented three">
              {tiers.map((item) => (
                <button className={item === seedTier ? "active" : ""} key={item} onClick={() => setSeedTier(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Read Tier</legend>
            <div className="segmented three">
              {tiers.map((item) => (
                <button className={item === readTier ? "active" : ""} key={item} onClick={() => setReadTier(item)} type="button">
                  {item}
                </button>
              ))}
            </div>
          </fieldset>

          <p className="hintText">
            Rows seeded with local wait may only be visible to local reads until the sync server catches up.
          </p>

          <div className="grid2">
            <label>
              Seed owner
              <input max={DEMO_OWNER_COUNT - 1} min="0" type="number" value={seedOwnerStart} onChange={(event) => setSeedOwnerStart(Number(event.target.value))} />
            </label>
            <label>
              Read owner
              <input max={DEMO_OWNER_COUNT - 1} min="0" type="number" value={ownerIndex} onChange={(event) => setOwnerIndex(Number(event.target.value))} />
            </label>
          </div>

          <div className="grid2">
            <label>
              Page size
              <input max="250" min="1" type="number" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} />
            </label>
            <label>
              Offset
              <input max={DEMO_ROWS_PER_OWNER - 1} min="0" type="number" value={offset} onChange={(event) => setOffset(Number(event.target.value))} />
            </label>
          </div>

          <button className="primary" disabled={seedStatus === "running"} type="button" onClick={() => void seedOne()}>
            {seedStatus === "running" ? "Seeding..." : "Seed 10k Rows"}
          </button>

          <button className="secondary" disabled={seedStatus === "running"} type="button" onClick={() => void seedAll()}>
            Seed Remaining Owners
          </button>

          <button disabled={pageStatus === "running"} type="button" onClick={() => void loadPage()}>
            {pageStatus === "running" ? "Loading..." : "Load Page"}
          </button>

          <button disabled={countStatus === "running"} type="button" onClick={() => void countRows()}>
            {countStatus === "running" ? "Counting..." : "Count Rows"}
          </button>

          <div className="quick">
            <button type="button" onClick={() => movePage(-pageSize)}>
              Previous
            </button>
            <button type="button" onClick={() => movePage(pageSize)}>
              Next
            </button>
          </div>

          <div className="metricStack">
            <div>
              <span>Seeded this session</span>
              <strong>{fmt(seededRows)} rows</strong>
            </div>
            <div>
              <span>Seed server</span>
              <strong>{ms(seedResult?.ms)}</strong>
            </div>
            <div>
              <span>Page server</span>
              <strong>{ms(pageResult?.ms)}</strong>
            </div>
            <div>
              <span>Page fetch</span>
              <strong>{ms(pageResult?.clientMs)}</strong>
            </div>
            <div>
              <span>Owner count</span>
              <strong>{typeof countResult?.count === "number" ? fmt(countResult.count) : "-"}</strong>
            </div>
            <div>
              <span>Count server</span>
              <strong>{ms(countResult?.ms)}</strong>
            </div>
            <div>
              <span>Count fetch</span>
              <strong>{ms(countResult?.clientMs)}</strong>
            </div>
          </div>
        </form>

        <section className="panel results">
          <div className="resultHeader">
            <h2>Rows by Created At</h2>
            <span>{pageStatus}</span>
          </div>

          {seedResult?.error ? <div className="errorBox">{seedResult.error}</div> : null}
          {pageResult?.error ? <div className="errorBox">{pageResult.error}</div> : null}
          {countResult?.error ? <div className="errorBox">{countResult.error}</div> : null}

          <div className="tableScroller demoTableWrap">
            <table className="compareTable">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Owner</th>
                  <th>Ordinal</th>
                  <th>Payload</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {pageResult?.rows?.length ? (
                  pageResult.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.createdAt}</td>
                      <td>{row.ownerIndex}</td>
                      <td>{row.ordinal}</td>
                      <td>{row.payload}</td>
                      <td className="monoCell">{row.id}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Seed an owner, then load a page.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <pre>{JSON.stringify({ seed: seedResult, page: pageResult, count: countResult }, null, 2)}</pre>
        </section>
      </section>
    </main>
  );
}
