// Cloudflare Pages Worker — robust proxy to Google Apps Script JSON API
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';
const API_SUFFIX = '/api';

function isApiPath(pathname) {
  return pathname === API_SUFFIX || pathname.endsWith(API_SUFFIX);
}

function corsHeaders(origin) {
  const h = new Headers();
  if (origin) h.set('access-control-allow-origin', origin);
  else h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-headers', 'content-type, authorization');
  h.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  h.set('access-control-allow-credentials', 'true');
  return h;
}

function copySafeHeaders(reqHeaders) {
  const out = new Headers();
  // Forward common headers but skip hop-by-hop and cookie
  for (const [k, v] of reqHeaders.entries()) {
    const key = k.toLowerCase();
    if (['cookie', 'host', 'connection', 'transfer-encoding', 'upgrade', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers'].includes(key)) continue;
    out.set(k, v);
  }
  // Ensure we tell GAS we want JSON back
  out.set('accept', 'application/json');
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS' && isApiPath(url.pathname)) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
    }

    if (isApiPath(url.pathname)) {
      // Build upstream URL, preserve query string (e.g., ?action=login)
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      // Read body into a reusable buffer to avoid streaming issues
      const needsBody = !(request.method === 'GET' || request.method === 'HEAD');
      const body = needsBody ? await request.arrayBuffer() : undefined;

      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers: copySafeHeaders(request.headers),
        redirect: 'follow',
        body
      });

      // Add CORS headers to upstream response
      const headers = new Headers(res.headers);
      corsHeaders(request.headers.get('origin')).forEach((v, k) => headers.set(k, v));

      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }

    // Static assets
    return env.ASSETS.fetch(request);
  }
};
