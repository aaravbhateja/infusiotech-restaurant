import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Status = 'pending' | 'paid' | 'failed' | 'refunded' | 'cash_received' | 'reconciled';

type Txn = {
  id: string;
  provider: 'razorpay' | 'cash';
  method: string | null;
  provider_reference: string | null;
  amount_minor: number;
  status: Status;
  created_at: string;
  order: { order_number: string; table: { label: string } | null; customer: { name: string | null; phone: string | null } | null } | null;
};

const STATUS_STYLE: Record<Status, { label: string; line: 'solid' | 'dashed'; bd: string; fg: string }> = {
  paid: { label: 'Success', line: 'solid', bd: '#8FD3AE', fg: '#0B7A3E' },
  reconciled: { label: 'Success', line: 'solid', bd: '#8FD3AE', fg: '#0B7A3E' },
  cash_received: { label: 'Success', line: 'solid', bd: '#8FD3AE', fg: '#0B7A3E' },
  pending: { label: 'Pending', line: 'dashed', bd: '#E0B860', fg: '#8A5A00' },
  refunded: { label: 'Refunded', line: 'solid', bd: '#C6B8F0', fg: '#5B21B6' },
  failed: { label: 'Failed', line: 'solid', bd: '#F4C7C1', fg: '#B42318' },
};

const TABS = ['All', 'UPI', 'Card', 'Cash', 'Pending', 'Refunds'];

const PERIODS = [
  { key: 'today', label: 'Today', title: 'today' },
  { key: 'yesterday', label: 'Yesterday', title: 'yesterday' },
  { key: '7d', label: '7 days', title: 'in the last 7 days' },
  { key: '30d', label: '30 days', title: 'in the last 30 days' },
  { key: 'all', label: 'All time', title: 'all time' },
] as const;
type Period = (typeof PERIODS)[number]['key'];

function periodRange(period: Period): { from: Date | null; to: Date | null } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const DAY = 86400000;
  if (period === 'today') return { from: start, to: null };
  if (period === 'yesterday') return { from: new Date(start.getTime() - DAY), to: start };
  if (period === '7d') return { from: new Date(start.getTime() - 6 * DAY), to: null };
  if (period === '30d') return { from: new Date(start.getTime() - 29 * DAY), to: null };
  return { from: null, to: null };
}

