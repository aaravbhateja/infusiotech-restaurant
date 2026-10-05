import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

type Bill = {
  id: string;
  order_number: string;
  total_minor: number;
  table: { label: string } | null;
  customer: { name: string | null; phone: string | null } | null;
};

export default function CashierHome() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [tab, setTab] = useState<'all' | 'dine' | 'takeaway'>('all');
  const [bills, setBills] = useState<Bill[]>([]);
  const [collectedToday, setCollectedToday] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number, total_minor, table:restaurant_tables(label), customer:customers(name, phone)')
      .eq('payment_status', 'unpaid')
      .not('order_status', 'in', '(rejected,cancelled)')
      .order('created_at');
    setBills((data as unknown as Bill[]) ?? []);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: payments } = await supabase.from('payments').select('amount_minor').eq('status', 'cash_received').gte('created_at', startOfDay.toISOString());
    setCollectedToday((payments ?? []).reduce((s, p) => s + p.amount_minor, 0));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('cashier-bills')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  async function collect(bill: Bill, method: 'cash' | 'upi' | 'card') {
    if (!guardOnline(isOnline)) return;
    setBusy(bill.id);
    const { error } = await supabase.rpc('record_cash_payment', { p_order_id: bill.id, p_method: method });
    setBusy(null);
    if (error) Alert.alert('Could not record payment', error.message);
    else load();
  }

  const visible = bills.filter((b) => (tab === 'all' ? true : tab === 'dine' ? !!b.table : !b.table));

  if (membership && membership.roleName !== 'Cashier') return <Redirect href={homePathForRole(membership.roleName)} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cash" size={22} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Counter</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>{membership?.tenantName}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 24, padding: 18, gap: 4 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Cash collected today</Text>
          <Text style={{ fontSize: 32, fontFamily: fonts.display, color: '#FFFFFF' }}>{formatMinor(collectedToday)}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            ['all', 'All bills'],
            ['dine', 'Dine-in'],
            ['takeaway', 'Takeaway'],
          ] as const).map(([key, label]) => {
            const on = tab === key;
            return (
              <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Bills awaiting payment · {visible.length}</Text>
        {visible.map((b, idx) => (
          <Animated.View
            key={b.id}
            entering={FadeInDown.delay(Math.min(idx, 8) * 40).duration(260)}
            exiting={FadeOutUp.duration(200)}
            layout={LinearTransition.springify().damping(18)}
            style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                #{b.order_number} · {b.table?.label ?? b.customer?.name ?? b.customer?.phone ?? 'Takeaway'}
              </Text>
              <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(b.total_minor)}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {([
                ['cash', 'Cash', 'cash'],
                ['upi', 'UPI', 'qr'],
                ['card', 'Card', 'card'],
              ] as const).map(([method, label, icon]) => (
                <AnimatedPressable
                  key={method}
                  disabled={busy === b.id}
                  onPress={() => collect(b, method)}
                  style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.success, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name={icon} size={16} color="#FFFFFF" />
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 13 }}>{busy === b.id ? '…' : label}</Text>
                </AnimatedPressable>
              ))}
            </View>
          </Animated.View>
        ))}
        {visible.length === 0 ? <Text style={{ textAlign: 'center', color: colors.ink500, padding: 24 }}>No bills waiting — you&rsquo;re all caught up.</Text> : null}
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}
