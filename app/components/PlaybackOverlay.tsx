'use client';

import React from 'react';
import { TTSState, PiperVoice, TTSProvider } from '../../lib/hooks/useTTS';

interface PlaybackOverlayProps {
    state: TTSState;
    availableVoices: SpeechSynthesisVoice[];
    availablePiperVoices: PiperVoice[];
    onPause: () => void;
    onStop: () => void;
    onNext: () => void;
    onPrev: () => void;
    onJumpToChapter: (index: number) => void;
    onSetVoice: (voice: SpeechSynthesisVoice) => void;
    onSetRate: (rate: number) => void;
    onSetLangFilter: (lang: string) => void;
    onSetLocalOnly: (local: boolean) => void;
    onSetProvider: (provider: TTSProvider) => void;
    onSetPiperVoiceId: (voiceId: string) => void;
    onSetPiperLang: (lang: string) => void;
    onSetQuoteVoiceId: (voiceId: string) => void;
    onSetSpeakerMapInput: (input: string) => void;
}

export function PlaybackOverlay({
    state,
    availableVoices,
    availablePiperVoices,
    onPause,
    onStop,
    onNext,
    onPrev,
    onJumpToChapter,
    onSetVoice,
    onSetRate,
    onSetLangFilter,
    onSetLocalOnly,
    onSetProvider,
    onSetPiperVoiceId,
    onSetPiperLang,
    onSetQuoteVoiceId,
    onSetSpeakerMapInput
}: PlaybackOverlayProps) {
    if (state.currentSegmentIndex === -1) return null;

    const currentSegment = state.segments[state.currentSegmentIndex];

    const filteredVoices = availableVoices.filter(v => {
        const langMatch = state.langFilter === 'all' || v.lang.startsWith(state.langFilter);
        const localMatch = !state.localOnly || v.localService === true;
        return langMatch && localMatch;
    });

    const piperLanguages = Array.from(new Set(availablePiperVoices.map(v => v.lang))).sort();
    const filteredPiperVoices = availablePiperVoices.filter(v => !state.piperLang || v.lang === state.piperLang);

    const languages = Array.from(new Set(availableVoices.map(v => v.lang.split('-')[0]))).sort();

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-2xl animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="bg-black/90 border border-cyan-500/50 backdrop-blur-md rounded-xl shadow-2xl shadow-cyan-500/20 p-4 flex flex-col gap-3">

                {/* Header: Segment Title & Close */}
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">Aether-Drive Audio Link</span>
                        <div className="flex items-center gap-2">
                            {state.segments.length > 1 && (
                                <div className="relative group/chapter">
                                    <select
                                        value={state.currentSegmentIndex}
                                        onChange={(e) => {
                                            const idx = parseInt(e.target.value);
                                            onJumpToChapter(idx);
                                        }}
                                        className="appearance-none bg-cyan-500/10 hover:bg-cyan-500/30 text-cyan-400 text-[10px] font-black px-2 py-1.5 rounded border border-cyan-500/20 transition-colors pr-6 cursor-pointer outline-none focus:border-cyan-400/50"
                                        title="Jump to Section..."
                                    >
                                        {state.segments.map((s, idx) => (
                                            <option key={idx} value={idx} className="bg-neutral-900 text-white">
                                                {idx + 1}. {s.title}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-cyan-400/50">
                                        ▼
                                    </div>
                                </div>
                            )}
                            <span className="text-sm font-medium text-white truncate max-w-[150px] md:max-w-md">
                                {currentSegment?.title || 'Synthesis...'}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={onStop}
                        className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-muted hover:text-white"
                        title="Close Link"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Controls & Voice Selection */}
                <div className="flex flex-wrap items-center justify-between gap-4">
                    {state.error && (
                        <div className="w-full bg-red-950/70 border border-red-500/40 text-red-100 px-4 py-2 rounded-lg text-xs flex items-center gap-3">
                            <span>{state.error}</span>
                            {state.provider === 'piper' && (
                                <button
                                    onClick={() => onSetProvider('webSpeech')}
                                    className="ml-auto bg-red-500/20 hover:bg-red-500/30 text-red-100 text-[10px] uppercase tracking-widest px-3 py-1.5 rounded"
                                >
                                    Use Speech API
                                </button>
                            )}
                        </div>
                    )}

                    {/* Media Controls */}
                    <div className="flex items-center gap-2">
                        <button onClick={onPrev} className="control-btn p-2" title="Previous">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                            </svg>
                        </button>

                        <button
                            onClick={onPause}
                            className="p-3 bg-cyan-500 hover:bg-cyan-400 rounded-full text-black shadow-lg shadow-cyan-500/50 active:scale-95 transition-all"
                            title={state.isPlaying ? "Pause" : "Resume"}
                        >
                            {state.isPlaying ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                </svg>
                            )}
                        </button>

                        <button onClick={onNext} className="control-btn p-2" title="Next">
                            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z" />
                            </svg>
                        </button>
                    </div>

                    {/* Voice & Speed */}
                    <div className="flex items-center gap-3 flex-grow md:justify-end">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/20 rounded px-2 py-1">
                            <select
                                value={state.provider}
                                onChange={(e) => onSetProvider(e.target.value as TTSProvider)}
                                className="bg-transparent text-[10px] text-cyan-400 font-bold uppercase tracking-widest focus:outline-none"
                                title="TTS Provider"
                            >
                                <option value="piper">PIPER</option>
                                <option value="webSpeech">SPEECH API</option>
                            </select>
                        </div>

                        {state.provider === 'piper' ? (
                            <>
                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/20 rounded px-2 py-1">
                                    <select
                                        value={state.piperLang}
                                        onChange={(e) => onSetPiperLang(e.target.value)}
                                        className="bg-transparent text-[10px] text-cyan-400 font-bold uppercase tracking-widest focus:outline-none"
                                        title="Piper Language"
                                    >
                                        {piperLanguages.map(lang => (
                                            <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                                        ))}
                                    </select>
                                </div>

                                <select
                                    value={state.piperVoiceId}
                                    onChange={(e) => onSetPiperVoiceId(e.target.value)}
                                    className="bg-white/5 border border-white/20 text-xs text-secondary rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 max-w-[140px] md:max-w-[220px]"
                                    title="Narrator Voice"
                                >
                                    {filteredPiperVoices.map(voice => (
                                        <option key={voice.id} value={voice.id} className="bg-black text-white">
                                            {voice.name}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={state.quoteVoiceId}
                                    onChange={(e) => onSetQuoteVoiceId(e.target.value)}
                                    className="bg-white/5 border border-white/20 text-xs text-secondary rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 max-w-[140px] md:max-w-[220px]"
                                    title="Quote Voice"
                                >
                                    <option value="" className="bg-black text-white">Quotes: Narrator</option>
                                    {filteredPiperVoices.map(voice => (
                                        <option key={voice.id} value={voice.id} className="bg-black text-white">
                                            Quotes: {voice.name}
                                        </option>
                                    ))}
                                </select>

                                <input
                                    value={state.speakerMapInput}
                                    onChange={(e) => onSetSpeakerMapInput(e.target.value)}
                                    placeholder="alice=en_US, bob=en_US"
                                    className="bg-white/5 border border-white/20 text-[10px] text-cyan-400 rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 w-[200px] placeholder:text-cyan-400/40"
                                    title="Speaker map: name=voiceId"
                                />
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 bg-white/5 border border-white/20 rounded px-2 py-1">
                                    <select
                                        value={state.langFilter}
                                        onChange={(e) => onSetLangFilter(e.target.value)}
                                        className="bg-transparent text-[10px] text-cyan-400 font-bold uppercase tracking-widest focus:outline-none"
                                        title="Filter by Language"
                                    >
                                        <option value="all">ALL LANG</option>
                                        {languages.map(lang => (
                                            <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                                        ))}
                                    </select>
                                    <div className="w-px h-3 bg-white/20" />
                                    <button
                                        onClick={() => onSetLocalOnly(!state.localOnly)}
                                        className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${state.localOnly ? 'text-cyan-400' : 'text-muted hover:text-white'}`}
                                        title="Toggle Local Service Only"
                                    >
                                        Local
                                    </button>
                                </div>

                                <select
                                    value={state.voice?.name || ''}
                                    onChange={(e) => {
                                        if (e.target.value === '') {
                                            onSetVoice(null as any);
                                            return;
                                        }
                                        const v = availableVoices.find(v => v.name === e.target.value);
                                        if (v) onSetVoice(v);
                                    }}
                                    className="bg-white/5 border border-white/20 text-xs text-secondary rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500 max-w-[120px] md:max-w-[200px]"
                                >
                                    <option value="" className="bg-black text-white">System Default</option>
                                    {filteredVoices.length === 0 ? (
                                        <option disabled>No matches</option>
                                    ) : (
                                        filteredVoices.map(voice => (
                                            <option key={voice.name} value={voice.name} className="bg-black text-white">
                                                {voice.name} {voice.localService ? '🏠' : '🌐'}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </>
                        )}

                        <select
                            value={state.rate}
                            onChange={(e) => onSetRate(parseFloat(e.target.value))}
                            className="bg-white/5 border border-white/20 text-xs text-secondary rounded px-2 py-1.5 focus:outline-none focus:border-cyan-500"
                        >
                            {[0.75, 1.0, 1.25, 1.5, 2.0].map(rate => (
                                <option key={rate} value={rate} className="bg-black text-white">
                                    {rate}x
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <style jsx>{`
                .control-btn {
                    @apply hover:bg-white/10 rounded-full transition-colors active:scale-95;
                }
            `}</style>
        </div>
    );
}
