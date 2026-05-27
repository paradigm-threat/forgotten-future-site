import { getStoryRawBase } from '@/lib/storyBrowser';

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

const FETCH_TIMEOUT_MS = 15000;

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

export async function fetchManuscript(version: ManuscriptVersion = '13plus'): Promise<{ parts: Part[], chapters: Chapter[], draftVersion?: string, updatedDate?: string }> {
    try {
        const rawBase = getStoryRawBase();
        const url = `${rawBase}/${MANUSCRIPT_FILES[version]}`;

        const response = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
        if (!response.ok) {
            throw new Error(`Failed to load manuscript: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        return parseManuscript(text);
    } catch (error) {
        console.error(`[Manuscript] Error:`, error);
        return { parts: [], chapters: [] };
    }
}
