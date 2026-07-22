import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appDirectory, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: repositoryRoot,
  turbopack: { root: repositoryRoot },
  async rewrites() {
    return [{
      source: "/api/:path*",
      destination: `${process.env.API_URL || "http://localhost:4000"}/api/:path*`
    }];
  }
};

export default nextConfig;
