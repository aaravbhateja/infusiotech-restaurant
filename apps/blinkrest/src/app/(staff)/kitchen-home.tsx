import { Redirect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { Easing, FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const DARK = { bg: '#141110', card: '#2A2422', text: '#FFFFFF', sub: '#C9BDB6' };
const LATE_MINUTES = 10;

function PulsingDot() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' }, style]} />;
}

type Item = { item_name_snapshot: string; quantity: number; station: string };
type Ticket = {
  id: string;
  order_number: string;
  order_status: 'accepted' | 'preparing' | 'ready';
  created_at: string;
  table: { label: string } | null;
  items: Item[];
};

function minutesSince(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

export default function KitchenHome() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [station, setStation] = useState('all');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, order_status, created_at, table:restaurant_tables(label)')
      .in('order_status', ['accepted', 'preparing'])
      .order('created_at');
    const list = (orders as unknown as Omit<Ticket, 'items'>[]) ?? [];

    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('order_status', 'ready');
    setReadyCount(count ?? 0);

    if (list.length === 0) {
      setTickets([]);
      return;
    }
    const { data: items } = await supabase.from('order_items').select('order_id, item_name_snapshot, quantity, menu_item:menu_items(station)').in('order_id', list.map((o) => o.id));
    setTickets(
      list.map((o) => ({
        ...o,
        items: (items ?? [])
          .filter((i) => i.order_id === o.id)
          .map((i) => ({ item_name_snapshot: i.item_name_snapshot, quantity: i.quantity, station: (i.menu_item as any)?.station ?? 'general' })),
      })),
    );
  }, []);

  useRealtimeRefresh('kitchenhometsx', tenantSubs(membership?.tenantId, ['orders', 'order_items', 'menu_items']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [membership, load]);

  async function advance(t: Ticket) {
    if (!guardOnline(isOnline)) return;
    const next = t.order_status === 'accepted' ? 'preparing' : 'ready';
    if (next === 'ready') {
      setTickets((prev) => prev.filter((x) => x.id !== t.id));
      setReadyCount((c) => c + 1);
    } else {
      setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, order_status: 'preparing' } : x)));
    }
    const { error } = await supabase.rpc('transition_order_status', { p_order_id: t.id, p_new_status: next, p_reason: null });
    if (error) {
      Alert.alert('Could not update', error.message);
      load();
    }
  }

  const stations = Array.from(new Set(tickets.flatMap((t) => t.items.map((i) => i.station))));
  const visibleTickets = tickets
    .map((t) => ({ ...t, items: station === 'all' ? t.items : t.items.filter((i) => i.station === station) }))
    .filter((t) => t.items.length > 0);

  const qCount = tickets.filter((t) => t.order_status === 'accepted').length;
  const cCount = tickets.filter((t) => t.order_status === 'preparing').length;

  if (membership && membership.roleName !== 'Kitchen Staff') return <Redirect href={homePathForRole(membership.roleName)} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: DARK.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: colors.saffron400, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chef" size={24} stroke={2} color={colors.ink900} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 24, fontFamily: fonts.display, color: DARK.text }}>Kitchen queue</Text>
            <Text style={{ fontSize: 13, color: DARK.sub }}>{membership?.tenantName}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[
            { label: 'Queued', value: qCount, color: '#FF7A57' },
            { label: 'Cooking', value: cCount, color: colors.saffron400 },
            { label: 'Ready', value: readyCount, color: '#2FCB7A' },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: DARK.card, borderRadius: 16, padding: 10, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {stations.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {['all', ...stations].map((s) => {
              const active = station === s;
              return (
                <AnimatedPressable
                  key={s}
                  onPress={() => setStation(s)}
                  style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: active ? colors.saffron400 : DARK.card, justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: active ? colors.ink900 : '#E9E1DC', textTransform: 'capitalize' }}>
                    {s === 'all' ? 'All stations' : s} · {s === 'all' ? tickets.length : tickets.filter((t) => t.items.some((i) => i.station === s)).length}
                  </Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        ) : null}

        {visibleTickets.map((t, idx) => {
          const s = t.order_status;
          const minutesLate = Math.floor((now - new Date(t.created_at).getTime()) / 60000);
          const isLate = minutesLate >= LATE_MINUTES;
          const head = isLate ? '#D9381A' : s === 'preparing' ? colors.saffron400 : colors.coral500;
          const btnLabel = s === 'accepted' ? 'Start cooking' : 'Mark ready';
          const btnIcon = s === 'accepted' ? 'flame' : 'bell';
          const btnBg = s === 'accepted' ? colors.ink900 : colors.success;

          return (
            <Animated.View
              key={t.id}
              entering={FadeInDown.delay(Math.min(idx, 8) * 50).springify().damping(16)}
              layout={LinearTransition.springify().damping(18)}
              style={{ backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', borderWidth: isLate ? 2 : 0, borderColor: '#D9381A' }}
            >
              <View style={{ backgroundColor: head, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {isLate ? <PulsingDot /> : null}
                <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>#{t.order_number}</Text>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{t.table?.label ?? 'Takeaway'}</Text>
                <View style={{ height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.92)', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="clock" size={15} stroke={2.4} color={colors.ink900} />
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{minutesSince(t.created_at)}</Text>
                </View>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                {t.items.map((i, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ minWidth: 34, height: 34, borderRadius: 10, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 17, color: '#FFFFFF' }}>{i.quantity}×</Text>
                    </View>
                    <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{i.item_name_snapshot}</Text>
                  </View>
                ))}
                <AnimatedPressable onPress={() => advance(t)} style={{ marginTop: 4, height: 54, borderRadius: 16, backgroundColor: btnBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Icon name={btnIcon} size={20} stroke={2.4} color="#FFFFFF" />
                  <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{btnLabel}</Text>
                </AnimatedPressable>
              </View>
            </Animated.View>
          );
        })}

        {visibleTickets.length === 0 ? (
          <View style={{ alignItems: 'center', padding: 32, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: DARK.card, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chef" size={32} stroke={1.8} color={colors.saffron400} />
            </View>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: DARK.text }}>Kitchen is clear</Text>
            <Text style={{ textAlign: 'center', color: DARK.sub, fontSize: 13 }}>
              {station === 'all' ? 'New accepted orders show up here the moment they arrive.' : `No tickets for ${station} right now.`}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}
