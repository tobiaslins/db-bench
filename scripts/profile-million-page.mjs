import { existsSync, readFileSync } from "node:fs";
import { userIdentity } from "jazz-tools";
import { createJazz, remote } from "jazz-tools/backend";
import { app } from "../jazz.generated.ts";
import permissions from "../jazz.permissions.json" with { type: "json" };

function loadEnvFile(path, { override = false } = {}) {
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator);
    let value = trimmed.slice(separator + 1);

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

const ownerIndex = Number(process.argv[2] ?? 1);
const requestedTier = process.argv[3] ?? "local-first";
const tier = { local: "local-first", global: "remote" }[requestedTier] ?? requestedTier;
const ownerSubject = `owner-${String(ownerIndex).padStart(4, "0")}`;
const ownerId = userIdentity("db-bench-million-rows", ownerSubject);
const serverUrl = process.env.JAZZ_SERVER_URL;
const adminSecret = process.env.JAZZ_ADMIN_SECRET;
if (!serverUrl) throw new Error("Missing JAZZ_SERVER_URL");
if (!adminSecret) throw new Error("Missing JAZZ_ADMIN_SECRET");

const jazz = createJazz({
  app,
  permissions,
  store: remote({
    appId: process.env.JAZZ_APP_ID ?? "db-bench",
    url: serverUrl,
    secret: adminSecret,
  }),
  authenticate: () => ({
    userId: ownerSubject,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  }),
});

const options = { tier };
const variants = [
  ["where-limit50", app.demoRows.where({ ownerId }).limit(50)],
  ["where-order-desc-limit50", app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").limit(50)],
  ["where-order-asc-limit50", app.demoRows.where({ ownerId }).orderBy("createdAt", "asc").limit(50)],
  ["where-order-desc-offset1000", app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").offset(1000).limit(50)],
  ["where-order-desc-offset4900", app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").offset(4900).limit(50)],
  ["where-select-order-desc-limit50", app.demoRows.where({ ownerId }).select("id", "createdAt", "ordinal").orderBy("createdAt", "desc").limit(50)],
];

try {
  await jazz.createAccountFor(ownerSubject);
  const db = await jazz.forReqUser(new Request(serverUrl));

  console.log({ ownerIndex, tier, serverUrl: process.env.JAZZ_SERVER_URL });
  for (const [name, query] of variants) {
    const started = performance.now();
    const rows = await db.all(query, options);
    console.log({ name, ms: Number((performance.now() - started).toFixed(3)), rows: rows.length });
  }
} finally {
  await jazz.close();
}
