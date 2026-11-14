import jazzPackage from "jazz-tools/package.json" with { type: "json" };
import { JAZZ_VERCEL_REGION } from "../../jazz-vercel.server";

export function getBenchEnvInfo(provider?: string) {
  return {
    provider,
    runtime: process.env.VERCEL ? "vercel" : "local",
    region: process.env.VERCEL_REGION ?? null,
    jazz:
      provider === "jazz-vercel"
        ? {
            driver: "vercel",
            sandboxRegion: JAZZ_VERCEL_REGION,
            packageVersion: jazzPackage.version,
          }
        : {
            appId: process.env.JAZZ_APP_ID ?? "db-bench",
            serverUrl: process.env.JAZZ_SERVER_URL ?? null,
            driver: "remote",
            clientEndpoint: "/jazz",
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
