import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Optimize for serverless/Vercel deployment
  output: 'standalone',

  // External packages that should not be bundled
  serverExternalPackages: ['@neondatabase/serverless', '@pinecone-database/pinecone', 'esbuild'],

  // Allow images from any HTTPS source
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },

  // Server Actions body size limit (Next.js 16 uses experimental.serverActions)
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
