import { createHash } from "crypto";
import { userIdentity, type DurabilityTier } from "jazz-tools";

export const DEMO_OWNER_COUNT = 1_000;
export const DEMO_ROWS_PER_OWNER = 10_000;
export const DEMO_TOTAL_ROWS = DEMO_OWNER_COUNT * DEMO_ROWS_PER_OWNER;
export const DEMO_OWNER_ISSUER = "db-bench-million-rows";
export const DEMO_CREATED_AT_BASE = 1_800_000_000;
export const DEMO_REQUEST_TIMEOUT_MS = 20_000;
export const DEMO_SEED_BATCH_SIZE = 1_000;

export type DemoRow = {
  id: string;
  ownerId: string;
  ownerIndex: number;
  ordinal: number;
  payload: string;
  createdAt: number;
};

export type DemoSession = {
  issuer: string;
  user_id: string;
  claims: Record<string, unknown>;
  authMode: "external";
};

export function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) return fallback;

  return Math.min(Math.max(parsed, min), max);
}

export function normalizeTier(value: unknown): DurabilityTier {
  return value === "local" || value === "edge" || value === "global" ? value : "edge";
}

export function timeoutMs(value: unknown) {
  if (value === null || value === undefined || value === "") return DEMO_REQUEST_TIMEOUT_MS;

  return clampInt(value, DEMO_REQUEST_TIMEOUT_MS, 1_000, 120_000);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function demoOwnerSubject(ownerIndex: number) {
  return `owner-${String(ownerIndex).padStart(4, "0")}`;
}

export function demoOwnerId(ownerIndex: number) {
  return userIdentity(DEMO_OWNER_ISSUER, demoOwnerSubject(ownerIndex));
}

export function demoOwnerSession(ownerIndex: number): DemoSession {
  return {
    issuer: DEMO_OWNER_ISSUER,
    user_id: demoOwnerSubject(ownerIndex),
    claims: { demoOwnerIndex: ownerIndex },
    authMode: "external",
  };
}

export function demoRowId(ownerIndex: number, ordinal: number) {
  const hex = createHash("sha256").update(`${DEMO_OWNER_ISSUER}:${ownerIndex}:${ordinal}`).digest("hex");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

export function demoRow(ownerIndex: number, ordinal: number): DemoRow {
  return {
    id: demoRowId(ownerIndex, ordinal),
    ownerId: demoOwnerId(ownerIndex),
    ownerIndex,
    ordinal,
    payload: `${demoOwnerSubject(ownerIndex)}-row-${String(ordinal).padStart(5, "0")}`,
    createdAt: DEMO_CREATED_AT_BASE + ordinal,
  };
}
