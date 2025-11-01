// Cloudflare Pages Worker — API proxy only (no path rewrites that can loop)
const GAS_API = 'https://script.google.com/macros/s/AKfycbw8ta_GdLedTCp1L-I6QKVcJzbJTgy6-3GfBtHMhrCS0ESlXRi5jHVs0v_AFeM6ZICN/exec';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api') {
      const upstream = new URL(GAS_API);
      for (const [k, v] of url.searchParams.entries()) upstream.searchParams.set(k, v);

      // Copy only the necessary headers; avoid forwarding `host` and other hop-by-hop headers.
      const headers = new Headers();
      for (const h of ['content-type', 'authorization', 'cookie']) {
        const v = request.headers.get(h);
        if (v) headers.set(h, v);
      }
      headers.set('accept', 'application/json');

      const res = await fetch(upstream.toString(), {
        method: request.method,
        headers,
        redirect: 'follow', // follow GAS redirects instead of surfacing 302s to the browser
        body: (request.method === 'GET' || request.method === 'HEAD') ? undefined : request.body
      });

      // Pass through the upstream response
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
    }

    return env.ASSETS.fetch(request);
  }
};
