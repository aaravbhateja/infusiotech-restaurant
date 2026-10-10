import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Stats = {
  orders_prepared: number;
  avg_prep_minutes: number | null;
  slowest_minutes: number | null;
  late_orders: number;
  rush_orders: number;
  slowest_dishes: { name: string; avg_minutes: number; times: number }[];
};

const RANGES = [
  { key: 1, label: 'Today' },
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
] as const;

function KitchenStatsScreen() {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const to = new Date();
    to.setHours(24, 0, 0, 0);
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const { data } = await supabase.rpc('kitchen_performance', { p_from: from.toISOString(), p_to: to.toISOString() });
    setStats((data as Stats) ?? null);
    setLoading(false);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const card = (label: string, value: string, tone: string = colors.ink900) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 18, padding: 14, gap: 2 }}>
      <Text style={{ fontSize: 24, fontFamily: fonts.display, color: tone }}>{value}</Text>
      <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Kitchen performance</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RANGES.map((r) => {
            const on = r.key === days;
            return (
              <Pressable key={r.key} onPress={() => setDays(r.key)} style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.coral600 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading || !stats ? (
          <ActivityIndicator color={colors.coral600} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {card('Orders prepared', String(stats.orders_prepared))}
              {card('Average prep time', stats.avg_prep_minutes === null ? '—' : `${stats.avg_prep_minutes} min`)}
              {card('Slowest order', stats.slowest_minutes === null ? '—' : `${stats.slowest_minutes} min`, colors.warning)}
              {card('Late orders', String(stats.late_orders), stats.late_orders > 0 ? colors.error : colors.success)}
              {card('Rush orders', String(stats.rush_orders))}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>SLOWEST DISHES</Text>
              {stats.slowest_dishes.length === 0 ? (
                <Text style={{ color: colors.ink500, fontFamily: fonts.body }}>Not enough data yet. Dishes appear here once they have been prepared at least twice.</Text>
              ) : (
                stats.slowest_dishes.map((d) => (
                  <View key={d.name} style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{d.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink500 }}>{d.times} orders</Text>
                    </View>
                    <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{d.avg_minutes} min</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function KitchenStats() {
  return (
    <RequireAccess permission="analytics.basic.view">
      <KitchenStatsScreen />
    </RequireAccess>
  );
}
