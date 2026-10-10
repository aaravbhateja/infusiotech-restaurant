import { supabase } from '@/lib/supabase';

export type AiResult<T> = { ok: true; data: T } | { ok: false; message: string };

const MESSAGES: Record<string, string> = {
  ai_not_configured: 'AI is not switched on for BlinkRest yet. It still needs a free Groq key added by the BlinkRest team.',
  ai_limit_reached: 'You have used today\'s AI allowance. It resets at midnight.',
  not_authorized: 'You do not have permission to use this.',
  ai_failed: 'The AI could not answer just now. Please try again in a minute.',
};

export async function callAi<T>(body: Record<string, unknown>): Promise<AiResult<T>> {
  const { data, error } = await supabase.functions.invoke('ai-assist', { body });
  if (error) return { ok: false, message: MESSAGES.ai_failed };
  const res = data as (T & { error?: string }) | null;
  if (!res) return { ok: false, message: MESSAGES.ai_failed };
  if (res.error) return { ok: false, message: MESSAGES[res.error] ?? res.error };
  return { ok: true, data: res };
}
