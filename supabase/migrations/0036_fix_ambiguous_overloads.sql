-- 0027 added record_cash_payment(p_order_id, p_method default 'cash') but
-- never dropped the original record_cash_payment(p_order_id) from 0011.
-- Calling the RPC with only p_order_id is now ambiguous between the two
-- overloads ("could not choose the best candidate function"), breaking
-- every cash/UPI/card payment recording.
drop function if exists public.record_cash_payment(uuid);

grant execute on function public.record_cash_payment(uuid, text) to authenticated;
