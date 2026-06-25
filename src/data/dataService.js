import sampleEvents from './events.json';

/**
 * Live event data layer.
 *
 * Real, recent, geolocated events are pulled from two free, no-API-key,
 * CORS-enabled sources:
 *   - USGS earthquakes  (https://earthquake.usgs.gov) — geological events
 *   - NASA EONET        (https://eonet.gsfc.nasa.gov)  — wildfires, volcanoes,
 *                                                        storms, floods, etc.
 *
 * Both let us bound results by a time window, which drives the customizable
 * "last N days" range control in the UI. If both sources fail (offline), we
 * fall back to the bundled sample set so the globe is never empty.
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
  const [quakes, natural] = await Promise.all([
    fetchUsgs(days).catch(() => []),
    fetchEonet(days).catch(() => []),
  ]);

  if (quakes.length === 0 && natural.length === 0) {
    // offline / both sources down → bundled sample so the globe still works
    return { events: sampleEvents.map(normalize), live: false };
  }

  // Cap each source separately so a flood of earthquakes doesn't crowd out the
  // NASA events — keeps real category variety on the globe.
  const quakeCap = Math.ceil(limit * 0.55);
  const naturalCap = limit - quakeCap;
  const events = [
    ...quakes.sort(byNewest).slice(0, quakeCap),
    ...natural.sort(byNewest).slice(0, naturalCap),
  ].map(normalize);

  return { events, live: true };
}

/**
 * Fetch fresh live events NOT already shown — used by the "Add Live Event"
 * button to drop one more real event onto the globe.
 * @param {Set<string>} excludeIds  ids already on the map
 * @returns {Promise<Array>} candidate events (newest first), possibly empty
 */
export async function fetchMoreEvents(excludeIds, days = 30) {
  const [quakes, natural] = await Promise.all([
    fetchUsgs(days).catch(() => []),
    fetchEonet(days).catch(() => []),
  ]);
  return [...quakes, ...natural]
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
