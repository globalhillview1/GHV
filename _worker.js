// Cloudflare Pages Worker — normalizes JSON body to form-encoded for GAS
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

function copyBaseHeaders(reqHeaders) {
  const out = new Headers();
  for (const [k, v] of reqHeaders.entries()) {
    const key = k.toLowerCase();
    if (['cookie','host','connection','transfer-encoding','upgrade','keep-alive','proxy-authenticate','proxy-authorization','te','trailers'].includes(key)) continue;
    // we'll set content-type later if we transform the body
    if (key === 'content-type') continue;
    out.set(k, v);
  }
  out.set('accept', 'application/json');
  out.set('x-requested-with', 'XMLHttpRequest');
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS' && isApiPath(url.pathname)) {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('origin')) });
    }

    if (isApiPath(url.pathname)) {
      // Preserve query (?action=login)
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);
      upstream.searchParams.set('__via', 'cf'); // harmless marker for debugging if needed

      const headers = copyBaseHeaders(request.headers);

      let body;
      let contentType = request.headers.get('content-type') || '';

      if (request.method === 'GET' || request.method === 'HEAD') {
        body = undefined;
      } else if (contentType.includes('application/json')) {
        // Convert JSON -> x-www-form-urlencoded so GAS can read e.parameter
        const raw = await request.text();
        try {
          const data = raw ? JSON.parse(raw) : {};
          const params = new URLSearchParams();
          Object.entries(data || {}).forEach(([k, v]) => params.append(k, String(v)));
          body = params.toString();
          headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
        } catch {
          // If parsing fails, forward as-is
          body = raw;
          headers.set('content-type', 'application/json');
        }
      } else {
        // form-encoded or multipart or other — pass through unchanged
        const buf = await request.arrayBuffer();
        body = buf;
        if (contentType) headers.set('content-type', contentType);
      }

      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        redirect: 'follow',
        body
      });

      const outHeaders = new Headers(res.headers);
      corsHeaders(request.headers.get('origin')).forEach((v, k) => outHeaders.set(k, v));
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: outHeaders });
    }

    return env.ASSETS.fetch(request);
  }
};
