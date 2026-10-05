import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BottomNav } from '@/components/BottomNav';
import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

type OrderRow = {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  table: { label: string } | null;
};

const STATUS_META: Record<string, { label: string; icon: IconName; fg: string; bg: string }> = {
  new: { label: 'New', icon: 'bolt', fg: colors.coral700, bg: colors.coral50 },
  accepted: { label: 'Accepted', icon: 'check', fg: '#1F5BD6', bg: '#EAF1FF' },
  preparing: { label: 'Preparing', icon: 'flame', fg: '#8A5A00', bg: '#FFF4D6' },
  ready: { label: 'Ready', icon: 'bell', fg: colors.success, bg: colors.successBg },
  served: { label: 'Served', icon: 'dine', fg: '#5B21B6', bg: '#F1EBFF' },
  rejected: { label: 'Rejected', icon: 'x', fg: colors.error, bg: colors.errorBg },
  cancelled: { label: 'Cancelled', icon: 'x', fg: colors.error, bg: colors.errorBg },
};

const NEXT_STEP: Record<string, { status: string; label: string; icon: IconName; bg: string; fg: string; permission: string }> = {
  new: { status: 'accepted', label: 'Accept', icon: 'check', bg: colors.coral600, fg: '#FFFFFF', permission: 'orders.accept' },
  accepted: { status: 'preparing', label: 'Start preparing', icon: 'flame', bg: '#FFF4D6', fg: '#8A5A00', permission: 'orders.prepare' },
  preparing: { status: 'ready', label: 'Mark ready', icon: 'bell', bg: colors.successBg, fg: colors.success, permission: 'orders.prepare' },
  ready: { status: 'served', label: 'Mark served', icon: 'dine', bg: '#F1EBFF', fg: '#5B21B6', permission: 'orders.serve' },
};

const FILTERS = ['all', 'new', 'accepted', 'preparing', 'ready', 'served', 'rejected', 'cancelled'] as const;

