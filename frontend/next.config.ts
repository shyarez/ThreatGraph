import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root to this folder: a stray package-lock.json higher up
  // (e.g. in the user's home directory) otherwise makes Next.js guess the wrong root.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
