import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the project root so Next does not pick up a lockfile from a parent folder.
  turbopack: { root: here },
  experimental: {
    // The stylesheet is small, so inline it and avoid a render-blocking request.
    inlineCss: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
