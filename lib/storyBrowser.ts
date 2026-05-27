import { getPrimaryStoryBaseUrl } from '@/lib/urlListEnv'

const DEFAULT_STORY_WEB_BLOB_BASE = 'https://gitlab.com/clevertree/ff-story/-/blob/main'

function normalizeTrailingSlash(value: string, trailing: boolean): string {
  const v = value.replace(/\/$/, '')
  return trailing ? `${v}/` : v
}

/** ff-story mirror origin (Relay or GitLab Pages). Required for browser/manuscript. */
export function getStoryRawBase(): string {
  return normalizeTrailingSlash(getPrimaryStoryBaseUrl(), false)
}

export function getBrowserEndpoint(path?: string): string {
  const rawBase = getStoryRawBase()
  if (!path) return `${rawBase}/index.json`
  return getStoryAssetUrl(path)
}

export function getStoryAssetUrl(path: string): string {
  const rawBase = getStoryRawBase()
  const p = path.replace(/^\/+/, '')
  return `${rawBase}/${p}`
}

export function getStoryAssetBase(path: string): string {
  const normalized = path.endsWith('/') ? path : `${path}/`
  return getStoryAssetUrl(normalized)
}

/** Web UI link to the story file (GitLab blob view by default). */
export function getStorySourceWebUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_STORY_WEB_BLOB_BASE?.trim().replace(/\/$/, '') ||
    DEFAULT_STORY_WEB_BLOB_BASE
  const p = path.replace(/^\/+/, '')
  return `${base}/${p}`
}

/** @deprecated Use getStorySourceWebUrl */
export function getStoryGitHubUrl(path: string): string {
  return getStorySourceWebUrl(path)
}
