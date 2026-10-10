// Sends queued support alerts (Razorpay KYC submitted, Zomato/Swiggy
// integration requested) to the support inbox. Called by the database, never
// by clients. Needs the RESEND_API_KEY secret and a Resend-verified sender
// domain; until then alerts stay queued and are sent the moment it is set.
//
// Secrets: RESEND_API_KEY (required), SUPPORT_EMAIL_TO (default support@blinkrest.com),
//          SUPPORT_EMAIL_FROM (default "BlinkRest Alerts <alerts@infusiotech.com>").
// Sensitive identifiers (PAN, bank account) arrive already masked; full KYC
// stays in the admin review screen.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendKey = Deno.env.get('RESEND_API_KEY');
const TO = Deno.env.get('SUPPORT_EMAIL_TO') ?? 'support@blinkrest.com';
const FROM = Deno.env.get('SUPPORT_EMAIL_FROM') ?? 'BlinkRest Alerts <alerts@infusiotech.com>';

const esc = (v: unknown) =>
  String(v ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function table(rows: [string, unknown][]) {
  return `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`)
    .join('')}</table>`;
}

function build(ctx: Record<string, any>): { subject: string; html: string } {
  const t = ctx.tenant ?? {};
  const o = ctx.owner ?? {};
  const common: [string, unknown][] = [
    ['Restaurant', t.name],
    ['City', [t.city, t.state].filter(Boolean).join(', ')],
    ['Owner', o.name],
    ['Owner email', o.email ?? t.contact_email],
    ['Owner phone', o.phone ?? t.contact_phone],
    ['Restaurant ID', t.id],
  ];
  if (ctx.kind === 'kyc_submitted') {
    const d = ctx.detail ?? {};
    return {
      subject: `Online payments application: ${t.name}`,
      html: `<h3>Online payments (Razorpay) application</h3>${table(common)}<h4>Submitted details</h4>${table([
        ['Legal business name', d.legal_business_name],
        ['Business type', d.business_type],
        ['PAN', d.pan_masked],
        ['GSTIN', d.gstin],
        ['Bank account holder', d.bank_holder],
        ['Bank account', d.bank_account_last4 ? `ending ${d.bank_account_last4}` : null],
        ['IFSC', d.ifsc],
        ['Status', d.status],
        ['Razorpay linked account', d.razorpay_linked_account_id],
      ])}<p style="font-family:Arial,sans-serif;font-size:13px;color:#666">Full details are in the admin KYC review. PAN and bank numbers are masked in this email.</p>`,
    };
  }
  const d = ctx.detail ?? {};
  return {
    subject: `Zomato/Swiggy integration request: ${t.name}`,
    html: `<h3>Zomato / Swiggy integration request</h3>${table(common)}<h4>Request</h4>${table([
      ['Channels', (d.channels ?? []).join(' + ')],
      ['Zomato restaurant ID', d.zomato_restaurant_id],
      ['Swiggy restaurant ID', d.swiggy_restaurant_id],
      ['Call them on', d.contact_phone],
    ])}<p style="font-family:Arial,sans-serif;font-size:13px;color:#666">Next: set them up with Dyno, then run <code>select public.operator_set_aggregator('${esc(t.id)}', 'setting_up', 'note');</code></p>`,
  };
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  if (!resendKey) return new Response(JSON.stringify({ ok: true, configured: false }), { headers: { 'Content-Type': 'application/json' } });

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: due } = await admin.rpc('claim_support_notifications', { p_limit: 10 });
  let sent = 0;
  for (const row of (due ?? []) as { id: string }[]) {
    try {
      const { data: ctx } = await admin.rpc('support_email_context', { p_id: row.id });
      if (!ctx) {
        await admin.rpc('finish_support_notification', { p_id: row.id, p_ok: true, p_error: 'context missing' });
        continue;
      }
      const mail = build(ctx);
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM, to: [TO], subject: mail.subject, html: mail.html, reply_to: ctx.owner?.email ?? undefined }),
      });
      if (!res.ok) throw new Error(`resend_${res.status}: ${(await res.text()).slice(0, 200)}`);
      await admin.rpc('finish_support_notification', { p_id: row.id, p_ok: true, p_error: null });
      sent++;
    } catch (e) {
      await admin.rpc('finish_support_notification', { p_id: row.id, p_ok: false, p_error: e instanceof Error ? e.message : 'failed' });
    }
  }
  return new Response(JSON.stringify({ ok: true, configured: true, sent }), { headers: { 'Content-Type': 'application/json' } });
});
