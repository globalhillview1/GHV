// Cloudflare Pages Worker — API proxy
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Proxy /api and /api/* to GAS
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const upstream = new URL(GAS_API);

      // preserve query string
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      // copy only safe headers
      const headers = new Headers();
      const reqHeaders = request.headers;
      const passThrough = ['content-type', 'accept', 'authorization'];
      for (const h of passThrough) {
        const v = reqHeaders.get(h);
        if (v) headers.set(h, v);
      }
      headers.set('accept', 'application/json');

      // clone body if present
      let body;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      // follow redirects (important for Apps Script)
      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        body,
        redirect: 'follow'
      });

      // sanitize response headers
      const outHeaders = new Headers(res.headers);
      outHeaders.delete('set-cookie');       // not useful through a proxy
      outHeaders.set('cache-control', 'no-store');

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders
      });
    }

    // static assets
    return env.ASSETS.fetch(request);
  }
};
