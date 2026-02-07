const DEFAULT_REPO_BASE = 'https://raw.githubusercontent.com/clevertree/ff-story/main/';

function normalizeRepoBase(value: string): string {
    const cleaned = value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
    let url: URL;
    try {
        url = new URL(cleaned);
    } catch {
        throw new Error('NEXT_PUBLIC_REPO_STORY must be an absolute http(s) URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('NEXT_PUBLIC_REPO_STORY must use http(s)');
    }

    return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
}

const repoPath = process.env.NEXT_PUBLIC_REPO_STORY || DEFAULT_REPO_BASE;
let resolvedRepoBase: string;
try {
    resolvedRepoBase = normalizeRepoBase(repoPath);
} catch (error) {
    console.warn('[Story Repo] Invalid NEXT_PUBLIC_REPO_STORY, falling back to default.', {
        value: repoPath
    });
    resolvedRepoBase = normalizeRepoBase(DEFAULT_REPO_BASE);
}

export const STORY_REPO_BASE = resolvedRepoBase;

export interface FileMetadata {
    _title?: string;
    _lqip?: string;
}

export interface FileTree {
    [key: string]: FileTree | FileMetadata | any;
    _count: number;
}

let cachedStoryIndex: FileTree | null = null;
let lastFetchTime = 0;

export async function getStoryIndex(): Promise<FileTree> {
    const now = Date.now();
    // Cache for 60 seconds
    if (cachedStoryIndex && (now - lastFetchTime < 60000)) {
        return cachedStoryIndex;
    }

    const cacheBuster = Math.floor(now / 60000);
    const res = await fetch(`${STORY_REPO_BASE}index.json?v=${cacheBuster}`, { next: { revalidate: 60 } });
    if (!res.ok) {
        throw new Error('Failed to fetch story index');
    }
    cachedStoryIndex = await res.json();
    lastFetchTime = now;
    return cachedStoryIndex!;
}

export async function getStoryFile(path: string): Promise<string> {
    const res = await fetch(`${STORY_REPO_BASE}${path}`, { next: { revalidate: 3600 } });
    if (!res.ok) {
        throw new Error(`Failed to fetch file: ${path}`);
    }
    return res.text();
}
