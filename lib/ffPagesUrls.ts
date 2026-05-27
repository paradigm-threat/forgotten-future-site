/**
 * Published content origins (Relay mirrors preferred; GitLab Pages as fallback).
 * Set NEXT_PUBLIC_STORY_RAW_BASE / NEXT_PUBLIC_TEASER_RAW_BASE to override.
 */

/** GitLab Pages fallback when Relay env is unset. */
export const DEFAULT_FF_STORY_PAGES_ORIGIN = 'https://ff-story-6a84a5.gitlab.io'
export const DEFAULT_FF_TEASER_PAGES_ORIGIN = 'https://ff-teaser-12140e.gitlab.io'

/** Example Relay mirrors (set in production env). */
export const EXAMPLE_FF_STORY_RELAY_ORIGIN = 'https://ff-story.atlanta3.relaygateway.net'
export const EXAMPLE_FF_TEASER_RELAY_ORIGIN = 'https://ff-teaser.atlanta3.relaygateway.net'
