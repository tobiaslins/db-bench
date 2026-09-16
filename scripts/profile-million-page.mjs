import { existsSync, readFileSync } from "node:fs";
import { schema as s, userIdentity } from "jazz-tools";
import { createJazzContext } from "../node_modules/jazz-tools/dist/backend/create-jazz-context.js";

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

const appSchema = {
  benchItems: s
    .table({
      runId: s.string(),
      ordinal: s.int(),
      value: s.string(),
      createdAt: s.int(),
    })
    .indexOnly(["runId", "ordinal"]),
  demoRows: s
    .table({
      ownerId: s.string(),
      ownerIssuer: s.string(),
      ownerSubject: s.string(),
      ownerIndex: s.int(),
      ordinal: s.int(),
      payload: s.string(),
      createdAt: s.int(),
    })
    .indexOnly(["ownerId", "createdAt"]),
};
const app = s.defineApp(appSchema);
const permissions = s.definePermissions(app, ({ policy, session }) => [
  policy.benchItems.allowRead.always(),
  policy.benchItems.allowInsert.always(),
  policy.benchItems.allowUpdate.always(),
  policy.benchItems.allowDelete.always(),
  policy.demoRows.allowRead.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowInsert.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowUpdate
    .whereOld({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject })
    .whereNew({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
  policy.demoRows.allowDelete.where({ ownerIssuer: session.user.identity.issuer, ownerSubject: session.user.identity.subject }),
]);

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

const ownerIndex = Number(process.argv[2] ?? 1);
const tier = process.argv[3] ?? "local";
const ownerId = userIdentity("db-bench-million-rows", `owner-${String(ownerIndex).padStart(4, "0")}`);
const context = createJazzContext({
  appId: process.env.JAZZ_APP_ID ?? "db-bench",
  app,
  permissions,
  driver: { type: "memory" },
  serverUrl: process.env.JAZZ_SERVER_URL,
  backendSecret: process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET,
  adminSecret: process.env.JAZZ_ADMIN_SECRET,
});
const db = context.forSession({
  issuer: "db-bench-million-rows",
  user_id: `owner-${String(ownerIndex).padStart(4, "0")}`,
  claims: { demoOwnerIndex: ownerIndex },
  authMode: "external",
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
  console.log({ ownerIndex, tier, serverUrl: process.env.JAZZ_SERVER_URL });
  for (const [name, query] of variants) {
    const started = performance.now();
    const rows = await db.all(query, options);
    console.log({ name, ms: Number((performance.now() - started).toFixed(3)), rows: rows.length });
  }
} finally {
  await context.shutdown();
}
