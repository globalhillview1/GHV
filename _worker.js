// Cloudflare Pages Worker — robust API proxy for Google Apps Script
// IMPORTANT: use the FINAL googleusercontent URL (macros/echo?...), not script.google.com
const GAS_API = 'https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLg_luQd5s0v5XOpZkS5JIT-QXR9KT5845cZq6-5IHKAH4Xg5bJEW63Xfgp6yzmqtiiM3HV4tzLXXmrSolxD0MyoCcn0Wu6qRzR4FtmLlb23jYLbM1vtYZCKWXBBgZhBOlQK9fAnYaFKXlHK6wQBz2MmkzzYGnfNp2pHx8vy7sTOVZburR3bcus5SvHNlRX6PMaCShwE9kBxzK7mRcPRqk9aRxrsyzbI9PEagBGHTa9aI-4ck95B5eYDx374w6VAbH7bKsA_6lBtuw8RWpXyUnU-C2Y4bPV643A6eA14Xg-RPCzj0DE&lib=MvUKQG4tLB1zVwA-ZbAsCr_tuZ2tUn3tE';

function pickHeaders(reqHeaders) {
  const h = new Headers();
  for (const k of ['content-type', 'accept', 'authorization']) {
    const v = reqHeaders.get(k);
    if (v) h.set(k, v);
  }
  if (!h.has('accept')) h.set('accept', 'application/json');
  return h;
}

async function forwardWithRedirectPreserved(url, init) {
  // First hop (don’t auto-follow; keep POST as POST)
  let res = await fetch(url, { ...init, redirect: 'manual' });

  // If Google still returns a redirect, replay to Location with same method+body
  const loc = res.headers.get('location');
  if (loc && [301, 302, 303, 307, 308].includes(res.status)) {
    res = await fetch(loc, { ...init, redirect: 'manual' });
  }

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

    // Handle stray OPTIONS on /api (defensive)
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
      const upstream = new URL(GAS_API);
      // Preserve all query params from the page request
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      const headers = pickHeaders(request.headers);

      let body;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer(); // clone body once
      }

      const init = { method: request.method, headers, body };
      return forwardWithRedirectPreserved(upstream.toString(), init);
    }

    // Static assets served by Pages
    return env.ASSETS.fetch(request);
  }
};
