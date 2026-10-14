import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "3000-firebase-ma3rad-1774449402960.cluster-cbeiita7rbe7iuwhvjs5zww2i4.cloudworkstations.dev",
      ],
    },
  },
  // @ts-ignore
  allowedDevOrigins: [
    "3000-firebase-ma3rad-1774449402960.cluster-cbeiita7rbe7iuwhvjs5zww2i4.cloudworkstations.dev",
  ],
};

export default nextConfig;