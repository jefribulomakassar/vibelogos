import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
    // Allow internal API proxy images (same origin)
  },
};

export default nextConfig;
