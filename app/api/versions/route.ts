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

const GITLAB_API = 'https://gitlab.com/api/v4';

const REPOS: Record<string, { name: string; projectPath: string; branch: string; repoUrl: string }> = {
    'ff-story': {
        name: 'Story',
        projectPath: 'clevertree/ff-story',
        branch: 'main',
        repoUrl: 'https://gitlab.com/clevertree/ff-story/-/commits/main'
    },
    'ff-teaser': {
        name: 'Teaser',
        projectPath: 'clevertree/ff-teaser',
        branch: 'main',
        repoUrl: 'https://gitlab.com/clevertree/ff-teaser/-/commits/main'
    },
    'forgotten-future-site': {
        name: 'Site',
        projectPath: 'clevertree/forgotten-future-site',
        branch: 'master',
        repoUrl: 'https://gitlab.com/clevertree/forgotten-future-site/-/commits/master'
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

function gitlabHeaders(): HeadersInit {
    const headers: HeadersInit = { Accept: 'application/json' };
    const token = process.env.GITLAB_TOKEN;
    if (token) {
        headers['PRIVATE-TOKEN'] = token;
    }
    return headers;
}

function projectId(projectPath: string): string {
    return encodeURIComponent(projectPath);
}

async function fetchGitLabRaw(path: string): Promise<Response> {
    return fetch(`${GITLAB_API}${path}`, { headers: gitlabHeaders(), next: { revalidate: 300 } });
}

async function fetchGitLabJson(path: string) {
    const res = await fetchGitLabRaw(path);
    if (!res.ok) {
        throw new Error(`GitLab request failed: ${res.status}`);
    }
    return res.json();
}

async function fetchRepoVersion(projectPath: string, branch: string, tryPackageJson: boolean): Promise<string> {
    const id = projectId(projectPath);
    const versionFile = encodeURIComponent('VERSION');
    try {
        const res = await fetchGitLabRaw(`/projects/${id}/repository/files/${versionFile}/raw?ref=${branch}`);
        if (res.ok) {
            const version = (await res.text()).trim();
            return `v${version}`;
        }
    } catch {
        /* fall through */
    }

    if (!tryPackageJson) return 'v?.?.?';

    try {
        const pkgPath = encodeURIComponent('package.json');
        const res = await fetchGitLabRaw(`/projects/${id}/repository/files/${pkgPath}/raw?ref=${branch}`);
        if (res.ok) {
            const pkg = JSON.parse(await res.text());
            if (pkg?.version) return `v${pkg.version}`;
        }
    } catch {
        /* fall through */
    }

    return 'v?.?.?';
}

async function fetchRepoCommits(projectPath: string, branch: string): Promise<CommitInfo[]> {
    const id = projectId(projectPath);
    const commits = await fetchGitLabJson(
        `/projects/${id}/repository/commits?ref=${encodeURIComponent(branch)}&per_page=3`
    );
    return (commits || []).map((c: any) => ({
        sha: (c.short_id || c.id || '').toString().substring(0, 7),
        message: (c.title || c.message || '').split('\n')[0],
        date: c.committed_date || c.created_at,
        url: c.web_url || `https://gitlab.com/${projectPath}/-/commit/${c.id}`
    }));
}

async function buildRepoData(key: string): Promise<RepoData> {
    const meta = REPOS[key];
    if (!meta) {
        throw new Error(`Unknown repo: ${key}`);
    }

    const tryPackageJson = key === 'forgotten-future-site';
    const [version, commits] = await Promise.all([
        fetchRepoVersion(meta.projectPath, meta.branch, tryPackageJson),
        fetchRepoCommits(meta.projectPath, meta.branch)
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
