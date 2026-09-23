# Forgotten Future — Relay mirrors, zero Vercel API

Production builds are **static** (`NEXT_PUBLIC_IS_STATIC=true`). The site loads **ff-story** (and optionally **ff-teaser**) from **Relay** mirrors; rasters use `?w=` WebP from `server.hooks.get` on those repos.

## Content repos

- **ff-story** / **ff-teaser**: `.relay.yaml` + `hooks/server/get.cs` (see paradigm-threat-files).
- Registered in **relay-master** catalog (`catalog/repos/ff-story.json`, `ff-teaser.json`).

## Site env

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_STORY_RAW_BASE` | ff-story mirror URL(s) |
| `NEXT_PUBLIC_TEASER_RAW_BASE` | ff-teaser mirror URL(s) |
| `NEXT_PUBLIC_PIPER_API_URLS` | Relay TTS hosts (browser → `/tts`, `/voices`) |

## Removed serverless routes

The `app/api/` tree is **removed** from the repo (and from CI artifacts). Legacy `/api/*` URLs must not be used. Use Relay mirrors and `lib/relayOptimizedAssetUrl.ts` instead.

## Build

```bash
node scripts/fetch-git-history.mjs   # RepoStatus cards
NEXT_PUBLIC_IS_STATIC=true npm run build
```

GitLab CI runs `fetch-git-history.mjs` before build and removes `app/api`.

## Fleet cutover

1. Push ff-story / ff-teaser with Relay hooks to fleet.
2. Set CI/CD variables `FF_STORY_PAGES_URL` / `FF_TEASER_PAGES_URL` to Relay hostnames.
3. Verify: `curl -sSI 'https://ff-story.ord1.relaygateway.net/<path>.png?w=400'` → `image/webp`.
