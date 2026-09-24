import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  distDir: process.env.BUILD_DIST_DIR ?? (process.env.TEST_STORAGE_DRIVER === "memory" && process.env.E2E_PORT ? ".next-e2e" : ".next"),
};

export default nextConfig;
