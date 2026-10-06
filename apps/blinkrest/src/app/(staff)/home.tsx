import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/States';
import { useAuth } from '@/hooks/useAuth';
import { menuImageUrl } from '@/lib/menuImage';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const ACTIVE_STATUSES = ['new', 'accepted', 'preparing', 'ready'];

type ActiveOrder = { order_status: string };

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || 'BR';
}

type RecentOrder = { created_at: string; total_minor: number; order_status: string; customer_id: string | null; items: { item_name_snapshot: string; quantity: number; line_total_minor: number }[] };

type Snap = {
  logoPath: string | null;
  firstName: string | null;
  revenue: number;
  orderCount: number;
  avgOrder: number;
  lastWeekRevenue: number;
  lastWeekCount: number;
  recent: RecentOrder[];
  tables: { id: string; floor_state: string }[];
  occupiedIds: string[];
  pay: { method: string; amount: number }[];
  pendingMinor: number;
  pendingCount: number;
  customers: { id: string; name: string | null }[];
  unreadCount: number;
  activeOrders: ActiveOrder[];
  latestActive: { order_number: string; total_minor: number; table: string | null } | null;
};

const EMPTY_SNAP: Snap = {
  logoPath: null, firstName: null, revenue: 0, orderCount: 0, avgOrder: 0, lastWeekRevenue: 0, lastWeekCount: 0, recent: [],
  tables: [], occupiedIds: [], pay: [], pendingMinor: 0, pendingCount: 0, customers: [], unreadCount: 0, activeOrders: [], latestActive: null,
};

// Remembered across visits: switching tabs unmounts this screen, so without
// this every return showed a skeleton until every query finished again. The
// last snapshot renders instantly and is refreshed in the background.
let homeCache: { tenantId: string; snap: Snap } | null = null;