const PAYMENT_LABELS: Record<string, string> = {
  paid: 'Paid online',
  cash_received: 'Cash received',
  reconciled: 'Reconciled',
  refunded: 'Refunded',
  pending: 'Payment pending',
};

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} hr`;
}

function OrdersScreen() {
  const { membership } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(
        'id, order_number, order_status, payment_status, total_minor, currency, created_at, table:restaurant_tables(label)',
      )
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data as unknown as OrderRow[]) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('orders-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${membership.tenantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const o of orders) {
      c[o.order_status] = (c[o.order_status] ?? 0) + 1;
      if (['new', 'accepted', 'preparing', 'ready', 'served'].includes(o.order_status)) c.all += 1;
    }
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    if (filter === 'all') return orders.filter((o) => ['new', 'accepted', 'preparing', 'ready', 'served'].includes(o.order_status));
    return orders.filter((o) => o.order_status === filter);
  }, [orders, filter]);

  async function advance(order: OrderRow) {
    const next = NEXT_STEP[order.order_status];
    if (!next) return;
    setBusyId(order.id);
    const { error } = await supabase.rpc('transition_order_status', {
      p_order_id: order.id,
      p_new_status: next.status,
      p_reason: null,
    });
    setBusyId(null);
    if (error) {
      Alert.alert('Could not update order', error.message);
      return;
    }
    await load();
  }

  async function reject(order: OrderRow, reason: string) {
    setBusyId(order.id);
    const { error } = await supabase.rpc('transition_order_status', {
      p_order_id: order.id,
      p_new_status: 'rejected',
      p_reason: reason,
    });
    setBusyId(null);
    setConfirmingReject(null);
    if (error) {
      Alert.alert('Could not reject order', error.message);
      return;
    }
    await load();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, gap: 8 }}>
        <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
          Live orders
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2FCB7A' }} />
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.success }}>Live</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink700 }}>· {counts.all ?? 0} active</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <AnimatedPressable
              key={f}
              onPress={() => setFilter(f)}
              style={{
                height: 42,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                backgroundColor: active ? colors.ink900 : colors.surface,
                borderWidth: active ? 0 : 1.5,
                borderColor: colors.inputBorder,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900, textTransform: 'capitalize' }}>
                {f}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: fonts.bodyBold,
                  color: active ? colors.ink900 : colors.ink700,
                  backgroundColor: active ? '#FFFFFF' : colors.bg,
                  borderRadius: radius.pill,
                  paddingHorizontal: 7,
                  paddingVertical: 1,
                  overflow: 'hidden',
                }}
              >
                {counts[f] ?? 0}
              </Text>
            </AnimatedPressable>
          );
        })}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 12, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral600} />}
        renderItem={({ item, index }) => {
          const status = STATUS_META[item.order_status] ?? STATUS_META.new;
          const nextStep = NEXT_STEP[item.order_status];
          const canAdvance = !!nextStep && (membership?.permissions.has(nextStep.permission) || membership?.permissions.has('orders.status.update'));
          const next = canAdvance ? nextStep : undefined;
          const closed = ['served', 'rejected', 'cancelled'].includes(item.order_status);
          const isConfirming = confirmingReject === item.id;

          return (
            <Animated.View
              entering={FadeInDown.delay(Math.min(index, 8) * 40).duration(260)}
              layout={LinearTransition.springify().damping(18)}
              style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 12, ...shadow.card }}
            >
              <Pressable onPress={() => router.push(`/(staff)/orders/${item.id}` as never)} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 19, fontFamily: fonts.display, color: colors.ink900 }}>#{item.order_number}</Text>
                  <View style={{ height: 26, paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={item.table ? 'tables' : 'bag'} size={15} stroke={2.2} color={colors.ink700} />
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>
                      {item.table?.label ?? 'Takeaway'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <View style={{ height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: status.bg, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Icon name={status.icon} size={15} stroke={2.3} color={status.fg} />
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: status.fg }}>{status.label}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.ink700, fontFamily: fonts.body }}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <View style={{ flex: 1 }} />
                  <View style={{ height: 26, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="clock" size={14} stroke={2.3} color={colors.ink700} />
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>{timeAgo(item.created_at)}</Text>
                  </View>
                </View>
              </Pressable>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#EADFD7', borderStyle: 'dashed', paddingTop: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>
                    {formatMinor(item.total_minor, item.currency)}
                  </Text>
                  {item.payment_status === 'unpaid' ? (
                    <View style={{ alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E0B860', borderStyle: 'dashed', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#8A5A00' }}>₹ Cash to be collected</Text>
                    </View>
                  ) : (
                    <View style={{ alignSelf: 'flex-start', height: 22, paddingHorizontal: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#8FD3AE', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.success }}>₹ {PAYMENT_LABELS[item.payment_status] ?? item.payment_status}</Text>
                    </View>
                  )}
                </View>
                {!closed && item.order_status === 'new' && membership?.permissions.has('orders.reject') ? (
                  <AnimatedPressable
                    onPress={() => setConfirmingReject(item.id)}
                    style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: '#F4C7C1', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icon name="x" size={20} stroke={2.4} color={colors.error} />
                  </AnimatedPressable>
                ) : null}
                {!closed && next ? (
                  <AnimatedPressable
                    disabled={busyId === item.id}
                    onPress={() => advance(item)}
                    style={{ height: 48, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: next.bg, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Icon name={next.icon} size={18} stroke={2.6} color={next.fg} />
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: next.fg }}>{next.label}</Text>
                  </AnimatedPressable>
                ) : null}
                {closed ? (
                  <AnimatedPressable
                    onPress={() => router.push(`/(staff)/orders/${item.id}` as never)}
                    style={{ height: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
                  >
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>View receipt</Text>
                  </AnimatedPressable>
                ) : null}
              </View>

              {isConfirming ? (
                <Animated.View entering={FadeInDown.duration(180)} style={{ borderRadius: 16, backgroundColor: colors.errorBg, padding: 12, gap: 10 }}>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: '#8E1B12' }}>
                    Reject #{item.order_number}? The customer is notified.
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <AnimatedPressable
                      onPress={() => setConfirmingReject(null)}
                      style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Keep order</Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      onPress={() => reject(item, 'Rejected by staff')}
                      style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Yes, reject</Text>
                    </AnimatedPressable>
                  </View>
                </Animated.View>
              ) : null}
            </Animated.View>
          );
        }}
        ListEmptyComponent={
          <Animated.View entering={FadeInDown} style={{ borderWidth: 1.5, borderColor: colors.inputBorder, borderStyle: 'dashed', borderRadius: 22, padding: 28, alignItems: 'center', gap: 8 }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.saffron50, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="orders" size={28} color="#8A5A00" />
            </View>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Nothing here right now</Text>
            <Text style={{ fontSize: 13, color: colors.ink500, textAlign: 'center' }}>
              Orders in this status will appear the moment they change.
            </Text>
          </Animated.View>
        }
      />
      {membership?.permissions.has('orders.create') ? (
        <AnimatedPressable
          onPress={() => router.push('/(staff)/orders/new' as never)}
          style={{ position: 'absolute', right: 16, bottom: 100, height: 58, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', gap: 8, ...shadow.sheet }}
        >
          <Icon name="plus" size={22} stroke={2.6} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>New order</Text>
        </AnimatedPressable>
      ) : null}
      <BottomNav active="orders" />
    </SafeAreaView>
  );
}

export default function Orders() {
  return (
    <RequireAccess permission="orders.view">
      <OrdersScreen />
    </RequireAccess>
  );
}
