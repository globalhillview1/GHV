// Cloudflare Pages Worker — API proxy
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams) upstream.searchParams.set(k, v);

      const headers = new Headers();
      for (const h of ['content-type', 'accept', 'authorization']) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      headers.set('accept', 'application/json');

      let body;
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        body = await request.arrayBuffer();
      }

      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        body,
        redirect: 'follow'
      });

      const outHeaders = new Headers(res.headers);
      outHeaders.delete('set-cookie');
      outHeaders.set('cache-control', 'no-store');

      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders
      });
    }

    return env.ASSETS.fetch(request);
  }
};