export default function Home() {
  const { membership, session } = useAuth();
  const cached = homeCache && homeCache.tenantId === membership?.tenantId ? homeCache.snap : null;
  const [snap, setSnap] = useState<Snap>(cached ?? EMPTY_SNAP);
  const [refreshing, setRefreshing] = useState(false);
  const { width } = useWindowDimensions();
  const [loadingFirst, setLoadingFirst] = useState(!cached);
  const [failed, setFailed] = useState(false);
  const [chartRange, setChartRange] = useState<'Today' | 'Week' | 'Month'>('Week');
  const { logoPath, firstName, revenue, orderCount, avgOrder, lastWeekRevenue, lastWeekCount, recent, tables, pay, pendingMinor, pendingCount, customers, unreadCount, activeOrders, latestActive } = snap;
  const occupiedIds = useMemo(() => new Set(snap.occupiedIds), [snap.occupiedIds]);
  const userId = session?.user.id;

  const load = useCallback(async () => {
    if (!membership) return;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const monthAgo = new Date(startOfDay.getTime() - 29 * 86400000);
    const weekAgoStart = new Date(startOfDay.getTime() - 7 * 86400000);

    // Every query at once instead of one after another.
    const [tenantRes, userRes, windowRes, tblRes, openRes, paysRes, unpaidRes, custRes, notesRes, readsRes, activeRes] = await Promise.all([
      supabase.from('tenants').select('logo_path').eq('id', membership.tenantId).maybeSingle(),
      supabase.from('users').select('display_name').eq('id', userId ?? '').maybeSingle(),
      supabase
        .from('orders')
        .select('total_minor, created_at, order_status, customer_id, items:order_items(item_name_snapshot, quantity, line_total_minor)')
        .gte('created_at', monthAgo.toISOString())
        .not('order_status', 'in', '(rejected,cancelled)'),
      supabase.from('restaurant_tables').select('id, floor_state').eq('status', 'active').order('label'),
      supabase.from('orders').select('table_id').in('order_status', ['new', 'accepted', 'preparing', 'ready', 'served']).eq('payment_status', 'unpaid').not('table_id', 'is', null),
      supabase.from('payments').select('amount_minor, method').in('status', ['paid', 'cash_received', 'reconciled']).gte('created_at', startOfDay.toISOString()),
      supabase.from('orders').select('total_minor').eq('payment_status', 'unpaid').not('order_status', 'in', '(rejected,cancelled)'),
      supabase.from('customers').select('id, name').order('created_at', { ascending: false }).limit(4),
      supabase.from('notifications').select('id').order('created_at', { ascending: false }).limit(100),
      supabase.from('notification_reads').select('notification_id').eq('membership_id', membership.id),
      supabase.from('orders').select('order_status, order_number, total_minor, table:restaurant_tables(label)').in('order_status', ACTIVE_STATUSES).order('created_at', { ascending: false }),
    ]);

    if (windowRes.error) {
      if (!homeCache) setFailed(true);
      setLoadingFirst(false);
      return;
    }
    setFailed(false);

    const all = (windowRes.data ?? []) as unknown as RecentOrder[];
    const todayOrders = all.filter((o) => new Date(o.created_at) >= startOfDay);
    const total = todayOrders.reduce((sum, o) => sum + o.total_minor, 0);
    const sameDayLastWeek = all.filter((o) => {
      const t = new Date(o.created_at).getTime();
      return t >= weekAgoStart.getTime() && t < weekAgoStart.getTime() + 86400000;
    });
    const byMethod = new Map<string, number>();
    for (const row of paysRes.data ?? []) byMethod.set(row.method ?? 'other', (byMethod.get(row.method ?? 'other') ?? 0) + row.amount_minor);
    const readIds = new Set((readsRes.data ?? []).map((r) => r.notification_id));
    const active = (activeRes.data ?? []) as unknown as (ActiveOrder & { order_number: string; total_minor: number; table: { label: string } | null })[];
    const first = active[0];

    const next: Snap = {
      logoPath: tenantRes.data?.logo_path ?? null,
      firstName: userRes.data?.display_name?.split(' ')[0] ?? null,
      revenue: total,
      orderCount: todayOrders.length,
      avgOrder: todayOrders.length ? Math.round(total / todayOrders.length) : 0,
      lastWeekRevenue: sameDayLastWeek.reduce((s, o) => s + o.total_minor, 0),
      lastWeekCount: sameDayLastWeek.length,
      recent: all,
      tables: (tblRes.data ?? []) as { id: string; floor_state: string }[],
      occupiedIds: (openRes.data ?? []).map((o) => o.table_id as string),
      pay: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })).sort((a, b) => b.amount - a.amount),
      pendingMinor: (unpaidRes.data ?? []).reduce((s, o) => s + o.total_minor, 0),
      pendingCount: unpaidRes.data?.length ?? 0,
      customers: (custRes.data ?? []) as { id: string; name: string | null }[],
      unreadCount: (notesRes.data ?? []).filter((n) => !readIds.has(n.id)).length,
      activeOrders: active.map((o) => ({ order_status: o.order_status })),
      latestActive: first ? { order_number: first.order_number, total_minor: first.total_minor, table: first.table?.label ?? null } : null,
    };
    homeCache = { tenantId: membership.tenantId, snap: next };
    setSnap(next);
    setLoadingFirst(false);
  }, [membership, userId]);

  useRealtimeRefresh('hometsx', tenantSubs(membership?.tenantId, ['orders', 'payments', 'restaurant_tables', 'customers', 'notifications']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const counts = {
    new: activeOrders.filter((o) => o.order_status === 'new').length,
    accepted: activeOrders.filter((o) => o.order_status === 'accepted').length,
    preparing: activeOrders.filter((o) => o.order_status === 'preparing').length,
    ready: activeOrders.filter((o) => o.order_status === 'ready').length,
  };

  const pct = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
  const revDelta = pct(revenue, lastWeekRevenue);
  const countDelta = pct(orderCount, lastWeekCount);

  const metrics = [
    { label: "Today's revenue", value: formatMinor(revenue), icon: 'rupee' as const, tint: colors.coral50, ink: colors.coral600, go: () => router.push('/(staff)/analytics'), delta: revDelta, sub: lastWeekRevenue ? `vs ${formatMinor(lastWeekRevenue)} last week` : 'No data last week' },
    { label: 'Total orders', value: String(orderCount), icon: 'orders' as const, tint: '#EAF1FF', ink: '#1F5BD6', go: () => router.push('/(staff)/orders'), delta: countDelta, sub: lastWeekCount ? `${orderCount - lastWeekCount >= 0 ? '+' : ''}${orderCount - lastWeekCount} vs last week` : 'No data last week' },
    { label: 'Pending bills', value: String(pendingCount), icon: 'timer' as const, tint: colors.saffron50, ink: '#8A5A00', go: () => router.push('/(staff)/orders?filter=unpaid' as never), delta: null, sub: `${formatMinor(pendingMinor)} to collect` },
    { label: 'Avg order value', value: formatMinor(avgOrder), icon: 'receipt' as const, tint: '#F1EBFF', ink: '#5B21B6', go: () => router.push('/(staff)/analytics'), delta: null, sub: `${activeOrders.length} active now` },
  ];

  const actions = [
    { label: 'Add menu item', icon: 'plus' as const, bg: colors.coral50, fg: colors.coral600, onPress: () => router.push('/(staff)/menu/new') },
    { label: 'Live orders', icon: 'bolt' as const, bg: colors.ink900, fg: colors.saffron400, onPress: () => router.push('/(staff)/orders') },
    { label: 'Manage tables', icon: 'tables' as const, bg: colors.successBg, fg: colors.success, onPress: () => router.push('/(staff)/tables') },
    { label: 'Invite staff', icon: 'users' as const, bg: '#EAF1FF', fg: '#1F5BD6', onPress: () => router.push('/(staff)/staff/invite') },
    { label: 'Create offer', icon: 'percent' as const, bg: colors.saffron50, fg: '#8A5A00', onPress: () => router.push('/(staff)/offers/create') },
    { label: 'View reports', icon: 'chart' as const, bg: '#F1EBFF', fg: '#5B21B6', onPress: () => router.push('/(staff)/analytics') },
  ];

  const chartW = Math.min(width - 40 - 36, 460);
  const chartDays = chartRange === 'Today' ? 1 : chartRange === 'Week' ? 7 : 30;
  const dayStart0 = new Date();
  dayStart0.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: chartRange === 'Today' ? 24 : chartDays }, (_, i) => {
    if (chartRange === 'Today') {
      const s = dayStart0.getTime() + i * 3600000;
      return { v: recent.filter((o) => { const t = new Date(o.created_at).getTime(); return t >= s && t < s + 3600000; }).reduce((a, o) => a + o.total_minor, 0), label: i % 6 === 0 ? `${i}h` : '' };
    }
    const s = dayStart0.getTime() - (chartDays - 1 - i) * 86400000;
    return { v: recent.filter((o) => { const t = new Date(o.created_at).getTime(); return t >= s && t < s + 86400000; }).reduce((a, o) => a + o.total_minor, 0), label: chartRange === 'Week' ? new Date(s).toLocaleDateString('en-IN', { weekday: 'short' }) : i % 5 === 0 ? String(new Date(s).getDate()) : '' };
  });
  const chartTotal = buckets.reduce((a, b) => a + b.v, 0);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.v));
  const bw = chartW / buckets.length - 3;

  const itemTotals = new Map<string, { qty: number; total: number }>();
  for (const o of recent.filter((o) => new Date(o.created_at) >= dayStart0)) {
    for (const it of o.items) {
      const p = itemTotals.get(it.item_name_snapshot) ?? { qty: 0, total: 0 };
      itemTotals.set(it.item_name_snapshot, { qty: p.qty + it.quantity, total: p.total + it.line_total_minor });
    }
  }
  const topItems = [...itemTotals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

  const occupiedCount = tables.filter((t) => occupiedIds.has(t.id)).length;
  const reservedCount = tables.filter((t) => !occupiedIds.has(t.id) && t.floor_state === 'reserved').length;
  const cleaningCount = tables.filter((t) => !occupiedIds.has(t.id) && t.floor_state === 'cleaning').length;
  const freeCount = tables.length - occupiedCount - reservedCount - cleaningCount;
  const payTotal = pay.reduce((s, p) => s + p.amount, 0);
  const PAY_COLORS = [colors.coral500, colors.ink900, colors.saffron400, colors.info];
  const PAY_LABEL: Record<string, string> = { upi: 'UPI', card: 'Card', cash: 'Cash', netbanking: 'Netbanking', wallet: 'Wallet' };

  // This screen is Owner's default home (and the fallback for any
  // unrecognised role) — every other role has its own home and must not
  // land here just by navigating to it directly.
  const correctHome = homePathForRole(membership?.roleName);
  if (correctHome !== '/(staff)/home') return <Redirect href={correctHome} />;

  if (failed || loadingFirst) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{membership?.tenantName}</Text>
          {failed ? (
            <ErrorState icon="home" title="We couldn’t load your dashboard" code="BR-503" onRetry={() => { setFailed(false); setLoadingFirst(true); load(); }} onContact={() => router.push('/(staff)/support')} />
          ) : (
            <>
              <Skeleton style={{ height: 190, borderRadius: 26 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} style={{ width: '47%', height: 110, borderRadius: 22 }} />
                ))}
              </View>
            </>
          )}
        </ScrollView>
        <BottomNav active="home" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 20, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.coral600} />}
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 15,
              backgroundColor: colors.ink900,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {logoPath ? (
              <Image source={{ uri: menuImageUrl(logoPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.saffron400 }}>
                {initials(membership?.tenantName ?? 'BlinkRest')}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }} numberOfLines={1}>
              {membership?.tenantName}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodySemi, color: colors.ink500 }}>{membership?.roleName}</Text>
          </View>
          <Pressable
            onPress={() => router.push('/(staff)/notifications' as never)}
            accessibilityLabel="Notifications"
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell" size={22} color={colors.ink900} />
            {unreadCount > 0 ? (
              <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Greeting */}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, letterSpacing: 1, color: colors.coral700, textTransform: 'uppercase' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
            Good {greeting}{firstName ? `, ${firstName}` : ''}!
          </Text>
          <Text style={{ fontSize: 15, color: colors.ink700, fontFamily: fonts.body }}>
            Here&apos;s what&apos;s happening at {membership?.tenantName} today.
          </Text>
        </View>

        {/* Live orders hero card */}
        <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, gap: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#2FCB7A' }} />
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', letterSpacing: 1 }}>
                LIVE ORDERS
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text style={{ fontSize: 46, fontFamily: fonts.display, color: '#FFFFFF' }}>{activeOrders.length}</Text>
            <Text style={{ fontSize: 15, color: '#E9E1DC', fontFamily: fonts.body }}>active orders right now</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            {[
              { n: counts.new, label: 'New', color: colors.coral500 },
              { n: counts.accepted, label: 'Accepted', color: '#7EA6FF' },
              { n: counts.preparing, label: 'Preparing', color: colors.saffron400 },
              { n: counts.ready, label: 'Ready', color: '#2FCB7A' },
            ].map((s) => (
              <View key={s.label}>
                <Text style={{ fontSize: 22, fontFamily: fonts.display, color: '#FFFFFF' }}>{s.n}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                  <Text style={{ fontSize: 12, color: '#E9E1DC', fontFamily: fonts.body }}>{s.label}</Text>
                </View>
              </View>
            ))}
          </View>
          {latestActive ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: 12,
              }}
            >
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  backgroundColor: colors.coral500,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="bolt" size={17} stroke={2.3} color={colors.ink900} />
              </View>
              <Text style={{ fontSize: 13, color: '#FFFFFF', flex: 1, fontFamily: fonts.body }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold }}>#{latestActive.order_number}</Text>
                {latestActive.table ? ` · ${latestActive.table}` : ''} · {formatMinor(latestActive.total_minor)}
              </Text>
            </View>
          ) : null}
          <View
            onTouchEnd={() => router.push('/(staff)/orders')}
            style={{
              height: 50,
              borderRadius: radius.pill,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: colors.ink900 }}>View live orders</Text>
            <Icon name="right" size={18} stroke={2.4} color={colors.ink900} />
          </View>
        </View>

        {/* Metrics grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {metrics.map((m) => (
            <Pressable
              key={m.label}
              onPress={m.go}
              style={{
                width: '47%',
                backgroundColor: colors.surface,
                borderRadius: 22,
                padding: 16,
                borderWidth: 1,
                borderColor: '#F4ECE6',
                gap: 10,
                ...shadow.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: m.tint, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={m.icon} size={20} stroke={2.1} color={m.ink} />
                </View>
                {m.delta != null ? (
                  <View style={{ height: 22, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: m.delta >= 0 ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: m.delta >= 0 ? colors.success : colors.error }}>{m.delta >= 0 ? '▲' : '▼'} {Math.abs(m.delta).toFixed(1)}%</Text>
                  </View>
                ) : null}
              </View>
              <View>
                <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900 }}>{m.value}</Text>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900, marginTop: 2 }}>{m.label}</Text>
                <Text style={{ fontSize: 11, color: colors.ink500, marginTop: 1 }}>{m.sub}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Quick actions */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>Quick actions</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {actions.map((a) => (
              <View
                key={a.label}
                onTouchEnd={a.onPress}
                style={{
                  width: '31%',
                  flexGrow: 1,
                  minHeight: 100,
                  backgroundColor: colors.surface,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: '#F4ECE6',
                  padding: 14,
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={a.icon} size={21} stroke={2.1} color={a.fg} />
                </View>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{a.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Revenue overview */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Revenue overview</Text>
            <View style={{ flexDirection: 'row', backgroundColor: '#F7F1EC', borderRadius: radius.pill, padding: 3 }}>
              {(['Today', 'Week', 'Month'] as const).map((r) => (
                <Pressable key={r} onPress={() => setChartRange(r)} style={{ height: 28, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: chartRange === r ? colors.ink900 : 'transparent', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 11.5, fontFamily: fonts.bodyExtraBold, color: chartRange === r ? '#FFFFFF' : colors.ink700 }}>{r}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(chartTotal)}</Text>
          <Svg width={chartW} height={110}>
            {buckets.map((b, i) => {
              const h = (b.v / maxBucket) * 96;
              return <Rect key={i} x={i * (bw + 3)} y={110 - h} width={Math.max(2, bw)} height={Math.max(h, b.v ? 3 : 0)} rx={4} fill={i === buckets.length - 1 ? colors.coral500 : '#FFD3C5'} />;
            })}
          </Svg>
          <View style={{ flexDirection: 'row' }}>
            {buckets.map((b, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{b.label}</Text>
            ))}
          </View>
        </View>

        {/* Top-selling items */}
        {topItems.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Top-selling items</Text>
              <Pressable onPress={() => router.push('/(staff)/analytics')}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>See all</Text>
              </Pressable>
            </View>
            {topItems.map(([name, v]) => (
              <View key={name} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{name}</Text>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(v.total)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.coral500, width: `${Math.max(4, (v.total / topItems[0][1].total) * 100)}%` }} />
                </View>
                <Text style={{ fontSize: 11, color: colors.ink500 }}>{v.qty} sold today</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Table occupancy */}
        {tables.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Table occupancy</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{occupiedCount} of {tables.length} tables seated</Text>
              </View>
              <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.coral600 }}>{Math.round((occupiedCount / tables.length) * 100)}%</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {tables.map((t) => {
                const occ = occupiedIds.has(t.id);
                const bg = occ ? colors.coral500 : t.floor_state === 'reserved' ? colors.infoBg : t.floor_state === 'cleaning' ? colors.saffron50 : colors.successBg;
                const bd = occ ? colors.coral500 : t.floor_state === 'reserved' ? colors.info : t.floor_state === 'cleaning' ? colors.saffron400 : '#8FD3AE';
                return <View key={t.id} style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: bg, borderWidth: 1.5, borderColor: bd, borderStyle: t.floor_state === 'cleaning' && !occ ? 'dashed' : 'solid' }} />;
              })}
            </View>
            <Text style={{ fontSize: 11, color: colors.ink500 }}>Occupied {occupiedCount} · Reserved {reservedCount} · Cleaning {cleaningCount} · Free {freeCount}</Text>
            <Pressable onPress={() => router.push('/(staff)/tables')} style={{ height: 40, borderRadius: radius.pill, backgroundColor: colors.coral50, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Manage tables</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Payment breakdown */}
        {pay.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Payment breakdown</Text>
              <Pressable onPress={() => router.push('/(staff)/payments' as never)}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Payments</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
              {pay.slice(0, 4).map((p, i) => (
                <View key={p.method} style={{ flex: p.amount, backgroundColor: PAY_COLORS[i] }} />
              ))}
            </View>
            {pay.slice(0, 4).map((p, i) => (
              <View key={p.method} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: PAY_COLORS[i] }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.ink700 }}>{PAY_LABEL[p.method] ?? p.method}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{Math.round((p.amount / Math.max(1, payTotal)) * 100)}%</Text>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900, minWidth: 74, textAlign: 'right' }}>{formatMinor(p.amount)}</Text>
              </View>
            ))}
            {pendingCount > 0 ? (
              <View style={{ backgroundColor: colors.saffron50, borderRadius: radius.md, padding: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Icon name="timer" size={15} color={colors.warning} />
                <Text style={{ flex: 1, fontSize: 12, fontFamily: fonts.bodyBold, color: colors.warning }}>{formatMinor(pendingMinor)} pending on {pendingCount} open bills</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Recent customers */}
        {customers.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Recent customers</Text>
              <Pressable onPress={() => router.push('/(staff)/customers' as never)}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>View all</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {customers.map((c, i) => (
                <Pressable key={c.id} onPress={() => router.push(`/(staff)/customers/${c.id}` as never)} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 10, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: ['#FFD3C5', '#D6E4FF', '#FFE9A8', '#CDEFD9'][i % 4], alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{initials(c.name ?? '?')}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{c.name ?? 'Guest'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}
