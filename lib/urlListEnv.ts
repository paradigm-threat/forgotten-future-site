/**
 * Multi-origin env vars use whitespace as delimiter.
 * NEXT_PUBLIC_STORY_RAW_BASE / NEXT_PUBLIC_STORY_BASE_URL — ff-story mirrors.
 * NEXT_PUBLIC_TEASER_RAW_BASE / NEXT_PUBLIC_TEASER_BASE_URL — ff-teaser mirrors.
 */

import {
  DEFAULT_FF_STORY_PAGES_ORIGIN,
  DEFAULT_FF_TEASER_PAGES_ORIGIN,
} from '@/lib/ffPagesUrls'

function normalizeOrigin(s: string): string {
  return s.trim().replace(/\/+$/, '')
}

export function parseUrlList(raw: string | undefined, fallback?: string): string[] {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) {
    return fallback ? [normalizeOrigin(fallback)] : []
  }
  const parts = trimmed
    .split(/\s+/)
    .map((s) => normalizeOrigin(s))
    .filter(Boolean)
  return parts.length > 0 ? parts : fallback ? [normalizeOrigin(fallback)] : []
}

function storyEnvRaw(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_STORY_RAW_BASE?.trim() ||
    process.env.NEXT_PUBLIC_STORY_BASE_URL?.trim() ||
    undefined
  )
}

function teaserEnvRaw(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_TEASER_RAW_BASE?.trim() ||
    process.env.NEXT_PUBLIC_TEASER_BASE_URL?.trim() ||
    undefined
  )
}

function withFallbackOrigin(origins: string[], fallback: string): string[] {
  const normalized = normalizeOrigin(fallback)
  return origins.includes(normalized) ? origins : [...origins, normalized]
}

export function getStoryBaseUrlList(): string[] {
  return withFallbackOrigin(
    parseUrlList(storyEnvRaw(), DEFAULT_FF_STORY_PAGES_ORIGIN),
    DEFAULT_FF_STORY_PAGES_ORIGIN,
  )
}

export function getPrimaryStoryBaseUrl(): string {
  return getStoryBaseUrlList()[0] || DEFAULT_FF_STORY_PAGES_ORIGIN
}

export function getTeaserBaseUrlList(): string[] {
  return withFallbackOrigin(
    parseUrlList(teaserEnvRaw(), DEFAULT_FF_TEASER_PAGES_ORIGIN),
    DEFAULT_FF_TEASER_PAGES_ORIGIN,
  )
}

export function getPrimaryTeaserBaseUrl(): string {
  return getTeaserBaseUrlList()[0] || DEFAULT_FF_TEASER_PAGES_ORIGIN
}

export function isRelayOrigin(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.relaygateway.net')
  } catch {
    return false
  }
}
