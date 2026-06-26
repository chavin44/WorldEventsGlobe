import sampleEvents from './events.json';
import { centroidFor } from './countryCentroids.js';

/**
 * Live event data layer.
 *
 * Real, recent, geolocated events are pulled from free, no-API-key sources:
 *   - USGS earthquakes  (https://earthquake.usgs.gov) — geological events
 *   - NASA EONET        (https://eonet.gsfc.nasa.gov)  — wildfires, volcanoes,
 *                                                        storms, floods, etc.
 *   - GDELT news        (https://gdeltproject.org)     — REAL economic, business,
 *                                                        company & geopolitical
 *                                                        world news
 *
 * USGS & EONET are CORS-enabled and hit directly. GDELT is not CORS-enabled, so
 * we route it through a public CORS proxy and cache the result (GDELT rate-limits
 * to ~1 request / 5s per IP). If a source fails, the others still populate the
 * globe; if ALL fail (offline) we fall back to the bundled sample set.
 */

export const CATEGORIES = {
  geopolitical: { label: 'geopolitical', color: '#ff5d5d' },
  geographical: { label: 'geographical', color: '#ffa14d' },
  economic: { label: 'economic', color: '#ffd24d' },
  environmental: { label: 'environmental', color: '#5dff9b' },
  other: { label: 'other', color: '#9db4ff' },
};

/**
 * Fetch live events within the last `days` days.
 * @param {object} opts
 * @param {number} opts.days  time window in days (1..90)
 * @param {number} [opts.limit] max events to return
 * @returns {Promise<{events: Array, live: boolean}>}
 */
export async function loadEvents({ days = 7, limit = 80 } = {}) {
  // USGS + EONET are CORS-enabled and fast — populate the globe from these
  // immediately. GDELT news is rate-limited behind a shared proxy, so it streams
  // in separately via fetchNews() (see main.js) instead of blocking this load.
  const [quakes, natural] = await Promise.all([
    fetchUsgs(days).catch(() => []),
    fetchEonet(days).catch(() => []),
  ]);

  // Include any already-cached GDELT news so it shows up instantly on reload.
  const cachedNews = getCachedNews(days);

  if (quakes.length === 0 && natural.length === 0 && cachedNews.length === 0) {
    // offline / all sources down → bundled sample so the globe still works
    return { events: sampleEvents.map(normalize), live: false };
  }

  // Cap each source separately so one flood (e.g. earthquakes) doesn't crowd
  // out the others — keeps real variety across all four categories on the globe.
  const newsEvents = cachedNews.sort(byNewest).slice(0, Math.round(limit * 0.45));
  const quakeEvents = quakes.sort(byNewest).slice(0, Math.round(limit * 0.3));
  const naturalEvents = natural.sort(byNewest).slice(0, Math.round(limit * 0.35));

  const events = [...newsEvents, ...quakeEvents, ...naturalEvents].map(normalize);
  return { events, live: true };
}

/**
 * Fetch GDELT world news (economic / business / company / geopolitical) for the
 * given window, retrying past the shared proxy's rate limit. Returns normalized
 * events. Called in the background after the initial load so news streams in
 * without making the user wait. Safe to call repeatedly — it caches.
 * @param {object} opts
 * @param {number} opts.days
 * @returns {Promise<Array>} normalized news events (possibly empty if throttled)
 */
export async function fetchNews({ days = 7 } = {}) {
  const news = await fetchGdelt(days, 4).catch(() => []);
  return news.map(normalize);
}

/**
 * Fetch fresh live events NOT already shown — used by the "Find More Events"
 * button to drop one more real event onto the globe.
 * @param {Set<string>} excludeIds  ids already on the map
 * @returns {Promise<Array>} candidate events (newest first), possibly empty
 */
export async function fetchMoreEvents(excludeIds, days = 30) {
  const [quakes, natural, news] = await Promise.all([
    fetchUsgs(days).catch(() => []),
    fetchEonet(days).catch(() => []),
    fetchGdelt(days, 2).catch(() => []),
  ]);
  return [...news, ...quakes, ...natural]
    .filter((e) => !excludeIds.has(e.id))
    .sort(byNewest)
    .map(normalize);
}

function byNewest(a, b) {
  return (b._ts || 0) - (a._ts || 0);
}

