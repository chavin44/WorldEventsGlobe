/**
 * Free CORS proxy for World Events Globe — deploy to Cloudflare Workers.
 *
 * Why: GDELT (the source of real economic/geopolitical/company news) isn't
 * CORS-enabled, and every *public* CORS proxy is permanently rate-limited by
 * GDELT because its IP is shared by the whole internet. This worker runs on its
 * own low-traffic Cloudflare IP, so GDELT never throttles it — making live news
 * reliable, for free (100,000 requests/day on the free plan).
 *
 * Deploy: see PROXY_SETUP.md. Once live, point the app at it by running this in
 * your browser console on the site (once):
 *     localStorage.setItem('newsProxy', 'https://YOUR-worker-name.workers.dev/?url=')
 *
 * Usage: GET https://YOUR-worker.workers.dev/?url=<url-encoded target URL>
 */
export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: cors });
    }

    // Only allow proxying the APIs this app actually uses (prevents abuse).
    const allowed = ['api.gdeltproject.org'];
    let host;
    try {
      host = new URL(target).hostname;
    } catch {
      return new Response('Bad url', { status: 400, headers: cors });
    }
    if (!allowed.includes(host)) {
      return new Response('Host not allowed', { status: 403, headers: cors });
    }

    try {
      const upstream = await fetch(target, {
        headers: { 'User-Agent': 'WorldEventsGlobe/1.0' },
        // Cache at Cloudflare's edge for 5 min so repeat visitors are instant
        // and we make far fewer calls to GDELT.
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: {
          ...cors,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (e) {
      return new Response('Upstream error: ' + e.message, { status: 502, headers: cors });
    }
  },
};
