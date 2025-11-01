// Cloudflare Pages Worker — API proxy to Google Apps Script
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';
const API_SUFFIX = '/api';

function isApiPath(pathname) {
  return pathname === API_SUFFIX || pathname.endsWith(API_SUFFIX);
}

function corsHeaders(origin) {
  const h = new Headers();
  // echo the actual origin when credentials might be used
  if (origin) h.set('access-control-allow-origin', origin);
  else h.set('access-control-allow-origin', '*');
  h.set('access-control-allow-headers', 'content-type, authorization');
  h.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  h.set('access-control-allow-credentials', 'true');
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight support
    if (request.method === 'OPTIONS' && isApiPath(url.pathname)) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
    }

    if (isApiPath(url.pathname)) {
      // Build upstream URL and carry the query string (?action=login, etc.)
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      // Minimal, safe headers to avoid confusing Apps Script
      const headers = new Headers();
      const ct = request.headers.get('content-type');
      if (ct) headers.set('content-type', ct);
      const auth = request.headers.get('authorization');
      if (auth) headers.set('authorization', auth);
      headers.set('accept', 'application/json');

      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        redirect: 'follow', // follow GAS redirects so you don't get HTML redirect pages
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body
      });

      // Attach CORS headers so the browser can read the JSON body
      const outHeaders = new Headers(res.headers);
      corsHeaders(request.headers.get('origin')).forEach((v, k) => outHeaders.set(k, v));

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders
      });
    }

    // Everything else is static content
    return env.ASSETS.fetch(request);
  }
};
