import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/@:storeSlug", destination: "/store/:storeSlug" },
      {
        source: "/@:storeSlug/:productSlug",
        destination: "/store/:storeSlug/:productSlug",
      },
    ];
  },
};

export default nextConfig;
