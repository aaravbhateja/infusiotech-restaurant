import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { menuImageUrl } from '@/lib/menuImage';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

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

export default function Home() {
  const { membership } = useAuth();
  const [revenue, setRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [avgOrder, setAvgOrder] = useState(0);
  const [activeOrders, setActiveOrders] = useState<ActiveOrder[]>([]);
  const [latestActive, setLatestActive] = useState<{ order_number: string; total_minor: number; table: string | null } | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (membership) {
      const { data: tenant } = await supabase.from('tenants').select('logo_path').eq('id', membership.tenantId).maybeSingle();
      setLogoPath(tenant?.logo_path ?? null);
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: todayOrders } = await supabase
      .from('orders')
      .select('total_minor')
      .gte('created_at', startOfDay.toISOString())
      .not('order_status', 'in', '(rejected,cancelled)');

    const total = (todayOrders ?? []).reduce((sum, o) => sum + o.total_minor, 0);
    setRevenue(total);
    setOrderCount(todayOrders?.length ?? 0);
    setAvgOrder(todayOrders?.length ? Math.round(total / todayOrders.length) : 0);

    const { data: active } = await supabase
      .from('orders')
      .select('order_status, order_number, total_minor, table:restaurant_tables(label)')
      .in('order_status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false });

    setActiveOrders((active as unknown as ActiveOrder[]) ?? []);
    const first = (active as any)?.[0];
    setLatestActive(
      first
        ? { order_number: first.order_number, total_minor: first.total_minor, table: first.table?.label ?? null }
        : null,
    );
  }, [membership]);

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

  const metrics = [
    { label: "Today's revenue", value: formatMinor(revenue), icon: 'rupee' as const, tint: colors.coral50, ink: colors.coral600 },
    { label: 'Total orders', value: String(orderCount), icon: 'orders' as const, tint: '#EAF1FF', ink: '#1F5BD6' },
    { label: 'Active now', value: String(activeOrders.length), icon: 'timer' as const, tint: colors.saffron50, ink: '#8A5A00' },
    { label: 'Avg order value', value: formatMinor(avgOrder), icon: 'receipt' as const, tint: '#F1EBFF', ink: '#5B21B6' },
  ];

  const actions = [
    { label: 'Live orders', icon: 'bolt' as const, bg: colors.ink900, fg: colors.saffron400, onPress: () => router.push('/(staff)/orders') },
    { label: 'Manage tables', icon: 'tables' as const, bg: colors.successBg, fg: colors.success, onPress: () => router.push('/(staff)/tables') },
    { label: 'More', icon: 'more' as const, bg: '#EAF1FF', fg: '#1F5BD6', onPress: () => router.push('/(staff)/more') },
  ];

  // This screen is Owner's default home (and the fallback for any
  // unrecognised role) — every other role has its own home and must not
  // land here just by navigating to it directly.
  const correctHome = homePathForRole(membership?.roleName);
  if (correctHome !== '/(staff)/home') return <Redirect href={correctHome} />;

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
          <View
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
          </View>
        </View>

        {/* Greeting */}
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, letterSpacing: 1, color: colors.coral700, textTransform: 'uppercase' }}>
            {new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
          </Text>
          <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
            Good {greeting}!
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
            <View
              key={m.label}
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
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: m.tint, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={m.icon} size={20} stroke={2.1} color={m.ink} />
              </View>
              <View>
                <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900 }}>{m.value}</Text>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900, marginTop: 2 }}>{m.label}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>Quick actions</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {actions.map((a) => (
              <View
                key={a.label}
                onTouchEnd={a.onPress}
                style={{
                  flex: 1,
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
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}
