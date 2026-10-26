/** @type {import('next').NextConfig} */
const nextConfig = {
  // sql.js runs on the server too, so API routes can re-check every answer.
  serverExternalPackages: ["sql.js"],
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/sql.js/dist/sql-wasm.wasm"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};
export default nextConfig;