// ---------------------------------------------------------------------------
// USGS earthquakes
// ---------------------------------------------------------------------------
async function fetchUsgs(days) {
  const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` +
    `&starttime=${start}&minmagnitude=4.5&orderby=time&limit=200`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('usgs');
  const json = await res.json();
  return (json.features || []).map(mapUsgs).filter(Boolean);
}

function mapUsgs(f) {
  const p = f.properties || {};
  const c = f.geometry?.coordinates;
  if (!c) return null;
  const mag = p.mag ?? 0;
  return {
    id: 'usgs-' + f.id,
    title: `M ${mag.toFixed(1)} earthquake — ${shortPlace(p.place)}`,
    category: 'geographical',
    severity: magToSeverity(mag),
    lat: c[1],
    lng: c[0],
    place: p.place || 'Unknown location',
    summary: `A magnitude ${mag.toFixed(1)} earthquake struck at a depth of ${
      c[2]?.toFixed?.(0) ?? '?'
    } km. ${p.place || ''}`.trim(),
    imageUrl: `https://picsum.photos/seed/quake${f.id}/640/400`,
    sourceName: 'USGS',
    sourceUrl: p.url, // real event page that fully describes the quake
    date: new Date(p.time).toISOString().slice(0, 10),
    _ts: p.time,
  };
}

function magToSeverity(m) {
  if (m >= 7) return 5;
  if (m >= 6) return 4;
  if (m >= 5.5) return 3;
  if (m >= 5) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// NASA EONET natural events
// ---------------------------------------------------------------------------
async function fetchEonet(days) {
  const url = `https://eonet.gsfc.nasa.gov/api/v3/events?limit=120&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('eonet');
  const json = await res.json();
  return (json.events || []).map(mapEonet).filter(Boolean);
}

const EONET_CATEGORY = {
  Wildfires: 'environmental',
  Volcanoes: 'geographical',
  'Severe Storms': 'environmental',
  Floods: 'environmental',
  Drought: 'environmental',
  Earthquakes: 'geographical',
  Landslides: 'geographical',
  'Sea and Lake Ice': 'geographical',
  'Dust and Haze': 'environmental',
  'Temperature Extremes': 'environmental',
  Manmade: 'geopolitical',
  'Water Color': 'environmental',
  Snow: 'environmental',
};

const EONET_SEVERITY = {
  Volcanoes: 5,
  'Severe Storms': 4,
  Wildfires: 4,
  Floods: 4,
  Drought: 3,
  Landslides: 4,
};

function mapEonet(ev) {
  const geom = ev.geometry?.[ev.geometry.length - 1]; // newest point
  if (!geom) return null;
  const coords = pointOf(geom.coordinates);
  if (!coords) return null;
  const catTitle = ev.categories?.[0]?.title || 'Other';
  const ts = geom.date ? Date.parse(geom.date) : Date.now();
  return {
    id: 'eonet-' + ev.id,
    title: ev.title,
    category: EONET_CATEGORY[catTitle] || 'environmental',
    severity: EONET_SEVERITY[catTitle] || 3,
    lat: coords[1],
    lng: coords[0],
    place: catTitle,
    summary: `${catTitle} event tracked by NASA EONET: ${ev.title}.`,
    imageUrl: `https://picsum.photos/seed/eonet${ev.id}/640/400`,
    sourceName: ev.sources?.[0]?.id || 'NASA EONET',
    sourceUrl: ev.sources?.[0]?.url || ev.link, // real source describing the event
    date: new Date(ts).toISOString().slice(0, 10),
    _ts: ts,
  };
}

// EONET point coords are [lng,lat]; polygons are nested — grab a representative point
function pointOf(coords) {
  if (!Array.isArray(coords)) return null;
  if (typeof coords[0] === 'number') return coords;
  let c = coords;
  while (Array.isArray(c) && typeof c[0] !== 'number') c = c[0];
  return Array.isArray(c) ? c : null;
}

// ---------------------------------------------------------------------------
// GDELT world news — economic, business, company & geopolitical events
// ---------------------------------------------------------------------------
// GDELT isn't CORS-enabled, so we proxy it and cache aggressively (it rate-limits
// to ~1 request / 5s per IP, and shared public proxy IPs are almost always over
// that budget). For RELIABLE news, deploy your own free Cloudflare Worker proxy
// (see cloudflare-worker.js + PROXY_SETUP.md) and set its URL — either edit
// DEFAULT_PROXY below, or at runtime run in the browser console:
//     localStorage.setItem('newsProxy', 'https://YOUR-worker.workers.dev/?url=')
// A personal worker has its own low-traffic IP, so GDELT never throttles it.
const GDELT_CACHE = new Map(); // days -> { ts, data }
const GDELT_TTL = 15 * 60 * 1000; // 15 minutes — news doesn't change that fast

// Public fallback proxy (often rate-limited). Override with a personal worker.
const DEFAULT_PROXY = 'https://corsproxy.io/?url=';
function corsProxy() {
  try {
    return localStorage.getItem('newsProxy') || DEFAULT_PROXY;
  } catch {
    return DEFAULT_PROXY;
  }
}

/** Cached GDELT news for a window, or [] — synchronous, never hits the network. */
function getCachedNews(days) {
  const cached = GDELT_CACHE.get(days);
  if (cached && Date.now() - cached.ts < GDELT_TTL) return cached.data;
  return [];
}

/**
 * Fetch + parse GDELT news, retrying past the shared proxy's rate limit.
 * @param {number} days
 * @param {number} retries  how many times to retry on a rate-limit (429) response
 */
