-- Email support@blinkrest.com when a restaurant applies for online payments
-- (Razorpay KYC) or a Zomato / Swiggy integration. Events are queued in a
-- table first, so nothing is lost if email sending is down or not yet set up;
-- the notify-support function sends them and marks them done.

create table public.support_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('kyc_submitted', 'aggregator_requested')),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  ref_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index support_notifications_pending_idx on public.support_notifications (created_at) where sent_at is null;
alter table public.support_notifications enable row level security;
-- No policies: service role only.

create or replace function public.kick_support_email()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text;
  v_key text;
begin
  select replace(value, 'send-push', 'notify-support') into v_url from public.app_config where key = 'send_push_url';
  select value into v_key from public.app_config where key = 'service_role_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key), body := '{}'::jsonb);
end;
$$;
revoke execute on function public.kick_support_email() from public, anon, authenticated;

create or replace function public.trg_queue_support_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if tg_table_name = 'tenant_kyc' then
      if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
        insert into public.support_notifications (kind, tenant_id, ref_id) values ('kyc_submitted', new.tenant_id, new.id);
        perform public.kick_support_email();
      end if;
    elsif tg_table_name = 'aggregator_connections' then
      if new.status = 'requested' and (tg_op = 'INSERT' or old.requested_at is distinct from new.requested_at) then
        insert into public.support_notifications (kind, tenant_id, ref_id) values ('aggregator_requested', new.tenant_id, new.id);
        perform public.kick_support_email();
      end if;
    end if;
  exception when others then
    null;   -- never block the restaurant's own submission
  end;
  return null;
end;
$$;

create trigger tenant_kyc_support_email after insert or update of status on public.tenant_kyc
  for each row execute function public.trg_queue_support_email();
create trigger aggregator_support_email after insert or update of requested_at, status on public.aggregator_connections
  for each row execute function public.trg_queue_support_email();

-- Retry anything not yet sent.
select cron.schedule('support-email-retries', '*/5 * * * *',
  $$select public.kick_support_email() where exists (select 1 from public.support_notifications where sent_at is null and attempts < 5)$$);
select cron.schedule('support-email-cleanup', '40 3 * * *',
  $$delete from public.support_notifications where sent_at < now() - interval '60 days'$$);

-- Everything the email needs, with sensitive numbers masked. Service role only.
create or replace function public.support_email_context(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  n record;
  t record;
  v_owner jsonb;
  v_detail jsonb;
begin
  select * into n from public.support_notifications where id = p_id;
  if n.id is null then return null; end if;
  select id, name, city, state, contact_email, contact_phone, gstin into t from public.tenants where id = n.tenant_id;

  select jsonb_build_object('name', u.display_name, 'email', u.email, 'phone', u.phone) into v_owner
  from public.tenant_memberships m join public.roles r on r.id = m.role_id and r.name = 'Owner' join public.users u on u.id = m.user_id
  where m.tenant_id = n.tenant_id and m.status = 'active' order by u.created_at limit 1;

  if n.kind = 'kyc_submitted' then
    select jsonb_build_object(
      'legal_business_name', k.legal_business_name, 'business_type', k.business_type,
      'pan_masked', 'XXXXXX' || right(k.pan, 4), 'gstin', k.gstin,
      'bank_holder', k.bank_account_holder_name, 'bank_account_last4', right(k.bank_account_number, 4), 'ifsc', k.bank_ifsc,
      'status', k.status, 'razorpay_linked_account_id', k.razorpay_linked_account_id) into v_detail
    from public.tenant_kyc k where k.id = n.ref_id;
  else
    select jsonb_build_object('channels', c.channels, 'zomato_restaurant_id', c.zomato_restaurant_id,
      'swiggy_restaurant_id', c.swiggy_restaurant_id, 'contact_phone', c.contact_phone) into v_detail
    from public.aggregator_connections c where c.id = n.ref_id;
  end if;

  return jsonb_build_object('kind', n.kind, 'tenant', to_jsonb(t), 'owner', v_owner, 'detail', v_detail, 'at', n.created_at);
end;
$$;
revoke execute on function public.support_email_context(uuid) from public, anon, authenticated;

create or replace function public.claim_support_notifications(p_limit integer default 10)
returns table (id uuid)
language sql
security definer
set search_path = public
as $$
  with due as (
    select s.id from public.support_notifications s
    where s.sent_at is null and s.attempts < 5 and s.created_at < now() + interval '1 second'
    order by s.created_at limit p_limit for update skip locked
  )
  select id from due;
$$;
revoke execute on function public.claim_support_notifications(integer) from public, anon, authenticated;

create or replace function public.finish_support_notification(p_id uuid, p_ok boolean, p_error text, p_count_attempt boolean default true)
returns void
language sql
security definer
set search_path = public
as $$
  update public.support_notifications
  set sent_at = case when p_ok then now() end,
      attempts = attempts + case when p_count_attempt then 1 else 0 end,
      last_error = left(p_error, 300)
  where id = p_id;
$$;
revoke execute on function public.finish_support_notification(uuid, boolean, text, boolean) from public, anon, authenticated;
