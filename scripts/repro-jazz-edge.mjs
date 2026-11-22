import { randomUUID } from "node:crypto";
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

const ownerIssuer = "db-bench-repro";
const ownerSubject = "owner-0";
const ownerId = userIdentity(ownerIssuer, ownerSubject);
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

const id = randomUUID();
const started = Date.now();

try {
  await jazz.createAccountFor(ownerSubject);
  const db = await jazz.forReqUser(new Request(serverUrl));

  console.log({ packageVersion: JSON.parse(readFileSync("node_modules/jazz-tools/package.json", "utf8")).version, serverUrl });
  console.log("insert local wait...");
  const localWrite = db.insert(
    app.demoRows,
    {
      ownerId,
      ownerIssuer,
      ownerSubject,
      ownerIndex: 0,
      ordinal: started % 1_000_000,
      payload: `repro-${started}`,
      createdAt: Math.floor(started / 1000),
    },
    { id },
  );
  await withTimeout(localWrite.wait({ tier: "local" }), 5_000, "local write");
  console.log("local write ok");

  for (const tier of ["local-first", "remote"]) {
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

  console.log("insert global wait...");
  const globalWrite = db.insert(
    app.demoRows,
    {
      ownerId,
      ownerIssuer,
      ownerSubject,
      ownerIndex: 0,
      ordinal: (started % 1_000_000) + 1,
      payload: `repro-global-${started}`,
      createdAt: Math.floor(started / 1000) + 1,
    },
    { id: randomUUID() },
  );
  await withTimeout(globalWrite.wait({ tier: "global" }), 5_000, "global write");
  console.log("global write ok");

  for (const tier of ["local-first", "remote"]) {
    const readStart = performance.now();
    try {
      const rows = await withTimeout(
        db.all(app.demoRows.where({ ownerId }).orderBy("createdAt", "desc").limit(2), {
          tier,
        }),
        5_000,
        `${tier} read after global write`,
      );
      console.log(`${tier} read after global write ok`, {
        ms: Number((performance.now() - readStart).toFixed(3)),
        rows: rows.length,
        firstPayload: rows[0]?.payload,
      });
    } catch (error) {
      console.log(`${tier} read after global write failed`, {
        ms: Number((performance.now() - readStart).toFixed(3)),
        error: error.message,
      });
    }
  }
} finally {
  await jazz.close();
}
