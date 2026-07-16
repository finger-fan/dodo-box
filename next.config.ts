import type {NextConfig} from 'next';
import packageJson from './package.json' with { type: 'json' };

const isCapacitor = process.env.BUILD_TARGET === 'capacitor';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: isCapacitor
    ? { unoptimized: true }
    : {
        remotePatterns: [
          {
            protocol: 'https',
            hostname: 'picsum.photos',
            port: '',
            pathname: '/**',
          },
        ],
      },
  output: isCapacitor ? 'export' : 'standalone',
  ...(isCapacitor && { trailingSlash: true }),
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  transpilePackages: ['motion', 'svelte', '@welshman/store'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
