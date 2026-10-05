-- Owner onboarding (create tenant + become Owner) and staff invitation
-- acceptance. Both need security definer functions because inserting into
-- tenant_memberships has no general-purpose RLS policy by design — the only
-- two ways a membership is created are these two controlled paths.

create or replace function public.create_tenant_and_owner(
  p_name text,
  p_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_owner_role_id uuid := '00000000-0000-0000-0000-000000000001';
  v_existing_membership uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select id into v_existing_membership
  from public.tenant_memberships
  where user_id = auth.uid() and status = 'active';

  if v_existing_membership is not null then
    raise exception 'already_has_active_membership' using errcode = 'P0001';
  end if;

  insert into public.tenants (name, slug)
  values (p_name, p_slug)
  returning id into v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, role_id, status, invited_by)
  values (v_tenant_id, auth.uid(), v_owner_role_id, 'active', auth.uid());

  insert into public.subscriptions (tenant_id, plan_id, status)
  select v_tenant_id, id, 'trialing' from public.plans where key = 'starter';

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', p_slug);
end;
$$;

revoke execute on function public.create_tenant_and_owner(text, text) from public, anon;
grant execute on function public.create_tenant_and_owner(text, text) to authenticated;

comment on function public.create_tenant_and_owner(text, text) is
  'Onboarding entry point: the signed-in caller becomes Owner of a brand-new tenant. Fails if they already hold an active membership anywhere (MVP: one active membership per user).';

-- Accept a staff invitation: validates the token, creates the membership,
-- marks the invitation accepted. Raw tokens are never stored — only their
-- hash — so this takes the raw token and hashes it internally.
create or replace function public.accept_staff_invitation(
  p_raw_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation record;
  v_existing_membership uuid;
  v_token_hash text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  v_token_hash := encode(digest(p_raw_token, 'sha256'), 'hex');

  select * into v_invitation
  from public.staff_invitations
  where token_hash = v_token_hash
    and status = 'pending'
    and expires_at > now();

  if v_invitation.id is null then
    raise exception 'invalid_or_expired_invitation' using errcode = 'P0001';
  end if;

  select id into v_existing_membership
  from public.tenant_memberships
  where user_id = auth.uid() and status = 'active';

  if v_existing_membership is not null then
    raise exception 'already_has_active_membership' using errcode = 'P0001';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role_id, status, invited_by)
  values (v_invitation.tenant_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by);

  update public.staff_invitations
  set status = 'accepted'
  where id = v_invitation.id;

  return jsonb_build_object('tenant_id', v_invitation.tenant_id);
end;
$$;

revoke execute on function public.accept_staff_invitation(text) from public, anon;
grant execute on function public.accept_staff_invitation(text) to authenticated;

comment on function public.accept_staff_invitation(text) is
  'Staff activation: hashes the raw invitation token, validates it is pending and unexpired, and creates the membership. Fails if the caller already has an active membership elsewhere.';
