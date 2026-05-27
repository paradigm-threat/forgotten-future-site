import { buildOptimizedAssetUrl, inferRepoFromAbsoluteUrl } from '@/lib/relayOptimizedAssetUrl';

const prefixPath = (path: string) => {
    const prefix = process.env.NEXT_PUBLIC_BASE_PATH || '';
    return `${prefix}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * next/image loader: site-local public assets are static; story/teaser remotes use Relay ?w=.
 */
export default function imageLoader({
    src,
    width,
    quality,
}: {
    src: string;
    width: number;
    quality?: number;
}) {
    if (src.startsWith('data:')) {
        return src;
    }

    if (src.startsWith('http')) {
        const repo = inferRepoFromAbsoluteUrl(src);
        if (repo) {
            return buildOptimizedAssetUrl(src, width, repo);
        }
        return src;
    }

    const normalized = src.startsWith('/') ? src : `/${src}`;
    const isSiteLocal =
        normalized.startsWith('/media/') ||
        normalized.startsWith('/og-image') ||
        normalized.startsWith('/favicon') ||
        normalized.startsWith('/apple-icon');

    if (isSiteLocal) {
        return prefixPath(normalized);
    }

    return buildOptimizedAssetUrl(normalized, width, 'story');
}
