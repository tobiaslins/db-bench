# DB Bench

Minimal Next.js API benchmark for Turso and Jazz.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Turso needs `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
Postgres needs `POSTGRES_URL` or `DATABASE_URL`. Set `POSTGRES_SSL=false` for local databases if needed.
Jazz uses `jazz-tools@alpha`. Set `JAZZ_SERVER_URL`, `JAZZ_APP_ID`, and `JAZZ_ADMIN_SECRET` to benchmark against Jazz Cloud. Use `JAZZ_DURABILITY_TIER=global` for cloud-confirmed writes and remote reads.

Validate the Jazz schema and permissions after changing them:

```bash
pnpm exec jazz-tools validate
```

The Next.js backend publishes the schema, permissions, and migrations when `createJazz` starts. Browser clients connect through `/jazz`; no separate Jazz development server is needed.

## API

`POST /api/bench/:provider`

Providers:

- `turso`
- `jazz`
- `postgres`

Operations:

- `createOne`: inserts 1 item
- `create`: inserts `count` items, capped at `1000`
- `select10`: returns 10 rows/items
- `selectTopN`: returns the highest `n` rows/items by `ordinal`
- `getById`: returns one row/item by `id`
- `updateTopN`: updates the highest `n` rows/items by `ordinal`
- `updateById`: updates one row/item by `id`
- `suite`: runs createOne, create1k, select10, selectTopN, getById, updateById, and updateTopN

Pass `runId` to isolate reads and updates to one benchmark run. If omitted, the API generates one for the request and returns it from create/suite results.
For Jazz benchmark runs, `jazzDurabilityTier: "global"` waits for Jazz Cloud writes and uses remote reads. `"local"` waits only for local writes and uses local-first reads.

Examples:

```bash
curl -X POST http://localhost:3000/api/bench/turso \
  -H "content-type: application/json" \
  -d '{"operation":"suite","count":1000,"n":25}'

curl -X POST http://localhost:3000/api/bench/jazz \
  -H "content-type: application/json" \
  -d '{"operation":"create","count":100}'
```

Each response includes server-side elapsed milliseconds for the requested operation.
