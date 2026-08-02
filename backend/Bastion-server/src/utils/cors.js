// Single source of truth for which browser origins Bastion accepts. Both the
// top-level cors() middleware (index.js) and the proxy's per-response header
// decorator (routes/proxyRoutes.js) read this so a request allowed at the
// gateway is also allowed when its proxied response is sent back to the
// browser. Lives in its own module to avoid circular imports between
// index.js and the routes that the gateway mounts.
//
// Origins come from BASTION_ALLOWED_ORIGINS (comma-separated) plus a small
// set of local dev defaults so `npm run dev` keeps working without env vars.
// const fromEnv = (process.env.BASTION_ALLOWED_ORIGINS || '')
//   .split(',')
//   .map((s) => s.trim())
//   .filter(Boolean);

// const devDefaults = [
//   'http://localhost:8080',
//   'http://localhost:8081',
//   'http://localhost:5173',
// ];

// export const bastionAllowedOrigins = Array.from(
//   new Set([...devDefaults, ...fromEnv])
// );

const fromEnv = (process.env.BASTION_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isProduction = process.env.NODE_ENV === 'production';

// Convenience origins for `npm run dev`. Dropped entirely in production: a
// deployed gateway has no reason to trust a developer laptop's localhost, and
// an allowed origin + credentials:true is a real cross-origin credential leak.
// In production the allow-list is exactly BASTION_ALLOWED_ORIGINS.
const devDefaults = isProduction
  ? []
  : [
      'http://localhost:8080',
      'http://localhost:8081',
      'http://localhost:5173',
      'http://13.235.24.234',
    ];

export const bastionAllowedOrigins = Array.from(
  new Set([...devDefaults, ...fromEnv])
);

// Fail loudly rather than silently CORS-blocking every browser request — this
// misconfiguration otherwise shows up as "login works in Postman but not the
// browser", which is a slow thing to diagnose during a deploy.
if (isProduction && bastionAllowedOrigins.length === 0) {
  console.error(
    '[Bastion] NODE_ENV=production but BASTION_ALLOWED_ORIGINS is empty — ' +
      'every browser origin will be rejected. Set it to your frontend URL(s).',
  );
}

// Matches localhost and any RFC-1918 private-LAN origin (10.x, 192.168.x,
// 172.16–31.x) on any port. Lets the app be opened from another device on the
// office Wi-Fi (e.g. http://10.195.180.50:8081) without re-listing every IP —
// DHCP hands these out and they change. Anything public must still be added
// explicitly via BASTION_ALLOWED_ORIGINS.
const PRIVATE_ORIGIN_RE =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Single allow-decision used by both the cors() middleware and the proxy's
// response-header decorator so the gateway and the proxied response agree.
export function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser clients (curl, server-to-server)
  if (bastionAllowedOrigins.includes(origin)) return true;

  // The private-LAN wildcard is a DEV convenience only. Containers and cloud
  // VMs sit inside RFC-1918 space (Docker bridge is 172.17-31.x, most VPCs are
  // 10.x), so keeping this enabled in production would auto-trust any origin
  // co-located on the same network — including another tenant's container —
  // with credentials:true. Explicit allow-list only once deployed.
  if (isProduction) return false;

  return PRIVATE_ORIGIN_RE.test(origin);
}