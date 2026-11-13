import "server-only";

import { acceptDeviceAccounts, createJazz, remote } from "jazz-tools/backend";
import { DEMO_USER_HEADER } from "./lib/million-rows-demo";
import permissions from "./permissions";
import { app } from "./schema";

function requiredEnv(name: "JAZZ_APP_ID" | "JAZZ_SERVER_URL" | "JAZZ_ADMIN_SECRET") {
  const value = process.env[name];

  if (!value) throw new Error(`${name} is required`);

  return value;
}

export const jazz = createJazz({
  app,
  permissions,
  store: remote({
    appId: requiredEnv("JAZZ_APP_ID"),
    url: requiredEnv("JAZZ_SERVER_URL"),
    secret: requiredEnv("JAZZ_ADMIN_SECRET"),
  }),
  authenticate(request) {
    const demoUser = request.headers.get(DEMO_USER_HEADER);

    if (!demoUser) return acceptDeviceAccounts(request);

    // Demo users come from a header, not a session, so there's nothing that expires; re-auth hourly.
    return {
      userId: demoUser,
      claims: { benchmarkDemo: true },
      expiresAt: Math.floor(Date.now() / 1000) + 60 * 60,
    };
  },
});
