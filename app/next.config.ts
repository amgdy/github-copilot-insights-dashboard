import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitCommitSha(): string {
  if (process.env.NEXT_PUBLIC_BUILD_ID) {
    return process.env.NEXT_PUBLIC_BUILD_ID;
  }
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: getGitCommitSha(),
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString(),
  },
};

export default nextConfig;
