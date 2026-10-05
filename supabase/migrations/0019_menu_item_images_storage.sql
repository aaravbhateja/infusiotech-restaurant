-- Public storage bucket for menu item photos. Objects are stored at
-- "<tenant_id>/<menu_item_id>-<random>.<ext>" so RLS can scope writes to the
-- uploader's own tenant via the first path segment, while reads stay public
-- (customers browsing the QR menu are anon/unauthenticated).
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy menu_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'menu-images');

create policy menu_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_permission('menu.create')
  );

create policy menu_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_permission('menu.edit')
  )
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_permission('menu.edit')
  );

create policy menu_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
    and public.has_permission('menu.edit')
  );
