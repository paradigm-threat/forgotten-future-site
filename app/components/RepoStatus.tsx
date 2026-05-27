'use client';

interface Commit {
  sha: string;
  message: string;
  date: string;
  url: string;
}

interface RepoData {
  name: string;
  version: string;
  commits: Commit[];
  repoUrl: string;
}

interface RepoStatusProps {
  name: string;
  repoKey: string;
  repoUrl: string;
  initialData?: RepoData;
}

function formatCommitUtc(isoDate: string) {
  return new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  });
}

/** Build-time git-history.json only — no /api/versions (zero serverless). */
export default function RepoStatus({ name, repoKey, repoUrl, initialData }: RepoStatusProps) {
  const data = initialData ? { ...initialData, name, repoUrl } : null;

  if (!data) {
    return (
      <div className="glass-panel p-6 border border-foreground/10 rounded-lg" data-repo={repoKey}>
        <h3 className="text-lg font-bold text-accent mb-2">{name}</h3>
        <p className="text-sm text-muted">Run scripts/fetch-git-history.mjs before build.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 border border-foreground/10 rounded-lg hover:border-accent/30 transition-colors" data-repo={repoKey}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-bold text-accent">{data.name}</h3>
        <span className="text-xs font-mono bg-accent/10 text-accent px-2 py-1 rounded">{data.version}</span>
      </div>
      <div className="space-y-3">
        {data.commits.map((commit) => (
          <a
            key={commit.sha}
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <div className="flex items-center gap-2 text-xs font-mono text-muted mb-1">
              <span className="text-accent group-hover:underline">{commit.sha}</span>
              <span>•</span>
              <span>{formatCommitUtc(commit.date)} UTC</span>
            </div>
            <p className="text-sm text-secondary line-clamp-1 group-hover:text-foreground transition-colors">
              {commit.message}
            </p>
          </a>
        ))}
      </div>
      <a
        href={data.repoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block text-xs text-accent hover:underline uppercase tracking-widest"
      >
        View Repository →
      </a>
    </div>
  );
}
