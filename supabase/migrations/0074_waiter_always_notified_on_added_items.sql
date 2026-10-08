-- "More items" notifications (a guest ordered again after being served) must
-- always reach the Waiters, even for restaurants that accept orders manually
-- (where only the Manager was targeted so far).
create or replace function public.set_notification_audience()
returns trigger
language plpgsql
as $$
begin
  if new.audience_roles is null then
    new.audience_roles := public.notification_audience(new.title, new.category);
  end if;
  if new.title like 'More items%' and not ('Waiter' = any(new.audience_roles)) then
    new.audience_roles := array_append(new.audience_roles, 'Waiter');
  end if;
  if not ('Owner' = any(new.audience_roles)) then
    new.audience_roles := array_append(new.audience_roles, 'Owner');
  end if;
  return new;
end;
$$;
