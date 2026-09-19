// Cloudflare Worker entry for vrroboticsacademy.com.
//
// Serves two things from ONE origin, which is the whole point of this file:
//
//   /api/*  → reverse-proxied to the Bastion gateway (Railway)
//   /*      → the built SPA in ./dist, via the static-assets binding
//
// Because the browser only ever talks to https://vrroboticsacademy.com, API
// calls are same-origin: no preflight, no Access-Control-Allow-Origin, no
// credentialed-CORS surface at all. The backend CORS allowlists still exist for
// non-browser and direct callers, but they stop being load-bearing for the app.
//
// The apex is canonical; www 301s to it so there is exactly one origin for
// cookies, localStorage and SEO.

// Upstream gateway. Set BASTION_ORIGIN as a Worker var to point at a different
// backend (staging) without editing code; the default is the Railway service.
const DEFAULT_BASTION_ORIGIN =
  'https://gallant-spirit-production-7e6b.up.railway.app';

// Hop-by-hop headers must not be forwarded across a proxy (RFC 7230 §6.1), and
// Cloudflare rejects some of them on a subrequest. Host is dropped so fetch()
// derives it from the upstream URL — forwarding the apex Host would make
// Railway's router look for a vrroboticsacademy.com service and 404.
const STRIPPED_REQUEST_HEADERS = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-authorization',
  'proxy-authenticate',
  'te',
  'trailer',
];

/**
 * Proxy an /api/* request to the Bastion gateway, preserving method, path,
 * query string, headers and body.
 */
async function proxyToBastion(request, env) {
  const bastionOrigin = env.BASTION_ORIGIN || DEFAULT_BASTION_ORIGIN;
  const incoming = new URL(request.url);
  const upstream = new URL(bastionOrigin);

  // Keep the path EXACTLY as-is. Bastion mounts its router at /api, so
  // /api/public/... and /api/admin/... must arrive with the prefix intact.
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;

  const headers = new Headers(request.headers);
  for (const h of STRIPPED_REQUEST_HEADERS) headers.delete(h);

  // Preserve the real client IP and protocol for Bastion's rate limiter, which
  // runs behind `app.set('trust proxy', 1)` and reads X-Forwarded-For. Without
  // this every request would look like it came from one Cloudflare IP and the
  // limiter would throttle all users as a single bucket.
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) headers.set('X-Forwarded-For', clientIp);
  headers.set('X-Forwarded-Proto', 'https');
  headers.set('X-Forwarded-Host', incoming.host);

  // GET/HEAD must not carry a body; anything else streams through untouched so
  // multipart uploads are not buffered or re-encoded.
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  const response = await fetch(
    new Request(upstream.toString(), {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'manual',
    })
  );

  // Same-origin responses need no CORS headers. Strip any the upstream set so
  // a stale allowlist upstream can never conflict with the browser's
  // same-origin expectations.
  const outHeaders = new Headers(response.headers);
  outHeaders.delete('access-control-allow-origin');
  outHeaders.delete('access-control-allow-credentials');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: outHeaders,
  });
}

/**
 * Decide what to do with an incoming URL, as a pure function so the routing
 * rules can be unit-tested without a Workers runtime, a network, or a build.
 *
 * Exported for worker.test.mjs.
 *
 * @param {string} rawUrl
 * @returns {{kind: 'redirect', location: string} | {kind: 'proxy'} | {kind: 'asset'}}
 */
export function routeFor(rawUrl) {
  const url = new URL(rawUrl);

  // Canonical host: www → apex, preserving path and query. 301 so browsers and
  // search engines cache the collapse onto one origin.
  if (url.hostname.startsWith('www.')) {
    const apex = new URL(url);
    apex.hostname = url.hostname.slice(4);
    return { kind: 'redirect', location: apex.toString() };
  }

  // Exactly the /api namespace. Checking `=== '/api'` plus the '/api/' prefix
  // (rather than startsWith('/api')) keeps a route like /apidocs on the SPA.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return { kind: 'proxy' };
  }

  return { kind: 'asset' };
}

export default {
  async fetch(request, env) {
    const route = routeFor(request.url);

    if (route.kind === 'redirect') return Response.redirect(route.location, 301);
    if (route.kind === 'proxy') return proxyToBastion(request, env);

    // Everything else is the SPA. not_found_handling in wrangler.jsonc makes
    // unknown paths return index.html so client-side routes deep-link.
    return env.ASSETS.fetch(request);
  },
};
