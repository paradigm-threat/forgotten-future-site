import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_STORY_REPO_BASE = 'https://clevertree.gitlab.io/ff-story/';
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { timestamp: number; payload: any }>();

function normalizeRepoBase(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return DEFAULT_STORY_REPO_BASE;
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return DEFAULT_STORY_REPO_BASE;
    }

    return value.endsWith('/') ? value : `${value}/`;
}

function getStoryRepoBase(): string {
    const candidate = process.env.STORY_REPO_BASE || DEFAULT_STORY_REPO_BASE;
    return normalizeRepoBase(candidate);
}

function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400'
    };
}

function sanitizePath(value: string) {
    const stripped = value.replace(/^\/+/, '');
    if (!stripped || stripped.includes('..')) return null;
    return stripped;
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers: HeadersInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            signal: controller.signal,
            headers,
            next: { revalidate: 300 }
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function GET(request: NextRequest) {
    const pathParam = request.nextUrl.searchParams.get('path');
    const cacheKey = 'browser:index';
    if (!pathParam) {
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            return NextResponse.json(cached.payload, { headers: getCorsHeaders() });
        }
    }

    const base = getStoryRepoBase();
    const isGithub = (() => {
        try {
            const host = new URL(base).hostname.toLowerCase();
            return host.includes('github');
        } catch {
            return false;
        }
    })();
    const headers: HeadersInit = isGithub ? { 'Accept': 'application/vnd.github.raw' } : {};

    if (!pathParam) {
        const url = `${base}index.json`;
        try {
            const response = await fetchWithTimeout(url, 15000, headers);
            if (!response.ok) {
                return NextResponse.json(
                    { message: `Failed to fetch story index (${response.status})` },
                    { status: 502, headers: getCorsHeaders() }
                );
            }

            const payload = await response.json();
            cache.set(cacheKey, { timestamp: Date.now(), payload });
            return NextResponse.json(payload, { headers: getCorsHeaders() });
        } catch (error) {
            console.error('[Browser API] Error:', error);
            return NextResponse.json(
                { message: 'Failed to load story index' },
                { status: 500, headers: getCorsHeaders() }
            );
        }
    }

    const sanitizedPath = sanitizePath(pathParam);
    if (!sanitizedPath) {
        return NextResponse.json({ message: 'Invalid path' }, { status: 400, headers: getCorsHeaders() });
    }

    const url = `${base}${sanitizedPath}`;
    try {
        const response = await fetchWithTimeout(url, 15000, headers);
        if (!response.ok) {
            return NextResponse.json(
                { message: `Failed to fetch file (${response.status})` },
                { status: 502, headers: getCorsHeaders() }
            );
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = Buffer.from(await response.arrayBuffer());
        return new NextResponse(buffer, {
            headers: {
                ...getCorsHeaders(),
                'Content-Type': contentType
            }
        });
    } catch (error) {
        console.error('[Browser API] Error:', error);
        return NextResponse.json(
            { message: 'Failed to load file' },
            { status: 500, headers: getCorsHeaders() }
        );
    }
}
