-- notify_waiter_call should follow the same trust boundary as every other
-- public write (create_public_order, submit_review): the client never
-- computes the token hash itself, so it never calls this RPC directly —
-- only the call-waiter edge function does, with the service-role key.
revoke execute on function public.notify_waiter_call(text) from anon;
