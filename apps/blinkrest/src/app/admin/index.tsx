import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

type Stats = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  new_tenants_7d: number;
  orders_today: number;
  gmv_today_minor: number;
  open_tickets: number;
  trialing_subscriptions: number;
};

type TenantRow = {
  tenant_id: string;
  name: string;
  slug: string;
  status: string;
  owner_email: string | null;
  plan_key: string | null;
  subscription_status: string | null;
  staff_count: number;
  table_count: number;
  orders_last_30d: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (search?: string) => {
    const [{ data: statsData }, { data: tenantData }] = await Promise.all([
      supabase.rpc('admin_platform_stats'),
      supabase.rpc('admin_list_tenants', { p_search: search?.trim() || null }),
    ]);
    setStats(statsData ?? null);
    setTenants((tenantData as TenantRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query, load]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/admin-login');
  }

  const cards: { label: string; value: string; color: string }[] = stats
    ? [
        { label: 'Active restaurants', value: String(stats.active_tenants), color: colors.success },
        { label: 'Suspended', value: String(stats.suspended_tenants), color: colors.error },
        { label: 'New this week', value: String(stats.new_tenants_7d), color: colors.coral600 },
        { label: 'Orders today', value: String(stats.orders_today), color: colors.ink900 },
        { label: 'GMV today', value: formatMinor(stats.gmv_today_minor), color: colors.ink900 },
        { label: 'Open tickets', value: String(stats.open_tickets), color: '#8A5A00' },
      ]
    : [];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900 }}>Platform console</Text>
            <Text style={{ fontSize: 13, color: colors.ink500 }}>InfusioTech · BlinkRest</Text>
          </View>
          <Pressable onPress={() => router.push('/admin/kyc' as never)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Icon name="shield" size={20} color={colors.ink900} />
          </Pressable>
          <Pressable onPress={() => router.push('/admin/support' as never)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Icon name="help" size={20} color={colors.ink900} />
          </Pressable>
          <Pressable onPress={signOut} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="logout" size={20} color={colors.error} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {cards.map((c) => (
            <View key={c.label} style={{ width: '31%', backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 12, gap: 4 }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: c.color }}>{c.value}</Text>
              <Text style={{ fontSize: 11, color: colors.ink500, fontFamily: fonts.bodyBold }}>{c.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 50, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Icon name="search" size={19} color={colors.ink500} />
          <TextInput value={query} onChangeText={setQuery} placeholder="Search restaurants, slugs, owner emails" placeholderTextColor={colors.ink500} style={{ flex: 1, fontSize: 15, color: colors.ink900 }} />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 1 }}>RESTAURANTS · {tenants.length}</Text>
          {loading ? (
            <Text style={{ color: colors.ink500 }}>Loading…</Text>
          ) : (
            tenants.map((t) => (
              <Pressable
                key={t.tenant_id}
                onPress={() => router.push(`/admin/tenants/${t.tenant_id}` as never)}
                style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 8, ...shadow.card }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 17, fontFamily: fonts.bodyExtraBold, color: colors.ink900, flex: 1 }}>{t.name}</Text>
                  <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: t.status === 'active' ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: t.status === 'active' ? colors.success : colors.error, textTransform: 'uppercase' }}>{t.status}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{t.owner_email ?? 'No owner'} · /{t.slug}</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Text style={{ fontSize: 12, color: colors.ink700 }}>{t.staff_count} staff</Text>
                  <Text style={{ fontSize: 12, color: colors.ink700 }}>{t.table_count} tables</Text>
                  <Text style={{ fontSize: 12, color: colors.ink700 }}>{t.orders_last_30d} orders/30d</Text>
                  {t.plan_key ? <Text style={{ fontSize: 12, color: colors.ink700 }}>{t.plan_key} · {t.subscription_status}</Text> : null}
                </View>
              </Pressable>
            ))
          )}
          {!loading && tenants.length === 0 ? <Text style={{ color: colors.ink500, textAlign: 'center', padding: 24 }}>No restaurants match.</Text> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
