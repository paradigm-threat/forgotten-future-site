'use client';

import {
    aggregateClientPiperVoices,
    fetchPiperTtsBlob,
    isClientPiperConfigured,
} from '@/lib/tts/piperClient';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TTSSegment {
    id: string | number;
    title: string;
    text: string;
}

export type TTSProvider = 'piper' | 'webSpeech';

export interface PiperVoice {
    id: string;
    name: string;
    lang: string;
}

export interface TTSState {
    isPlaying: boolean;
    currentSegmentIndex: number;
    segments: TTSSegment[];
    voice: SpeechSynthesisVoice | null;
    rate: number;
    langFilter: string;
    localOnly: boolean;
    provider: TTSProvider;
    piperVoiceId: string;
    piperLang: string;
    quoteVoiceId: string;
    speakerMapInput: string;
    error: string | null;
}

const LS_VOICE = 'ff-tts-voice';
const LS_RATE = 'ff-tts-rate';
const LS_LANG = 'ff-tts-lang';
const LS_LOCAL = 'ff-tts-local-only';
const LS_PROVIDER = 'ff-tts-provider';
const LS_PIPER_VOICE = 'ff-tts-piper-voice';
const LS_PIPER_LANG = 'ff-tts-piper-lang';
const LS_PIPER_QUOTE = 'ff-tts-piper-quote-voice';
const LS_SPEAKER_MAP = 'ff-tts-speaker-map';

type SpeakerBlock = { speaker: string; text: string };

function normalizeSpeaker(speaker: string): string {
    return speaker.trim().toLowerCase();
}

function parseSpeakerBlocks(text: string): SpeakerBlock[] {
    const blocks: SpeakerBlock[] = [];
    const tag = /\[SPEAKER:([^\]]+)\]/gi;
    let lastIndex = 0;
    let currentSpeaker = 'narrator';
    let match: RegExpExecArray | null;
    while ((match = tag.exec(text)) !== null) {
        const idx = match.index ?? 0;
        const before = text.slice(lastIndex, idx).trim();
        if (before) blocks.push({ speaker: currentSpeaker, text: before });
        currentSpeaker = normalizeSpeaker(match[1] ?? 'narrator');
        lastIndex = idx + match[0].length;
    }
    const tail = text.slice(lastIndex).trim();
    if (tail) blocks.push({ speaker: currentSpeaker, text: tail });
    return blocks.length > 0 ? blocks : [{ speaker: 'narrator', text }];
}

function parseSpeakerMapInput(input: string): Record<string, string> {
    if (!input.trim()) return {};
    const pairs = input.split(',');
    const map: Record<string, string> = {};
    for (const pair of pairs) {
        const [rawKey, rawVal] = pair.split('=');
        if (!rawKey || !rawVal) continue;
        const key = normalizeSpeaker(rawKey);
        const val = rawVal.trim();
        if (key && val) map[key] = val;
    }
    return map;
}

function isQuotedSentence(text: string): boolean {
    return text.includes('"');
}

