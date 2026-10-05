-- Lets Owner and Manager customise the brand color shown on the customer-
-- facing QR menu (tenants.brand_colors, already present since 0002 but
-- never used until now). Owner gets it automatically via the
-- grant_new_permission_to_owner trigger added in 0038.
insert into public.permissions (key, description) values
  ('menu.branding.manage', 'Customise the customer menu''s brand color')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select '00000000-0000-0000-0000-000000000002', id from public.permissions
where key = 'menu.branding.manage'
on conflict do nothing;
