-- accept_staff_invitation() never copied the inviter-supplied display_name
-- onto the accepting user's profile, so the Staff list fell back to showing
-- raw emails/phone numbers for every teammate who never separately set a
-- name. Now it fills it in on acceptance (without overwriting a name the
-- user already has), and this backfills everyone already affected.
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

  if exists (
    select 1 from public.tenant_memberships
    where user_id = auth.uid() and tenant_id = v_invitation.tenant_id and status = 'active'
  ) then
    raise exception 'already_has_active_membership' using errcode = 'P0001';
  end if;

  insert into public.tenant_memberships (tenant_id, user_id, role_id, status, invited_by)
  values (v_invitation.tenant_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by);

  update public.staff_invitations
  set status = 'accepted'
  where id = v_invitation.id;

  update public.users
  set
    active_tenant_id = v_invitation.tenant_id,
    display_name = coalesce(display_name, v_invitation.display_name)
  where id = auth.uid();

  return jsonb_build_object('tenant_id', v_invitation.tenant_id);
end;
$$;

update public.users u
set display_name = si.display_name
from public.tenant_memberships tm
join public.staff_invitations si
  on si.tenant_id = tm.tenant_id
  and si.status = 'accepted'
  and si.display_name is not null
where tm.user_id = u.id
  and u.display_name is null
  and (si.contact = u.email or si.contact = u.phone);
