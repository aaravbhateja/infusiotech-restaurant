-- Mobile-number signup with an SMS code (sent via Fast2SMS by the phone-otp
-- edge function). Supabase's own phone provider is switched off for this
-- project, so a phone account is a normal auth user whose login id is a
-- synthetic, never-emailed address derived from the number; the real number
-- lives in public.users.phone. Only the edge function (service role) touches
-- these tables — RLS is on with no policies, so clients can't read or write
-- them at all.

create table public.phone_otps (
  phone text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  last_sent_at timestamptz not null default now()
);

create table public.phone_otp_sends (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  ip text,
  created_at timestamptz not null default now()
);

create index phone_otp_sends_phone_idx on public.phone_otp_sends (phone, created_at desc);
create index phone_otp_sends_ip_idx on public.phone_otp_sends (ip, created_at desc);

alter table public.phone_otps enable row level security;
alter table public.phone_otp_sends enable row level security;
revoke all on public.phone_otps from anon, authenticated;
revoke all on public.phone_otp_sends from anon, authenticated;

-- Looks up an auth user by login address for the password-reset flow.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;
