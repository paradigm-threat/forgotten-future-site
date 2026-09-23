import { fetchFirstOk } from '@/lib/fetchFirstOk';
import { getStoryBaseUrlList } from '@/lib/urlListEnv';

export interface Part {
    id: string; // generated from title
    title: string;
    summary: string;
    chapters: Chapter[];
}

export interface Chapter {
    id: number;
    title: string;
    content: string; // The text under ## Draft
    summary: string; // The text under ## Synopsis
}

export type ManuscriptVersion = '13plus' | 'youngadult';

const MANUSCRIPT_FILES: Record<ManuscriptVersion, string> = {
    '13plus': 'manuscript/MANUSCRIPT_13_PLUS.md',
    'youngadult': 'manuscript/MANUSCRIPT_YOUNG_ADULT.md'
};

export async function parseManuscript(text: string): Promise<{ parts: Part[], chapters: Chapter[], draftVersion?: string, updatedDate?: string }> {
    const versionMatch = text.match(/> Draft Version: ([\d.]+)/);
    const draftVersion = versionMatch ? versionMatch[1] : undefined;

    const dateMatch = text.match(/> Updated: ([\d-]+)/);
    const updatedDate = dateMatch ? dateMatch[1] : undefined;

    const segments = text.split(/\n---\n/);

    const parts: Part[] = [];
    const chaptersList: Chapter[] = [];

    let currentPart: Part | null = null;
    const defaultPart: Part = {
        id: 'unassigned',
        title: 'Manuscript',
        summary: 'The recorded logs of the Aether-Drive.',
        chapters: []
    };

    for (const segment of segments) {
        const partMatch = segment.match(/# PART ([IVXLCDM]+):? (.*)/i);
        if (partMatch) {
            const summaryMatch = segment.match(/\*([\s\S]*?)\*/);
            const partSummary = summaryMatch ? summaryMatch[1].trim() : '';
            const partTitle = `Part ${partMatch[1]}: ${partMatch[2].trim()}`;
            const partId = partMatch[2].toLowerCase().replace(/[^a-z0-9]+/g, '-');

            currentPart = {
                id: partId,
                title: partTitle,
                summary: partSummary,
                chapters: []
            };
            parts.push(currentPart);
            continue;
        }

        const headerMatch = segment.match(/#+ Chapter (\d+):? (.*)/i);
        if (!headerMatch) continue;

        const id = parseInt(headerMatch[1]);
        const title = headerMatch[2].trim();

        let content = '';
        const draftMatch = segment.match(/## Draft\s*\n([\s\S]*?)(?=\n##|$)/i);
        if (draftMatch) {
            content = draftMatch[1].trim();
        }

        let summary = '';
        const synopsisMatch = segment.match(/## Synopsis\s*\n([\s\S]*?)(?=\n##|$)/i);
        if (synopsisMatch) {
            summary = synopsisMatch[1].trim();
        }

        const chapter: Chapter = { id, title, content, summary };
        chaptersList.push(chapter);

        if (currentPart) {
            currentPart.chapters.push(chapter);
        } else {
            defaultPart.chapters.push(chapter);
        }
    }

    if (defaultPart.chapters.length > 0 && !parts.some(p => p.id === 'unassigned')) {
        parts.unshift(defaultPart);
    }

    return {
        parts,
        chapters: chaptersList,
        draftVersion,
        updatedDate
    };
}

const FETCH_TIMEOUT_MS = 5000;

function localManuscriptUrls(version: ManuscriptVersion): string[] {
    const prefix = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');
    const file = MANUSCRIPT_FILES[version];
    const urls = [`${prefix}/${file}`];
    if (version === 'youngadult') {
        urls.push(`${prefix}/manuscript/manuscript_youngadult.md`);
    } else {
        urls.push(`${prefix}/manuscript/manuscript_13plus.md`);
    }
    return urls;
}

export async function fetchManuscript(version: ManuscriptVersion = '13plus'): Promise<{ parts: Part[], chapters: Chapter[], draftVersion?: string, updatedDate?: string }> {
    try {
        const remoteUrls = getStoryBaseUrlList().map((base) => `${base}/${MANUSCRIPT_FILES[version]}`);
        const fetched = await fetchFirstOk([...remoteUrls, ...localManuscriptUrls(version)], FETCH_TIMEOUT_MS);
        if (!fetched) {
            throw new Error('Failed to load manuscript from all mirrors');
        }

        return parseManuscript(fetched.text);
    } catch (error) {
        console.error(`[Manuscript] Error:`, error);
        return { parts: [], chapters: [] };
    }
}
