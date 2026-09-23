const DEFAULT_TIMEOUT_MS = 5000

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeoutId))
}

/** Try URLs in priority order; skip timeouts, TLS, and non-OK responses. */
export async function fetchFirstOk(
  urls: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ url: string; text: string } | null> {
  const seen = new Set<string>()
  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    try {
      const response = await fetchWithTimeout(url, timeoutMs)
      if (!response.ok) continue
      const text = await response.text()
      if (text.trim().length > 0) {
        return { url, text }
      }
    } catch (error) {
      console.warn(`[fetchFirstOk] ${url}:`, error)
    }
  }
  return null
}
