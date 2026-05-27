import { getBrowserEndpoint } from './storyBrowser';

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
    if (cachedStoryIndex && (now - lastFetchTime < 60000)) {
        return cachedStoryIndex;
    }

    const cacheBuster = Math.floor(now / 60000);
    const indexEndpoint = getBrowserEndpoint();
    const indexUrl = `${indexEndpoint}${indexEndpoint.includes('?') ? '&' : '?'}v=${cacheBuster}`;
    const res = await fetch(indexUrl);
    if (!res.ok) {
        throw new Error('Failed to fetch story index');
    }
    cachedStoryIndex = await res.json();
    lastFetchTime = now;
    return cachedStoryIndex!;
}

export async function getStoryFile(path: string): Promise<string> {
    const res = await fetch(getBrowserEndpoint(path));
    if (!res.ok) {
        throw new Error(`Failed to fetch file: ${path}`);
    }
    return res.text();
}
