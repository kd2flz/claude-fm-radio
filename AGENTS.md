# AGENTS.md

Netlify edge-function project exposing Claude FM (YouTube live) as an audio stream
for radio-browser.info. No build/test toolchain; deploy via Netlify.

## Structure

- `netlify/edge-functions/stream.ts` — `/stream`: resolves audio URL and streams bytes.
- `netlify/edge-functions/health.ts` — `/health`.
- `public/` — static site + `radio.m3u` playlist.
- `netlify.toml` — publish dir and edge function routes.

## Key facts

- Edge functions are Deno; use standard Web APIs only (no Node modules).
- Audio resolution tries Piped instances, then Invidious, then `FALLBACK_AUDIO_URL`.
- Module-level cache TTL is 2 minutes; `?refresh=1` bypasses cache.
- YouTube audio URLs are IP-bound, so bytes must be proxied (not redirected).
- Netlify edge execution has ~50s limits; clients auto-reconnect.
- Portability: all config via env vars; no Netlify-specific storage used.

## Deploy

Connect repo to Netlify; set env vars in dashboard; deploy. Stream URL: `/stream`.
