import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { BottomNav } from '@/components/BottomNav';
import { Icon, type IconName } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { menuImageUrl } from '@/lib/menuImage';
import { guardOnline } from '@/lib/offline';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type OrderRow = { id: string; order_number: string; order_status: string; total_minor: number; created_at: string; table_id: string | null; table: { label: string } | null };
type Member = { id: string; display_name: string | null; role_name: string };
type DiscountRequest = { id: string; order_id: string; amount_minor: number; reason: string; order: { order_number: string } | null };

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

export default function ManagerHome() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [seatedTables, setSeatedTables] = useState(0);
  const [revenueToday, setRevenueToday] = useState(0);
  const [team, setTeam] = useState<Member[]>([]);
  const [discountRequests, setDiscountRequests] = useState<DiscountRequest[]>([]);
  const [logoPath, setLogoPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: liveOrders }, { count: tables }, { data: team0 }, { data: discounts }, { data: tenant }, { data: seatedRows }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, order_status, total_minor, created_at, table_id, table:restaurant_tables(label)')
        .in('order_status', ['new', 'accepted', 'preparing', 'ready'])
        .order('created_at'),
      supabase.from('restaurant_tables').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('tenant_memberships').select('id, status, users!tenant_memberships_user_id_fkey(display_name), roles(name)').eq('tenant_id', membership.tenantId).eq('status', 'active').order('joined_at', { ascending: false }).limit(6),
      membership.permissions.has('offers.manage')
        ? supabase.from('discount_requests').select('id, order_id, amount_minor, reason, order:orders(order_number)').eq('status', 'pending').order('created_at')
        : Promise.resolve({ data: [] }),
      supabase.from('tenants').select('logo_path').eq('id', membership.tenantId).maybeSingle(),
      supabase.from('orders').select('table_id').not('table_id', 'is', null).not('order_status', 'in', '(rejected,cancelled)').is('table_released_at', null),
    ]);
    setSeatedTables(new Set((seatedRows ?? []).map((o) => o.table_id)).size);
    setLogoPath(tenant?.logo_path ?? null);
    setOrders((liveOrders as unknown as OrderRow[]) ?? []);
    setTableCount(tables ?? 0);
    setDiscountRequests((discounts as unknown as DiscountRequest[]) ?? []);
    setTeam(
      (team0 ?? []).map((r: any) => ({
        id: r.id,
        display_name: (Array.isArray(r.users) ? r.users[0] : r.users)?.display_name ?? null,
        role_name: (Array.isArray(r.roles) ? r.roles[0] : r.roles)?.name ?? '',
      })),
    );

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: paid } = await supabase
      .from('orders')
      .select('total_minor')
      .in('payment_status', ['paid', 'cash_received', 'reconciled'])
      .gte('created_at', startOfDay.toISOString());
    setRevenueToday((paid ?? []).reduce((s, o) => s + o.total_minor, 0));
  }, [membership]);

  useRealtimeRefresh('managerhometsx', tenantSubs(membership?.tenantId, ['orders', 'payments', 'discount_requests', 'staff_shifts', 'restaurant_tables']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('manager-home')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  const kitchenLoad = orders.filter((o) => o.order_status === 'accepted' || o.order_status === 'preparing').length;

  const alerts = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- display-only staleness check, not state
    const now = Date.now();
    return orders
      .filter((o) => o.order_status === 'new' && now - new Date(o.created_at).getTime() > 5 * 60000)
      .map((o) => ({
        title: `Order #${o.order_number} waiting`,
        sub: `${o.table?.label ?? 'Takeaway'} · not yet accepted`,
        icon: 'timer' as IconName,
        bg: colors.errorBg,
        fg: colors.error,
        orderId: o.id,
      }));
  }, [orders]);

  async function reviewDiscount(req: DiscountRequest, approve: boolean) {
    if (!guardOnline(isOnline)) return;
    setDiscountRequests((prev) => prev.filter((r) => r.id !== req.id));
    const { error } = await supabase.rpc('review_discount_request', { p_request_id: req.id, p_approve: approve });
    if (error) {
      Alert.alert('Could not review request', error.message);
      load();
    }
  }

  if (!membership) return null;
  if (membership.roleName !== 'Manager') return <Redirect href={homePathForRole(membership.roleName)} />;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#E7DBFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {logoPath ? (
              <Image source={{ uri: menuImageUrl(logoPath) ?? undefined }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : (
              <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink900 }}>{initials(membership.tenantName)}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{membership.tenantName}</Text>
            <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: '#F1EBFF', alignSelf: 'flex-start', justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#5B21B6' }}>MANAGER</Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => router.push('/(staff)/orders' as never)} style={{ flex: 1, backgroundColor: colors.ink900, borderRadius: 20, padding: 12 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: '#FFFFFF' }}>{orders.length}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Live orders</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(staff)/tables' as never)} style={{ flex: 1, backgroundColor: colors.coral500, borderRadius: 20, padding: 12 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{seatedTables}/{tableCount}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Tables seated</Text>
          </Pressable>
          <View style={{ flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 20, padding: 12 }}>
            <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(revenueToday)}</Text>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Revenue today</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {([
            ['Menu', 'menu', '/(staff)/menu', '#EAF1FF', '#1F5BD6'],
            ['Staff', 'users', '/(staff)/staff', '#F1EBFF', '#5B21B6'],
            ['Analytics', 'chart', '/(staff)/analytics', colors.successBg, colors.success],
            ['Offers', 'percent', '/(staff)/offers', colors.saffron50, '#8A5A00'],
            ['Cash', 'cash', '/(staff)/cash', colors.infoBg, colors.info],
          ] as const).map(([label, icon, href, bg, fg]) => (
            <Pressable
              key={label}
              onPress={() => router.push(href as never)}
              style={{ width: '18%', flexGrow: 1, aspectRatio: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={icon} size={18} stroke={2.1} color={fg} />
              </View>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {discountRequests.length > 0 ? (
          <Animated.View entering={FadeInDown} layout={LinearTransition.springify().damping(18)} style={{ gap: 10 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Discount requests</Text>
            {discountRequests.map((req) => (
              <Animated.View key={req.id} layout={LinearTransition.springify().damping(18)} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Order #{req.order?.order_number}</Text>
                  <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>{formatMinor(req.amount_minor)}</Text>
                </View>
                <Text style={{ fontSize: 13, color: colors.ink700 }}>{req.reason}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={() => reviewDiscount(req, false)}
                    style={{ flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#F4C7C1', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>Decline</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => reviewDiscount(req, true)}
                    style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Approve</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        {alerts.length > 0 ? (
          <Animated.View entering={FadeInDown} layout={LinearTransition.springify().damping(18)} style={{ gap: 10 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginHorizontal: 4 }}>Needs your attention</Text>
            {alerts.map((a, idx) => (
              <Animated.View key={a.orderId} entering={FadeInDown.delay(idx * 50)} layout={LinearTransition.springify().damping(18)}>
                <Pressable onPress={() => router.push(`/(staff)/orders/${a.orderId}` as never)} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={a.icon} size={19} color={a.fg} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{a.title}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>{a.sub}</Text>
                  </View>
                  <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
                </Pressable>
              </Animated.View>
            ))}
          </Animated.View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>On shift now · {team.length}</Text>
            <Pressable onPress={() => router.push('/(staff)/staff' as never)}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Roster</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row' }}>
            {team.map((m) => (
              <View key={m.id} style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#FFE7A6', marginRight: -8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 13, color: colors.ink900 }}>{initials(m.display_name)}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Kitchen load</Text>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#8A5A00' }}>{kitchenLoad} tickets</Text>
            </View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.bg }}>
              <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.saffron400, width: `${Math.min(100, kitchenLoad * 10)}%` }} />
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Seat guests', icon: 'tables' as const, fg: colors.success, route: '/(staff)/tables' },
            { label: 'Mark sold out', icon: 'ban' as const, fg: colors.error, route: '/(staff)/menu' },
            { label: 'Shift report', icon: 'chart' as const, fg: '#5B21B6', route: '/(staff)/analytics' },
          ].map((a) => (
            <Pressable
              key={a.label}
              onPress={() => router.push(a.route as never)}
              style={{ flex: 1, minHeight: 92, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', padding: 12, justifyContent: 'space-between' }}
            >
              <Icon name={a.icon} size={22} color={a.fg} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <BottomNav active="home" />
    </SafeAreaView>
  );
}
