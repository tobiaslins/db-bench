import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["jazz-napi"],
} satisfies NextConfig;

export default nextConfig;
