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
  // Games that graduated from the lab keep working at their old /lab links.
  async redirects() {
    return ["shadow-match", "elevator-of-doom", "pigeon-air-traffic", "balloon-doctor", "dabbawala-rush", "fridge-tetris", "tiffin-stack"].map((slug) => ({
      source: `/lab/${slug}`,
      destination: `/${slug}`,
      permanent: true,
    }));
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
