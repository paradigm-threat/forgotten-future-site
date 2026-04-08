import { NextRequest, NextResponse } from 'next/server';
import { parseManuscript, ManuscriptVersion } from '@/lib/manuscript';
import { DEFAULT_FF_STORY_PAGES_ORIGIN } from '@/lib/ffPagesUrls';

const MANUSCRIPT_FILES: Record<ManuscriptVersion, string> = {
    '13plus': 'manuscript/MANUSCRIPT_13_PLUS.md',
    'youngadult': 'manuscript/MANUSCRIPT_YOUNG_ADULT.md'
};

const DEFAULT_STORY_REPO_BASE = `${DEFAULT_FF_STORY_PAGES_ORIGIN}/`;

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

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { timestamp: number; payload: any }>();

function getCorsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400'
    };
}

function isGithubUrl(url: string) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return [
            'raw.githubusercontent.com',
            'github.com',
            'githubusercontent.com'
        ].some(domain => host === domain || host.endsWith(`.${domain}`));
    } catch {
        return false;
    }
}

function isGitlabPagesUrl(url: string) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'gitlab.io' || host.endsWith('.gitlab.io');
    } catch {
        return false;
    }
}

function isLocalhostUrl(url: string) {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    } catch {
        return false;
    }
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
    const editionParam = request.nextUrl.searchParams.get('edition') || '13plus';
    const version = (editionParam === '13plus' || editionParam === 'youngadult')
        ? (editionParam as ManuscriptVersion)
        : null;

    if (!version) {
        return NextResponse.json({ message: 'Invalid edition' }, { status: 400, headers: getCorsHeaders() });
    }

    const cacheKey = `manuscript:${version}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return NextResponse.json(cached.payload, { headers: getCorsHeaders() });
    }

    const manuscriptPath = MANUSCRIPT_FILES[version];
    const manuscriptUrl = `${getStoryRepoBase()}${manuscriptPath}`;

    const isGithub = isGithubUrl(manuscriptUrl);
    const isGitlabPages = isGitlabPagesUrl(manuscriptUrl);
    const isLocalhost = isLocalhostUrl(manuscriptUrl);

    if (!isGithub && !isGitlabPages && !isLocalhost) {
        return NextResponse.json({ message: 'Blocked upstream host' }, { status: 403, headers: getCorsHeaders() });
    }

    const headers: HeadersInit = isGithub ? { 'Accept': 'application/vnd.github.raw' } : {};
    const token = process.env.GITHUB_APP_TOKEN;
    if (isGithub && token) {
        headers.Authorization = `Bearer ${token}`;
    }

    try {
        const response = await fetchWithTimeout(manuscriptUrl, 15000, headers);
        if (!response.ok) {
            return NextResponse.json(
                { message: `Failed to fetch manuscript (${response.status})` },
                { status: 502, headers: getCorsHeaders() }
            );
        }

        const text = await response.text();
        const payload = await parseManuscript(text);

        cache.set(cacheKey, { timestamp: Date.now(), payload });
        return NextResponse.json(payload, { headers: getCorsHeaders() });
    } catch (error) {
        console.error('[Manuscript API] Error:', error);
        return NextResponse.json(
            { message: 'Failed to load manuscript' },
            { status: 500, headers: getCorsHeaders() }
        );
    }
}
