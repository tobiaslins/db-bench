import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["jazz-tools", "jazz-napi", "@garden-co/jazz-napi-linux-x64-gnu"],
  outputFileTracingIncludes: {
    "/*": ["node_modules/@garden-co/jazz-napi-linux-x64-gnu/**/*"],
  },
  turbopack: {
    resolveAlias: {
      "./native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
      "jazz-tools/dist/runtime/native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
    },
  },
};

export default nextConfig;
