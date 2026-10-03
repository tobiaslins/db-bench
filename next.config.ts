import type { NextConfig } from "next";
import { withJazz } from "jazz-tools/dev/next";

const nextConfig = {
  serverExternalPackages: ["jazz-tools"],
  turbopack: {
    resolveAlias: {
      "./native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
      "jazz-tools/dist/runtime/native-runtime/node-foreground-node-lease.js": "./lib/jazz-node-foreground-node-lease-browser-stub.ts",
    },
  },
} satisfies NextConfig;

export default withJazz(nextConfig, { server: false });
