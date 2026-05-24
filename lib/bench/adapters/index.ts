import { jazzAdapter } from "./jazz";
import { postgresAdapter } from "./postgres";
import { tursoAdapter } from "./turso";
import type { BenchAdapter, BenchProvider } from "../types";

const adapters: Record<BenchProvider, BenchAdapter> = {
  jazz: jazzAdapter,
  postgres: postgresAdapter,
  turso: tursoAdapter,
};

export function getAdapter(provider: string): BenchAdapter {
  const adapter = adapters[provider as BenchProvider];

  if (!adapter) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  return adapter;
}
