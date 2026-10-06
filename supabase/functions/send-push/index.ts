// Called by the notifications_push_trigger (via pg_net) on every new
// notification row, regardless of what inserted it. Looks up every device
// registered for that tenant and relays the message through Expo's push
// API. Never called directly by the client.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.tenant_id || !body?.title) {
    return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: tokens } = await admin.from('device_push_tokens').select('expo_push_token').eq('tenant_id', body.tenant_id);

  if (!tokens || tokens.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // One message per device even if a token is somehow stored more than once.
  const unique = [...new Set(tokens.map((t) => t.expo_push_token))];
  const messages = unique.map((token) => ({
    to: token,
    title: body.title,
    body: body.body ?? '',
    sound: 'default',
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });

  const result = await res.json().catch(() => null);
  return new Response(JSON.stringify({ ok: res.ok, sent: messages.length, result }), { headers: { 'Content-Type': 'application/json' } });
});
