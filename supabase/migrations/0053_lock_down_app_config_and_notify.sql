-- Two real security holes, found while auditing for store submission:
--
-- 1. app_config (0033) stores the Supabase service-role key and the
--    send-push function's URL, used by notify_push_on_insert() to call out
--    to Expo's push API. It was created with no row-level security at all,
--    and Supabase grants anon/authenticated broad default privileges on
--    every public table — so any unauthenticated caller could read the
--    service-role key straight out of the table via PostgREST
--    (`select * from app_config`), which hands them full admin access to
--    every tenant's data, bypassing every RLS policy in this schema.
--
-- 2. notify() (0012) inserts into public.notifications with no permission
--    check, and was left executable by anon/authenticated by default (no
--    migration ever revoked it, unlike every other internal trigger
--    helper). It is only ever called from database triggers — grep confirms
--    no client or edge-function code calls it — so anyone with the anon key
--    could call `rpc('notify', {...})` directly to insert an arbitrary
--    title/body into any tenant_id they guess, which notify_push_on_insert
--    then pushes to that restaurant's staff as a real notification
--    (a phishing/spam vector with no authentication at all).

revoke all on public.app_config from public, anon, authenticated;
alter table public.app_config enable row level security;
-- No policies: only the table owner / service role can touch it, same
-- lockdown pattern as every other service-role-only table in this schema.

revoke execute on function public.notify(uuid, text, text, text, text, text, uuid) from public, anon, authenticated;
