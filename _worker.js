// Cloudflare Pages Worker — robust API proxy for Google Apps Script
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

function pickHeaders(reqHeaders) {
  const h = new Headers();
  for (const k of ['content-type', 'accept', 'authorization']) {
    const v = reqHeaders.get(k);
    if (v) h.set(k, v);
  }
  // prefer JSON responses
  if (!h.has('accept')) h.set('accept', 'application/json');
  return h;
}

async function forwardWithRedirectPreserved(url, init) {
  // first hop (no automatic redirect following)
  let res = await fetch(url, { ...init, redirect: 'manual' });

  // If Apps Script returns a redirect, re-issue the request to the Location
  const loc = res.headers.get('location');
  if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
    // Re-play original method + body so POST stays POST
    res = await fetch(loc, { ...init, redirect: 'manual' });
  }

  // sanitize response headers
  const out = new Headers(res.headers);
  out.delete('set-cookie');
  out.set('cache-control', 'no-store');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle preflight or stray OPTIONS (defensive)
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/api')) {
      return new Response('', {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'cache-control': 'no-store'
        }
      });
    }

    // Proxy /api and /api/* to GAS
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // Build upstream URL (no extra path on GAS web app)
      const upstream = new URL(GAS_API);
      // Pass through query params
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      // Copy safe headers
      const headers = pickHeaders(request.headers);

      // Clone body for non-GET/HEAD
      let body;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      const init = {
        method: request.method,
        headers,
        body
      };

      return forwardWithRedirectPreserved(upstream.toString(), init);
    }

    // Everything else: serve static assets
    return env.ASSETS.fetch(request);
  }
};
