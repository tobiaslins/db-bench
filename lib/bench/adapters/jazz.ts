import { jazz } from "../../../jazz.server";
import { makeItems, makeUpdateValue } from "../items";
import type { BenchAdapter, BenchItem, BenchOptions, JazzDurabilityTier } from "../types";
import { jazzApp } from "./jazz-app";

type JazzRow = typeof jazzApp.benchItems._rowType;

export function getJazzDurabilityTier(options?: BenchOptions): JazzDurabilityTier {
  if (options?.jazzDurabilityTier) {
    return options.jazzDurabilityTier;
  }

  const configured = process.env.JAZZ_DURABILITY_TIER;

  if (configured === "global" || configured === "local") {
    return configured;
  }

  if (configured === "edge") return "global";

  return process.env.JAZZ_SERVER_URL ? "global" : "local";
}

export function getJazzReadOptions(options?: BenchOptions) {
  return {
    tier: getJazzDurabilityTier(options) === "global" ? "remote" : "local-first",
  } as const;
}

function toItem(row: JazzRow): BenchItem {
  return row;
}

export const jazzAdapter: BenchAdapter = {
  name: "jazz",

  async setup() {
    await jazz.ready();
  },

  async createItems(count, options) {
    const runId = options?.runId ?? "unknown-run";
    const items = makeItems(count, runId);
    const db = jazz.db;

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

    return {
      count: items.length,
      runId,
      firstId: items[0]?.id,
      lastId: items.at(-1)?.id,
    };
  },

  async select10(options) {
    const rows = await jazz.db.all(jazzApp.benchItems.where({ runId: options?.runId ?? "unknown-run" }).orderBy("ordinal", "asc").limit(10), {
      ...getJazzReadOptions(options),
    });

    return rows.map(toItem);
  },

  async selectTopN(n, options) {
    const rows = await jazz.db.all(
      jazzApp.benchItems.where({ runId: options?.runId ?? "unknown-run" }).orderBy("ordinal", "desc").limit(n),
      getJazzReadOptions(options),
    );

    return rows.map(toItem);
  },

  async getById(id, options) {
    const item = await jazz.db.one(jazzApp.benchItems.where({ id }), {
      ...getJazzReadOptions(options),
    });

    return item ? toItem(item) : null;
  },

  async updateTopN(n, options) {
    const runId = options?.runId ?? "unknown-run";
    const rows = await this.selectTopN(n, options);
    const db = jazz.db;

    const commit = await db.transaction((tx: any) => {
      rows.forEach((row, index) => {
        tx.update(jazzApp.benchItems, row.id, {
          value: makeUpdateValue(index),
        });
      });
    });

    await commit.wait({ tier: getJazzDurabilityTier(options) });

    return {
      count: rows.length,
      runId,
      ids: rows.map((row) => row.id),
    };
  },

  async updateById(id, options) {
    const db = jazz.db;

    await db.update(jazzApp.benchItems, id, {
      value: makeUpdateValue(0),
    }).wait({ tier: getJazzDurabilityTier(options) });

    return {
      count: 1,
      runId: options?.runId ?? "unknown-run",
      ids: [id],
    };
  },
};