function splitSentences(text: string): string[] {
    const ABBR_PLACEHOLDER = '\x00';
    const ABBREVIATIONS = /\b(B\.C|A\.D|B\.C\.E|C\.E|A\.M|P\.M|e\.g|i\.e|etc|vs|approx|ca?|Mr|Mrs|Ms|Dr|Jr|Sr|St|Prof|Gen|Gov|Sgt|Lt|Col|Capt|Rev|Vol|No|Fig|Dept|Univ|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\./gi;

    let safe = text.replace(ABBREVIATIONS, (m) => m.slice(0, -1) + ABBR_PLACEHOLDER);
    safe = safe.replace(/\b([A-Z])\./g, '$1' + ABBR_PLACEHOLDER);
    safe = safe.replace(/(\d)\.(\d)/g, '$1' + ABBR_PLACEHOLDER + '$2');

    const lines = safe.split(/\n+/).filter(l => l.trim());
    const allSentences: string[] = [];
    for (const line of lines) {
        const raw = line.match(/[^.!?]*[.!?]+(?:\s+|$)/g);
        if (!raw) {
            const restored = line.trim().replaceAll(ABBR_PLACEHOLDER, '.');
            if (restored) allSentences.push(restored);
            continue;
        }
        const joined = raw.join('');
        const leftover = line.substring(joined.length).trim();
        if (leftover) raw.push(leftover);
        for (const s of raw) {
            const restored = s.trim().replaceAll(ABBR_PLACEHOLDER, '.');
            if (restored) allSentences.push(restored);
        }
    }

    const merged: string[] = [];
    for (const s of allSentences) {
        if (merged.length > 0 && s.length < 30) {
            merged[merged.length - 1] += ' ' + s;
        } else {
            merged.push(s);
        }
    }
    return merged.filter(s => s.length > 0);
}

export function useTTS() {
    const [state, setState] = useState<TTSState>({
        isPlaying: false,
        currentSegmentIndex: -1,
        segments: [],
        voice: null,
        rate: 1.0,
        langFilter: 'en',
        localOnly: false,
        provider: 'piper',
        piperVoiceId: '',
        piperLang: 'en',
        quoteVoiceId: '',
        speakerMapInput: '',
        error: null,
    });

    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [availablePiperVoices, setAvailablePiperVoices] = useState<PiperVoice[]>([]);
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const cancelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const fetchAbortRef = useRef<AbortController | null>(null);
    const isPlayingRef = useRef(false);
    const currentChunkIndexRef = useRef(0);
    const sentencesRef = useRef<string[]>([]);
    const sentenceSpeakersRef = useRef<string[]>([]);
    const providerRef = useRef<TTSProvider>('piper');
    const piperVoiceIdRef = useRef<string>('');
    const piperLangRef = useRef<string>('en');
    const quoteVoiceIdRef = useRef<string>('');
    const speakerMapRef = useRef<Record<string, string>>({});
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);

    /** Request screen wake lock (keeps screen on during playback) */
    const acquireWakeLock = useCallback(async () => {
        try {
            if ('wakeLock' in navigator && !wakeLockRef.current) {
                wakeLockRef.current = await navigator.wakeLock.request('screen');
                wakeLockRef.current.addEventListener('release', () => { wakeLockRef.current = null; });
            }
        } catch { /* user denied or not supported */ }
    }, []);

    const releaseWakeLock = useCallback(() => {
        wakeLockRef.current?.release().catch(() => { });
        wakeLockRef.current = null;
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            audioRef.current = new Audio();
        }
    }, []);

    // Ensure audio stops on navigation or reload
    useEffect(() => {
        const handleStop = () => {
            isPlayingRef.current = false;
            if (synth) {
                synth.cancel();
                if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
            }
        };

        window.addEventListener('beforeunload', handleStop);
        window.addEventListener('pagehide', handleStop);

        return () => {
            handleStop();
            window.removeEventListener('beforeunload', handleStop);
            window.removeEventListener('pagehide', handleStop);
        };
    }, [synth]);

    // Initial load from localStorage
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedRate = localStorage.getItem(LS_RATE);
        const savedLang = localStorage.getItem(LS_LANG);
        const savedLocalOnly = localStorage.getItem(LS_LOCAL);
        const savedProvider = localStorage.getItem(LS_PROVIDER);
        const savedPiperVoice = localStorage.getItem(LS_PIPER_VOICE);
        const savedPiperLang = localStorage.getItem(LS_PIPER_LANG);
        const savedQuoteVoice = localStorage.getItem(LS_PIPER_QUOTE);
        const savedSpeakerMap = localStorage.getItem(LS_SPEAKER_MAP);
        setState(prev => ({
            ...prev,
            rate: savedRate ? parseFloat(savedRate) : prev.rate,
            langFilter: savedLang ? savedLang : prev.langFilter,
            localOnly: savedLocalOnly === 'true' ? true : savedLocalOnly === 'false' ? false : prev.localOnly,
            provider: (savedProvider === 'webSpeech' ? 'webSpeech' : 'piper') as TTSProvider,
            piperVoiceId: savedPiperVoice ?? prev.piperVoiceId,
            piperLang: savedPiperLang ?? prev.piperLang,
            quoteVoiceId: savedQuoteVoice ?? prev.quoteVoiceId,
            speakerMapInput: savedSpeakerMap ?? prev.speakerMapInput,
        }));
    }, []);

    // Re-acquire wake lock when tab becomes visible again (browser auto-releases on hide)
    useEffect(() => {
        const onVisChange = () => {
            if (document.visibilityState === 'visible' && isPlayingRef.current) acquireWakeLock();
        };
        document.addEventListener('visibilitychange', onVisChange);
        return () => document.removeEventListener('visibilitychange', onVisChange);
    }, [acquireWakeLock]);

    // Sync with global events for legacy components
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const speakingId = state.isPlaying && state.currentSegmentIndex !== -1
            ? state.segments[state.currentSegmentIndex].id
            : null;
        window.dispatchEvent(new CustomEvent('ff-tts-status', { detail: { speakingId } }));
        isPlayingRef.current = state.isPlaying;
    }, [state.isPlaying, state.currentSegmentIndex, state.segments]);

    // Initialize voices
    useEffect(() => {
        if (!synth) return;

        const updateVoices = () => {
            const rawVoices = synth.getVoices();
            // Sort: English first, then by name
            const sortedVoices = [...rawVoices].sort((a, b) => {
                const aEn = a.lang.startsWith('en');
                const bEn = b.lang.startsWith('en');
                if (aEn && !bEn) return -1;
                if (!aEn && bEn) return 1;
                return a.name.localeCompare(b.name);
            });

            setAvailableVoices(sortedVoices);

            // Try to restore saved voice OR pick a default
            const savedVoiceName = localStorage.getItem(LS_VOICE);
            if (savedVoiceName && !state.voice) {
                const savedVoice = sortedVoices.find(v => v.name === savedVoiceName);
                if (savedVoice) {
                    setState(prev => ({ ...prev, voice: savedVoice }));
                } else if (sortedVoices.length > 0) {
                    // Default to Google/English if saved one is gone
                    const preferred = sortedVoices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
                        || sortedVoices.find(v => v.lang.startsWith('en'))
                        || sortedVoices[0];
                    setState(prev => ({ ...prev, voice: preferred }));
                }
            } else if (!state.voice && sortedVoices.length > 0) {
                const preferred = sortedVoices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
                    || sortedVoices.find(v => v.lang.startsWith('en'))
                    || sortedVoices[0];
                setState(prev => ({ ...prev, voice: preferred }));
            }
        };

        updateVoices();
        if (synth.onvoiceschanged !== undefined) {
            synth.onvoiceschanged = updateVoices;
        }
    }, [synth, state.voice]);

    // Load Piper voices from server config
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let mounted = true;
        if (!isClientPiperConfigured()) return;
        aggregateClientPiperVoices()
            .then(data => {
                if (!mounted || !data) return;
                const voices = Array.isArray(data.voices) ? data.voices as PiperVoice[] : [];
                setAvailablePiperVoices(voices);

                const savedVoiceId = localStorage.getItem(LS_PIPER_VOICE);
                const defaultVoiceId = data.defaultVoiceId as string | null;
                const firstVoiceId = voices[0]?.id ?? '';
                const resolvedVoiceId = savedVoiceId || defaultVoiceId || firstVoiceId;

                setState(prev => ({
                    ...prev,
                    piperVoiceId: resolvedVoiceId || prev.piperVoiceId,
                    piperLang: prev.piperLang || voices[0]?.lang || 'en',
                    provider: voices.length > 0 ? prev.provider : 'webSpeech',
                }));
            })
            .catch(() => {
                if (!mounted) return;
                setAvailablePiperVoices([]);
                setState(prev => ({ ...prev, provider: 'webSpeech' }));
            });

        return () => { mounted = false; };
    }, []);

    useEffect(() => {
        providerRef.current = state.provider;
        piperVoiceIdRef.current = state.piperVoiceId;
        piperLangRef.current = state.piperLang;
        quoteVoiceIdRef.current = state.quoteVoiceId;
        speakerMapRef.current = parseSpeakerMapInput(state.speakerMapInput);
    }, [state.provider, state.piperVoiceId, state.piperLang, state.quoteVoiceId, state.speakerMapInput]);

    const stop = useCallback(() => {
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        fetchAbortRef.current?.abort();
        fetchAbortRef.current = null;
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
            audioUrlRef.current = null;
        }
        synth?.cancel();
        isPlayingRef.current = false;
        currentChunkIndexRef.current = 0;
        sentencesRef.current = [];
        sentenceSpeakersRef.current = [];
        releaseWakeLock();
        setState(prev => ({ ...prev, isPlaying: false, currentSegmentIndex: -1 }));
    }, [synth]);

    const highlightSegment = (index: number) => {
        setState(prev => ({ ...prev, currentSegmentIndex: index, isPlaying: true }));
    };

    const speak = useCallback((index: number, segments: TTSSegment[], voice: SpeechSynthesisVoice | null, rate: number, chunkIndex: number = 0) => {
        if (!segments[index]) {
            stop();
            return;
        }

        if (!isPlayingRef.current) return;

        if (chunkIndex === 0) {
            setState(prev => ({ ...prev, currentSegmentIndex: index, isPlaying: true }));
        }

        currentChunkIndexRef.current = chunkIndex;

        if (providerRef.current === 'piper') {
            const rawText = segments[index].text;
            const rawWithTitle = (chunkIndex === 0 && segments[index].title)
                ? `${segments[index].title}. ${rawText}`
                : rawText;

            if (chunkIndex === 0) {
                const blocks = parseSpeakerBlocks(rawWithTitle).map(block => ({
                    speaker: block.speaker,
                    text: block.text
                        .replace(/[#*_~`\[\]()]/g, ' ')
                        .replace(/\n+/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                }));
                const sentences: string[] = [];
                const speakers: string[] = [];
                for (const block of blocks) {
                    const parts = splitSentences(block.text);
                    for (const part of parts) {
                        sentences.push(part);
                        speakers.push(block.speaker);
                    }
                }
                const resolvedSpeakers = sentences.map((s, i) => {
                    const speaker = speakers[i] ?? 'narrator';
                    if (speaker === 'narrator' && isQuotedSentence(s)) return 'quote';
                    return speaker;
                });
                sentencesRef.current = sentences;
                sentenceSpeakersRef.current = resolvedSpeakers;
            }

            const sentences = sentencesRef.current;
            const speakers = sentenceSpeakersRef.current;

            if (chunkIndex >= sentences.length) {
                if (index + 1 < segments.length) {
                    speak(index + 1, segments, voice, rate, 0);
                } else {
                    stop();
                }
                return;
            }

            const text = sentences[chunkIndex];
            const speaker = speakers[chunkIndex] ?? 'narrator';
            const speakerMap = speakerMapRef.current;
            const quoteVoice = quoteVoiceIdRef.current;
            const voiceId = speaker === 'quote' && quoteVoice
                ? quoteVoice
                : speakerMap[speaker] ?? piperVoiceIdRef.current;

            if (!voiceId) {
                stop();
                return;
            }

            fetchAbortRef.current?.abort();
            const controller = new AbortController();
            fetchAbortRef.current = controller;

            fetchPiperTtsBlob({ text, voiceId, rate }, controller.signal)
                .then(blob => {
                    if (!isPlayingRef.current || !audioRef.current) return;
                    const url = URL.createObjectURL(blob);
                    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
                    audioUrlRef.current = url;
                    audioRef.current.src = url;
                    audioRef.current.onended = () => {
                        if (isPlayingRef.current) speak(index, segments, voice, rate, chunkIndex + 1);
                    };
                    audioRef.current.onerror = () => stop();
                    audioRef.current.play().catch(() => stop());
                })
                .catch(() => {
                    if (isPlayingRef.current) stop();
                });

            return;
        }

        if (!synth) {
            stop();
            return;
        }

        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        synth.cancel();

        cancelTimeoutRef.current = setTimeout(() => {
            if (!isPlayingRef.current) return;

            const rawText = segments[index].text
                .replace(/[#*_~`\[\]()]/g, ' ')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const MAX_LENGTH = 2800;
            const textToProcess = (chunkIndex === 0 && segments[index].title)
                ? `${segments[index].title}. ${rawText}`
                : rawText;

            const chunks: string[] = [];
            if (textToProcess.length > MAX_LENGTH) {
                let remaining = textToProcess;
                while (remaining.length > 0) {
                    if (remaining.length <= MAX_LENGTH) {
                        chunks.push(remaining);
                        break;
                    }
                    let splitIdx = remaining.lastIndexOf('.', MAX_LENGTH);
                    if (splitIdx === -1 || splitIdx < MAX_LENGTH * 0.5) {
                        splitIdx = remaining.lastIndexOf(' ', MAX_LENGTH);
                    }
                    if (splitIdx === -1) splitIdx = MAX_LENGTH;
                    chunks.push(remaining.substring(0, splitIdx + 1).trim());
                    remaining = remaining.substring(splitIdx + 1).trim();
                }
            } else {
                chunks.push(textToProcess);
            }

            if (chunkIndex >= chunks.length) {
                if (index + 1 < segments.length) {
                    speak(index + 1, segments, voice, rate, 0);
                } else {
                    stop();
                }
                return;
            }

            const utterance = new SpeechSynthesisUtterance(chunks[chunkIndex]);
            if (voice) utterance.voice = voice;
            utterance.rate = rate;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;

            utterance.onstart = () => {
                setState(prev => ({ ...prev, currentSegmentIndex: index, isPlaying: true }));
            };

            utterance.onend = () => {
                if (isPlayingRef.current) {
                    speak(index, segments, voice, rate, chunkIndex + 1);
                }
            };

            utterance.onerror = (event) => {
                if (event.error !== 'interrupted' && event.error !== 'canceled') {
                    console.error('TTS Error:', event);
                    isPlayingRef.current = false;
                    setState(prev => ({ ...prev, isPlaying: false }));
                }
            };

            utteranceRef.current = utterance;
            synth.speak(utterance);
        }, 20);
    }, [synth, stop]);

    const play = useCallback((segments: TTSSegment[], startIndex: number = 0) => {
        isPlayingRef.current = true;
        acquireWakeLock();
        setState(prev => ({ ...prev, segments, currentSegmentIndex: startIndex, isPlaying: true }));
        speak(startIndex, segments, state.voice, state.rate, 0);
    }, [speak, state.voice, state.rate]);

    const pause = useCallback(() => {
        if (state.provider === 'piper') {
            if (state.isPlaying) {
                isPlayingRef.current = false;
                audioRef.current?.pause();
                releaseWakeLock();
                setState(prev => ({ ...prev, isPlaying: false }));
            } else if (state.currentSegmentIndex !== -1) {
                isPlayingRef.current = true;
                acquireWakeLock();
                setState(prev => ({ ...prev, isPlaying: true }));
                speak(state.currentSegmentIndex, state.segments, state.voice, state.rate, currentChunkIndexRef.current);
            }
            return;
        }

        if (!synth) return;

        if (state.isPlaying) {
            // Requested PAUSE: Cut off immediately
            isPlayingRef.current = false;
            synth.cancel();
            releaseWakeLock();
            setState(prev => ({ ...prev, isPlaying: false }));
        } else {
            // Requested RESUME: Restart from the saved chunk position
            if (state.currentSegmentIndex !== -1) {
                isPlayingRef.current = true;
                acquireWakeLock();
                setState(prev => ({ ...prev, isPlaying: true }));
                speak(state.currentSegmentIndex, state.segments, state.voice, state.rate, currentChunkIndexRef.current);
            }
        }
    }, [synth, state.isPlaying, state.currentSegmentIndex, state.segments, state.voice, state.rate, speak]);

    const next = useCallback(() => {
        if (state.currentSegmentIndex + 1 < state.segments.length) {
            speak(state.currentSegmentIndex + 1, state.segments, state.voice, state.rate, 0);
        } else {
            stop();
        }
    }, [state.currentSegmentIndex, state.segments, state.voice, state.rate, speak, stop]);

    const prev = useCallback(() => {
        if (state.currentSegmentIndex > 0) {
            speak(state.currentSegmentIndex - 1, state.segments, state.voice, state.rate, 0);
        }
    }, [state.currentSegmentIndex, state.segments, state.voice, state.rate, speak]);

    const setVoice = (voice: SpeechSynthesisVoice | null) => {
        if (voice) {
            localStorage.setItem(LS_VOICE, voice.name);
        } else {
            localStorage.removeItem(LS_VOICE);
        }
        setState(prev => ({ ...prev, voice }));
        if (state.isPlaying || synth?.paused) {
            speak(state.currentSegmentIndex, state.segments, voice, state.rate, 0);
        }
    };

    const setRate = (rate: number) => {
        localStorage.setItem(LS_RATE, rate.toString());
        setState(prev => ({ ...prev, rate }));
        if (state.isPlaying || synth?.paused) {
            speak(state.currentSegmentIndex, state.segments, state.voice, rate, 0);
        }
    };

    const setLangFilter = (langFilter: string) => {
        localStorage.setItem(LS_LANG, langFilter);
        setState(prev => ({ ...prev, langFilter }));
    };

    const setLocalOnly = (localOnly: boolean) => {
        localStorage.setItem(LS_LOCAL, localOnly.toString());
        setState(prev => ({ ...prev, localOnly }));
    };

    const setProvider = (provider: TTSProvider) => {
        localStorage.setItem(LS_PROVIDER, provider);
        setState(prev => ({ ...prev, provider, error: null }));
        if (state.isPlaying) stop();
    };

    const setPiperVoiceId = (voiceId: string) => {
        localStorage.setItem(LS_PIPER_VOICE, voiceId);
        setState(prev => ({ ...prev, piperVoiceId: voiceId }));
        if (state.isPlaying) speak(state.currentSegmentIndex, state.segments, state.voice, state.rate, 0);
    };

    const setPiperLang = (lang: string) => {
        localStorage.setItem(LS_PIPER_LANG, lang);
        setState(prev => ({ ...prev, piperLang: lang }));
    };

    const setQuoteVoiceId = (voiceId: string) => {
        localStorage.setItem(LS_PIPER_QUOTE, voiceId);
        setState(prev => ({ ...prev, quoteVoiceId: voiceId }));
        if (state.isPlaying) speak(state.currentSegmentIndex, state.segments, state.voice, state.rate, 0);
    };

    const setSpeakerMapInput = (input: string) => {
        localStorage.setItem(LS_SPEAKER_MAP, input);
        setState(prev => ({ ...prev, speakerMapInput: input }));
        if (state.isPlaying) speak(state.currentSegmentIndex, state.segments, state.voice, state.rate, 0);
    };

    return {
        state,
        availableVoices,
        availablePiperVoices,
        play,
        pause,
        stop,
        next,
        prev,
        setVoice,
        setRate,
        setLangFilter,
        setLocalOnly,
        setProvider,
        setPiperVoiceId,
        setPiperLang,
        setQuoteVoiceId,
        setSpeakerMapInput
    };
}
