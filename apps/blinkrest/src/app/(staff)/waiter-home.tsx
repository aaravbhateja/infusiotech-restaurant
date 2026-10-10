import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { ShiftBreak } from '@/components/ShiftBreak';
import { PartPaymentSheet, type PartPayOrder } from '@/components/PartPaymentSheet';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type OrderRow = {
  id: string;
  order_number: string;
  order_status: string;
  total_minor: number;
  created_at: string;
  table: { label: string } | null;
};

type ToCollect = { id: string; order_number: string; total_minor: number; amount_paid_minor: number; bill_requested_at: string | null; table: { label: string } | null };

const STATUS_META: Record<string, { label: string; icon: 'bolt' | 'flame' | 'bell' | 'timer'; bg: string; fg: string }> = {
  new: { label: 'New order', icon: 'bolt', bg: colors.coral50, fg: colors.coral700 },
  accepted: { label: 'Accepted', icon: 'flame', bg: '#EAF1FF', fg: '#1F5BD6' },
  preparing: { label: 'In kitchen', icon: 'flame', bg: '#FFF4D6', fg: '#8A5A00' },
  ready: { label: 'Food ready', icon: 'bell', bg: colors.successBg, fg: colors.success },
};

function elapsed(startedAt: string, now: number) {
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function WaiterHome() {
  const { membership, session } = useAuth();
  const isOnline = useIsOnline();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [shiftStartedAt, setShiftStartedAt] = useState<string | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [ordersTaken, setOrdersTaken] = useState(0);
  const [toCollect, setToCollect] = useState<ToCollect[]>([]);
  const [splitting, setSplitting] = useState<PartPayOrder | null>(null);
  const [heldMinor, setHeldMinor] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, order_status, total_minor, created_at, table:restaurant_tables(label)')
      .in('order_status', ['new', 'accepted', 'preparing', 'ready'])
      .not('table_id', 'is', null)
      .order('created_at', { ascending: false });
    setOrders((data as unknown as OrderRow[]) ?? []);

    if (membership) {
      const [{ data: unpaid }, { data: held }] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, total_minor, amount_paid_minor, bill_requested_at, table:restaurant_tables(label)')
          .or(`served_by.eq.${membership.id},bill_requested_at.not.is.null`)
          .eq('order_status', 'served')
          .eq('payment_status', 'unpaid')
          .order('served_at', { ascending: false }),
        supabase.from('payments').select('amount_minor').eq('collected_by', membership.id).eq('via_waiter', true).eq('method', 'cash').is('handover_id', null).eq('status', 'cash_received'),
      ]);
      setToCollect((unpaid as unknown as ToCollect[]) ?? []);
      setHeldMinor((held ?? []).reduce((sum, p) => sum + p.amount_minor, 0));
    }
  }, [membership]);

  const loadShift = useCallback(async () => {
    if (!membership || !session) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [{ data: shift }, { count }] = await Promise.all([
      supabase.from('staff_shifts').select('started_at').eq('membership_id', membership.id).is('ended_at', null).maybeSingle(),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('taken_by', session.user.id).gte('created_at', startOfDay.toISOString()),
    ]);
    setShiftStartedAt(shift?.started_at ?? null);
    setOrdersTaken(count ?? 0);
  }, [membership, session]);

  useRealtimeRefresh('waiterhometsx', tenantSubs(membership?.tenantId, ['orders', 'staff_shifts', 'restaurant_tables', 'payments', 'cash_handovers']), () => {
    load();
    loadShift();
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    loadShift();
  }, [membership, load, loadShift]);

  useEffect(() => {
    if (!shiftStartedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [shiftStartedAt]);

  async function toggleShift() {
    if (!guardOnline(isOnline)) return;
    setShiftBusy(true);
    if (shiftStartedAt) await supabase.rpc('end_shift');
    else await supabase.rpc('start_shift');
    setShiftBusy(false);
    loadShift();
  }

  const readyOrders = orders.filter((o) => o.order_status === 'ready');

  async function markServed(order: OrderRow) {
    if (!guardOnline(isOnline)) return;
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    const { error } = await supabase.rpc('transition_order_status', { p_order_id: order.id, p_new_status: 'served', p_reason: null });
    if (error) {
      Alert.alert('Could not update order', error.message);
      await load();
    }
  }

  async function collectPayment(o: ToCollect, method: 'upi' | 'card' | 'cash') {
    if (!guardOnline(isOnline)) return;
    const label = method === 'upi' ? 'UPI' : method === 'card' ? 'Card' : 'Cash';
    Alert.alert(`Record ${formatMinor(o.total_minor - o.amount_paid_minor)} by ${label}?`, `${o.table?.label ?? 'Order'} · #${o.order_number}. Confirm the guest has paid.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `${label} received`,
        onPress: async () => {
          const { error } = await supabase.rpc('record_cash_payment', { p_order_id: o.id, p_method: method });
          if (error) Alert.alert('Could not record payment', error.message);
          load();
        },
      },
    ]);
  }

  if (membership && membership.roleName !== 'Waiter') return <Redirect href={homePathForRole(membership.roleName)} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFD3C5', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink900 }}>
              {(membership?.roleName ?? 'W')[0]}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>My tables</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.coral50, justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.coral700 }}>WAITER</Text>
              </View>
              <Text style={{ fontSize: 13, color: colors.ink700 }}>{membership?.tenantName}</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: colors.ink900, borderRadius: 20, padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: '#C9BDB6' }}>{shiftStartedAt ? 'On shift' : 'Off shift'}</Text>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: '#FFFFFF' }}>
              {shiftStartedAt ? elapsed(shiftStartedAt, now) : '00:00:00'}
            </Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 20, padding: 14, gap: 4, justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{ordersTaken}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Orders taken today</Text>
          </View>
        </View>
        <Pressable
          disabled={shiftBusy}
          onPress={toggleShift}
          style={{ height: 48, borderRadius: radius.pill, backgroundColor: shiftStartedAt ? colors.errorBg : colors.successBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: shiftStartedAt ? colors.error : colors.success }}>
            {shiftBusy ? 'Please wait…' : shiftStartedAt ? 'End shift' : 'Start shift'}
          </Text>
        </Pressable>
        <ShiftBreak />

        {readyOrders.length > 0 ? (
          <Animated.View entering={FadeInDown.springify().damping(14)} style={{ backgroundColor: colors.success, borderRadius: 24, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bell" size={22} stroke={2.2} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', letterSpacing: 1 }}>READY AT THE PASS</Text>
                <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>
                  {readyOrders[0].table?.label ?? 'Order'} · #{readyOrders[0].order_number}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={() => markServed(readyOrders[0])}
              style={{ height: 48, borderRadius: radius.pill, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Icon name="dine" size={18} color={colors.success} />
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.success }}>Mark served</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {membership?.permissions.has('payments.cash.collect') ? (
          <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 22, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>BILLS & CASH IN MY HAND</Text>
                <Text style={{ fontSize: 24, fontFamily: fonts.display, color: heldMinor > 0 ? colors.warning : colors.ink900 }}>{formatMinor(heldMinor)}</Text>
              </View>
              <Pressable onPress={() => router.push('/(staff)/cash' as never)} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.ink900, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 13 }}>{heldMinor > 0 ? 'Hand over' : 'My cash'}</Text>
              </Pressable>
            </View>
            {toCollect.map((o) => (
              <View key={o.id} style={{ gap: 8, borderTopWidth: 1, borderTopColor: '#F4ECE6', paddingTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{o.table?.label ?? 'Order'} · #{o.order_number}</Text>
                    <Text style={{ fontSize: 12, fontFamily: o.bill_requested_at ? fonts.bodyExtraBold : fonts.body, color: o.bill_requested_at ? colors.coral700 : colors.ink500 }}>
                      {o.bill_requested_at ? 'Guest asked for the bill' : 'Served · unpaid'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(o.total_minor - o.amount_paid_minor)}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {([['upi', 'UPI'], ['card', 'Card'], ['cash', 'Cash']] as const).map(([m, label]) => (
                    <Pressable key={m} onPress={() => collectPayment(o, m)} style={{ flex: 1, height: 42, borderRadius: radius.pill, backgroundColor: m === 'upi' ? colors.ink900 : colors.surface, borderWidth: m === 'upi' ? 0 : 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 13, color: m === 'upi' ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  onPress={() => setSplitting({ id: o.id, label: `${o.table?.label ?? 'Order'} · #${o.order_number}`, totalMinor: o.total_minor, paidMinor: o.amount_paid_minor })}
                  style={{ alignSelf: 'flex-start' }}
                >
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Split bill / part payment</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {orders.map((o, idx) => {
            const meta = STATUS_META[o.order_status] ?? STATUS_META.new;
            return (
              <Animated.View key={o.id} entering={FadeInDown.delay(Math.min(idx, 8) * 40).duration(260)} layout={LinearTransition.springify().damping(18)} style={{ width: '47%' }}>
              <Pressable
                onPress={() => router.push(`/(staff)/orders/${o.id}` as never)}
                style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 2, borderColor: meta.bg, padding: 14, gap: 8, ...shadow.card }}
              >
                <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{o.table?.label}</Text>
                <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: meta.bg, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name={meta.icon} size={13} stroke={2.4} color={meta.fg} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: meta.fg }}>{meta.label}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>
                  #{o.order_number} · {formatMinor(o.total_minor)}
                </Text>
              </Pressable>
              </Animated.View>
            );
          })}
          {orders.length === 0 ? (
            <Text style={{ color: colors.ink500, fontFamily: fonts.body }}>No active tables right now.</Text>
          ) : null}
        </View>
      </ScrollView>

      <AnimatedPressable
        onPress={() => router.push('/(staff)/orders/new' as never)}
        style={{ position: 'absolute', right: 16, bottom: 100, height: 58, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadow.sheet }}
      >
        <Icon name="plus" size={22} stroke={2.6} color="#FFFFFF" />
        <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>Take order</Text>
      </AnimatedPressable>
      <BottomNav active="home" />
      <PartPaymentSheet order={splitting} onClose={() => setSplitting(null)} onChanged={load} />
    </SafeAreaView>
  );
}
