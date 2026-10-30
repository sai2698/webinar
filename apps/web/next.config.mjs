/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emits a self-contained server bundle for standalone deployment.
  output: 'standalone',
  transpilePackages: ['@webinar/shared'],
  typescript: {
    // Verified separately via npm run typecheck before build to conserve RAM
    ignoreBuildErrors: true,
  },
  eslint: {
    // Avoid spawning ESLint worker threads during production builds on low-RAM VPS
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
