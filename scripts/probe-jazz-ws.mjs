import { existsSync, readFileSync } from "node:fs";
import { userIdentity } from "jazz-tools";
import {
  decodeWebSocketFrameBatch,
  decodeWireError,
  encodeWebSocketFrameBatch,
  encodeWebSocketPrelude,
  encodeWireClientHello,
  isWireError,
  isWireHello,
  isWireMessage,
  peerIdentityForWebSocketAuth,
  webSocketUrl,
} from "../node_modules/jazz-tools/dist/runtime/native-runtime/websocket.js";
import { PostcardReader } from "../node_modules/jazz-tools/dist/runtime/native-runtime/native-codec.js";

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

async function bytesFrom(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error(`unexpected websocket data: ${typeof data}`);
}

function frameTag(frame) {
  try {
    return new PostcardReader(frame).u64();
  } catch {
    return "undecodable";
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local", { override: true });

const auth = {
  jwt_token: null,
  admin_secret: process.env.JAZZ_ADMIN_SECRET,
  backend_secret: process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET,
};
const appId = process.env.JAZZ_APP_ID ?? "db-bench";
const endpoint = webSocketUrl(process.env.JAZZ_SERVER_URL ?? "http://localhost:1625/", appId);
const fallbackIdentity = new TextEncoder().encode(userIdentity("https://jazz.invalid", "backend-open"));
const peerIdentity = peerIdentityForWebSocketAuth(JSON.stringify(auth), fallbackIdentity);

console.log({ endpoint, peerIdentity: new TextDecoder().decode(peerIdentity) });

const socket = new WebSocket(endpoint);
socket.binaryType = "arraybuffer";

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.send(encodeWebSocketPrelude(JSON.stringify(auth), peerIdentity));
socket.send(encodeWebSocketFrameBatch([encodeWireClientHello()]));

const event = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("no websocket message within 5s")), 5_000);
  socket.addEventListener(
    "message",
    (message) => {
      clearTimeout(timer);
      resolve(message);
    },
    { once: true },
  );
  socket.addEventListener("close", (close) => {
    clearTimeout(timer);
    reject(new Error(`closed before first message code=${close.code} reason=${close.reason || "none"}`));
  });
  socket.addEventListener("error", (error) => {
    clearTimeout(timer);
    reject(error);
  });
});

const frames = decodeWebSocketFrameBatch(await bytesFrom(event.data));
console.log({ frameCount: frames.length });

for (const frame of frames) {
  console.log({
    tag: frameTag(frame),
    isHello: isWireHello(frame),
    isError: isWireError(frame),
    isMessage: isWireMessage(frame),
    error: isWireError(frame) ? decodeWireError(frame) : undefined,
    bytes: frame.byteLength,
  });
}

socket.close();
