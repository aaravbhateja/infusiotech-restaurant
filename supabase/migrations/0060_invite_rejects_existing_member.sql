-- Inviting someone who is already an active member of this restaurant (the
-- owner inviting their own email, or a repeat invite for a current staff
-- member) used to succeed and hand out an invite code that could never be
-- accepted — accept_staff_invitation rejects anyone who already has an
-- active membership here. Fail at invite time with a clear reason instead.

create or replace function public.create_staff_invitation(
  p_tenant_id uuid,
  p_contact text,
  p_role_id uuid,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_raw_token text;
  v_token_hash text;
  v_invitation_id uuid;
  v_contact text := trim(p_contact);
  v_digits text := right(regexp_replace(trim(p_contact), '\D', '', 'g'), 10);
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('staff.invite') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.roles where id = p_role_id and (tenant_id is null or tenant_id = p_tenant_id)
  ) then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.tenant_memberships m
    join public.users u on u.id = m.user_id
    where m.tenant_id = p_tenant_id
      and m.status = 'active'
      and (
        (position('@' in v_contact) > 0 and lower(u.email) = lower(v_contact))
        or (position('@' in v_contact) = 0 and length(v_digits) >= 10
            and right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = v_digits)
      )
  ) then
    raise exception 'already_a_member' using errcode = 'P0001';
  end if;

  v_raw_token := encode(gen_random_bytes(24), 'base64');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  insert into public.staff_invitations (tenant_id, contact, display_name, role_id, token_hash, expires_at, invited_by)
  values (p_tenant_id, p_contact, p_display_name, p_role_id, v_token_hash, now() + interval '7 days', auth.uid())
  returning id into v_invitation_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, after_summary)
  values (p_tenant_id, auth.uid(), 'staff.invite', 'staff_invitations', v_invitation_id,
    jsonb_build_object('contact', p_contact, 'role_id', p_role_id));

  return jsonb_build_object('invitation_id', v_invitation_id, 'raw_token', v_raw_token);
end;
$$;
