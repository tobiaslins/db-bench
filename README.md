# DB Bench

Minimal Next.js API benchmark for Turso and Jazz.

## Setup

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Turso needs `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
Jazz uses `jazz-tools@alpha`. Set `JAZZ_SERVER_URL`, `JAZZ_APP_ID`, `JAZZ_ADMIN_SECRET`, and `BACKEND_SECRET` to benchmark against Jazz Cloud. Use `JAZZ_DURABILITY_TIER=global` for cloud-confirmed writes and reads.
On Vercel, the Jazz adapter defaults to `JAZZ_DRIVER=memory` to avoid writing a `.jazz` directory in serverless functions.

Deploy the Jazz schema and permissions after changing them:

```bash
set -a; source .env; set +a
pnpm exec jazz-tools deploy
```

## API

`POST /api/bench/:provider`

Providers:

- `turso`
- `jazz`

Operations:

- `create`: inserts `count` items, capped at `1000`
- `select10`: returns 10 rows/items
- `selectTopN`: returns the highest `n` rows/items by `ordinal`
- `getById`: returns one row/item by `id`
- `updateTopN`: updates the highest `n` rows/items by `ordinal`
- `updateById`: updates one row/item by `id`
- `suite`: runs create, select10, selectTopN, and getById

Pass `runId` to isolate reads and updates to one benchmark run. If omitted, the API generates one for the request and returns it from create/suite results.

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
