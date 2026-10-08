-- When a guest adds to an order, the kitchen's timer for that ticket must
-- restart from the moment the new items arrived, not from the first order.
alter table public.orders add column round_started_at timestamptz;
update public.orders set round_started_at = created_at;
alter table public.orders alter column round_started_at set default now();
alter table public.orders alter column round_started_at set not null;

create or replace function public.trg_order_round_started()
returns trigger
language plpgsql
as $$
begin
  if new.current_round is distinct from old.current_round then
    new.round_started_at := now();
  end if;
  return new;
end;
$$;

create trigger orders_round_started
  before update on public.orders
  for each row execute function public.trg_order_round_started();
