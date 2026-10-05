-- Lets AcceptInvite show who/what you're joining BEFORE committing to a
-- password and accepting — previously the screen accepted blind. Read-only,
-- reveals nothing for an invalid/expired/already-used token beyond "invalid".
create or replace function public.preview_staff_invitation(p_raw_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_invitation record;
  v_tenant record;
  v_role record;
  v_inviter record;
begin
  select * into v_invitation
  from public.staff_invitations
  where token_hash = encode(digest(p_raw_token, 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now();

  if v_invitation.id is null then
    raise exception 'invalid_or_expired_invitation' using errcode = 'P0001';
  end if;

  select name into v_tenant from public.tenants where id = v_invitation.tenant_id;
  select name into v_role from public.roles where id = v_invitation.role_id;
  select display_name, email into v_inviter from public.users where id = v_invitation.invited_by;

  return jsonb_build_object(
    'tenant_name', v_tenant.name,
    'role_name', v_role.name,
    'invitee_name', v_invitation.display_name,
    'inviter_name', coalesce(v_inviter.display_name, v_inviter.email),
    'expires_at', v_invitation.expires_at
  );
end;
$$;

revoke execute on function public.preview_staff_invitation(text) from public;
grant execute on function public.preview_staff_invitation(text) to anon, authenticated;
