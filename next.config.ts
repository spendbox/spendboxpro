import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Request photos are shrunk in the browser first (to a few hundred KB each),
    // so four of them fit comfortably. Vercel's own limit is about 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
