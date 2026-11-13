# Claude FM Radio (Netlify)

Lightweight Netlify edge proxy that exposes the Claude FM YouTube live stream as an
audio URL ingestible by radio-browser.info.

## Deploy

1. Push this repo to GitHub/GitLab.
2. Create a Netlify site from the repo.
3. Set env vars (optional): `YOUTUBE_VIDEO_ID`, `PIPED_INSTANCES`, `INVIDIOUS_INSTANCES`,
   `AUDIO_ITAG`, `FALLBACK_AUDIO_URL`.
4. Deploy. Stream URL: `https://<site>/stream` (or `/radio.m3u`).

## radio-browser.info

Register `https://<site>/stream` as the station stream URL. `/health` reports liveness.
