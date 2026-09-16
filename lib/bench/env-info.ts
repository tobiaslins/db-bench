import jazzPackage from "jazz-tools/package.json" with { type: "json" };

export function getBenchEnvInfo(provider?: string) {
  return {
    provider,
    runtime: process.env.VERCEL ? "vercel" : "local",
    jazz: {
      appId: process.env.JAZZ_APP_ID ?? "db-bench",
      serverUrl: process.env.JAZZ_SERVER_URL ?? null,
      driver: process.env.VERCEL ? "memory" : (process.env.JAZZ_DRIVER ?? "persistent"),
      packageVersion: jazzPackage.version,
    },
    postgres: {
      urlSet: Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_DATABASE_URL || process.env.DATABASE_URL),
    },
    turso: {
      urlSet: Boolean(process.env.TURSO_DATABASE_URL),
    },
  };
}
