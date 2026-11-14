"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SeriesPoint } from "../../lib/monitor";

type Target = { provider: string; tier: string };
type Percentile = "p50" | "p95" | "p99";

type LatencyChartProps = {
  points: SeriesPoint[];
  targets: Target[];
  operations: { id: string; label: string }[];
  start: string;
  end: string;
  bucketMinutes: number;
};

// One categorical slot per provider, in the palette's fixed order; Jazz's local tier is the same hue, dashed.
const providerColors: Record<string, string> = {
  jazz: "var(--series-1)",
  "jazz-vercel": "var(--series-2)",
  postgres: "var(--series-3)",
  turso: "var(--series-4)",
};

const percentiles: Percentile[] = ["p50", "p95", "p99"];
const height = 320;
const margin = { top: 16, right: 20, bottom: 32, left: 52 };

const keyOf = (target: Target) => `${target.provider}|${target.tier}`;
const labelOf = (target: Target) => (target.tier === "-" ? target.provider : `${target.provider} · ${target.tier}`);
const dashOf = (target: Target) => (target.tier === "local" ? "6 4" : undefined);

function formatMs(value: number) {
  if (value >= 100) return `${value.toFixed(0)} ms`;
  if (value >= 10) return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} ms`;
}

// The nearest 1-2-5 step below (or above) a value, so the log axis hugs the data.
function niceStep(value: number, direction: "down" | "up") {
  const exponent = Math.floor(Math.log10(value));
  const steps = [1, 2, 5, 10].map((step) => step * 10 ** exponent);
  return direction === "down" ? steps.filter((step) => step <= value).at(-1)! : steps.find((step) => step >= value)!;
}

function logTicks(min: number, max: number) {
  const ticks: number[] = [];
  for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
    for (const step of [1, 2, 5]) {
      const value = step * 10 ** exponent;
      if (value >= min && value <= max) ticks.push(value);
    }
  }
  return ticks;
}

function timeTicks(start: number, end: number) {
  const span = end - start;
  const hour = 3_600_000;
  const step = span <= 2 * hour ? 10 * 60_000 : span <= 2 * 24 * hour ? 3 * hour : span <= 8 * 24 * hour ? 24 * hour : 5 * 24 * hour;
  const offset = new Date(start).getTimezoneOffset() * 60_000;
  const ticks: number[] = [];
  for (let tick = Math.ceil((start - offset) / step) * step + offset; tick <= end; tick += step) ticks.push(tick);
  return { ticks, withDate: step >= 24 * hour };
}

function formatTime(time: number, withDate: boolean) {
  const date = new Date(time);
  return withDate
    ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function LatencyChart({ points, targets, operations, start, end, bucketMinutes }: LatencyChartProps) {
  const [operation, setOperation] = useState(operations.find((item) => item.id === "select10")?.id ?? operations[0].id);
  const [percentile, setPercentile] = useState<Percentile>("p50");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [width, setWidth] = useState(900);
  // Time labels use the viewer's timezone, which the server doesn't know; render them after hydration.
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = wrapRef.current;
    setMounted(true);
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const bucketMs = bucketMinutes * 60_000;

  const series = useMemo(
    () =>
      targets.map((target) => ({
        target,
        values: points
          .filter((point) => point.operation === operation && point.provider === target.provider && point.tier === target.tier)
          // Plot each bucket at its middle, so a bucket still filling up sits left of "now".
          .map((point) => ({ time: Date.parse(point.bucket) + bucketMs / 2, value: point[percentile], count: point.count })),
      })),
    [points, targets, operation, percentile, bucketMs],
  );
  const visible = series.filter(({ target, values }) => !hidden.has(keyOf(target)) && values.length > 0);
  const allValues = visible.flatMap(({ values }) => values.map((item) => item.value)).filter((value) => value > 0);

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const yMin = allValues.length ? niceStep(Math.min(...allValues), "down") : 1;
  const yMax = allValues.length ? niceStep(Math.max(...allValues), "up") : 1000;
  const x = (time: number) => margin.left + ((time - startMs) / (endMs - startMs)) * plotWidth;
  const y = (value: number) =>
    margin.top + plotHeight - ((Math.log10(Math.max(value, yMin)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * plotHeight;
  const yTicks = logTicks(yMin, yMax);
  const { ticks: xTicks, withDate } = timeTicks(startMs, endMs);

  // Break a line wherever buckets are missing instead of drawing across the gap.
  const pathOf = (values: { time: number; value: number }[]) =>
    values
      .map((item, index) => `${index > 0 && item.time - values[index - 1].time <= bucketMs * 1.5 ? "L" : "M"}${x(item.time).toFixed(1)},${y(item.value).toFixed(1)}`)
      .join("");

  const bucketTimes = [...new Set(visible.flatMap(({ values }) => values.map((item) => item.time)))].sort((a, b) => a - b);
  const hoverRows =
    hoverTime === null
      ? []
      : visible
          .flatMap(({ target, values }) => {
            const match = values.find((item) => item.time === hoverTime);
            return match ? [{ target, ...match }] : [];
          })
          .sort((a, b) => a.value - b.value);

  function onPointerMove(event: React.PointerEvent<SVGRectElement>) {
    if (bucketTimes.length === 0) return;
    const bounds = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const time = startMs + ((event.clientX - bounds.left - margin.left) / plotWidth) * (endMs - startMs);
    setHoverTime(bucketTimes.reduce((best, item) => (Math.abs(item - time) < Math.abs(best - time) ? item : best)));
  }

  const tooltipLeft = hoverTime === null ? 0 : x(hoverTime);
  const tooltipOnLeft = tooltipLeft > width * 0.6;

  return (
    <section className="panel compareWrap viz-root">
      <div className="chartHeader">
        <h2 className="monitorHeading">Latency over time</h2>
        <div className="chartControls">
          <select aria-label="Operation" value={operation} onChange={(event) => setOperation(event.target.value)}>
            {operations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <div className="segmented three" role="group" aria-label="Percentile">
            {percentiles.map((item) => (
              <button className={item === percentile ? "active" : ""} key={item} onClick={() => setPercentile(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="chartLegend">
        {targets.map((target) => {
          const key = keyOf(target);
          const off = hidden.has(key);
          return (
            <button
              aria-pressed={!off}
              className={off ? "legendItem off" : "legendItem"}
              key={key}
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              type="button"
            >
              <svg aria-hidden height="10" width="22">
                <line stroke={providerColors[target.provider]} strokeDasharray={dashOf(target)} strokeLinecap="round" strokeWidth="2" x1="2" x2="20" y1="5" y2="5" />
              </svg>
              {labelOf(target)}
            </button>
          );
        })}
      </div>

      <div className="chartWrap" ref={wrapRef}>
        <svg height={height} role="img" aria-label={`${percentile} latency over time, log scale`} width={width}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line className="gridLine" x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} />
              <text className="axisLabel" dominantBaseline="middle" textAnchor="end" x={margin.left - 8} y={y(tick)}>
                {tick >= 1 ? tick : tick.toFixed(1)}
              </text>
            </g>
          ))}
          <text className="axisLabel" x={margin.left} y={10}>
            ms (log scale)
          </text>
          {(mounted ? xTicks : []).map((tick) => (
            <text className="axisLabel" key={tick} textAnchor="middle" x={x(tick)} y={height - 10}>
              {formatTime(tick, withDate)}
            </text>
          ))}

          {visible.map(({ target, values }) => (
            <g key={keyOf(target)}>
              <path d={pathOf(values)} fill="none" stroke={providerColors[target.provider]} strokeDasharray={dashOf(target)} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              {/* A lone bucket has no line to show, so it gets a marker. */}
              {values.map((item, index) =>
                (index === 0 || item.time - values[index - 1].time > bucketMs * 1.5) &&
                (index === values.length - 1 || values[index + 1].time - item.time > bucketMs * 1.5) ? (
                  <circle className="pointRing" cx={x(item.time)} cy={y(item.value)} fill={providerColors[target.provider]} key={item.time} r="4" />
                ) : null,
              )}
            </g>
          ))}

          {hoverTime !== null ? (
            <g pointerEvents="none">
              <line className="crosshair" x1={x(hoverTime)} x2={x(hoverTime)} y1={margin.top} y2={margin.top + plotHeight} />
              {hoverRows.map((row) => (
                <circle className="pointRing" cx={x(row.time)} cy={y(row.value)} fill={providerColors[row.target.provider]} key={keyOf(row.target)} r="4" />
              ))}
            </g>
          ) : null}

          <rect
            fill="transparent"
            height={plotHeight}
            onPointerLeave={() => setHoverTime(null)}
            onPointerMove={onPointerMove}
            width={plotWidth}
            x={margin.left}
            y={margin.top}
          />
        </svg>

        {allValues.length === 0 ? <p className="chartEmpty">No samples for this operation in the window yet.</p> : null}

        {hoverTime !== null && hoverRows.length > 0 ? (
          <div className="chartTooltip" style={tooltipOnLeft ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}>
            <strong>
              {new Date(hoverTime - bucketMs / 2).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {bucketMinutes >= 60 ? `${bucketMinutes / 60}h` : `${bucketMinutes}m`} bucket
            </strong>
            {hoverRows.map((row) => (
              <div className="tooltipRow" key={keyOf(row.target)}>
                <svg aria-hidden height="10" width="18">
                  <line stroke={providerColors[row.target.provider]} strokeDasharray={dashOf(row.target)} strokeWidth="2" x1="1" x2="17" y1="5" y2="5" />
                </svg>
                <span>{labelOf(row.target)}</span>
                <span className="tooltipValue">
                  {formatMs(row.value)} <em>n={row.count}</em>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
