// next.config.js

const path = require("path");

const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
const basePath = isStatic ? (process.env.NEXT_PUBLIC_BASE_PATH || '/forgotten-future-site') : '';

const relayCacheRule = {
    urlPattern: /^https:\/\/[^/]+\.relaygateway\.net\/.+\.(png|jpe?g|gif|webp)(\?.*)?$/i,
    handler: 'StaleWhileRevalidate',
    options: {
        cacheName: 'ff-relay-rasters',
        expiration: {
            maxEntries: 128,
            maxAgeSeconds: 60 * 60 * 24 * 7,
        },
        cacheableResponse: {
            statuses: [0, 200],
        },
    },
};

const withPWA = require("@ducanh2912/next-pwa").default({
    dest: "public",
    disable: process.env.NODE_ENV === "development" || isStatic,
    register: true,
    skipWaiting: true,
    cacheOnFrontEndNav: true,
    publicExcludes: [
        "media/**/*",
        "audio/**/*",
    ],
    workboxOptions: {
        disableDevLogs: true,
        runtimeCaching: [relayCacheRule],
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: isStatic ? 'export' : undefined,
    basePath: basePath || undefined,
    assetPrefix: basePath || undefined,
    pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
    reactStrictMode: true,
    trailingSlash: true,
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    turbopack: {},
    webpack: (config) => config,
    ...(!isStatic
        ? {
              async redirects() {
                  return [
                      {
                          source: '/:path*',
                          has: [{ type: 'host', value: 'forgottenfuturebook.com' }],
                          destination: 'https://www.forgottenfuturebook.com/:path*',
                          permanent: true,
                          basePath: false,
                      },
                  ];
              },
          }
        : {}),
    images: {
        unoptimized: true,
        remotePatterns: [
            { protocol: 'https', hostname: '**.relaygateway.net' },
            { protocol: 'https', hostname: 'ff-story-6a84a5.gitlab.io' },
            { protocol: 'https', hostname: 'ff-teaser-12140e.gitlab.io' },
            { protocol: 'https', hostname: '**.gitlab.io' },
        ],
    },
};

module.exports = withPWA(nextConfig);
