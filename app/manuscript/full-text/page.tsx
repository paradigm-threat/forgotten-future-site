'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import { fetchManuscript, Chapter, Part, ManuscriptVersion } from '../../../lib/manuscript';
import { VersionSwitch } from '../../components/VersionSwitch';
import { MarkdownLink } from '../../components/MarkdownLink';
import { useTTS, TTSSegment } from '../../../lib/hooks/useTTS';
import { PlaybackOverlay } from '../../components/PlaybackOverlay';

function FullTextContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const editionParam = searchParams.get('edition');

    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [parts, setParts] = useState<Part[]>([]);
    const [draftVersion, setDraftVersion] = useState<string | undefined>();
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [version, setVersion] = useState<ManuscriptVersion>(editionParam === '13plus' ? '13plus' : 'youngadult');
    const [notification, setNotification] = useState<string | null>(null);
    const {
        state: tts,
        availableVoices,
        play,
        pause,
        stop,
        next,
        prev,
        setVoice,
        setRate,
        setLangFilter,
        setLocalOnly
    } = useTTS();

    const LOAD_TIMEOUT_MS = 20000;
    const [loadTrigger, setLoadTrigger] = useState(0);

    // Track state to avoid redundant updates and rapid reloads
    const currentVersionRef = useRef<string | undefined>(undefined);
    const lastActiveRef = useRef(Date.now());
    const lastUpdateAttemptRef = useRef(0);

    const prevChaptersRef = useRef<Chapter[]>([]);

    const playChapters = useCallback((startIndex: number = 0) => {
        const segments: TTSSegment[] = chapters.map((ch, idx) => ({
            id: ch.id,
            title: `Chapter ${ch.id}: ${ch.title}`,
            text: ch.content
        }));
        play(segments, startIndex);
    }, [chapters, play]);

    useEffect(() => {
        if (tts.isPlaying && tts.currentSegmentIndex !== -1) {
            const currentSegment = tts.segments[tts.currentSegmentIndex];
            const element = document.getElementById(`chapter-${currentSegment.id}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }, [tts.isPlaying, tts.currentSegmentIndex, tts.segments]);

    useEffect(() => {
        const handleRequest = (e: Event) => {
            const ce = e as CustomEvent;
            const targetId = ce.detail?.chapterId;
            if (tts.isPlaying && tts.currentSegmentIndex !== -1) {
                stop();
            } else if (targetId) {
                const idx = chapters.findIndex(c => c.id === targetId);
                if (idx !== -1) playChapters(idx);
            }
        };
        window.addEventListener('ff-request-tts', handleRequest);
        return () => window.removeEventListener('ff-request-tts', handleRequest);
    }, [tts.isPlaying, tts.currentSegmentIndex, chapters, playChapters, stop]);

    const handleVersionChange = (newVersion: ManuscriptVersion) => {
        setVersion(newVersion);
        const params = new URLSearchParams(window.location.search);
        if (newVersion === 'youngadult') {
            params.set('edition', 'youngadult');
        } else {
            params.delete('edition');
        }
        router.replace(`${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`, { scroll: false });
    };

    useEffect(() => {
        const handleActivity = () => {
            lastActiveRef.current = Date.now();
        };
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('scroll', handleActivity);
        window.addEventListener('click', handleActivity);
        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('click', handleActivity);
        };
    }, []);

    useEffect(() => {
        setIsLoading(true);
        setLoadError(null);

        const timeoutId = setTimeout(() => {
            setLoadError((prev) => (prev ? prev : 'timeout'));
            setIsLoading(false);
        }, LOAD_TIMEOUT_MS);

        const loadManuscript = (forceRemote = false) => {
            const now = Date.now();

            // Stop remote fetching if user is idle (> 60s) or tab is hidden
            if (forceRemote) {
                const isIdle = now - lastActiveRef.current > 60000;
                const isHidden = document.visibilityState === 'hidden';
                if (isIdle || isHidden) return;

                // Harden update feature: Rate-limit attempts to once per 60s
                if (now - lastUpdateAttemptRef.current < 60000) {
                    console.log("[Manuscript] Skipping update check, too soon since last attempt.");
                    return;
                }
                lastUpdateAttemptRef.current = now;
            }

            fetchManuscript(version).then(data => {
                clearTimeout(timeoutId);
                if (data.chapters.length > 0) {
                    setLoadError(null);
                    const hasNewVersion = data.draftVersion !== currentVersionRef.current;

                    if (forceRemote && hasNewVersion && currentVersionRef.current !== undefined) {
                        const versionInfo = data.updatedDate ? `v${data.draftVersion} (${data.updatedDate})` : `v${data.draftVersion}`;
                        setNotification(`Archive Updated: ${versionInfo}`);
                        setTimeout(() => setNotification(null), 10000);
                    }

                    if (hasNewVersion) {
                        setChapters(data.chapters);
                        setParts(data.parts);
                        setDraftVersion(data.draftVersion);
                        currentVersionRef.current = data.draftVersion;
                        prevChaptersRef.current = data.chapters;
                    }
                } else {
                    setLoadError('unavailable');
                }
                setIsLoading(false);

                // Handle hash-based scrolling after data loads (only on first load)
                if (!forceRemote && window.location.hash) {
                    setTimeout(() => {
                        const id = window.location.hash.replace('#', '');
                        const element = document.getElementById(id);
                        if (element) {
                            element.scrollIntoView({ behavior: 'smooth' });
                        }
                    }, 100);
                }
            }).catch(() => {
                clearTimeout(timeoutId);
                setLoadError('unavailable');
                setIsLoading(false);
            });
        };

        // 1. Load local version immediately for speed
        loadManuscript(false);

        // 2. Check for remote updates immediately after
        const remoteCheckTimeout = setTimeout(() => loadManuscript(true), 2000);

        // 3. Polling: attempt to refresh from GitHub once per 60 seconds
        const intervalId = setInterval(() => loadManuscript(true), 60000);

        return () => {
            clearTimeout(timeoutId);
            clearTimeout(remoteCheckTimeout);
            clearInterval(intervalId);
        };
    }, [version, loadTrigger]);

    // Track scroll position to save last read chapter
    useEffect(() => {
        if (isLoading || chapters.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.id;
                        if (id.startsWith('chapter-')) {
                            localStorage.setItem('ff-last-read-chapter', id);
                            localStorage.setItem('ff-last-read-edition', version);
                        }
                    }
                });
            },
            { threshold: 0.1, rootMargin: '-10% 0px -80% 0px' }
        );

        const chapterElements = document.querySelectorAll('section[id^="chapter-"]');
        chapterElements.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, [isLoading, chapters, version]);

    return (
        <div className="container mx-auto px-6 lg:px-12 py-12 relative">
            {/* Content Refresh Notification */}
            {notification && (
                <div className="fixed top-28 right-8 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="bg-cyan-500 text-black px-6 py-3 rounded-full shadow-xl shadow-accent/50 font-bold text-xs uppercase tracking-widest flex items-center gap-3">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-background"></span>
                        </span>
                        {notification}
                        <button onClick={() => setNotification(null)} className="hover:opacity-60 transition-opacity">✕</button>
                    </div>
                </div>
            )}

            <header className="mb-16 text-center lg:text-left lg:pl-[25%] relative">

                <h1 className="text-6xl font-black mb-4 tracking-tighter text-glow">FORGOTTEN FUTURE</h1>
                <h2 className="text-xl uppercase tracking-[0.3em]">The Full Manuscript Draft</h2>
                {draftVersion && (
                    <span className="text-[10px] text-muted uppercase tracking-[0.2em] border border-primary/5 bg-primary/5 px-3 py-1 rounded">
                        Draft: v{draftVersion}
                    </span>
                )}
                <div className="mt-6 flex flex-wrap gap-4 no-print">
                    <button
                        onClick={() => playChapters(0)}
                        className={`flex items-center gap-3 px-6 py-2 rounded-full border text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${tts.isPlaying && tts.segments.length > 1
                            ? 'bg-cyan-500 text-background border-cyan-500 shadow-xl shadow-accent/50'
                            : 'bg-primary/5 text-cyan-400 border-primary/10 hover:bg-white/10'
                            }`}
                    >
                        {tts.isPlaying && tts.segments.length > 1 ? (
                            <>
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-background"></span>
                                </span>
                                Playing Full Audio...
                            </>
                        ) : (
                            <>
                                <span>▶</span> Listen to Full Manuscript (BETA)
                            </>
                        )}
                    </button>
                </div>
                <div className="mt-4 p-4 border border-cyan-500/20 bg-cyan-500/5 rounded text-xs text-secondary uppercase tracking-widest leading-relaxed max-w-3xl">
                    Note: This draft covers the <strong className="text-cyan-400 font-bold">{version === '13plus' ? '13+ Core Edition' : 'Young Adult Edition'}</strong>.
                    Optimized for Text-to-Speech
                </div>

            </header>

            <div className="flex flex-col lg:flex-row gap-12 relative">
                {/* Navigation Sidebar */}
                <aside className="lg:w-1/4 no-print order-1 lg:order-1">
                    <div className="glass-panel sticky top-36 max-h-[70vh] overflow-y-auto custom-scrollbar p-6">
                        <Link href={`/manuscript${version === 'youngadult' ? '' : '?edition=13plus'}`} className="text-cyan-500/60 hover:text-cyan-400 font-bold uppercase tracking-widest text-[10px] flex items-center gap-2 mb-2 border-b border-primary/5 transition-colors">
                            ← Back to Chapter List
                        </Link>

                        <div className="flex justify-between items-center mb-6 border-b border-primary/10 pb-2">
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em]">
                                Navigation
                            </h2>
                            <div className="scale-75 origin-right mr-2">
                                <VersionSwitch version={version} onVersionChange={handleVersionChange} />
                            </div>
                        </div>

                        <div className="space-y-8">
                            {/* SIDEBAR_START (dynamic) */}
                            <div>
                                <div className="space-y-6">
                                    {parts.map((section, idx) => (
                                        <div key={idx}>
                                            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3">
                                                {section.title}
                                            </h3>
                                            <ul className="space-y-2 border-l border-primary/5 pl-4">
                                                {section.chapters.map((c) => (
                                                    <li key={c.id}>
                                                        <a href={`#chapter-${c.id}`} className="text-[10px] text-secondary hover:text-cyan-400 transition-colors block py-0.5 leading-tight uppercase tracking-tighter">
                                                            {c.id}. {c.title}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* SIDEBAR_END */}
                        </div>
                    </div>
                </aside>

                <article className="lg:w-3/4 space-y-24 pb-[100vh] order-2 lg:order-2">
                    {/* ARTICLE_START */}
                    {isLoading && !loadError ? (
                        <div className="flex flex-col items-center justify-center py-24 text-muted uppercase tracking-widest text-xs">
                            <div className="mb-4 animate-pulse">Decrypting Aether-Logs...</div>
                        </div>
                    ) : loadError || chapters.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-muted uppercase tracking-widest text-xs space-y-4">
                            <div className="mb-4 text-red-500/80 text-center max-w-md">
                                {loadError === 'timeout'
                                    ? 'Link timed out. The manuscript could not be loaded from the archive (local or GitHub). Check your connection and try again.'
                                    : loadError === 'unavailable'
                                        ? 'Link severed: records inaccessible. Local and remote fetch failed.'
                                        : 'Link severed: records inaccessible.'}
                            </div>
                            <button
                                onClick={() => {
                                    setLoadError(null);
                                    setIsLoading(true);
                                    setLoadTrigger((t) => t + 1);
                                }}
                                className="text-cyan-500 hover:text-cyan-400 font-bold uppercase tracking-widest border border-cyan-500/50 px-6 py-3 rounded hover:bg-cyan-500/10 transition-colors"
                            >
                                Re-establish connection
                            </button>
                        </div>
                    ) : (
                        parts.length > 0 ? (
                            parts.map((part, pIdx) => (
                                <div key={pIdx} className="space-y-24">
                                    <header className="border-y border-primary/5 py-12 mb-16 text-center">
                                        <h2 className="text-4xl font-black tracking-widest uppercase mb-4">{part.title}</h2>
                                    </header>

                                    {part.chapters.map((chapter) => (
                                        <section
                                            key={chapter.id}
                                            id={`chapter-${chapter.id}`}
                                            className="prose prose-invert max-w-none scroll-mt-32"
                                        >
                                            <div className="flex items-center justify-between mb-8 group not-prose">
                                                <h3 className="text-3xl font-bold flex items-center gap-4 m-0">
                                                    <span className="text-cyan-500 text-sm font-mono uppercase tracking-widest">
                                                        Chapter {chapter.id}
                                                    </span>
                                                    {chapter.title}
                                                </h3>
                                                <button
                                                    onClick={() => {
                                                        if (tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id) {
                                                            stop();
                                                        } else {
                                                            const idx = chapters.findIndex(c => c.id === chapter.id);
                                                            if (idx !== -1) playChapters(idx);
                                                        }
                                                    }}
                                                    className={`no-print flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id
                                                        ? 'bg-cyan-500 text-background border-cyan-500 shadow-lg shadow-accent/50'
                                                        : 'bg-transparent text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/10'
                                                        }`}
                                                >
                                                    {tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id ? (
                                                        <>
                                                            <span className="relative flex h-2 w-2">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-background"></span>
                                                            </span>
                                                            Stop Listening
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>▶</span> Listen
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                            <div className={`leading-[2] text-lg space-y-6 transition-all duration-500 ${tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'text-secondary'}`}>
                                                <ReactMarkdown
                                                    components={{
                                                        a: MarkdownLink
                                                    }}
                                                >{chapter.content}</ReactMarkdown>
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            ))
                        ) : (
                            chapters.map((chapter) => (
                                <section
                                    key={chapter.id}
                                    id={`chapter-${chapter.id}`}
                                    className="prose prose-invert max-w-none scroll-mt-32"
                                >
                                    <div className="flex items-center justify-between mb-8 group not-prose">
                                        <h3 className="text-3xl font-bold flex items-center gap-4 m-0">
                                            <span className="text-cyan-500 text-sm font-mono uppercase tracking-widest">
                                                Chapter {chapter.id}
                                            </span>
                                            {chapter.title}
                                        </h3>
                                        <button
                                            onClick={() => {
                                                if (tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id) {
                                                    stop();
                                                } else {
                                                    const idx = chapters.findIndex(c => c.id === chapter.id);
                                                    if (idx !== -1) playChapters(idx);
                                                }
                                            }}
                                            className={`no-print flex items-center gap-2 px-4 py-2 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id
                                                ? 'bg-cyan-500 text-background border-cyan-500 shadow-lg shadow-accent/50'
                                                : 'bg-transparent text-cyan-500 border-cyan-500/30 hover:bg-cyan-500/10'
                                                }`}
                                        >
                                            {tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id ? (
                                                <>
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-background opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-background"></span>
                                                    </span>
                                                    Stop Listening
                                                </>
                                            ) : (
                                                <>
                                                    <span>▶</span> Listen
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <div className={`leading-[2] text-lg space-y-6 transition-all duration-500 ${tts.isPlaying && tts.currentSegmentIndex !== -1 && tts.segments[tts.currentSegmentIndex].id === chapter.id ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]' : 'text-secondary'}`}>
                                        <ReactMarkdown
                                            components={{
                                                a: MarkdownLink
                                            }}
                                        >{chapter.content}</ReactMarkdown>
                                    </div>
                                </section>
                            ))
                        )
                    )}
                    {/* ARTICLE_END */}
                </article>
            </div>

            <footer className="border-t border-primary/10 py-12 text-center">
                <p className="text-muted text-sm italic mb-4">
                    End of First Edition Manuscript. The Aether-Drive reaches its limit of recall.
                </p>
                <p className="text-[10px] text-muted uppercase tracking-widest">
                    Protocol: Full Sync | Archive ID: FF-MAN-MAX
                </p>
            </footer>

            <PlaybackOverlay
                state={tts}
                availableVoices={availableVoices}
                onPause={pause}
                onStop={stop}
                onNext={next}
                onPrev={prev}
                onSetVoice={setVoice}
                onSetRate={setRate}
                onSetLangFilter={setLangFilter}
                onSetLocalOnly={setLocalOnly}
            />
        </div>
    );
}

export default function FullTextManuscript() {
    return (
        <Suspense fallback={
            <div className="container mx-auto px-6 py-24 text-center text-muted uppercase tracking-widest text-xs">
                Syncing with Archive...
            </div>
        }>
            <FullTextContent />
        </Suspense>
    );
}

