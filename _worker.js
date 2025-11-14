// Cloudflare Pages Worker — API proxy only (no path rewrites that can loop)
const GAS_API = 'https://script.google.com/macros/s/AKfycbwOscN4yvXLakGTrdzuNjR_OhkkQWnTjkh8dyaP1TT_HKFu4HZWVxvPw8gPZJSluas4/exec';
// Only allow your site
const ALLOWED_ORIGINS = ['https://ghvian.pages.dev']; // add more if needed

function corsHeaders(origin) {
  const hdr = new Headers();
  hdr.set('Access-Control-Allow-Origin', origin);
  hdr.set('Vary', 'Origin'); // cache correctness
  hdr.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  hdr.set('Access-Control-Allow-Headers', 'content-type');
  hdr.set('Access-Control-Max-Age', '86400');
  return hdr;
}

function isAllowed(origin) {
  return origin && ALLOWED_ORIGINS.includes(origin);
}

async function handleOptions(req) {
  const origin = req.headers.get('Origin');
  if (!isAllowed(origin)) return new Response('Forbidden', { status: 403 });
  return new Response(null, { headers: corsHeaders(origin) });
}

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    if (req.method === 'OPTIONS') return handleOptions(req);
    if (!isAllowed(origin)) return new Response('Forbidden', { status: 403 });

    // Prepare the upstream request
    const url = new URL(GAS_URL);
    // Forward query string for GETs like ?action=listNotices
    const incoming = new URL(req.url);
    url.search = incoming.search;

    const init = {
      method: req.method,
      headers: new Headers(),
      redirect: 'follow',
    };

    // Only forward body for POST
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await req.arrayBuffer();
      init.body = body;
      // Keep content-type only; avoid custom headers that trigger CORS issues
      const ct = req.headers.get('content-type');
      if (ct) init.headers.set('content-type', ct);
    }

    const upstream = await fetch(url.toString(), init);

    // Return upstream body + add CORS headers
    const respBody = await upstream.arrayBuffer();
    const headers = new Headers(upstream.headers);
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    // Optional: ensure JSON content-type for GAS JSON responses
    if (!headers.get('content-type')) headers.set('content-type', 'application/json');

    return new Response(respBody, { status: upstream.status, headers });
  }
}
