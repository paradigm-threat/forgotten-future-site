// next.config.js

const path = require("path");

const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
const basePath = isStatic ? (process.env.NEXT_PUBLIC_BASE_PATH || '/forgotten-future-site') : '';

const withPWA = require("@ducanh2912/next-pwa").default({
    dest: "public",
    // Disable PWA in development AND when building a static export
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
        runtimeCaching: [
            {
                urlPattern: /^https:\/\/www\.forgottenfuturebook\.com\/api\/manuscript(\?.*)?$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'ff-api-manuscript',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 7,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /^https:\/\/www\.forgottenfuturebook\.com\/api\/versions(\?.*)?$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'ff-api-versions',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 7,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /\/api\/manuscript(\?.*)?$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'ff-api-manuscript-local',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 7,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /\/api\/versions(\?.*)?$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'ff-api-versions-local',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 7,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
        ],
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    output: isStatic ? 'export' : undefined,
    basePath: basePath || undefined,
    assetPrefix: basePath || undefined,
    // Configure pageExtensions
    pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
    // Optionally, add any other Next.js config below
    reactStrictMode: true,
    trailingSlash: true,
    sassOptions: {
        includePaths: [path.join(__dirname, 'styles')],
    },
    // Turbopack config required when a webpack config is present (next-pwa)
    turbopack: {},
    webpack: (config) => config,
    async headers() {
        return [
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Origin', value: '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
                ],
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: '/api/browser',
                destination: '/api/browser/',
            },
            {
                source: '/api/manuscript',
                destination: '/api/manuscript/',
            },
        ];
    },
    images: process.env.NEXT_PUBLIC_IS_STATIC === 'true'
        ? {
            unoptimized: true,
        }
        : {
            loader: 'custom',
            loaderFile: './lib/imageLoader.ts',
            localPatterns: [
                {
                    pathname: '/**',
                    search: '?*',
                },
            ],
        },
}

module.exports = withPWA(nextConfig)
