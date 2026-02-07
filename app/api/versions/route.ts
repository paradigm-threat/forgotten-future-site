import { NextRequest, NextResponse } from 'next/server';

interface CommitInfo {
    sha: string;
    message: string;
    date: string;
    url: string;
}

interface RepoData {
    name: string;
    version: string;
    commits: CommitInfo[];
    repoUrl: string;
}

const REPOS: Record<string, { name: string; owner: string; repo: string; branch: string; repoUrl: string }> = {
    'ff-story': {
        name: 'Story',
        owner: 'clevertree',
        repo: 'ff-story',
        branch: 'main',
        repoUrl: 'https://github.com/clevertree/ff-story/commits/main/'
    },
    'ff-teaser': {
        name: 'Teaser',
        owner: 'clevertree',
        repo: 'ff-teaser',
        branch: 'main',
        repoUrl: 'https://github.com/clevertree/ff-teaser/commits/main/'
    },
    'forgotten-future-site': {
        name: 'Site',
        owner: 'clevertree',
        repo: 'forgotten-future-site',
        branch: 'master',
        repoUrl: 'https://github.com/clevertree/forgotten-future-site/commits/master/'
    }
};

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

function getGitHubHeaders(): HeadersInit {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    const token = process.env.GITHUB_APP_TOKEN;
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return headers;
}

async function fetchGitHubJson(url: string) {
    const res = await fetch(url, { headers: getGitHubHeaders(), next: { revalidate: 300 } });
    if (!res.ok) {
        throw new Error(`GitHub request failed: ${res.status}`);
    }
    return res.json();
}

async function fetchRepoVersion(owner: string, repo: string): Promise<string> {
    try {
        const versionData = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/contents/VERSION`);
        if (versionData?.content) {
            const version = Buffer.from(versionData.content, 'base64').toString('utf-8').trim();
            return `v${version}`;
        }
    } catch {
        // fallthrough to package.json
    }

    try {
        const pkgData = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/contents/package.json`);
        if (pkgData?.content) {
            const pkg = JSON.parse(Buffer.from(pkgData.content, 'base64').toString('utf-8'));
            if (pkg?.version) return `v${pkg.version}`;
        }
    } catch {
        // fallthrough
    }

    return 'v?.?.?';
}

async function fetchRepoCommits(owner: string, repo: string): Promise<CommitInfo[]> {
    const commits = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=3`);
    return (commits || []).map((c: any) => ({
        sha: c.sha.substring(0, 7),
        message: c.commit.message.split('\n')[0],
        date: c.commit.author.date,
        url: c.html_url
    }));
}

async function buildRepoData(key: string): Promise<RepoData> {
    const meta = REPOS[key];
    if (!meta) {
        throw new Error(`Unknown repo: ${key}`);
    }

    const [version, commits] = await Promise.all([
        fetchRepoVersion(meta.owner, meta.repo),
        fetchRepoCommits(meta.owner, meta.repo)
    ]);

    return {
        name: meta.name,
        version,
        commits,
        repoUrl: meta.repoUrl
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: getCorsHeaders() });
}

export async function GET(request: NextRequest) {
    const repoKey = request.nextUrl.searchParams.get('repo');
    const cacheKey = repoKey ? `versions:${repoKey}` : 'versions:all';

    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return NextResponse.json(cached.payload, { headers: getCorsHeaders() });
    }

    try {
        if (repoKey) {
            if (!REPOS[repoKey]) {
                return NextResponse.json({ message: 'Unknown repo key' }, { status: 400, headers: getCorsHeaders() });
            }
            const repo = await buildRepoData(repoKey);
            const payload = { repo, updatedAt: new Date().toISOString() };
            cache.set(cacheKey, { timestamp: Date.now(), payload });
            return NextResponse.json(payload, { headers: getCorsHeaders() });
        }

        const entries = await Promise.all(Object.keys(REPOS).map(async (key) => [key, await buildRepoData(key)]));
        const repos = Object.fromEntries(entries);
        const payload = { repos, updatedAt: new Date().toISOString() };
        cache.set(cacheKey, { timestamp: Date.now(), payload });
        return NextResponse.json(payload, { headers: getCorsHeaders() });
    } catch (error) {
        console.error('[Versions API] Error:', error);
        return NextResponse.json({ message: 'Failed to load versions' }, { status: 500, headers: getCorsHeaders() });
    }
}
