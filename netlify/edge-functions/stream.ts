const VIDEO_ID = Deno.env.get("YOUTUBE_VIDEO_ID") || "tRsQsTMvPNg";
const ITAG = Deno.env.get("AUDIO_ITAG") || "140";
const PIPED = (Deno.env.get("PIPED_INSTANCES") || "https://pipedapi.kavin.rocks").split(",").map((s) => s.trim()).filter(Boolean);
const INVIDIOUS = (Deno.env.get("INVIDIOUS_INSTANCES") || "https://inv.nadeko.net").split(",").map((s) => s.trim()).filter(Boolean);
const FALLBACK = Deno.env.get("FALLBACK_AUDIO_URL");
const TTL = 2 * 60 * 1000;

let cache: { url: string; at: number } | null = null;

async function tryPiped(instance: string): Promise<string | null> {
  try {
    const res = await fetch(`${instance}/streams/${VIDEO_ID}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const streams = data.audioStreams || [];
    const pick = streams.find((s: any) => /mp4|m4a/i.test(s.mimeType || s.codec || "")) || streams[0];
    return pick?.url || null;
  } catch {
    return null;
  }
}

async function tryInvidious(instance: string): Promise<string | null> {
  try {
    const url = `${instance}/latest_version?id=${VIDEO_ID}&itag=${ITAG}&local=true`;
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    return res.url || url;
  } catch {
    return null;
  }
}

async function resolve(force = false): Promise<string> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.url;
  for (const i of PIPED) {
    const u = await tryPiped(i);
    if (u) { cache = { url: u, at: Date.now() }; return u; }
  }
  for (const i of INVIDIOUS) {
    const u = await tryInvidious(i);
    if (u) { cache = { url: u, at: Date.now() }; return u; }
  }
  if (FALLBACK) { cache = { url: FALLBACK, at: Date.now() }; return FALLBACK; }
  throw new Error("no audio source");
}

export default async (request: Request) => {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  let audioUrl: string;
  try {
    audioUrl = await resolve(force);
  } catch {
    return new Response("stream unavailable", { status: 503 });
  }
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;
  let upstream: Response;
  try {
    upstream = await fetch(audioUrl, { headers });
  } catch {
    return new Response("upstream error", { status: 502 });
  }
  if (!upstream.ok) {
    try {
      audioUrl = await resolve(true);
      upstream = await fetch(audioUrl, { headers });
    } catch {}
  }
  const respHeaders = new Headers();
  respHeaders.set("Content-Type", upstream.headers.get("content-type") || "audio/mp4");
  respHeaders.set("Cache-Control", "no-store");
  respHeaders.set("Access-Control-Allow-Origin", "*");
  const cl = upstream.headers.get("content-length");
  if (cl) respHeaders.set("Content-Length", cl);
  const ar = upstream.headers.get("accept-ranges");
  if (ar) respHeaders.set("Accept-Ranges", ar);
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
};
