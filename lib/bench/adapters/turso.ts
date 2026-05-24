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
        ordinal INTEGER NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  },

  async createItems(count) {
    const items = makeItems(count);

    await getClient().batch(
      items.map((item) => ({
        sql: `INSERT INTO ${tableName} (id, ordinal, value, created_at) VALUES (:id, :ordinal, :value, :createdAt)`,
        args: {
          id: item.id,
          ordinal: item.ordinal,
          value: item.value,
          createdAt: item.createdAt,
        },
      })),
      "immediate",
    );

    return {
      count: items.length,
      firstId: items[0]?.id,
      lastId: items.at(-1)?.id,
    };
  },

  async select10() {
    const result = await getClient().execute(`SELECT * FROM ${tableName} LIMIT 10`);
    return result.rows.map((row: Record<string, unknown>) => rowToItem(row));
  },

  async selectTopN(n) {
    const result = await getClient().execute(`SELECT * FROM ${tableName} ORDER BY ordinal DESC LIMIT ?`, [n]);

    return result.rows.map((row: Record<string, unknown>) => rowToItem(row));
  },

  async getById(id) {
    const result = await getClient().execute(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);

    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  },

  async updateTopN(n) {
    const rows = await this.selectTopN(n);

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
      ids: rows.map((row) => row.id),
    };
  },

  async updateById(id) {
    await getClient().execute(`UPDATE ${tableName} SET value = ? WHERE id = ?`, [makeUpdateValue(0), id]);

    return {
      count: 1,
      ids: [id],
    };
  },
};
