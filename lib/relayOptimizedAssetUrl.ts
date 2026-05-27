/**
 * Build display URLs for ff-story / ff-teaser assets on Relay mirrors (`?w=` → WebP).
 */

import {
  getPrimaryStoryBaseUrl,
  getPrimaryTeaserBaseUrl,
  getStoryBaseUrlList,
  getTeaserBaseUrlList,
  isRelayOrigin,
} from '@/lib/urlListEnv'
import {
  DEFAULT_FF_STORY_PAGES_ORIGIN,
  DEFAULT_FF_TEASER_PAGES_ORIGIN,
} from '@/lib/ffPagesUrls'

const MAX_DISPLAY_W = 8192

export type FfAssetRepo = 'story' | 'teaser'

function clampWidth(w: number): number {
  if (!Number.isFinite(w) || w < 1) return 1
  return Math.min(Math.floor(w), MAX_DISPLAY_W)
}

function encodePathSegments(relPath: string): string {
  const norm = relPath.replace(/^\/+/, '')
  if (!norm) return ''
  return norm
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function pathIsSvg(pathForAPI: string): boolean {
  const clean = pathForAPI.split('?')[0]
  const lower = clean.toLowerCase()
  if (lower.endsWith('.svg')) return true
  if (pathForAPI.startsWith('http')) {
    try {
      return new URL(pathForAPI).pathname.toLowerCase().endsWith('.svg')
    } catch {
      return false
    }
  }
  return false
}

function primaryBaseForRepo(repo: FfAssetRepo): string {
  return repo === 'teaser' ? getPrimaryTeaserBaseUrl() : getPrimaryStoryBaseUrl()
}

function basesForRepo(repo: FfAssetRepo): string[] {
  return repo === 'teaser' ? getTeaserBaseUrlList() : getStoryBaseUrlList()
}

/** Infer repo from absolute URL host (GitLab Pages or Relay). */
export function inferRepoFromAbsoluteUrl(url: string): FfAssetRepo | null {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host.includes('ff-teaser') || host === new URL(DEFAULT_FF_TEASER_PAGES_ORIGIN).hostname.toLowerCase()) {
      return 'teaser'
    }
    if (host.includes('ff-story') || host === new URL(DEFAULT_FF_STORY_PAGES_ORIGIN).hostname.toLowerCase()) {
      return 'story'
    }
  } catch {
    /* ignore */
  }
  return null
}

function appendWidthQuery(absoluteUrl: string, w: number): string {
  const u = new URL(absoluteUrl)
  u.searchParams.set('w', String(clampWidth(w)))
  return u.toString()
}

function absoluteMirrorUrl(pathForAPI: string, repo: FfAssetRepo): string {
  if (pathForAPI.startsWith('http')) {
    const u = new URL(pathForAPI)
    const inferred = inferRepoFromAbsoluteUrl(pathForAPI) ?? repo
    const base = primaryBaseForRepo(inferred).replace(/\/+$/, '')
    const pathname = u.pathname.replace(/^\/+/, '')
    return `${base}/${encodePathSegments(pathname)}`
  }
  const norm = pathForAPI.split('?')[0].replace(/^\/+/, '')
  const base = primaryBaseForRepo(repo).replace(/\/+$/, '')
  return `${base}/${encodePathSegments(norm)}`
}

/**
 * Raster → Relay mirror + `?w=`; SVG → mirror without `?w=`.
 * `pathForAPI` is repo-relative or absolute story/teaser URL.
 */
export function buildOptimizedAssetUrl(
  pathForAPI: string,
  width?: number,
  repo: FfAssetRepo = 'story',
): string {
  const isSvg = pathIsSvg(pathForAPI)
  const absolute = absoluteMirrorUrl(pathForAPI, repo)

  if (isSvg) {
    return absolute.split('?')[0]
  }

  const w = width === undefined ? 800 : clampWidth(width)
  return appendWidthQuery(absolute.split('?')[0], w)
}

export { isRelayOrigin }

export function listOptimizedAssetUrls(
  pathForAPI: string,
  width?: number,
  repo: FfAssetRepo = 'story',
): string[] {
  if (pathForAPI.startsWith('http')) {
    return [buildOptimizedAssetUrl(pathForAPI, width, repo)]
  }
  const norm = pathForAPI.split('?')[0].replace(/^\/+/, '')
  const bases = basesForRepo(repo)
  const isSvg = pathIsSvg(pathForAPI)
  const w = width === undefined ? 800 : clampWidth(width)
  return bases.map((base) => {
    const absolute = `${base.replace(/\/+$/, '')}/${encodePathSegments(norm)}`
    if (isSvg) return absolute
    return appendWidthQuery(absolute, w)
  })
}
