import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /**
   * Selective API rewrites — only proxy auth and user endpoints to Express.
   *
   * /api/auth/*  → http://localhost:5001/api/auth/*  (login, signup, etc.)
   * /api/users/* → http://localhost:5001/api/users/* (profile, etc.)
   *
   * /api/chat and any other Next.js API routes stay local.
   */
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'http://localhost:5001/api/auth/:path*',
      },
      {
        source: '/api/users/:path*',
        destination: 'http://localhost:5001/api/users/:path*',
      },
    ];
  },
};

export default nextConfig;
