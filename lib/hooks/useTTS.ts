'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TTSSegment {
    id: string | number;
    title: string;
    text: string;
}

export interface TTSState {
    isPlaying: boolean;
    currentSegmentIndex: number;
    segments: TTSSegment[];
    voice: SpeechSynthesisVoice | null;
    rate: number;
    langFilter: string;
    localOnly: boolean;
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
    });

    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
    const cancelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isPlayingRef = useRef(false);
    const currentChunkIndexRef = useRef(0);

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
        const savedRate = localStorage.getItem('ff-tts-rate');
        const savedLang = localStorage.getItem('ff-tts-lang');
        const savedLocalOnly = localStorage.getItem('ff-tts-local-only');
        if (savedRate || savedLang || savedLocalOnly) {
            setState(prev => ({
                ...prev,
                rate: savedRate ? parseFloat(savedRate) : prev.rate,
                langFilter: savedLang ? savedLang : prev.langFilter,
                localOnly: savedLocalOnly === 'true' ? true : savedLocalOnly === 'false' ? false : prev.localOnly
            }));
        }
    }, []);

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
            const savedVoiceName = localStorage.getItem('ff-tts-voice');
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

    const stop = useCallback(() => {
        if (!synth) return;
        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        synth.cancel();
        isPlayingRef.current = false;
        currentChunkIndexRef.current = 0;
        setState(prev => ({ ...prev, isPlaying: false, currentSegmentIndex: -1 }));
    }, [synth]);

    const highlightSegment = (index: number) => {
        setState(prev => ({ ...prev, currentSegmentIndex: index, isPlaying: true }));
    };

    const speak = useCallback((index: number, segments: TTSSegment[], voice: SpeechSynthesisVoice | null, rate: number, chunkIndex: number = 0) => {
        if (!synth || !segments[index]) {
            stop();
            return;
        }

        // Check if we should still be playing
        if (!isPlayingRef.current) {
            return;
        }

        currentChunkIndexRef.current = chunkIndex;

        if (cancelTimeoutRef.current) clearTimeout(cancelTimeoutRef.current);
        synth.cancel();

        // Small delay to ensure browser cleared the voice queue
        cancelTimeoutRef.current = setTimeout(() => {
            // Check status again after timeout
            if (!isPlayingRef.current) return;

            // Clean text
            const rawText = segments[index].text
                .replace(/[#*_~`\[\]()]/g, ' ')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            // Internal chunking for stability (3000 chars is safe)
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
                // Move to next segment
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
                // Ignore interrupted/canceled as we do that manually
                if (event.error !== 'interrupted' && event.error !== 'canceled') {
                    console.error('TTS Error:', event);
                    isPlayingRef.current = false;
                    setState(prev => ({ ...prev, isPlaying: false }));
                }
            };

            utteranceRef.current = utterance;
            synth.speak(utterance);
        }, 50);
    }, [synth, stop]);

    const play = useCallback((segments: TTSSegment[], startIndex: number = 0) => {
        isPlayingRef.current = true;
        setState(prev => ({ ...prev, segments, currentSegmentIndex: startIndex, isPlaying: true }));
        speak(startIndex, segments, state.voice, state.rate, 0);
    }, [speak, state.voice, state.rate]);

    const pause = useCallback(() => {
        if (!synth) return;

        if (state.isPlaying) {
            // Requested PAUSE: Cut off immediately
            isPlayingRef.current = false;
            synth.cancel(); // Most reliable way to kill audio immediately, especially on Linux
            setState(prev => ({ ...prev, isPlaying: false }));
        } else {
            // Requested RESUME: Restart from the saved chunk position
            if (state.currentSegmentIndex !== -1) {
                isPlayingRef.current = true;
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
            localStorage.setItem('ff-tts-voice', voice.name);
        } else {
            localStorage.removeItem('ff-tts-voice');
        }
        setState(prev => ({ ...prev, voice }));
        if (state.isPlaying || synth?.paused) {
            speak(state.currentSegmentIndex, state.segments, voice, state.rate, 0);
        }
    };

    const setRate = (rate: number) => {
        localStorage.setItem('ff-tts-rate', rate.toString());
        setState(prev => ({ ...prev, rate }));
        if (state.isPlaying || synth?.paused) {
            speak(state.currentSegmentIndex, state.segments, state.voice, rate, 0);
        }
    };

    const setLangFilter = (langFilter: string) => {
        localStorage.setItem('ff-tts-lang', langFilter);
        setState(prev => ({ ...prev, langFilter }));
    };

    const setLocalOnly = (localOnly: boolean) => {
        localStorage.setItem('ff-tts-local-only', localOnly.toString());
        setState(prev => ({ ...prev, localOnly }));
    };

    return {
        state,
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
    };
}
