-- Discount approval workflow: a waiter/cashier handling an order can
-- request a manual discount (a complaint, a goodwill gesture, a VIP) but
-- can't just apply it — a manager/owner (anyone with offers.manage, the
-- same authority level that governs promo codes) has to approve it before
-- it touches the bill.

create table public.discount_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  order_id uuid not null references public.orders (id) on delete cascade,
  requested_by uuid not null references public.users (id),
  amount_minor bigint not null check (amount_minor > 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.users (id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index discount_requests_tenant_id_idx on public.discount_requests (tenant_id, created_at desc);

alter table public.discount_requests enable row level security;

create policy discount_requests_read on public.discount_requests
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.has_permission('orders.view'));

create or replace function public.request_discount(p_order_id uuid, p_amount_minor bigint, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_total_minor bigint;
  v_id uuid;
begin
  if not public.has_permission('orders.status.update') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select tenant_id, total_minor into v_tenant_id, v_total_minor
  from public.orders where id = p_order_id and tenant_id = public.current_tenant_id();

  if v_tenant_id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if p_amount_minor > v_total_minor then
    raise exception 'amount_exceeds_total' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.discount_requests where order_id = p_order_id and status = 'pending') then
    raise exception 'request_already_pending' using errcode = 'P0001';
  end if;

  insert into public.discount_requests (tenant_id, order_id, requested_by, amount_minor, reason)
  values (v_tenant_id, p_order_id, auth.uid(), p_amount_minor, trim(p_reason))
  returning id into v_id;

  insert into public.notifications (tenant_id, category, icon, title, body)
  select v_tenant_id, 'orders', 'percent', 'Discount requested · #' || o.order_number, trim(p_reason)
  from public.orders o where o.id = p_order_id;

  return v_id;
end;
$$;

revoke execute on function public.request_discount(uuid, bigint, text) from public, anon;
grant execute on function public.request_discount(uuid, bigint, text) to authenticated;

create or replace function public.review_discount_request(p_request_id uuid, p_approve boolean, p_review_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  if not public.has_permission('offers.manage') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_request from public.discount_requests
  where id = p_request_id and tenant_id = public.current_tenant_id() and status = 'pending';

  if v_request.id is null then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;

  update public.discount_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      reviewed_by = auth.uid(), review_note = p_review_note, reviewed_at = now()
  where id = p_request_id;

  if p_approve then
    update public.orders
    set discount_minor = discount_minor + v_request.amount_minor,
        total_minor = greatest(0, total_minor - v_request.amount_minor)
    where id = v_request.order_id;
  end if;
end;
$$;

revoke execute on function public.review_discount_request(uuid, boolean, text) from public, anon;
grant execute on function public.review_discount_request(uuid, boolean, text) to authenticated;
