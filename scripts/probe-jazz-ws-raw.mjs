import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
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

    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

function clientFrame(opcode, payload) {
  const mask = randomBytes(4);
  const length = payload.byteLength;
  const header = length < 126 ? Buffer.from([0x80 | opcode, 0x80 | length]) : Buffer.from([0x80 | opcode, 0x80 | 126, length >> 8, length & 255]);
  const masked = Buffer.alloc(length);

  for (let index = 0; index < length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function parseServerFrame(buffer) {
  let offset = 0;
  const first = buffer[offset++];
  const second = buffer[offset++];
  let length = second & 0x7f;

  if (length === 126) {
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(buffer.readBigUInt64BE(offset));
    offset += 8;
  }

  const masked = Boolean(second & 0x80);
  let mask;
  if (masked) {
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (mask) {
    for (let index = 0; index < payload.byteLength; index += 1) {
      payload[index] ^= mask[index % 4];
    }
  }

  return { fin: Boolean(first & 0x80), opcode: first & 0x0f, payload };
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

const appId = process.env.JAZZ_APP_ID;
const host = "127.0.0.1";
const port = Number(process.env.JAZZ_PORT || 1625);
const path = `/apps/${encodeURIComponent(appId)}/ws`;
const auth = {
  jwt_token: null,
  admin_secret: process.env.JAZZ_ADMIN_SECRET,
  backend_secret: process.env.JAZZ_BACKEND_SECRET || process.env.BACKEND_SECRET,
};
const peerIdentity = peerIdentityForWebSocketAuth(
  JSON.stringify(auth),
  new TextEncoder().encode(userIdentity("https://jazz.invalid", "backend-open")),
);
const prelude = Buffer.from(encodeWebSocketPrelude(JSON.stringify(auth), peerIdentity));
const hello = Buffer.from(encodeWebSocketFrameBatch([encodeWireClientHello()]));

const socket = net.createConnection({ host, port });
const chunks = [];

await new Promise((resolve, reject) => {
  socket.once("connect", resolve);
  socket.once("error", reject);
});

const key = randomBytes(16).toString("base64");
socket.write(
  [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}:${port}`,
    "Connection: Upgrade",
    "Upgrade: websocket",
    "Sec-WebSocket-Version: 13",
    `Sec-WebSocket-Key: ${key}`,
    "",
    "",
  ].join("\r\n"),
);

const headerBuffer = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("upgrade timed out")), 5_000);
  socket.on("data", function onData(chunk) {
    chunks.push(chunk);
    const combined = Buffer.concat(chunks);
    const end = combined.indexOf("\r\n\r\n");
    if (end === -1) return;
    clearTimeout(timer);
    socket.off("data", onData);
    resolve(combined);
  });
  socket.once("error", reject);
});

const headerEnd = headerBuffer.indexOf("\r\n\r\n");
console.log(headerBuffer.subarray(0, headerEnd).toString());

socket.write(clientFrame(1, prelude));
socket.write(clientFrame(2, hello));

const serverWsFrame = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("server frame timed out")), 5_000);
  socket.once("data", (chunk) => {
    clearTimeout(timer);
    resolve(parseServerFrame(chunk));
  });
  socket.once("error", reject);
});

console.log({ opcode: serverWsFrame.opcode, payloadBytes: serverWsFrame.payload.byteLength });

if (serverWsFrame.opcode === 2) {
  const frames = decodeWebSocketFrameBatch(serverWsFrame.payload);
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
}

socket.end();
