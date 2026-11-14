import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    // Next's catch-all rewrite parameter omits the trailing slash, while Django
    // POST endpoints require it (APPEND_SLASH cannot safely redirect POST data).
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*/` },
      { source: "/media/:path*", destination: `${backend}/media/:path*` },
    ];
  },
};

export default nextConfig;
