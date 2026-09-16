import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage:
  corepack pnpm jazz:server
  corepack pnpm jazz:server:persistent

Environment:
  JAZZ_APP_ID
  JAZZ_BACKEND_SECRET or BACKEND_SECRET
  JAZZ_ADMIN_SECRET
  JAZZ_PORT=1625
  JAZZ_SERVER_DATA_DIR=.jazz-server`);
  process.exit(0);
}

const appId = process.env.JAZZ_APP_ID;
const backendSecret = process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET;
const adminSecret = process.env.JAZZ_ADMIN_SECRET;
const port = process.env.JAZZ_PORT || "1625";
const persistent = process.argv.includes("--persistent") || process.env.JAZZ_SERVER_DRIVER === "persistent";

if (!appId) throw new Error("Missing JAZZ_APP_ID");
if (!backendSecret) throw new Error("Missing JAZZ_BACKEND_SECRET or BACKEND_SECRET");
if (!adminSecret) throw new Error("Missing JAZZ_ADMIN_SECRET");

const args = [
  "exec",
  "jazz-tools",
  "server",
  appId,
  "--port",
  port,
  "--backend-secret",
  backendSecret,
  "--admin-secret",
  adminSecret,
];

if (persistent) {
  args.push("--data-dir", process.env.JAZZ_SERVER_DATA_DIR || ".jazz-server");
} else {
  args.push("--in-memory");
}

console.log(`[jazz] starting local server on http://localhost:${port}/`);

const child = spawn("corepack", ["pnpm", ...args], {
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
