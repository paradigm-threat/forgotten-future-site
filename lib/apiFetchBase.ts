const DEFAULT_PROD_API = 'https://forgottenfuturebook.com';
const LOCAL_API_BASE = 'http://localhost:3000';

function normalizeApiBase(value: string): string {
    const cleaned = value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    let url: URL;
    try {
        url = new URL(cleaned);
    } catch {
        throw new Error('NEXT_PUBLIC_API_BASE must be an absolute http(s) URL');
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('NEXT_PUBLIC_API_BASE must use http(s)');
    }
    return cleaned.replace(/\/$/, '');
}

/** API host from env (SSR, static export, or server-side fetch). */
export function getConfiguredApiBase(): string {
    const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
    const candidate =
        process.env.NEXT_PUBLIC_API_BASE?.trim() ||
        (isStatic ? DEFAULT_PROD_API : LOCAL_API_BASE);
    try {
        return normalizeApiBase(candidate);
    } catch {
        const fallback = isStatic ? DEFAULT_PROD_API : LOCAL_API_BASE;
        return normalizeApiBase(fallback);
    }
}

/**
 * Origin for browser /api/* fetches. Uses the current page origin when the app is not a
 * static export so https://www.… and https://… (no www) do not cross origins (CORS).
 */
export function getApiFetchBase(): string {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_IS_STATIC !== 'true') {
        return window.location.origin;
    }
    return getConfiguredApiBase();
}
