-- Staff invitation creation as an RPC (not a REST route) so the raw token
-- is generated and hashed in one place regardless of caller (the Flutter
-- app calls this directly via supabase.rpc). The raw token is returned
-- exactly once, in this response, and never stored.

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
begin
  if p_tenant_id <> public.current_tenant_id() or not public.has_permission('staff.invite') then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.roles where id = p_role_id and (tenant_id is null or tenant_id = p_tenant_id)
  ) then
    raise exception 'invalid_role' using errcode = 'P0001';
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

revoke execute on function public.create_staff_invitation(uuid, text, uuid, text) from public, anon;
grant execute on function public.create_staff_invitation(uuid, text, uuid, text) to authenticated;

comment on function public.create_staff_invitation(uuid, text, uuid, text) is
  'Creates a staff invitation and returns the one-time raw token (never stored). Caller must hold staff.invite for the target tenant.';
