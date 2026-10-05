-- users_self_read only ever allowed id = auth.uid(), so any screen that
-- embeds tenant_memberships -> users (e.g. the Staff list) silently dropped
-- every teammate's row via the inner join performed by the embedded
-- resource, leaving only the querying user's own membership visible.
create policy users_staff_read on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or (
      public.has_permission('staff.view')
      and exists (
        select 1
        from public.tenant_memberships m
        where m.user_id = public.users.id
          and m.tenant_id = public.current_tenant_id()
          and m.status = 'active'
      )
    )
  );
