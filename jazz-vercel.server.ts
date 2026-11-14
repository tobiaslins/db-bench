import "server-only";

import { createJazz, vercel } from "jazz-tools/backend";
import permissions from "./permissions";
import { app } from "./schema";

export const JAZZ_VERCEL_REGION = "fra1";

// Same app as jazz.server.ts, but its core runs in a Vercel Sandbox in this project instead of a remote server.
// Only backend code uses it (no `authenticate`, no mounted route), so the benchmark compares the stores alone.
export const jazzVercel = createJazz({
  app,
  permissions,
  basePath: "/jazz-vercel",
  store: vercel({
    namespace: ({ environment }) => environment,
    region: JAZZ_VERCEL_REGION,
  }),
});
