import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Status = 'Active' | 'Scheduled' | 'Expired';

type OfferRow = {
  id: string;
  code: string;
  kind: 'percent' | 'flat' | 'free_item';
  value_minor: number | null;
  value_percent: number | null;
  min_order_minor: number;
  usage_limit: number | null;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
};

const TABS: Status[] = ['Active', 'Scheduled', 'Expired'];

function statusOf(o: OfferRow): Status {
  const now = Date.now();
  if (new Date(o.starts_at).getTime() > now) return 'Scheduled';
  if (o.ends_at && new Date(o.ends_at).getTime() < now) return 'Expired';
  return o.is_active ? 'Active' : 'Expired';
}

function titleOf(o: OfferRow): string {
  if (o.kind === 'percent') return `${o.value_percent}% off up to ${o.value_minor ? formatMinor(o.value_minor) : 'no cap'}`;
  if (o.kind === 'flat') return `${formatMinor(o.value_minor ?? 0)} off`;
  return 'Free item';
}

function OffersScreen() {
  const { membership } = useAuth();
  const [tab, setTab] = useState<Status>('Active');
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [redemptions, setRedemptions] = useState<Record<string, { count: number; sales: number }>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('offers').select('*').order('created_at', { ascending: false });
    setOffers((data as OfferRow[]) ?? []);
    const { data: red } = await supabase.from('offer_redemptions').select('offer_id, discount_minor');
    const agg: Record<string, { count: number; sales: number }> = {};
    for (const r of red ?? []) {
      agg[r.offer_id] = agg[r.offer_id] ?? { count: 0, sales: 0 };
      agg[r.offer_id].count += 1;
      agg[r.offer_id].sales += r.discount_minor;
    }
    setRedemptions(agg);
  }, []);

  useRealtimeRefresh('offersindextsx', tenantSubs(membership?.tenantId, ['offers']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const withStatus = useMemo(() => offers.map((o) => ({ ...o, status: statusOf(o) })), [offers]);
  const counts = useMemo(() => ({
    Active: withStatus.filter((o) => o.status === 'Active').length,
    Scheduled: withStatus.filter((o) => o.status === 'Scheduled').length,
    Expired: withStatus.filter((o) => o.status === 'Expired').length,
  }), [withStatus]);
  const visible = withStatus.filter((o) => o.status === tab);

  async function toggle(o: OfferRow) {
    setOffers((prev) => prev.map((x) => (x.id === o.id ? { ...x, is_active: !o.is_active } : x)));
    const { error } = await supabase.rpc('set_offer_active', { p_offer_id: o.id, p_active: !o.is_active });
    if (error) {
      Alert.alert('Could not update offer', error.message);
      load();
    }
  }

  const canManage = membership?.permissions.has('offers.manage') ?? false;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Offers</Text>
          {canManage ? (
            <Pressable onPress={() => router.push('/(staff)/offers/create' as never)} style={{ height: 46, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="plus" size={20} stroke={2.6} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 15 }}>Create</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: '#F2EAE4', borderRadius: radius.pill, padding: 4 }}>
          {TABS.map((t) => {
            const on = t === tab;
            return (
              <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: on ? '#FFFFFF' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, fontSize: 14, color: on ? colors.ink900 : colors.ink700 }}>{t} · {counts[t]}</Text>
              </Pressable>
            );
          })}
        </View>

        {visible.map((o) => {
          const red = redemptions[o.id] ?? { count: 0, sales: 0 };
          const pct = o.usage_limit ? Math.min(100, Math.round((red.count / o.usage_limit) * 100)) : 0;
          const bg = o.status === 'Expired' ? '#F1ECE8' : colors.coral500;
          const fg = o.status === 'Expired' ? colors.ink700 : colors.ink900;
          return (
            <View key={o.id} style={{ borderRadius: 24, backgroundColor: bg, overflow: 'hidden' }}>
              <View style={{ padding: 16, paddingBottom: 18, gap: 6, borderBottomWidth: 2, borderBottomColor: 'rgba(27,23,22,.25)', borderStyle: 'dashed' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 10, borderWidth: 2, borderColor: fg, borderStyle: 'dashed', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: fg, letterSpacing: 1 }}>{o.code}</Text>
                  </View>
                  {canManage && o.status !== 'Expired' ? (
                    <Pressable onPress={() => toggle(o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: fg }}>{o.is_active ? 'Live' : 'Paused'}</Text>
                      <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: o.is_active ? colors.success : 'rgba(27,23,22,.3)', padding: 3, alignItems: o.is_active ? 'flex-end' : 'flex-start' }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }} />
                      </View>
                    </Pressable>
                  ) : null}
                </View>
                <Text style={{ fontSize: 28, fontFamily: fonts.display, color: fg, marginTop: 4 }}>{titleOf(o)}</Text>
                <Text style={{ fontSize: 13, fontFamily: fonts.bodySemi, color: fg }}>Min. order {formatMinor(o.min_order_minor)}</Text>
              </View>
              <View style={{ padding: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: fg }}>{red.count} uses</Text>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: fg }}>{formatMinor(red.sales)} given</Text>
                </View>
                {o.usage_limit ? (
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(27,23,22,.12)' }}>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: fg, width: `${pct}%` }} />
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodySemi, color: fg }}>
                    {o.ends_at ? `Ends ${new Date(o.ends_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'No end date'}
                    {o.usage_limit ? ` · limit ${o.usage_limit}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}

        {visible.length === 0 ? (
          <Text style={{ textAlign: 'center', color: colors.ink500, padding: 24 }}>No {tab.toLowerCase()} offers.</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Offers() {
  return (
    <RequireAccess permission="offers.manage">
      <OffersScreen />
    </RequireAccess>
  );
}
