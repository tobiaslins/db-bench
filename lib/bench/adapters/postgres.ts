import { Pool } from "pg";
import { makeItems, makeUpdateValue } from "../items";
import type { BenchAdapter, BenchItem } from "../types";

const tableName = "bench_items";

let pool: Pool | undefined;

function getDatabaseUrl() {
  return process.env.POSTGRES_URL || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL;
}

function sanitizeDatabaseUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);

  if (url.searchParams.get("sslrootcert") === "system") {
    url.searchParams.delete("sslrootcert");
  }

  return url.toString();
}

function shouldUseSsl(databaseUrl: string) {
  if (process.env.POSTGRES_SSL === "true") return true;
  if (process.env.POSTGRES_SSL === "false") return false;

  return !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1");
}

function getPool() {
  if (!pool) {
    const connectionString = getDatabaseUrl();

    if (!connectionString) {
      throw new Error("Missing POSTGRES_URL or DATABASE_URL");
    }

    pool = new Pool({
      connectionString: sanitizeDatabaseUrl(connectionString),
      max: Number(process.env.POSTGRES_POOL_MAX ?? 5),
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
    });
  }

  return pool;
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

function makePlaceholders(itemCount: number, fieldsPerItem: number) {
  return Array.from({ length: itemCount }, (_, itemIndex) => {
    const start = itemIndex * fieldsPerItem;
    return `(${Array.from({ length: fieldsPerItem }, (_field, fieldIndex) => `$${start + fieldIndex + 1}`).join(", ")})`;
  }).join(", ");
}

export const postgresAdapter: BenchAdapter = {
  name: "postgres",

  async setup() {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        value TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )
    `);
    await getPool().query(`CREATE INDEX IF NOT EXISTS bench_items_run_ordinal_idx ON ${tableName} (run_id, ordinal DESC)`);
  },

  async createItems(count, options) {
    const items = makeItems(count, options?.runId ?? "unknown-run");
    const values = items.flatMap((item) => [item.id, item.runId, item.ordinal, item.value, item.createdAt]);

    await getPool().query(
      `INSERT INTO ${tableName} (id, run_id, ordinal, value, created_at) VALUES ${makePlaceholders(items.length, 5)}`,
      values,
    );

    return {
      count: items.length,
      runId: options?.runId ?? "unknown-run",
      firstId: items[0]?.id,
      lastId: items.at(-1)?.id,
    };
  },

  async select10(options) {
    const result = await getPool().query(`SELECT * FROM ${tableName} WHERE run_id = $1 LIMIT 10`, [options?.runId ?? "unknown-run"]);
    return result.rows.map(rowToItem);
  },

  async selectTopN(n, options) {
    const result = await getPool().query(`SELECT * FROM ${tableName} WHERE run_id = $1 ORDER BY ordinal DESC LIMIT $2`, [
      options?.runId ?? "unknown-run",
      n,
    ]);

    return result.rows.map(rowToItem);
  },

  async getById(id) {
    const result = await getPool().query(`SELECT * FROM ${tableName} WHERE id = $1 LIMIT 1`, [id]);

    const row = result.rows[0];
    return row ? rowToItem(row) : null;
  },

  async updateTopN(n, options) {
    const runId = options?.runId ?? "unknown-run";
    const rows = await this.selectTopN(n, options);

    if (rows.length > 0) {
      const values = rows.flatMap((row, index) => [row.id, makeUpdateValue(index)]);
      await getPool().query(
        `UPDATE ${tableName} AS item
         SET value = updates.value
         FROM (VALUES ${makePlaceholders(rows.length, 2)}) AS updates(id, value)
         WHERE item.id = updates.id`,
        values,
      );
    }

    return {
      count: rows.length,
      runId,
      ids: rows.map((row) => row.id),
    };
  },

  async updateById(id, options) {
    await getPool().query(`UPDATE ${tableName} SET value = $1 WHERE id = $2`, [makeUpdateValue(0), id]);

    return {
      count: 1,
      runId: options?.runId ?? "unknown-run",
      ids: [id],
    };
  },
};
