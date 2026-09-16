import type { NextConfig } from "next";

const useWasmBackend = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  serverExternalPackages: useWasmBackend ? [] : ["jazz-tools", "jazz-napi"],
  outputFileTracingIncludes: {
    "/*": ["node_modules/jazz-wasm/pkg/jazz_wasm_bg.wasm"],
  },
  turbopack: {
    resolveAlias: {
      ...(useWasmBackend ? { "jazz-napi": "./lib/jazz-napi-wasm.ts" } : {}),
      "./native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
      "jazz-tools/dist/runtime/native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
    },
  },
};

export default nextConfig;
