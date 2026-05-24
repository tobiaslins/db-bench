import { connect } from "@tursodatabase/serverless";
import { makeItems, makeUpdateValue } from "../items";
import type { BenchAdapter, BenchItem } from "../types";

const tableName = "bench_items";

let client: ReturnType<typeof connect> | undefined;

function getClient() {
  if (!client) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error("Missing TURSO_DATABASE_URL");
    }

    client = connect({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }

  return client;
}

function rowToItem(row: Record<string, unknown>): BenchItem {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    ordinal: Number(row.ordinal),
    value: String(row.value),
    createdAt: Number(row.created_at),
  };
}

export const tursoAdapter: BenchAdapter = {
  name: "turso",

  async setup() {
    await getClient().execute(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    await getClient().execute(`ALTER TABLE ${tableName} ADD COLUMN run_id TEXT NOT NULL DEFAULT 'legacy'`).catch(() => undefined);
    await getClient().execute(`CREATE INDEX IF NOT EXISTS bench_items_run_ordinal_idx ON ${tableName} (run_id, ordinal DESC)`);
  },

  async createItems(count, options) {
    const items = makeItems(count, options?.runId ?? "unknown-run");

    await getClient().batch(
      items.map((item) => ({
        sql: `INSERT INTO ${tableName} (id, run_id, ordinal, value, created_at) VALUES (:id, :runId, :ordinal, :value, :createdAt)`,
        args: {
          id: item.id,
          runId: item.runId,
          ordinal: item.ordinal,
          value: item.value,
          createdAt: item.createdAt,
        },
      })),
      "immediate",
    );

    return {
      count: items.length,
      runId: options?.runId ?? "unknown-run",
      firstId: items[0]?.id,
      lastId: items.at(-1)?.id,
    };
  },

  async select10(options) {
    const result = await getClient().execute(`SELECT * FROM ${tableName} WHERE run_id = ? LIMIT 10`, [options?.runId ?? "unknown-run"]);
    return result.rows.map((row: Record<string, unknown>) => rowToItem(row));
  },

  async selectTopN(n, options) {
    const result = await getClient().execute(`SELECT * FROM ${tableName} WHERE run_id = ? ORDER BY ordinal DESC LIMIT ?`, [
      options?.runId ?? "unknown-run",
      n,
    ]);

    return result.rows.map((row: Record<string, unknown>) => rowToItem(row));
  },

  async getById(id) {
    const result = await getClient().execute(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);

    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  },

  async updateTopN(n, options) {
    const runId = options?.runId ?? "unknown-run";
    const rows = await this.selectTopN(n, options);

    await getClient().batch(
      rows.map((row, index) => ({
        sql: `UPDATE ${tableName} SET value = :value WHERE id = :id`,
        args: {
          id: row.id,
          value: makeUpdateValue(index),
        },
      })),
      "immediate",
    );

    return {
      count: rows.length,
      runId,
      ids: rows.map((row) => row.id),
    };
  },

  async updateById(id, options) {
    await getClient().execute(`UPDATE ${tableName} SET value = ? WHERE id = ?`, [makeUpdateValue(0), id]);

    return {
      count: 1,
      runId: options?.runId ?? "unknown-run",
      ids: [id],
    };
  },
};
