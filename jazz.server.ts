import "server-only";

import { acceptLocalFirstAuth, createJazz, remote } from "jazz-tools/backend";
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

    return demoUser ? { userId: demoUser, claims: { benchmarkDemo: true } } : acceptLocalFirstAuth(request);
  },
});
