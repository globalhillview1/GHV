// Cloudflare Pages Worker — handles /api, ./api, and /something/api paths correctly
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

function isApiPath(pathname) {
  // Handles '/api', './api', 'api', and nested '/something/api'
  return pathname === '/api' || pathname.endsWith('/api');
}

function corsHeaders(origin) {
  const h = new Headers();
  h.set('access-control-allow-origin', origin || '*');
  h.set('access-control-allow-headers', 'content-type, authorization');
  h.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  h.set('access-control-allow-credentials', 'true');
  return h;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle relative API requests (like "api?action=login")
    if (!url.pathname.startsWith('/api') && url.pathname.endsWith('api')) {
      url.pathname = '/api';
    }

    // Handle CORS preflight
    if (request.method === 'OPTIONS' && isApiPath(url.pathname)) {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('origin')),
      });
    }

    if (isApiPath(url.pathname)) {
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams.entries()) {
        upstream.searchParams.set(k, v);
      }

      const headers = new Headers();
      for (const h of ['content-type', 'authorization', 'cookie']) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      headers.set('accept', 'application/json');

      try {
        const res = await fetch(upstream.toString(), {
          method: request.method,
          headers,
          redirect: 'follow',
          body:
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : request.body,
        });

        const outHeaders = new Headers(res.headers);
        corsHeaders(request.headers.get('origin')).forEach((v, k) =>
          outHeaders.set(k, v)
        );

        return new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers: outHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Proxy failed', details: err.message }), {
          status: 500,
          headers: corsHeaders(request.headers.get('origin')),
        });
      }
    }

    // Fallback to static assets
    return env.ASSETS.fetch(request);
  },
};