function PaymentsScreen() {
  const { membership } = useAuth();
  const [tab, setTab] = useState('All');
  const [txns, setTxns] = useState<Txn[]>([]);
  const [period, setPeriod] = useState<Period>('today');

  const load = useCallback(async () => {
    const { from, to } = periodRange(period);
    let q = supabase
      .from('payments')
      .select('id, provider, method, provider_reference, amount_minor, status, created_at, order:orders(order_number, table:restaurant_tables(label), customer:customers(name, phone))')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lt('created_at', to.toISOString());
    const { data } = await q;
    setTxns((data as unknown as Txn[]) ?? []);
  }, [period]);

  useRealtimeRefresh('paymentsindextsx', tenantSubs(membership?.tenantId, ['payments', 'orders']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('payments-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  const todays = txns;
  const periodTitle = PERIODS.find((p) => p.key === period)!.title;

  const totals = useMemo(() => {
    const successful = todays.filter((t) => ['paid', 'cash_received', 'reconciled'].includes(t.status));
    const upi = successful.filter((t) => t.method === 'upi' || (t.provider === 'razorpay' && !t.method)).reduce((s, t) => s + t.amount_minor, 0);
    const card = successful.filter((t) => t.method === 'card').reduce((s, t) => s + t.amount_minor, 0);
    const cash = successful.filter((t) => t.method === 'cash' || (t.provider === 'cash' && !t.method)).reduce((s, t) => s + t.amount_minor, 0);
    const pending = todays.filter((t) => t.status === 'pending');
    const refunds = todays.filter((t) => t.status === 'refunded');
    return {
      total: upi + card + cash,
      count: successful.length,
      upi,
      card,
      cash,
      pendingAmt: pending.reduce((s, t) => s + t.amount_minor, 0),
      pendingCount: pending.length,
      refundAmt: refunds.reduce((s, t) => s + t.amount_minor, 0),
      refundCount: refunds.length,
    };
  }, [todays]);

  const filtered = todays.filter((t) => {
    if (tab === 'All') return true;
    if (tab === 'UPI') return (t.method === 'upi' || (t.provider === 'razorpay' && !t.method)) && t.status !== 'refunded';
    if (tab === 'Card') return t.method === 'card' && t.status !== 'refunded';
    if (tab === 'Cash') return t.method === 'cash' || (t.provider === 'cash' && !t.method);
    if (tab === 'Pending') return t.status === 'pending';
    if (tab === 'Refunds') return t.status === 'refunded';
    return true;
  });

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Payments</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {PERIODS.map((p) => {
            const on = p.key === period;
            return (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.coral600 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {p.key === 'today' ? <Icon name="calendar" size={15} color={on ? '#FFFFFF' : colors.ink900} /> : null}
                <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, gap: 6 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Total collected {periodTitle}</Text>
          <Text style={{ fontSize: 38, fontFamily: fonts.display, color: '#FFFFFF' }}>{formatMinor(totals.total)}</Text>
          <Text style={{ fontSize: 13, color: '#C9BDB6' }}>{totals.count} payments</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'UPI', amt: totals.upi, icon: 'qr' as IconName, bg: colors.coral50, fg: colors.coral600 },
            { label: 'Card', amt: totals.card, icon: 'card' as IconName, bg: '#EAF1FF', fg: '#1F5BD6' },
            { label: 'Cash', amt: totals.cash, icon: 'cash' as IconName, bg: colors.saffron50, fg: '#8A5A00' },
            { label: `Pending · ${totals.pendingCount} bills`, amt: totals.pendingAmt, icon: 'clock' as IconName, bg: '#F1EBFF', fg: '#5B21B6' },
            { label: `Refunds · ${totals.refundCount}`, amt: totals.refundAmt, icon: 'refresh' as IconName, bg: '#FFE4DA', fg: colors.coral700 },
          ].map((c) => (
            <View key={c.label} style={{ width: '47%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 6 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={c.icon} size={19} stroke={2.1} color={c.fg} />
              </View>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(c.amt)}</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700, marginTop: -4 }}>{c.label}</Text>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map((t) => {
            const on = t === tab;
            return (
              <Pressable key={t} onPress={() => setTab(t)} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <Text style={{ padding: 24, textAlign: 'center', fontSize: 14, color: colors.ink500 }}>No transactions in this filter {period === 'all' ? 'yet' : periodTitle}.</Text>
          ) : (
            filtered.map((x, i) => {
              const s = STATUS_STYLE[x.status];
              const who = x.order?.customer?.name ?? x.order?.customer?.phone ?? x.order?.table?.label ?? 'Guest';
              return (
                <Pressable
                  key={x.id}
                  onPress={() => router.push(`/(staff)/payments/${x.id}` as never)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: i < filtered.length - 1 ? 1 : 0, borderBottomColor: '#F4ECE6' }}
                >
                  <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={x.method === 'card' ? 'card' : x.method === 'cash' || x.provider === 'cash' ? 'cash' : 'qr'} size={20} color={colors.ink900} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{x.provider_reference ?? (x.provider === 'cash' ? 'Cash payment' : 'Awaiting payment')}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: colors.ink500 }}>Order #{x.order?.order_number ?? '—'} · {who} · {new Date(x.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(x.amount_minor)}</Text>
                    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, borderWidth: 1.5, borderColor: s.bd, borderStyle: s.line, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: s.fg }}>{s.label}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Payments() {
  return (
    <RequireAccess permission="payments.view">
      <PaymentsScreen />
    </RequireAccess>
  );
}
