import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel max function duration (seconds) — butuh karena generate 6 mockup bisa 45–60 detik
  // Free plan Vercel max 60s, Pro plan max 300s
  serverExternalPackages: [],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/doxxsrxcb/**',
      },
    ],
  },
};

export default nextConfig;
