'use client';

import { useState, useEffect } from 'react';
import { getApiFetchBase } from '@/lib/apiFetchBase';

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

export default function RepoStatus({ name, repoKey, repoUrl, initialData }: RepoStatusProps) {
  const [data, setData] = useState<RepoData | null>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
    if (isStatic && initialData) {
      setData({ ...initialData, name, repoUrl });
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        const apiBase = getApiFetchBase();
        const endpoint = `${apiBase}/api/versions?repo=${encodeURIComponent(repoKey)}`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Failed to fetch repo status');
        const payload = await res.json();
        const repo = payload?.repo;
        if (!repo) throw new Error('Invalid repo status response');

        setData({
          ...repo,
          name,
          repoUrl
        });
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [name, repoKey, repoUrl, initialData]);

  if (loading) {
    return (
      <div className="glass-panel animate-pulse h-48 flex items-center justify-center">
        <span className="text-muted text-xs uppercase tracking-widest">Scanning {name}...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-panel border-element-fire/30">
        <h3 className="text-xs font-bold uppercase tracking-widest mb-4">Repository: {name}</h3>
        <p className="text-element-fire text-[10px] font-mono">Signal Lost: {error || 'Unknown Error'}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel group hover:border-accent/30 transition-all">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xs font-bold uppercase tracking-widest">Repository: {data.name}</h3>
        <span className="text-[10px] bg-cyan-500/10 text-cyan-500 px-2 py-0.5 rounded border border-cyan-500/20">{data.version}</span>
      </div>
      <div className="space-y-3 mb-6">
        <div className="text-[10px] text-muted font-mono leading-tight">
          {data.commits.map((commit) => (
            <div key={commit.sha} className="flex flex-col mb-2 last:mb-0">
              <div className="flex gap-2 items-baseline">
                <span className="text-[9px] text-muted/60 whitespace-nowrap">
                  {formatCommitUtc(commit.date)}
                </span>
                <span className="text-secondary break-words">{commit.message}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <a href={data.repoUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-accent uppercase tracking-widest hover:text-accent-bright inline-flex items-center gap-2">
        Repository <span className="text-lg">→</span>
      </a>
    </div>
  );
}
