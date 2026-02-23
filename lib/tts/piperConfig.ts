/**
 * Piper TTS config — proxies to a remote clevertree-tts-server instance.
 * Set PIPER_API_URL and PIPER_API_SECRET in your environment.
 */

export const PIPER_API_URL = process.env.PIPER_API_URL ?? '';
export const PIPER_API_SECRET = process.env.PIPER_API_SECRET ?? '';

export function isPiperConfigured(): boolean {
    return !!PIPER_API_URL;
}
