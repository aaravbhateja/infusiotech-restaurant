// The URL a table's QR code points to — the customer-facing web build of
// this same Expo app, at /r/<restaurant-slug>/<table-label>?k=<secret>.
// The slug and table segments are purely cosmetic (a human can read what
// they're about to scan); the actual security is the `k` query param, a
// one-time-shown random token the server resolves back to a tenant+table —
// nothing about the path alone grants access, so it can't be guessed.
//
// Deliberately NEVER falls back to window.location.origin or any other
// "whatever's currently running this" address. A customer scans this code
// with their own phone, on their own network, possibly hours or days later —
// a dev server's tunnel URL (exp.direct, ngrok, localhost) is never reachable
// for them even if it happens to still be alive at that exact moment, so
// baking one in is always wrong, in Expo Go, a simulator, or anywhere else
// that isn't the real deployment. EXPO_PUBLIC_ORDER_BASE_URL overrides this
// only for pointing at a *different real deployment* (e.g. staging).
const PRODUCTION_ORDER_BASE_URL = 'https://blinkrest.com';

function baseUrl(): string {
  const envBase = process.env.EXPO_PUBLIC_ORDER_BASE_URL;
  return (envBase || PRODUCTION_ORDER_BASE_URL).replace(/\/$/, '');
}

export function slugifyTableLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'table'
  );
}

export function buildOrderUrl(rawToken: string, tenantSlug: string, tableLabel: string): string {
  const slug = tenantSlug || 'restaurant';
  const table = slugifyTableLabel(tableLabel);
  return `${baseUrl()}/r/${encodeURIComponent(slug)}/${encodeURIComponent(table)}?k=${encodeURIComponent(rawToken)}`;
}
