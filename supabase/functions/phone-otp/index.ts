// Public endpoint behind the mobile-number signup / password-reset screens.
//   action "send"   — texts a 6-digit code via Fast2SMS
//   action "signup" — checks the code and creates the account with the password
//   action "reset"  — checks the code and sets a new password
// Codes are stored hashed, expire after 10 minutes, allow 5 wrong tries, and
// sends are rate-limited per number and per IP so the endpoint can't be used
// to spam strangers or burn SMS credit.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import { corsHeaders, handleCors } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fast2smsKey = Deno.env.get('FAST2SMS_API_KEY');

const admin = createClient(supabaseUrl, serviceRoleKey);

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_PER_PHONE_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 20;
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// Same mapping the app uses to sign in: the number is never an email, the
// address is only a stable login id and nothing is ever sent to it.
function loginEmail(ten: string) {
  return `${ten}@phone.blinkrest.app`;
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function codeHash(ten: string, code: string) {
  return sha256(`${ten}:${code}:${serviceRoleKey}`);
}

function newCode() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, '0');
}

async function sendCode(ten: string, ip: string) {
  if (!fast2smsKey) return json({ error: 'sms_not_configured' }, 503);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing } = await admin.from('phone_otps').select('last_sent_at').eq('phone', ten).maybeSingle();
  if (existing && Date.now() - new Date(existing.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return json({ error: 'wait_before_resend' }, 429);
  }
  const [{ count: phoneCount }, { count: ipCount }] = await Promise.all([
    admin.from('phone_otp_sends').select('id', { count: 'exact', head: true }).eq('phone', ten).gte('created_at', since),
    admin.from('phone_otp_sends').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since),
  ]);
  if ((phoneCount ?? 0) >= MAX_PER_PHONE_PER_HOUR || (ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
    return json({ error: 'too_many_requests' }, 429);
  }

  const code = newCode();
  await admin.from('phone_otps').upsert({
    phone: ten,
    code_hash: await codeHash(ten, code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    last_sent_at: new Date().toISOString(),
  });

  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: { authorization: fast2smsKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'otp', variables_values: code, numbers: ten, flash: 0 }),
  });
  const result = await res.json().catch(() => null);
  if (!res.ok || !result?.return) {
    await admin.from('phone_otps').delete().eq('phone', ten);
    console.error('fast2sms_failed', res.status, JSON.stringify(result));
    return json({ error: 'sms_failed' }, 502);
  }

  await admin.from('phone_otp_sends').insert({ phone: ten, ip });
  return json({ ok: true });
}

// Returns an error Response, or null when the code was right (and is now spent).
async function checkCode(ten: string, code: unknown): Promise<Response | null> {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) return json({ error: 'invalid_code' }, 400);
  const { data: row } = await admin.from('phone_otps').select('code_hash, expires_at, attempts').eq('phone', ten).maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) return json({ error: 'invalid_code' }, 400);
  if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'too_many_attempts' }, 429);
  if (row.code_hash !== (await codeHash(ten, code))) {
    await admin.from('phone_otps').update({ attempts: row.attempts + 1 }).eq('phone', ten);
    return json({ error: 'invalid_code' }, 400);
  }
  await admin.from('phone_otps').delete().eq('phone', ten);
  return null;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => null);
  const ten = normalizePhone(body?.phone);
  if (!ten) return json({ error: 'invalid_phone' }, 400);
  const ip = (req.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim();

  if (body.action === 'send') return sendCode(ten, ip);

  if (body.action === 'signup' || body.action === 'reset') {
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8) return json({ error: 'weak_password' }, 400);
    const bad = await checkCode(ten, body.code);
    if (bad) return bad;

    if (body.action === 'signup') {
      const { data, error } = await admin.auth.admin.createUser({
        email: loginEmail(ten),
        password,
        email_confirm: true,
        user_metadata: { phone: `+91${ten}` },
      });
      if (error || !data.user) {
        const exists = /already|registered|exists/i.test(error?.message ?? '');
        return json({ error: exists ? 'already_registered' : 'signup_failed' }, exists ? 409 : 500);
      }
      // The real number, not the synthetic address, is what staff see and
      // what staff invites match against.
      await admin.from('users').update({ phone: `+91${ten}`, email: null, phone_verified_at: new Date().toISOString() }).eq('id', data.user.id);
      return json({ ok: true });
    }

    const { data: userId } = await admin.rpc('auth_user_id_by_email', { p_email: loginEmail(ten) });
    if (!userId) return json({ error: 'no_account' }, 404);
    const { error } = await admin.auth.admin.updateUserById(userId as string, { password });
    if (error) return json({ error: 'reset_failed' }, 500);
    return json({ ok: true });
  }

  return json({ error: 'unknown_action' }, 400);
});
