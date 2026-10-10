import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, card, heading, rupees } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const TABS = [
  ['menu', 'Menu engineering'],
  ['forecast', 'Forecast'],
  ['outlets', 'Outlets'],
] as const;

type Dish = { menu_item_id: string; name: string; qty: number; revenue_minor: number; unit_margin_minor: number | null; margin_pct: number | null; class: string };
type Day = { day: string; weekday: string; forecast_minor: number; forecast_orders: number; samples: number };
type Outlet = { tenant_id: string; name: string; today_minor: number; today_orders: number; week_minor: number; week_orders: number; avg_ticket_minor: number; is_current: boolean };

const CLASSES: Record<string, { tone: string; bg: string; tip: string }> = {
  Star: { tone: colors.success, bg: colors.successBg, tip: 'Popular and profitable. Keep it prominent.' },
  Plowhorse: { tone: '#8A5A00', bg: colors.saffron50, tip: 'Popular but low margin. Try a small price rise or cheaper ingredients.' },
  Puzzle: { tone: colors.info, bg: colors.infoBg, tip: 'Profitable but few orders. Promote it or reposition it on the menu.' },
  Dog: { tone: colors.error, bg: colors.errorBg, tip: 'Neither popular nor profitable. Consider replacing it.' },
  'Needs recipe': { tone: colors.ink700, bg: colors.bg, tip: 'Add a recipe (Menu → dish → Recipe) so profit can be judged.' },
  'No sales': { tone: colors.ink500, bg: colors.bg, tip: 'No sales in this period.' },
};

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function InsightsScreen() {
  const { membership } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('menu');
  const [days, setDays] = useState<30 | 90>(30);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [forecast, setForecast] = useState<Day[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [filter, setFilter] = useState<string>('All');

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    const [d, f, o] = await Promise.all([
      supabase.rpc('menu_engineering', { p_from: ymd(from), p_to: ymd(to) }),
      supabase.rpc('sales_forecast'),
      supabase.rpc('group_dashboard'),
    ]);
    setDishes((d.data as Dish[]) ?? []);
    setForecast((f.data as Day[]) ?? []);
    setOutlets((o.data as Outlet[]) ?? []);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  function copyMenuTo(target: Outlet) {
    if (!membership) return;
    Alert.alert(`Copy this menu to ${target.name}?`, 'Dishes are matched by category and name: existing ones are updated to this menu\'s prices and details, new ones are added. Nothing is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Copy menu',
        onPress: async () => {
          const { data, error } = await supabase.rpc('copy_menu_to_outlet', { p_source: membership.tenantId, p_target: target.tenant_id });
          if (error) Alert.alert('Could not copy', error.message);
          else Alert.alert('Menu copied', `${(data as { created: number }).created} added, ${(data as { updated: number }).updated} updated.`);
        },
      },
    ]);
  }

  const maxForecast = Math.max(1, ...forecast.map((f) => f.forecast_minor));
  const classes = ['All', 'Star', 'Plowhorse', 'Puzzle', 'Dog', 'Needs recipe'];
  const shown = dishes.filter((d) => filter === 'All' || d.class === filter);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Insights</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([k, l]) => <Chip key={k} label={l} on={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>

        {tab === 'menu' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="30 days" on={days === 30} onPress={() => setDays(30)} />
              <Chip label="90 days" on={days === 90} onPress={() => setDays(90)} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {classes.map((c) => <Chip key={c} label={c === 'All' ? 'All' : `${c} · ${dishes.filter((d) => d.class === c).length}`} on={filter === c} onPress={() => setFilter(c)} />)}
            </ScrollView>
            {filter !== 'All' && CLASSES[filter] ? <Text style={{ fontSize: 13, color: colors.ink700 }}>{CLASSES[filter].tip}</Text> : null}
            {shown.map((d) => {
              const c = CLASSES[d.class] ?? CLASSES['No sales'];
              return (
                <View key={d.menu_item_id} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{d.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>
                      {d.qty} sold · {rupees(d.revenue_minor, 0)}{d.margin_pct !== null && d.unit_margin_minor !== null ? ` · ${d.margin_pct}% margin` : ''}
                    </Text>
                  </View>
                  <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: c.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: c.tone }}>{d.class.toUpperCase()}</Text>
                  </View>
                </View>
              );
            })}
            {shown.length === 0 ? <Text style={{ color: colors.ink500 }}>Nothing here.</Text> : null}
          </>
        ) : null}

        {tab === 'forecast' ? (
          <>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>An estimate: the average of the same weekday over the last four weeks. It does not know about holidays, weather or offers.</Text>
            {forecast.map((f) => (
              <View key={f.day} style={card}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{f.weekday} · {new Date(f.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
                  <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>{rupees(f.forecast_minor, 0)}</Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.bg }}>
                  <View style={{ height: 8, borderRadius: 4, width: `${Math.round((f.forecast_minor / maxForecast) * 100)}%`, backgroundColor: colors.coral600 }} />
                </View>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>≈ {f.forecast_orders} orders · based on {f.samples} past {f.weekday}s{f.samples < 2 ? ' (low confidence)' : ''}</Text>
              </View>
            ))}
          </>
        ) : null}

        {tab === 'outlets' ? (
          <>
            <Text style={heading}>YOUR RESTAURANTS, LAST 7 DAYS</Text>
            {outlets.map((o) => (
              <View key={o.tenant_id} style={[card, o.is_current ? { borderColor: colors.coral600, borderWidth: 2 } : null]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{o.name}{o.is_current ? ' (this one)' : ''}</Text>
                  <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{rupees(o.week_minor, 0)}</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>Today {rupees(o.today_minor, 0)} · {o.today_orders} orders · week {o.week_orders} orders · average bill {rupees(o.avg_ticket_minor, 0)}</Text>
                {!o.is_current ? <Button label="Copy this restaurant's menu to it" tone="ghost" onPress={() => copyMenuTo(o)} /> : null}
              </View>
            ))}
            {outlets.length <= 1 ? <Text style={{ color: colors.ink500 }}>You own one restaurant. When you own more, they appear here side by side, and you can copy a menu between them.</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Insights() {
  return (
    <RequireAccess permission="analytics.advanced.view">
      <InsightsScreen />
    </RequireAccess>
  );
}
