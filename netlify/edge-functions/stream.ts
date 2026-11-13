const VIDEO_ID = Deno.env.get("YOUTUBE_VIDEO_ID") || "tRsQsTMvPNg";
const PREFERRED_ITAG = Deno.env.get("AUDIO_ITAG") || "140";
const PIPED = (Deno.env.get("PIPED_INSTANCES") || "https://pipedapi.kavin.rocks").split(",").map((s) => s.trim()).filter(Boolean);
const INVIDIOUS = (Deno.env.get("INVIDIOUS_INSTANCES") || "https://inv.nadeko.net").split(",").map((s) => s.trim()).filter(Boolean);
const FALLBACK = Deno.env.get("FALLBACK_AUDIO_URL");
const TTL = 2 * 60 * 1000;
const INNER_TUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

const PROFILES = [
  {
    name: "ANDROID",
    clientName: "ANDROID",
    clientVersion: "20.10.38",
    clientHeader: "3",
    userAgent: "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
    extra: { androidSdkVersion: 34 },
  },
  {
    name: "IOS",
    clientName: "IOS",
    clientVersion: "20.10.38",
    clientHeader: "5",
    userAgent: "com.google.ios.youtube/20.10.38 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iOS", osVersion: "18.0" },
  },
];

let cache: { url: string; at: number } | null = null;
let lastGood: string | null = null;

async function tryInnerTube(profile: typeof PROFILES[number], apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": profile.userAgent,
        "X-YouTube-Client-Name": profile.clientHeader,
        "X-YouTube-Client-Version": profile.clientVersion,
        "Accept-Language": "en-US,en;q=0.9",
      },
      body: JSON.stringify({
        context: { client: { clientName: profile.clientName, clientVersion: profile.clientVersion, hl: "en", gl: "US", ...profile.extra } },
        videoId: VIDEO_ID,
        contentCheckOk: true,
        racyCheckOk: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const status = data?.playabilityStatus?.status;
    if (status && status !== "OK") return null;
    const formats = data?.streamingData?.adaptiveFormats || data?.streamingData?.formats || [];
    const audio = formats.filter((f: any) => String(f?.mimeType || "").toLowerCase().startsWith("audio/"));
    const pool = audio.length ? audio : formats;
    const direct = pool.filter((f: any) => typeof f?.url === "string" && f.url);
    if (!direct.length) return null;
    const preferred = direct.find((f: any) => String(f.itag) === PREFERRED_ITAG);
    if (preferred?.url) return preferred.url;
    for (const itag of ["140", "139", "251", "250", "249"]) {
      const m = direct.find((f: any) => String(f.itag) === itag);
      if (m?.url) return m.url;
    }
    return direct[0]?.url || null;
  } catch {
    return null;
  }
}

async function fetchApiKeyFromWatchPage(): Promise<string> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${VIDEO_ID}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return INNER_TUBE_KEY;
    const html = await res.text();
    const m = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
    return m?.[1] || INNER_TUBE_KEY;
  } catch {
    return INNER_TUBE_KEY;
  }
}

async function tryPiped(instance: string): Promise<string | null> {
  try {
    const res = await fetch(`${instance}/streams/${VIDEO_ID}`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
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
    const url = `${instance}/latest_version?id=${VIDEO_ID}&itag=${PREFERRED_ITAG}&local=true`;
    const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return res.url || url;
  } catch {
    return null;
  }
}

async function resolve(force = false): Promise<string> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.url;

  let apiKey = INNER_TUBE_KEY;
  for (const profile of PROFILES) {
    const u = await tryInnerTube(profile, apiKey);
    if (u) { cache = { url: u, at: Date.now() }; lastGood = u; return u; }
  }
  apiKey = await fetchApiKeyFromWatchPage();
  for (const profile of PROFILES) {
    const u = await tryInnerTube(profile, apiKey);
    if (u) { cache = { url: u, at: Date.now() }; lastGood = u; return u; }
  }

  for (const i of PIPED) {
    const u = await tryPiped(i);
    if (u) { cache = { url: u, at: Date.now() }; lastGood = u; return u; }
  }
  for (const i of INVIDIOUS) {
    const u = await tryInvidious(i);
    if (u) { cache = { url: u, at: Date.now() }; lastGood = u; return u; }
  }
  if (FALLBACK) { cache = { url: FALLBACK, at: Date.now() }; lastGood = FALLBACK; return FALLBACK; }
  if (lastGood) return lastGood;
  throw new Error("no audio source");
}

export default async (request: Request) => {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  let audioUrl: string;
  try {
    audioUrl = await resolve(force);
  } catch {
    if (lastGood) audioUrl = lastGood;
    else return new Response("stream unavailable", { status: 503 });
  }
  const headers: Record<string, string> = { "User-Agent": "Mozilla/5.0" };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;
  let upstream: Response | null = null;
  try {
    upstream = await fetch(audioUrl, { headers });
  } catch {
    try {
      audioUrl = await resolve(true);
      upstream = await fetch(audioUrl, { headers });
    } catch {
      if (lastGood && lastGood !== audioUrl) {
        try { upstream = await fetch(lastGood, { headers }); if (upstream.ok) audioUrl = lastGood; } catch {}
      }
    }
  }
  if (!upstream) return new Response("upstream error", { status: 502 });
  if (!upstream.ok) {
    try {
      audioUrl = await resolve(true);
      upstream = await fetch(audioUrl, { headers });
    } catch {}
  }
  if (!upstream.ok && lastGood && lastGood !== audioUrl) {
    try { const r = await fetch(lastGood, { headers }); if (r.ok) { upstream = r; audioUrl = lastGood; } } catch {}
  }
  if (!upstream.ok) return new Response("stream unavailable", { status: 503 });
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
EOF
echo done