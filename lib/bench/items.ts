import { randomUUID } from "crypto";
import type { BenchItem } from "./types";

export function makeRunId(): string {
  return `run-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function makeItems(count: number, runId: string): BenchItem[] {
  const now = Math.floor(Date.now() / 1000);
  const ordinalBase = (now % 1_000_000) * 1000;

  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    runId,
    ordinal: ordinalBase + index,
    value: `item-${now}-${index}`,
    createdAt: now,
  }));
}

export function clampInteger(value: unknown, fallback: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

export function makeUpdateValue(index: number): string {
  return `updated-${Date.now()}-${index}`;
}
