import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type RealtimeSub = { table: string; filter?: string };

// Safety net: even if the realtime socket silently stops delivering (a
// sleeping phone, a flaky network, a dropped websocket), the screen still
// catches up within this many ms.
const POLL_MS = 5000;
const RECONNECT_MS = 3000;

// Re-runs `onChange` whenever any subscribed table changes (insert, update
// or delete), so a screen reflects changes made on other devices — and its
// own actions — without a manual refresh. Bursts of events (an order status
// change touches several rows) collapse into one reload.
//
// To stay live reliably it also:
//  - reloads the moment the subscription is (re)established, so anything
//    that changed while the screen was loading or the socket was down is not
//    missed;
//  - reconnects on its own when the channel errors, times out or closes;
//  - reloads when the app returns to the foreground;
//  - polls slowly as a last resort;
//  - does all of the above only while the screen is focused (stacked screens
//    underneath stay mounted but idle).
export function useRealtimeRefresh(name: string, subs: RealtimeSub[], onChange: () => void) {
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  });
  const focused = useIsFocused();

  const key = subs.map((s) => `${s.table}:${s.filter ?? ''}`).join('|');

  useEffect(() => {
    if (subs.length === 0 || !focused) return;
    let disposed = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const fire = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => handler.current(), 120);
    };

    const connect = () => {
      if (disposed) return;
      const ch = supabase.channel(`rt-${name}-${Math.random().toString(36).slice(2, 8)}`);
      let c = ch;
      for (const s of subs) {
        c = c.on('postgres_changes', { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) }, fire);
      }
      channel = ch;
      c.subscribe((status) => {
        if (disposed || channel !== ch) return;
        if (status === 'SUBSCRIBED') {
          fire();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          supabase.removeChannel(ch);
          channel = null;
          if (retry) clearTimeout(retry);
          retry = setTimeout(connect, RECONNECT_MS);
        }
      });
    };

    connect();
    const poll = setInterval(() => handler.current(), POLL_MS);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') fire();
    });
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fire();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);

    return () => {
      disposed = true;
      if (debounce) clearTimeout(debounce);
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      appState.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the subscription list
  }, [name, key, focused]);
}

export function tenantSubs(tenantId: string | undefined, tables: string[]): RealtimeSub[] {
  return tables.length && tenantId ? tables.map((table) => ({ table, filter: `tenant_id=eq.${tenantId}` })) : [];
}
