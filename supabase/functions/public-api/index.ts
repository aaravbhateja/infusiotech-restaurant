// BlinkRest public API (v1). Authenticate with: Authorization: Bearer brk_...
//
//   GET   /v1/orders?since=<ISO time>&status=<status>&limit=<1-100>   scope orders:read
//   GET   /v1/orders/<id>                                              scope orders:read
//   GET   /v1/payments?since=<ISO time>&limit=<1-100>                  scope payments:read
//   GET   /v1/menu                                                     scope menu:read
//   PATCH /v1/menu/<id>   {"available": true|false}                    scope menu:write
//
// Limit: 120 requests per minute per key. Money is in minor units (paise).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['new', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'cancelled'];

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra } });

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS' } });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token.startsWith('brk_')) return json({ error: 'invalid_api_key' }, 401);
  const { data: key } = await admin.rpc('api_key_check', { p_hash: await sha256Hex(token) });
  if (!key) return json({ error: 'invalid_api_key' }, 401);
  if (key.limited) return json({ error: 'rate_limited', message: 'Max 120 requests per minute.' }, 429, { 'Retry-After': '30' });
  const scopes: string[] = key.scopes ?? [];
  const tenant: string = key.tenant_id;
  const need = (scope: string) => (scopes.includes(scope) ? null : json({ error: 'missing_scope', scope }, 403));

  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/public-api/, '').replace(/\/+$/, '');
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const sinceRaw = url.searchParams.get('since');
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw).toISOString() : null;
  if (sinceRaw && !since) return json({ error: 'invalid_since' }, 400);

  if (req.method === 'GET' && path === '/v1/orders') {
    const denied = need('orders:read');
    if (denied) return denied;
    const status = url.searchParams.get('status');
    if (status && !STATUSES.includes(status)) return json({ error: 'invalid_status', allowed: STATUSES }, 400);
    const { data, error } = await admin.rpc('api_orders', { p_tenant: tenant, p_since: since, p_status: status, p_limit: limit });
    return error ? json({ error: 'server_error' }, 500) : json({ data });
  }

  const orderMatch = path.match(/^\/v1\/orders\/([^/]+)$/);
  if (req.method === 'GET' && orderMatch) {
    const denied = need('orders:read');
    if (denied) return denied;
    if (!UUID.test(orderMatch[1])) return json({ error: 'not_found' }, 404);
    const { data } = await admin.rpc('api_order', { p_tenant: tenant, p_id: orderMatch[1] });
    return data ? json({ data }) : json({ error: 'not_found' }, 404);
  }

  if (req.method === 'GET' && path === '/v1/payments') {
    const denied = need('payments:read');
    if (denied) return denied;
    const { data, error } = await admin.rpc('api_payments', { p_tenant: tenant, p_since: since, p_limit: limit });
    return error ? json({ error: 'server_error' }, 500) : json({ data });
  }

  if (req.method === 'GET' && path === '/v1/menu') {
    const denied = need('menu:read');
    if (denied) return denied;
    const { data, error } = await admin.rpc('api_menu', { p_tenant: tenant });
    return error ? json({ error: 'server_error' }, 500) : json({ data });
  }

  const menuMatch = path.match(/^\/v1\/menu\/([^/]+)$/);
  if (req.method === 'PATCH' && menuMatch) {
    const denied = need('menu:write');
    if (denied) return denied;
    if (!UUID.test(menuMatch[1])) return json({ error: 'not_found' }, 404);
    const body = await req.json().catch(() => null);
    if (typeof body?.available !== 'boolean') return json({ error: 'invalid_body', message: 'Send {"available": true|false}.' }, 400);
    const { data: found } = await admin.rpc('api_set_availability', { p_tenant: tenant, p_item: menuMatch[1], p_available: body.available });
    return found ? json({ ok: true }) : json({ error: 'not_found' }, 404);
  }

  return json({ error: 'not_found' }, 404);
});
