import { mkdirSync } from "fs";
import { join } from "path";
import { createJazzContext } from "../../../node_modules/jazz-tools/dist/backend/create-jazz-context.js";
import { makeItems, makeUpdateValue } from "../items";
import type { BenchAdapter, BenchItem, BenchOptions, JazzDurabilityTier } from "../types";
import { jazzApp, jazzPermissions } from "./jazz-app";

type JazzRow = typeof jazzApp.benchItems._rowType;
type JazzDriver = { type: "memory" } | { type: "persistent"; dataPath: string };

let context: ReturnType<typeof createJazzContext> | undefined;

export function getJazzBackendSecret() {
  return process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET;
}

export function getJazzDurabilityTier(options?: BenchOptions): JazzDurabilityTier {
  if (options?.jazzDurabilityTier) {
    return options.jazzDurabilityTier;
  }

  const configured = process.env.JAZZ_DURABILITY_TIER;

  if (configured === "edge" || configured === "global" || configured === "local") {
    return configured;
  }

  return process.env.JAZZ_SERVER_URL ? "global" : "local";
}

export function getJazzReadOptions(options?: BenchOptions) {
  return {
    tier: getJazzDurabilityTier(options),
  } as const;
}

function getDriver(): JazzDriver {
  const configured = process.env.JAZZ_DRIVER;

  if (configured === "memory") {
    return { type: "memory" };
  }

  if (configured === "persistent") {
    const dataDir = process.env.JAZZ_DATA_DIR ?? join(process.cwd(), ".jazz");
    mkdirSync(dataDir, { recursive: true });
    return {
      type: "persistent",
      dataPath: process.env.JAZZ_DATA_PATH ?? join(dataDir, "bench.db"),
    };
  }

  if (process.env.VERCEL && process.env.JAZZ_SERVER_URL) {
    return { type: "memory" };
  }

  const dataDir = process.env.JAZZ_DATA_DIR ?? join(process.cwd(), ".jazz");
  mkdirSync(dataDir, { recursive: true });
  return {
    type: "persistent",
    dataPath: process.env.JAZZ_DATA_PATH ?? join(dataDir, "bench.db"),
  };
}

export function getJazzContext() {
  if (!context) {
    context = createJazzContext({
      appId: process.env.JAZZ_APP_ID ?? "db-bench",
      app: jazzApp,
      permissions: jazzPermissions,
      driver: getDriver(),
      serverUrl: process.env.JAZZ_SERVER_URL,
      backendSecret: getJazzBackendSecret(),
      adminSecret: process.env.JAZZ_ADMIN_SECRET,
    });
  }

  return context;
}

function getDb() {
  return process.env.JAZZ_SERVER_URL || getJazzBackendSecret() ? getJazzContext().asBackend() : getJazzContext().db();
}

function toItem(row: JazzRow): BenchItem {
  return row;
}

export const jazzAdapter: BenchAdapter = {
  name: "jazz",

  async setup() {
    getDb();
  },

  async createItems(count, options) {
    const runId = options?.runId ?? "unknown-run";
    const items = makeItems(count, runId);
    const db = getDb();

    const commit = await db.transaction((tx: any) => {
      for (const item of items) {
        tx.insert(
          jazzApp.benchItems,
          {
            runId: item.runId,
            ordinal: item.ordinal,
            value: item.value,
            createdAt: item.createdAt,
          },
          { id: item.id },
        );
      }
    });

    await commit.wait({ tier: getJazzDurabilityTier(options) });
    getJazzContext().flush();

    return {
      count: items.length,
      runId,
      firstId: items[0]?.id,
      lastId: items.at(-1)?.id,
    };
  },

  async select10(options) {
    const rows = await getDb().all(jazzApp.benchItems.where({ runId: options?.runId ?? "unknown-run" }).limit(10), {
      ...getJazzReadOptions(options),
    });

    return rows.map(toItem);
  },

  async selectTopN(n, options) {
    const rows = await getDb().all(
      jazzApp.benchItems.where({ runId: options?.runId ?? "unknown-run" }).orderBy("ordinal", "desc").limit(n),
      getJazzReadOptions(options),
    );

    return rows.map(toItem);
  },

  async getById(id, options) {
    const item = await getDb().one(jazzApp.benchItems.where({ id }), {
      ...getJazzReadOptions(options),
    });

    return item ? toItem(item) : null;
  },

  async updateTopN(n, options) {
    const runId = options?.runId ?? "unknown-run";
    const rows = await this.selectTopN(n, options);
    const db = getDb();

    const commit = await db.transaction((tx: any) => {
      rows.forEach((row, index) => {
        tx.update(jazzApp.benchItems, row.id, {
          value: makeUpdateValue(index),
        });
      });
    });

    await commit.wait({ tier: getJazzDurabilityTier(options) });
    getJazzContext().flush();

    return {
      count: rows.length,
      runId,
      ids: rows.map((row) => row.id),
    };
  },

  async updateById(id, options) {
    const db = getDb();

    await db.update(jazzApp.benchItems, id, {
      value: makeUpdateValue(0),
    }).wait({ tier: getJazzDurabilityTier(options) });
    getJazzContext().flush();

    return {
      count: 1,
      runId: options?.runId ?? "unknown-run",
      ids: [id],
    };
  },
};
