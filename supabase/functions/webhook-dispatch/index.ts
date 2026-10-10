// Delivers queued webhook events. Called by the database (pg_net) the moment
// an event is queued and once a minute for retries; never by clients.
//
// Each request is signed:
//   X-BlinkRest-Signature: sha256=<hex HMAC-SHA256 of "<timestamp>.<body>" with the endpoint secret>
//   X-BlinkRest-Timestamp: unix seconds
// Receivers should reject timestamps older than a few minutes.
//
// Safety: https only, redirects are not followed, and a destination whose
// DNS resolves to a private/loopback/link-local address is refused so a
// webhook can never be pointed at our own network.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const l = ip.toLowerCase();
    return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:');
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublicDestination(rawUrl: string) {
  const u = new URL(rawUrl);
  if (u.protocol !== 'https:') throw new Error('not_https');
  const host = u.hostname;
  if (/^[0-9.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host.replace(/^\[|\]$/g, ''))) throw new Error('private_address');
    return;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) throw new Error('private_address');
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(host, 'A').catch(() => [] as string[]),
      Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
    ]);
    const all = [...a, ...aaaa];
    if (all.length === 0) throw new Error('dns_failed');
    if (all.some(isPrivateIp)) throw new Error('private_address');
  } catch (e) {
    if (e instanceof Error && (e.message === 'dns_failed' || e.message === 'private_address')) throw e;
    // resolveDns unavailable in this runtime: the hostname rules above still applied.
  }
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: due, error } = await admin.rpc('claim_webhook_deliveries', { p_limit: 25 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const rows = (due ?? []) as { id: string; event: string; url: string; secret: string; payload: unknown; created_at: string }[];
  await Promise.allSettled(
    rows.map(async (d) => {
      let ok = false;
      let code: number | null = null;
      let err: string | null = null;
      try {
        await assertPublicDestination(d.url);
        const body = JSON.stringify({ id: d.id, event: d.event, created_at: d.created_at, data: d.payload });
        const ts = String(Math.floor(Date.now() / 1000));
        const res = await fetch(d.url, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BlinkRest-Webhooks/1.0',
            'X-BlinkRest-Event': d.event,
            'X-BlinkRest-Delivery': d.id,
            'X-BlinkRest-Timestamp': ts,
            'X-BlinkRest-Signature': `sha256=${await sign(d.secret, `${ts}.${body}`)}`,
          },
          body,
        });
        code = res.status;
        ok = res.status >= 200 && res.status < 300;
        if (!ok) err = `HTTP ${res.status}`;
        await res.body?.cancel();
      } catch (e) {
        err = e instanceof Error ? e.message : 'request_failed';
      }
      await admin.rpc('finish_webhook_delivery', { p_id: d.id, p_ok: ok, p_code: code, p_error: err });
    }),
  );

  return new Response(JSON.stringify({ ok: true, processed: rows.length }), { headers: { 'Content-Type': 'application/json' } });
});
