import { fetchFirstOk } from './fetchFirstOk';
import { getStoryBaseUrlList } from './urlListEnv';

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
    const indexUrls = getStoryBaseUrlList().map((base) => `${base}/index.json?v=${cacheBuster}`);
    const fetched = await fetchFirstOk(indexUrls);
    if (!fetched) {
        throw new Error('Failed to fetch story index');
    }
    cachedStoryIndex = JSON.parse(fetched.text);
    lastFetchTime = now;
    return cachedStoryIndex!;
}

export async function getStoryFile(path: string): Promise<string> {
    const rel = path.replace(/^\/+/, '');
    const urls = getStoryBaseUrlList().map((base) => `${base}/${rel}`);
    const fetched = await fetchFirstOk(urls);
    if (!fetched) {
        throw new Error(`Failed to fetch file: ${path}`);
    }
    return fetched.text;
}
