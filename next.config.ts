import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [],
  allowedDevOrigins: ["47.238.4.125", "localhost", "127.0.0.1"],
};

export default nextConfig;
