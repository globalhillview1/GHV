// _worker.js — robust proxy for Cloudflare Pages -> Google Apps Script
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

async function proxyToGAS(request, url) {
  // Build upstream URL
  const upstream = new URL(GAS_API);

  // Forward original query string
  for (const [k, v] of url.searchParams.entries()) upstream.searchParams.set(k, v);

  // If path like /api/login, map to ?op=login
  const seg = url.pathname.slice('/api'.length).replace(/^\/+/, '');
  if (seg) upstream.searchParams.set('op', seg);

  // Prepare request init; ensure JSON is allowed
  const init = {
    method: request.method,
    headers: new Headers(request.headers),
    body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body,
    redirect: 'follow',              // follow redirects from GAS if any
    cf: { cacheTtl: 0, cacheEverything: false }
  };
  init.headers.set('accept', 'application/json');
  // Prevent cookies confusing GAS or caching layers
  init.headers.delete('cookie');

  let res = await fetch(upstream.toString(), init);

  // If GAS forgot content-type or returned HTML (e.g. HtmlService),
  // wrap it into JSON so the frontend's res.json() never explodes.
  const ct = res.headers.get('content-type') || '';
  if (!ct.toLowerCase().includes('application/json')) {
    const text = await res.text();
    const payload = JSON.stringify({
      ok: false,
      upstreamStatus: res.status,
      error: text.slice(0, 4000) // cap size
    });
    return new Response(payload, {
      status: res.ok ? 200 : res.status,
      headers: { 'content-type': 'application/json; charset=utf-8' }
    });
  }

  // Normal JSON passthrough
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight (usually unnecessary for same-origin, but OK)
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

    // Always proxy /api and /api/*
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const resp = await proxyToGAS(request, url);
      // Add CORS just in case
      const r = new Response(resp.body, resp);
      r.headers.set('Access-Control-Allow-Origin', url.origin);
      return r;
    }

    // Static assets served by Pages
    return env.ASSETS.fetch(request);
  }
};
