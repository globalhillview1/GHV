// _worker.js — Cloudflare Pages Worker proxy for Google Apps Script
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight (mostly unnecessary for same-origin, but harmless)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': url.origin,
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'content-type, accept'
        }
      });
    }

    // Proxy /api and /api/*
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const upstream = new URL(GAS_API);

      // Forward original query string
      for (const [k, v] of url.searchParams.entries()) upstream.searchParams.set(k, v);

      // If path like /api/login, map to ?op=login
      const seg = url.pathname.slice('/api'.length).replace(/^\/+/, '');
      if (seg) upstream.searchParams.set('op', seg);

      const init = {
        method: request.method,
        headers: new Headers(request.headers),
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
        redirect: 'manual'
      };
      init.headers.set('accept', 'application/json');

      const res = await fetch(upstream.toString(), init);
      const resp = new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
      resp.headers.set('Access-Control-Allow-Origin', url.origin);
      return resp;
    }

    // Static assets
    return env.ASSETS.fetch(request);
  }
}
