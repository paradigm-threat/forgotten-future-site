/**
 * Browser-side Piper TTS — direct to relay-gateway hosts (no Vercel proxy).
 */

import {
  getClientPiperApiBaseUrls,
  getClientPiperApiSecret,
} from '@/lib/tts/piperBases'

export interface PiperVoicesPayload {
  voices: unknown[]
  defaultVoiceId: string | null
}

function piperAuthHeaders(): Record<string, string> {
  const secret = getClientPiperApiSecret()
  if (!secret) return {}
  return { Authorization: `Bearer ${secret}` }
}

function shouldFailoverToNextHost(status: number): boolean {
  return status === 429 || status >= 500
}

export function isClientPiperConfigured(): boolean {
  return getClientPiperApiBaseUrls().length > 0
}

export async function fetchPiperTtsBlob(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  timeoutMs = 28_000,
): Promise<Blob> {
  const bases = getClientPiperApiBaseUrls()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...piperAuthHeaders(),
  }
  const payload = JSON.stringify(body)

  let lastResponse: Response | undefined
  let lastThrown: unknown

  for (const base of bases) {
    const url = `${base}/tts`
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: signal ?? AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return res.blob()
      lastResponse = res
      if (!shouldFailoverToNextHost(res.status)) break
    } catch (e) {
      lastThrown = e
      if (signal?.aborted) throw e
    }
  }

  if (lastResponse) {
    let detail = `HTTP ${lastResponse.status}`
    try {
      const errBody = await lastResponse.json()
      if (errBody && typeof errBody === 'object' && 'error' in errBody) {
        detail = String((errBody as { error: unknown }).error)
      }
    } catch {
      /* ignore */
    }
    throw new Error(`Piper API error: ${detail}`)
  }
  const msg =
    lastThrown instanceof Error ? lastThrown.message : String(lastThrown ?? 'unknown')
  throw new Error(`All Piper TTS upstreams failed: ${msg}`)
}

export async function aggregateClientPiperVoices(
  timeoutMs = 15_000,
): Promise<PiperVoicesPayload> {
  const bases = getClientPiperApiBaseUrls()
  const headers: Record<string, string> = {
    'Cache-Control': 'no-cache',
    ...piperAuthHeaders(),
  }
  const byId = new Map<string, unknown>()
  let defaultVoiceId: string | null = null

  for (const base of bases) {
    const url = `${base}/voices`
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) continue
      const data = (await res.json()) as {
        voices?: unknown[]
        defaultVoiceId?: string | null
      }
      const voices = Array.isArray(data.voices) ? data.voices : []
      if (defaultVoiceId == null && data.defaultVoiceId != null) {
        defaultVoiceId =
          typeof data.defaultVoiceId === 'string' ? data.defaultVoiceId : null
      }
      for (const v of voices) {
        if (
          v &&
          typeof v === 'object' &&
          'id' in v &&
          typeof (v as { id: unknown }).id === 'string'
        ) {
          const id = (v as { id: string }).id
          if (!byId.has(id)) byId.set(id, v)
        }
      }
    } catch {
      /* try next host */
    }
  }

  return { voices: Array.from(byId.values()), defaultVoiceId }
}