async function fetchGdelt(days, retries = 2) {
  const cached = GDELT_CACHE.get(days);
  if (cached && Date.now() - cached.ts < GDELT_TTL) return cached.data;

  const query =
    '(business OR economy OR market OR company OR election OR government OR trade OR diplomacy) sourcelang:eng';
  const span = days >= 1 ? `${Math.min(days, 90)}d` : '1d';
  const gdeltUrl =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=75&sort=datedesc&timespan=${span}`;
  const url = corsProxy() + encodeURIComponent(gdeltUrl);

  // GDELT returns a 429 + plain-text notice when the shared proxy IP is over its
  // ~1-request/5s budget. Retry with spacing until it lets us through.
  let articles = await tryGdelt(url);
  for (let i = 0; !articles && i < retries; i++) {
    await sleep(5500);
    articles = await tryGdelt(url);
  }
  const data = (articles || []).map(mapGdelt).filter(Boolean);
  // Only cache a genuine, non-empty result. Caching an empty (rate-limited)
  // response would lock us out of GDELT for the whole TTL.
  if (data.length > 0) GDELT_CACHE.set(days, { ts: Date.now(), data });
  return data;
}

async function tryGdelt(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  const text = await res.text();
  try {
    return JSON.parse(text).articles || [];
  } catch {
    return null; // rate-limit notice / non-JSON
  }
}

// Title keywords → category. Economic is checked first so company/market news
// lands in the economic bucket; everything else news-y defaults to geopolitical.
const ECON_RE =
  /\b(econom|market|stock|share|inflation|tariff|trade|earnings|revenue|profit|compan|merger|acquisi|ipo|gdp|bank|finance|investor|dollar|euro|oil|price|startup|billion|million|fund|ceo|layoff|jobs|wages|recession|crypto|nasdaq|shares)\b/i;
const GEO_RE =
  /\b(election|vote|president|minister|parliament|govern|war|conflict|military|troops|protest|diploma|sanction|treaty|border|summit|coup|missile|nuclear|embassy|refugee|senate|congress|policy|tensions?)\b/i;
const HIGH_IMPACT_RE =
  /\b(crisis|crash|collapse|war|surge|record|billion|emergency|soar|plunge|historic|massive)\b/i;

function mapGdelt(a) {
  if (!a.title || !a.url) return null;
  const loc = centroidFor(a.sourcecountry);
  if (!loc) return null; // can't place it on the globe without a country centroid

  const title = a.title;
  const category = ECON_RE.test(title) ? 'economic' : 'geopolitical';
  const severity = HIGH_IMPACT_RE.test(title) ? 3 : 2;

  // Jitter so multiple articles from one country spread out instead of stacking.
  const lat = loc.lat + (Math.random() - 0.5) * 6;
  const lng = loc.lng + (Math.random() - 0.5) * 6;
  const ts = parseGdeltDate(a.seendate);

  return {
    id: 'gdelt-' + hashStr(a.url),
    title: title.length > 110 ? title.slice(0, 107) + '…' : title,
    category,
    severity,
    lat,
    lng,
    place: a.sourcecountry || 'Unknown',
    summary: `${category === 'economic' ? 'Business/economic' : 'World'} news from ${
      a.sourcecountry || 'an international outlet'
    } (${a.domain || 'source'}): "${title}".`,
    imageUrl: a.socialimage || `https://picsum.photos/seed/news${hashStr(a.url)}/640/400`,
    sourceName: a.domain || 'News',
    sourceUrl: a.url, // real article describing the event
    date: new Date(ts).toISOString().slice(0, 10),
    _ts: ts,
  };
}

// GDELT seendate looks like "20260625T231500Z"
function parseGdeltDate(s) {
  if (!s || s.length < 15) return Date.now();
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(
    11,
    13
  )}:${s.slice(13, 15)}Z`;
  const t = Date.parse(iso);
  return isNaN(t) ? Date.now() : t;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// shared
// ---------------------------------------------------------------------------
function shortPlace(place) {
  if (!place) return 'Unknown';
  // "71 km WNW of Catuday, Philippines" → "Catuday, Philippines"
  const i = place.indexOf(' of ');
  return i >= 0 ? place.slice(i + 4) : place;
}

function normalize(e) {
  return {
    id: e.id,
    title: e.title ?? 'Untitled event',
    category: CATEGORIES[e.category] ? e.category : 'other',
    severity: clamp(e.severity ?? 1, 1, 5),
    lat: Number(e.lat) || 0,
    lng: Number(e.lng) || 0,
    place: e.place ?? 'Unknown location',
    summary: e.summary ?? '',
    imageUrl: e.imageUrl ?? '',
    sourceName: e.sourceName ?? 'Source',
    sourceUrl: e.sourceUrl ?? '#',
    date: e.date ?? '',
    _ts: e._ts ?? 0,
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
