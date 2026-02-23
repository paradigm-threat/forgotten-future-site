import { NextResponse } from 'next/server';
import { PIPER_API_URL, isPiperConfigured } from '@/lib/tts/piperConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
    if (!isPiperConfigured()) {
        return NextResponse.json({ voices: [], defaultVoiceId: null });
    }

    try {
        const upstream = await fetch(`${PIPER_API_URL}/voices`, {
            headers: { 'Cache-Control': 'no-cache' },
        });

        if (!upstream.ok) {
            console.error(`[TTS VOICES] Upstream returned ${upstream.status}`);
            return NextResponse.json({ voices: [], defaultVoiceId: null });
        }

        const data = await upstream.json();
        return NextResponse.json(data);
    } catch (err) {
        console.error('[TTS VOICES]', err instanceof Error ? err.message : err);
        return NextResponse.json({ voices: [], defaultVoiceId: null });
    }
}
