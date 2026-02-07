const DEFAULT_API_BASE = 'https://www.forgottenfuturebook.com';
const DEFAULT_BASE_PATH = '/forgotten-future-site';

function normalizeApiBase(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return DEFAULT_API_BASE;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return DEFAULT_API_BASE;
    }

    return value.replace(/\/$/, '');
}

export function getApiBase(): string {
    const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || DEFAULT_BASE_PATH;

    if (isStatic && typeof window !== 'undefined') {
        return `${window.location.origin}${basePath}`.replace(/\/$/, '');
    }

    const apiBase = process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE;
    return normalizeApiBase(apiBase);
}

export function getBrowserEndpoint(path?: string): string {
    const base = getApiBase();
    if (!path) return `${base}/api/browser`;
    const searchParams = new URLSearchParams({ path });
    return `${base}/api/browser?${searchParams.toString()}`;
}

export function getStoryAssetUrl(path: string): string {
    return getBrowserEndpoint(path);
}

export function getStoryAssetBase(path: string): string {
    const normalized = path.endsWith('/') ? path : `${path}/`;
    return getBrowserEndpoint(normalized);
}

export function getStoryGitHubUrl(path: string): string {
    return `https://github.com/clevertree/ff-story/blob/main/${path}`;
}