import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const RANGES = [
  { key: 'today', label: 'Today', days: 1, offset: 0 },
  { key: 'yesterday', label: 'Yesterday', days: 1, offset: 1 },
  { key: '7d', label: '7 days', days: 7, offset: 0 },
  { key: '30d', label: '30 days', days: 30, offset: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const DAY_MS = 86400000;
const PAID = ['paid', 'cash_received', 'reconciled'];
const SLOTS = ['12–2', '2–4', '4–6', '6–8', '8–10', '10–12'];
const METHOD_COLORS = [colors.coral500, colors.ink900, colors.saffron400, colors.info];
const METHOD_LABEL: Record<string, string> = { upi: 'UPI', card: 'Card', cash: 'Cash', netbanking: 'Netbanking', wallet: 'Wallet' };

type OrderRow = {
  total_minor: number;
  tax_minor: number;
  created_at: string;
  order_status: string;
  customer_id: string | null;
  items: { item_name_snapshot: string; quantity: number; line_total_minor: number; menu_item: { category: { name: string } | null } | null }[];
};
type PaymentRow = { amount_minor: number; method: string | null };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function delta(cur: number, prev: number) {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Delta({ value, suffix = 'vs previous period' }: { value: number | null; suffix?: string }) {
  if (value == null) return <Text style={{ fontSize: 11, color: colors.ink500 }}>No earlier data to compare</Text>;
  const up = value >= 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: up ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: up ? colors.success : colors.error }}>
          {up ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
        </Text>
      </View>
      {suffix ? <Text style={{ fontSize: 11, color: '#C9BDB6' }}>{suffix}</Text> : null}
    </View>
  );
}

function Card({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 18, gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>{title}</Text>
        {right ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{right}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function AnalyticsScreen() {
  const { membership } = useAuth();
  const { width } = useWindowDimensions();
  const [rangeKey, setRangeKey] = useState<RangeKey>('7d');
  const [current, setCurrent] = useState<OrderRow[]>([]);
  const [previous, setPrevious] = useState<OrderRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const range = RANGES.find((r) => r.key === rangeKey)!;
  const chartW = Math.min(width - 32 - 36, 460);

  const load = useCallback(async () => {
    setLoading(true);
    const end = startOfToday() + DAY_MS - range.offset * DAY_MS;
    const start = end - range.days * DAY_MS;
    const prevStart = start - range.days * DAY_MS;
    const select = 'total_minor, tax_minor, created_at, order_status, customer_id, items:order_items(item_name_snapshot, quantity, line_total_minor, menu_item:menu_items(category:menu_categories(name)))';

    const [{ data: orders, error }, { data: pays }] = await Promise.all([
      supabase.from('orders').select(select).gte('created_at', new Date(prevStart).toISOString()).lt('created_at', new Date(end).toISOString()),
      supabase.from('payments').select('amount_minor, method').in('status', PAID).gte('created_at', new Date(start).toISOString()).lt('created_at', new Date(end).toISOString()),
    ]);
    if (error) {
      setFailed(true);
      setLoading(false);
      return;
    }
    const rows = (orders ?? []) as unknown as (OrderRow & { created_at: string })[];
    const valid = rows.filter((o) => !['rejected', 'cancelled'].includes(o.order_status));
    setCurrent(rows.filter((o) => new Date(o.created_at).getTime() >= start));
    setPrevious(valid.filter((o) => new Date(o.created_at).getTime() < start));
    setPayments((pays ?? []) as PaymentRow[]);
    setFailed(false);
    setLoading(false);
  }, [range]);

  useRealtimeRefresh('analyticstsx', tenantSubs(membership?.tenantId, ['orders', 'payments']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const stats = useMemo(() => {
    const valid = current.filter((o) => !['rejected', 'cancelled'].includes(o.order_status));
    const revenue = valid.reduce((s, o) => s + o.total_minor, 0);
    const prevRevenue = previous.reduce((s, o) => s + o.total_minor, 0);
    const count = valid.length;
    const prevCount = previous.length;
    const avg = count ? Math.round(revenue / count) : 0;
    const prevAvg = prevCount ? Math.round(prevRevenue / prevCount) : 0;
    const net = valid.reduce((s, o) => s + o.total_minor - o.tax_minor, 0);
    const guests = new Set(valid.map((o) => o.customer_id).filter(Boolean)).size;

    const hourly = range.days === 1;
    const n = hourly ? 24 : range.days;
    const startMs = startOfToday() + DAY_MS - range.offset * DAY_MS - range.days * DAY_MS;
    const bucketMs = hourly ? 3600000 : DAY_MS;
    const revenueBuckets = Array.from({ length: n }, () => 0);
    const prevBuckets = Array.from({ length: n }, () => 0);
    const countBuckets = Array.from({ length: n }, () => 0);
    for (const o of valid) {
      const i = Math.floor((new Date(o.created_at).getTime() - startMs) / bucketMs);
      if (i >= 0 && i < n) {
        revenueBuckets[i] += o.total_minor;
        countBuckets[i] += 1;
      }
    }
    for (const o of previous) {
      const i = Math.floor((new Date(o.created_at).getTime() - (startMs - range.days * DAY_MS)) / bucketMs);
      if (i >= 0 && i < n) prevBuckets[i] += o.total_minor;
    }
    const labelFor = (i: number) => {
      const d = new Date(startMs + i * bucketMs);
      return hourly ? (i % 6 === 0 ? `${d.getHours()}h` : '') : range.days <= 7 ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : i % 5 === 0 ? String(d.getDate()) : '';
    };

    const cat = new Map<string, number>();
    const items = new Map<string, { qty: number; total: number }>();
    for (const o of valid) {
      for (const it of o.items) {
        const c = it.menu_item?.category?.name ?? 'Other';
        cat.set(c, (cat.get(c) ?? 0) + it.line_total_minor);
        const prev = items.get(it.item_name_snapshot) ?? { qty: 0, total: 0 };
        items.set(it.item_name_snapshot, { qty: prev.qty + it.quantity, total: prev.total + it.line_total_minor });
      }
    }
    const categories = [...cat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const catTotal = [...cat.values()].reduce((s, v) => s + v, 0);
    const best = [...items.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 5);

    const methods = new Map<string, number>();
    for (const p of payments) methods.set(p.method ?? 'other', (methods.get(p.method ?? 'other') ?? 0) + p.amount_minor);
    const methodList = [...methods.entries()].sort((a, b) => b[1] - a[1]);
    const methodTotal = methodList.reduce((s, [, v]) => s + v, 0);

    const grid = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => 0));
    for (const o of valid) {
      const d = new Date(o.created_at);
      const slot = Math.floor(d.getHours() / 2) - 6;
      if (slot >= 0 && slot < 6) grid[(d.getDay() + 6) % 7][slot] += 1;
    }
    const gridMax = Math.max(1, ...grid.flat());

    const completed = current.filter((o) => o.order_status === 'served').length;
    const cancelled = current.filter((o) => o.order_status === 'cancelled').length;
    const rejected = current.filter((o) => o.order_status === 'rejected').length;

    return { revenue, count, avg, net, guests, revenueBuckets, prevBuckets, countBuckets, labelFor, categories, catTotal, best, methodList, methodTotal, grid, gridMax, completed, cancelled, rejected, deltaRevenue: delta(revenue, prevRevenue), deltaCount: delta(count, prevCount), deltaAvg: delta(avg, prevAvg), hasData: current.length > 0 };
  }, [current, previous, payments, range]);

  async function exportReport() {
    const lines = [
      `${membership?.tenantName} — analytics (${range.label})`,
      `Revenue: ${formatMinor(stats.revenue)}`,
      `Orders: ${stats.count}`,
      `Average order value: ${formatMinor(stats.avg)}`,
      `Net sales (excl. tax): ${formatMinor(stats.net)}`,
      '',
      'Sales by category',
      ...stats.categories.map(([n, v]) => `${n},${formatMinor(v)}`),
      '',
      'Best-selling items',
      ...stats.best.map(([n, v]) => `${n},${v.qty} sold,${formatMinor(v.total)}`),
      '',
      'Payment methods',
      ...stats.methodList.map(([m, v]) => `${METHOD_LABEL[m] ?? m},${formatMinor(v)}`),
    ];
    await Share.share({ message: lines.join('\n') });
  }

  const maxRev = Math.max(1, ...stats.revenueBuckets, ...stats.prevBuckets);
  const chartH = 120;
  const pathFor = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / Math.max(1, vals.length - 1)) * chartW} ${chartH - (v / maxRev) * (chartH - 12) - 4}`).join(' ');
  const maxCount = Math.max(1, ...stats.countBuckets);
  const barW = chartW / stats.countBuckets.length - 3;

  const kpis = [
    { label: 'Total orders', value: String(stats.count), d: stats.deltaCount },
    { label: 'Avg order value', value: formatMinor(stats.avg), d: stats.deltaAvg },
    { label: 'Net sales', value: formatMinor(stats.net), note: 'after discounts & GST' },
    { label: 'Unique guests', value: String(stats.guests), note: 'with a phone number' },
  ];

  const statusTotal = Math.max(1, stats.completed + stats.cancelled + stats.rejected);
  const R = 38;
  const C = 2 * Math.PI * R;
  const donutArcs = stats.methodList.slice(0, 4).reduce<{ m: string; len: number; off: number }[]>((acc, [m, v]) => {
    const len = (v / Math.max(1, stats.methodTotal)) * C;
    const off = acc.length ? acc[acc.length - 1].off + acc[acc.length - 1].len : 0;
    return [...acc, { m, len, off }];
  }, []);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>Analytics</Text>
          <Text style={{ fontSize: 12, color: colors.ink500 }}>{membership?.tenantName}</Text>
        </View>
        <Pressable onPress={exportReport} disabled={!stats.hasData} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: stats.hasData ? 1 : 0.5 }}>
          <Icon name="download" size={15} color={colors.ink900} />
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Export</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {RANGES.map((r) => {
            const active = rangeKey === r.key;
            return (
              <Pressable key={r.key} onPress={() => setRangeKey(r.key)} style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: active ? colors.ink900 : colors.surface, borderWidth: active ? 0 : 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: active ? fonts.bodyExtraBold : fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{r.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {loading ? (
          <View style={{ gap: 12 }}>
            <Skeleton style={{ height: 150, borderRadius: 26 }} />
            <Skeleton style={{ height: 80, borderRadius: 20 }} />
            <Skeleton style={{ height: 180, borderRadius: 24 }} />
          </View>
        ) : failed ? (
          <ErrorState title="We couldn’t load your reports" body="Our servers took too long to answer. Orders and payments are not affected — only this screen." code="BR-503" onRetry={load} onContact={() => router.push('/(staff)/support')} />
        ) : !stats.hasData ? (
          <EmptyState icon="chart" title="No orders in this period" body="Reports fill in as orders come through. Try a longer range." />
        ) : (
          <>
            <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, gap: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Total revenue · {range.label.toLowerCase()}</Text>
              <Text style={{ fontSize: 38, fontFamily: fonts.display, color: '#FFFFFF' }}>{formatMinor(stats.revenue)}</Text>
              <Delta value={stats.deltaRevenue} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {kpis.map((k) => (
                <View key={k.label} style={{ width: '48%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{k.label}</Text>
                  <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{k.value}</Text>
                  {'d' in k ? (
                    k.d == null ? (
                      <Text style={{ fontSize: 11, color: colors.ink500 }}>—</Text>
                    ) : (
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: k.d >= 0 ? colors.success : colors.error }}>{k.d >= 0 ? '▲' : '▼'} {Math.abs(k.d).toFixed(1)}%</Text>
                    )
                  ) : (
                    <Text style={{ fontSize: 11, color: colors.ink500 }}>{k.note}</Text>
                  )}
                </View>
              ))}
            </View>

            <Card title="Revenue over time" right="This period vs previous">
              <Svg width={chartW} height={chartH}>
                <Path d={pathFor(stats.prevBuckets)} stroke={colors.inputBorder} strokeWidth={2} strokeDasharray="5 4" fill="none" />
                <Path d={pathFor(stats.revenueBuckets)} stroke={colors.coral500} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" fill="none" />
              </Svg>
              <View style={{ flexDirection: 'row' }}>
                {stats.revenueBuckets.map((_, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{stats.labelFor(i)}</Text>
                ))}
              </View>
            </Card>

            <Card title="Orders over time" right={String(stats.count)}>
              <Svg width={chartW} height={110}>
                {stats.countBuckets.map((c, i) => {
                  const h = (c / maxCount) * 96;
                  return <Rect key={i} x={i * (barW + 3)} y={110 - h} width={Math.max(2, barW)} height={Math.max(h, c ? 3 : 0)} rx={3} fill={i === stats.countBuckets.length - 1 ? colors.coral500 : colors.ink900} />;
                })}
              </Svg>
            </Card>

            {stats.categories.length > 0 ? (
              <Card title="Sales by category">
                {stats.categories.map(([name, value]) => (
                  <View key={name} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{name}</Text>
                      <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{formatMinor(value)} <Text style={{ color: colors.ink500, fontFamily: fonts.body }}>· {Math.round((value / Math.max(1, stats.catTotal)) * 100)}%</Text></Text>
                    </View>
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.line }}>
                      <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.coral500, width: `${Math.max(3, (value / stats.categories[0][1]) * 100)}%` }} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {stats.best.length > 0 ? (
              <Card title="Best-selling items">
                {stats.best.map(([name, v], i) => (
                  <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: 16, fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink500 }}>{i + 1}</Text>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{name}</Text>
                      <Text style={{ fontSize: 12, color: colors.ink500 }}>{v.qty} sold</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(v.total)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {stats.methodList.length > 0 ? (
              <Card title="Payment methods">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                  <View style={{ width: 104, height: 104 }}>
                    <Svg width={104} height={104} viewBox="0 0 104 104">
                      <Circle cx={52} cy={52} r={R} stroke={colors.line} strokeWidth={14} fill="none" />
                      {donutArcs.map((arc, i) => (
                        <Circle key={arc.m} cx={52} cy={52} r={R} stroke={METHOD_COLORS[i]} strokeWidth={14} fill="none" strokeDasharray={`${arc.len} ${C - arc.len}`} strokeDashoffset={-arc.off} rotation={-90} origin="52, 52" />
                      ))}
                    </Svg>
                    <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{Math.round((stats.methodList[0][1] / Math.max(1, stats.methodTotal)) * 100)}%</Text>
                      <Text style={{ fontSize: 10, color: colors.ink500 }}>via {METHOD_LABEL[stats.methodList[0][0]] ?? stats.methodList[0][0]}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, gap: 8 }}>
                    {stats.methodList.slice(0, 4).map(([m, v], i) => (
                      <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: METHOD_COLORS[i] }} />
                        <Text style={{ flex: 1, fontSize: 13, color: colors.ink700 }}>{METHOD_LABEL[m] ?? m}</Text>
                        <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{formatMinor(v)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </Card>
            ) : null}

            <Card title="Peak order hours" right="orders per slot">
              <View style={{ flexDirection: 'row', paddingLeft: 34, gap: 4 }}>
                {SLOTS.map((s) => (
                  <Text key={s} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: colors.ink500 }}>{s}</Text>
                ))}
              </View>
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, di) => (
                <View key={day} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ width: 30, fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{day}</Text>
                  {stats.grid[di].map((n, si) => (
                    <View key={si} style={{ flex: 1, height: 26, borderRadius: 6, backgroundColor: n === 0 ? colors.line : `rgba(255,90,54,${0.18 + 0.82 * (n / stats.gridMax)})`, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontFamily: fonts.bodyBold, color: n / stats.gridMax > 0.55 ? '#FFFFFF' : colors.ink700 }}>{n || ''}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </Card>

            <Card title="Order status breakdown">
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.line }}>
                <View style={{ flex: stats.completed || 0.0001, backgroundColor: colors.success }} />
                <View style={{ flex: stats.cancelled || 0.0001, backgroundColor: colors.coral600 }} />
                <View style={{ flex: stats.rejected || 0.0001, backgroundColor: colors.saffron400 }} />
              </View>
              <View style={{ flexDirection: 'row', gap: 24 }}>
                {[
                  ['Completed', stats.completed, colors.success],
                  ['Cancelled', stats.cancelled, colors.coral600],
                  ['Rejected', stats.rejected, colors.warning],
                ].map(([label, n, c]) => (
                  <View key={label as string}>
                    <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{n as number}</Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: c as string }}>{label as string}</Text>
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>{Math.round((stats.completed / statusTotal) * 100)}% of orders were served.</Text>
            </Card>
          </>
        )}
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
