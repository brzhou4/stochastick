/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server build for Docker / AgentBox deployment.
  output: "standalone",
};

export default nextConfig;
