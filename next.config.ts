import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jazz-tools", "jazz-napi"],
  turbopack: {
    resolveAlias: {
      "./native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
      "jazz-tools/dist/runtime/native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
    },
  },
};

export default nextConfig;
