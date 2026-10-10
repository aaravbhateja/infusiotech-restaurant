import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

// "Take a break" / "End break" for whoever is on shift. Renders nothing when
// there is no open shift, so it can be dropped on any staff home screen.
export function ShiftBreak() {
  const { membership } = useAuth();
  const [onShift, setOnShift] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: shift }, { data: brk }] = await Promise.all([
      supabase.from('staff_shifts').select('id').eq('membership_id', membership.id).is('ended_at', null).maybeSingle(),
      supabase.from('shift_breaks').select('id').eq('membership_id', membership.id).is('ended_at', null).maybeSingle(),
    ]);
    setOnShift(!!shift);
    setOnBreak(!!brk);
  }, [membership]);

  useRealtimeRefresh('shiftbreaktsx', tenantSubs(membership?.tenantId, ['staff_shifts', 'shift_breaks']), load);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  if (!onShift) return null;

  async function toggle() {
    setBusy(true);
    const { error } = await supabase.rpc(onBreak ? 'end_break' : 'start_break');
    setBusy(false);
    if (error) Alert.alert('Could not update break', error.message);
    load();
  }

  return (
    <Pressable
      disabled={busy}
      onPress={toggle}
      style={{ height: 44, borderRadius: radius.pill, backgroundColor: onBreak ? colors.saffron50 : colors.surface, borderWidth: 1.5, borderColor: onBreak ? colors.saffron400 : colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{onBreak ? 'On break · tap to end break' : 'Take a break'}</Text>
    </Pressable>
  );
}
