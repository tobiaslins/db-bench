import { randomUUID } from "node:crypto";
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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function withTimeout(promise, ms, label) {
  let timer;

  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]);
}

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

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

const ownerSession = {
  issuer: "db-bench-repro",
  user_id: "owner-0",
  claims: {},
  authMode: "external",
};
const ownerId = userIdentity(ownerSession.issuer, ownerSession.user_id);
const backendSecret = process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET;
const serverUrl = process.env.JAZZ_SERVER_URL;

if (!backendSecret) throw new Error("Missing JAZZ_BACKEND_SECRET or BACKEND_SECRET");
if (!serverUrl) throw new Error("Missing JAZZ_SERVER_URL");

console.log({ packageVersion: JSON.parse(readFileSync("node_modules/jazz-tools/package.json", "utf8")).version, serverUrl });

const context = createJazzContext({
  appId: process.env.JAZZ_APP_ID ?? "db-bench",
  app,
  permissions,
  driver: { type: "memory" },
  serverUrl,
  backendSecret,
  adminSecret: process.env.JAZZ_ADMIN_SECRET,
});

const db = context.forSession(ownerSession);
const id = randomUUID();
const started = Date.now();

try {
  console.log("insert local wait...");
  const localWrite = db.insert(
    app.demoRows,
    {
      ownerId,
      ownerIssuer: ownerSession.issuer,
      ownerSubject: ownerSession.user_id,
      ownerIndex: 0,
      ordinal: started % 1_000_000,
      payload: `repro-${started}`,
      createdAt: Math.floor(started / 1000),
    },
    { id },
  );
  await withTimeout(localWrite.wait({ tier: "local" }), 5_000, "local write");
  console.log("local write ok");

  for (const tier of ["local", "edge", "global"]) {
    const readStart = performance.now();
    try {
      const rows = await withTimeout(
        db.all(app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").limit(1), {
          tier,
        }),
        5_000,
        `${tier} read`,
      );
      console.log(`${tier} read ok`, { ms: Number((performance.now() - readStart).toFixed(3)), rows: rows.length });
    } catch (error) {
      console.log(`${tier} read failed`, { ms: Number((performance.now() - readStart).toFixed(3)), error: error.message });
    }
  }

  console.log("insert edge wait...");
  const edgeWrite = db.insert(
    app.demoRows,
    {
      ownerId,
      ownerIssuer: ownerSession.issuer,
      ownerSubject: ownerSession.user_id,
      ownerIndex: 0,
      ordinal: (started % 1_000_000) + 1,
      payload: `repro-edge-${started}`,
      createdAt: Math.floor(started / 1000) + 1,
    },
    { id: randomUUID() },
  );
  await withTimeout(edgeWrite.wait({ tier: "edge" }), 5_000, "edge write");
  console.log("edge write ok");

  for (const tier of ["local", "edge", "global"]) {
    const readStart = performance.now();
    try {
      const rows = await withTimeout(
        db.all(app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").limit(2), {
          tier,
        }),
        5_000,
        `${tier} read after edge write`,
      );
      console.log(`${tier} read after edge write ok`, {
        ms: Number((performance.now() - readStart).toFixed(3)),
        rows: rows.length,
        firstPayload: rows[0]?.payload,
      });
    } catch (error) {
      console.log(`${tier} read after edge write failed`, {
        ms: Number((performance.now() - readStart).toFixed(3)),
        error: error.message,
      });
    }
  }
} finally {
  await context.shutdown();
}
