import { readFileSync } from "node:fs";
import { initSync, mintLocalFirstToken as mintWasmLocalFirstToken, WasmDb } from "jazz-wasm";

initSync({
  module: readFileSync(new URL("../node_modules/jazz-wasm/pkg/jazz_wasm_bg.wasm", import.meta.url)),
});

export class NapiDb {
  static openMemory(schema: Uint8Array, config: Uint8Array) {
    return WasmDb.openMemory(schema, config);
  }

  static openMemoryAsBackend(schema: Uint8Array, config: Uint8Array) {
    return WasmDb.openMemoryAsBackend(schema, config);
  }

  static openMemoryWithSelfSignedProof(
    schema: Uint8Array,
    config: Uint8Array,
    token: string,
    appId: string,
    claimedAuthor: string,
  ) {
    return WasmDb.openMemoryWithSelfSignedProof(
      schema,
      config,
      token,
      appId,
      claimedAuthor,
    );
  }
}

export function mintLocalFirstToken(seedB64: string, audience: string, ttlSeconds: number) {
  return mintWasmLocalFirstToken(
    seedB64,
    audience,
    ttlSeconds,
    BigInt(Math.floor(Date.now() / 1_000)),
  );
}
