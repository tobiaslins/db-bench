import { existsSync, readFileSync, writeFileSync } from "node:fs";

const patches = [
  {
    file: "node_modules/jazz-tools/dist/runtime/native-runtime/websocket.js",
    from:
      "export const CLIENT_WIRE_FEATURES = FEATURE_SYNC_MESSAGE_PAYLOAD |\n" +
      "    FEATURE_STRUCTURED_ERRORS |\n" +
      "    FEATURE_PAYLOAD_ZSTD |\n" +
      "    FEATURE_MESSAGE_FRAGMENTATION |",
    to:
      "export const CLIENT_WIRE_FEATURES = FEATURE_SYNC_MESSAGE_PAYLOAD |\n" +
      "    FEATURE_STRUCTURED_ERRORS |\n" +
      "    FEATURE_MESSAGE_FRAGMENTATION |",
  },
  {
    file: "node_modules/jazz-tools/dist/worker/jazz-broker-worker.js",
    from:
      "var CLIENT_WIRE_FEATURES = FEATURE_SYNC_MESSAGE_PAYLOAD | FEATURE_STRUCTURED_ERRORS | FEATURE_PAYLOAD_ZSTD | FEATURE_MESSAGE_FRAGMENTATION |",
    to:
      "var CLIENT_WIRE_FEATURES = FEATURE_SYNC_MESSAGE_PAYLOAD | FEATURE_STRUCTURED_ERRORS | FEATURE_MESSAGE_FRAGMENTATION |",
  },
];

let changed = 0;

for (const patch of patches) {
  if (!existsSync(patch.file)) {
    console.warn(`[jazz-zstd] skipped missing ${patch.file}`);
    continue;
  }

  const source = readFileSync(patch.file, "utf8");
  if (!source.includes(patch.from)) {
    console.log(`[jazz-zstd] already patched or pattern changed: ${patch.file}`);
    continue;
  }

  writeFileSync(patch.file, source.replace(patch.from, patch.to));
  changed += 1;
  console.log(`[jazz-zstd] disabled FEATURE_PAYLOAD_ZSTD in ${patch.file}`);
}

if (changed === 0) {
  console.log("[jazz-zstd] no files changed");
}
