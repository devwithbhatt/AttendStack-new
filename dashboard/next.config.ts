import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  compress: false,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: "",
    NEXT_PUBLIC_API_ENDPOINT: process.env.NEXT_PUBLIC_API_ENDPOINT || "http://localhost:8001",
  },
  sassOptions: {
    includePaths: [
      path.join(__dirname, "node_modules/bootstrap/scss"),
      path.join(__dirname, "node_modules"),
    ],
    silenceDeprecations: ["import", "global-builtin", "color-functions", "mixed-decls"],
  },
  experimental: {
    optimizePackageImports: [
      "@tabler/icons-react",
      "@tabler/icons",
      "lucide-react",
      "react-bootstrap",
      "react-feather",
      "react-bootstrap-icons",
      "sweetalert2",
      "apexcharts",
      "react-apexcharts",
    ],
  },
  webpack(config) {
    config.resolve.modules.push(path.resolve(__dirname, "node_modules/bootstrap/scss"));
    return config;
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/sign-in",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

export default nextConfig;
