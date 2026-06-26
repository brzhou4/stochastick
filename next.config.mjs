/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // yahoo-finance2 is server-only; keep it out of the client bundle.
    serverComponentsExternalPackages: ["yahoo-finance2"],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // yahoo-finance2's ESM build references Deno-only test modules that webpack
      // can't resolve. Externalize it so it's required at runtime in Node instead
      // of being bundled (and traced into those test files).
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, "yahoo-finance2"]
        : [config.externals, "yahoo-finance2"].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
