/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',  // Produces a minimal server in .next/standalone — no node_modules needed
  async rewrites() {
    // API_URL is for server-side rewrites (Docker internal: http://backend:8000)
    // NEXT_PUBLIC_API_URL is for browser-side (http://localhost:8000)
    const serverUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${serverUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
