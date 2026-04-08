import { DEFAULT_FF_STORY_PAGES_ORIGIN } from '@/lib/ffPagesUrls';

const DEFAULT_API_BASE = 'https://forgottenfuturebook.com';
const DEFAULT_STORY_WEB_BLOB_BASE = 'https://gitlab.com/clevertree/ff-story/-/blob/main';

function normalizeApiBase(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error('NEXT_PUBLIC_API_BASE must be an absolute http(s) URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('NEXT_PUBLIC_API_BASE must use http(s)');
    }

    return value.replace(/\/$/, '');
}

function normalizeTrailingSlash(value: string, trailing: boolean): string {
    const v = value.replace(/\/$/, '');
    return trailing ? `${v}/` : v;
}

function getStoryRawBase(): string | null {
    const raw = process.env.NEXT_PUBLIC_STORY_RAW_BASE?.trim();
    if (raw) return normalizeTrailingSlash(raw, false);
    if (process.env.NEXT_PUBLIC_IS_STATIC === 'true') return DEFAULT_FF_STORY_PAGES_ORIGIN;
    return null;
}

export function getApiBase(): string {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || DEFAULT_API_BASE;
    return normalizeApiBase(apiBase);
}

export function getBrowserEndpoint(path?: string): string {
    const rawBase = getStoryRawBase();
    if (rawBase) {
        if (!path) return `${rawBase}/index.json`;
        return getStoryAssetUrl(path);
    }
    const base = getApiBase();
    if (!path) return `${base}/api/browser/`;
    const searchParams = new URLSearchParams({ path });
    return `${base}/api/browser/?${searchParams.toString()}`;
}

export function getStoryAssetUrl(path: string): string {
    const rawBase = getStoryRawBase();
    if (rawBase) {
        const p = path.replace(/^\/+/, '');
        return `${rawBase}/${p}`;
    }
    return getBrowserEndpoint(path);
}

export function getStoryAssetBase(path: string): string {
    const normalized = path.endsWith('/') ? path : `${path}/`;
    return getStoryAssetUrl(normalized);
}

/** Web UI link to the story file (GitLab blob view by default). */
export function getStorySourceWebUrl(path: string): string {
    const base =
        process.env.NEXT_PUBLIC_STORY_WEB_BLOB_BASE?.trim().replace(/\/$/, '')
        || DEFAULT_STORY_WEB_BLOB_BASE;
    const p = path.replace(/^\/+/, '');
    return `${base}/${p}`;
}

/** @deprecated Use getStorySourceWebUrl */
export function getStoryGitHubUrl(path: string): string {
    return getStorySourceWebUrl(path);
}
