/**
 * Piper TTS base URLs — relay-gateway hosts (Caddy → clevertree-tts).
 */

export const DEFAULT_PIPER_API_BASES = [
  'https://atlanta2.relaygateway.net',
  'https://atlanta3.relaygateway.net',
  'https://jp-osa.relaygateway.net',
] as const

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function parseBases(raw: string | undefined): string[] {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return []
  return trimmed
    .split(/\s+/)
    .map((s) => normalizeBaseUrl(s))
    .filter(Boolean)
}

export function getClientPiperApiBaseUrls(): string[] {
  const fromList = parseBases(process.env.NEXT_PUBLIC_PIPER_API_URLS)
  if (fromList.length > 0) return fromList
  const single = normalizeBaseUrl(process.env.NEXT_PUBLIC_PIPER_API_URL ?? '')
  return single ? [single] : [...DEFAULT_PIPER_API_BASES]
}

export function getClientPiperApiSecret(): string {
  return process.env.NEXT_PUBLIC_PIPER_API_SECRET ?? ''
}
