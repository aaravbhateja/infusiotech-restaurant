import { useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';

export type RealtimeSub = { table: string; filter?: string };

// Re-runs `onChange` whenever any subscribed table changes (insert, update
// or delete), so a screen reflects changes made on other devices — and its
// own actions — without a manual refresh. Bursts of events (an order status
// change touches several rows) collapse into one reload.
export function useRealtimeRefresh(name: string, subs: RealtimeSub[], onChange: () => void) {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });

  const key = subs.map((s) => `${s.table}:${s.filter ?? ''}`).join('|');

  useEffect(() => {
    if (subs.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler.current(), 120);
    };
    let channel = supabase.channel(`rt-${name}-${Math.random().toString(36).slice(2, 8)}`);
    for (const s of subs) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, fire);
    }
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the subscription list
  }, [name, key]);
}

export function tenantSubs(tenantId: string | undefined, tables: string[]): RealtimeSub[] {
  return tenantId ? tables.map((table) => ({ table, filter: `tenant_id=eq.${tenantId}` })) : [];
}
