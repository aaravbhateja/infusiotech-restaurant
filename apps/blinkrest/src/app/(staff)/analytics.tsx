import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

const RANGES = ['Week', 'Month'] as const;
const DAY_MS = 86400000;

function AnalyticsScreen() {
  const { membership } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]>('Week');
  const [orders, setOrders] = useState<{ total_minor: number; created_at: string; order_status: string }[]>([]);

  const load = useCallback(async () => {
    const days = range === 'Week' ? 7 : 30;
    const since = new Date(Date.now() - days * DAY_MS);
    const { data } = await supabase
      .from('orders')
      .select('total_minor, created_at, order_status')
      .gte('created_at', since.toISOString())
      .not('order_status', 'in', '(rejected,cancelled)');
    setOrders(data ?? []);
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const totalRevenue = orders.reduce((s, o) => s + o.total_minor, 0);
  const totalOrders = orders.length;
  const avgOrder = totalOrders ? Math.round(totalRevenue / totalOrders) : 0;

  const days = range === 'Week' ? 7 : 30;
  const buckets = useMemo(() => {
    const arr = Array.from({ length: days }).map((_, i) => {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - (days - 1 - i));
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      const dayOrders = orders.filter((o) => {
        const t = new Date(o.created_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });
      return {
        label: dayStart.toLocaleDateString(undefined, { weekday: 'short' })[0],
        revenue: dayOrders.reduce((s, o) => s + o.total_minor, 0),
        count: dayOrders.length,
      };
    });
    return arr;
  }, [orders, days]);

  const maxRevenue = Math.max(1, ...buckets.map((b) => b.revenue));
  const chartW = 320;
  const chartH = 140;
  const barGap = 4;
  const barW = chartW / buckets.length - barGap;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>Analytics</Text>
          <Text style={{ fontSize: 12, color: colors.ink500 }}>{membership?.tenantName}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {RANGES.map((r) => {
            const active = range === r;
            return (
              <Pressable
                key={r}
                onPress={() => setRange(r)}
                style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{r}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, gap: 6 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Total revenue · {range.toLowerCase()}</Text>
          <Text style={{ fontSize: 40, fontFamily: fonts.display, color: '#FFFFFF' }}>{formatMinor(totalRevenue)}</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'Orders', value: String(totalOrders) },
            { label: 'Avg order value', value: formatMinor(avgOrder) },
            { label: 'Revenue', value: formatMinor(totalRevenue) },
          ].map((k) => (
            <View key={k.label} style={{ width: '47%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 4, ...shadow.card }}>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{k.label}</Text>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{k.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Revenue over time</Text>
          <Svg width={chartW} height={chartH}>
            {buckets.map((b, i) => {
              const h = (b.revenue / maxRevenue) * (chartH - 20);
              return (
                <Rect
                  key={i}
                  x={i * (barW + barGap)}
                  y={chartH - h}
                  width={barW}
                  height={h}
                  rx={4}
                  fill={i === buckets.length - 1 ? colors.coral500 : '#FFD3C5'}
                />
              );
            })}
          </Svg>
          <View style={{ flexDirection: 'row' }}>
            {buckets.map((b, i) => (
              <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink500 }}>
                {b.label}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Analytics() {
  return (
    <RequireAccess permission="analytics.basic.view">
      <AnalyticsScreen />
    </RequireAccess>
  );
}
