import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

type Period = 'today' | 'week' | 'month';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: '7 days' },
  { key: 'month', label: '30 days' },
];

type WaiterRow = {
  membership_id: string;
  waiter_name: string;
  tables_served: number;
  orders_served: number;
  collected_minor: number;
  pending_handover_minor: number;
  confirmed_minor: number;
  shortage_minor: number;
  held_by_waiter_minor: number;
};

type TableRow = {
  order_id: string;
  order_number: string;
  table_label: string | null;
  served_at: string;
  served_by_name: string | null;
  total_minor: number;
  payment_status: string;
  payment_method: string | null;
  collected_by_name: string | null;
  handover_status: string | null;
};

type Handover = {
  id: string;
  waiter_membership_id: string;
  amount_minor: number;
  received_amount_minor: number | null;
  status: 'pending' | 'confirmed';
  submitted_at: string;
  confirmed_at: string | null;
};

function sinceFor(p: Period) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (p === 'week') d.setDate(d.getDate() - 6);
  if (p === 'month') d.setDate(d.getDate() - 29);
  return d.toISOString();
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const HANDOVER_LABEL: Record<string, { label: string; bg: string; fg: string }> = {
  with_waiter: { label: 'With waiter', bg: '#FFF4D6', fg: '#8A5A00' },
  pending: { label: 'Awaiting cashier', bg: colors.infoBg, fg: colors.info },
  confirmed: { label: 'Cashier received', bg: colors.successBg, fg: colors.success },
};

export default function CashAndTables() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [period, setPeriod] = useState<Period>('today');
  const [waiters, setWaiters] = useState<WaiterRow[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<Handover | null>(null);
  const [receivedText, setReceivedText] = useState('');

  const canReceive = membership?.permissions.has('payments.cash.receive') ?? false;
  const canCollect = membership?.permissions.has('payments.cash.collect') ?? false;
  const seesAll = membership?.permissions.has('payments.view') ?? false;

  const load = useCallback(async () => {
    const since = sinceFor(period);
    const [w, t, h] = await Promise.all([
      supabase.rpc('waiter_cash_summary', { p_from: since }),
      supabase.rpc('table_service_report', { p_from: since }),
      supabase
        .from('cash_handovers')
        .select('id, waiter_membership_id, amount_minor, received_amount_minor, status, submitted_at, confirmed_at')
        .gte('submitted_at', since)
        .order('submitted_at', { ascending: false }),
    ]);
    setWaiters((w.data as WaiterRow[]) ?? []);
    setTables((t.data as TableRow[]) ?? []);
    setHandovers((h.data as unknown as Handover[]) ?? []);
    setLoading(false);
  }, [period]);

  useRealtimeRefresh('cashtsx', tenantSubs(membership?.tenantId, ['orders', 'payments', 'cash_handovers']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const totals = waiters.reduce(
    (a, w) => ({
      collected: a.collected + w.collected_minor,
      held: a.held + w.held_by_waiter_minor,
      pending: a.pending + w.pending_handover_minor,
      confirmed: a.confirmed + w.confirmed_minor,
      shortage: a.shortage + w.shortage_minor,
    }),
    { collected: 0, held: 0, pending: 0, confirmed: 0, shortage: 0 },
  );

  async function handOver() {
    if (!guardOnline(isOnline)) return;
    setBusy(true);
    const { error } = await supabase.rpc('submit_cash_handover', { p_note: null });
    setBusy(false);
    if (error) {
      Alert.alert('Could not hand over', error.message === 'nothing_to_hand_over' ? 'You have no cash to hand over right now.' : error.message);
      return;
    }
    load();
  }

  async function confirm(h: Handover, received: number | null) {
    if (!guardOnline(isOnline)) return;
    setBusy(true);
    const { error } = await supabase.rpc('confirm_cash_handover', { p_handover_id: h.id, p_received_minor: received });
    setBusy(false);
    if (error) {
      Alert.alert('Could not confirm', error.message);
      return;
    }
    setConfirming(null);
    setReceivedText('');
    load();
  }

  const mine = waiters.find((w) => w.membership_id === membership?.id);
  const pendingList = handovers.filter((h) => h.status === 'pending');
  const doneList = handovers.filter((h) => h.status === 'confirmed');
  const nameOf = (h: Handover) => waiters.find((w) => w.membership_id === h.waiter_membership_id)?.waiter_name ?? 'Waiter';

  const stat = (label: string, value: number, tone: string = colors.ink900) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 18, padding: 12, gap: 2 }}>
      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: tone }}>{formatMinor(value)}</Text>
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
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>{seesAll ? 'Cash & tables' : 'My cash'}</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PERIODS.map((p) => {
            const on = p.key === period;
            return (
              <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.coral600 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.coral600} style={{ marginTop: 30 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {seesAll ? (
                <>
                  {stat('Cash collected by waiters & cashier', totals.collected)}
                  {stat('Still with waiters', totals.held, totals.held > 0 ? colors.warning : colors.ink900)}
                  {stat('Awaiting cashier', totals.pending, colors.info)}
                  {stat('Received by cashier', totals.confirmed, colors.success)}
                  {totals.shortage !== 0 ? stat(totals.shortage > 0 ? 'Shortage' : 'Excess', Math.abs(totals.shortage), colors.error) : null}
                </>
              ) : (
                <>
                  {stat('Collected', mine?.collected_minor ?? 0)}
                  {stat('In my hand', mine?.held_by_waiter_minor ?? 0, colors.warning)}
                  {stat('Awaiting cashier', mine?.pending_handover_minor ?? 0, colors.info)}
                  {stat('Cashier received', mine?.confirmed_minor ?? 0, colors.success)}
                </>
              )}
            </View>

            {canCollect && (mine?.held_by_waiter_minor ?? 0) > 0 ? (
              <Pressable disabled={busy} onPress={handOver} style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 15 }}>
                  Hand over {formatMinor(mine?.held_by_waiter_minor ?? 0)} to cashier
                </Text>
              </Pressable>
            ) : null}

            {pendingList.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>WAITING FOR THE CASHIER</Text>
                {pendingList.map((h) => (
                  <View key={h.id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 2, borderColor: colors.saffron400, padding: 14, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{nameOf(h)}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink500 }}>Submitted {timeOf(h.submitted_at)}</Text>
                      </View>
                      <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(h.amount_minor)}</Text>
                    </View>
                    {canReceive ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable disabled={busy} onPress={() => confirm(h, null)} style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Received in full</Text>
                        </Pressable>
                        <Pressable disabled={busy} onPress={() => { setReceivedText(''); setConfirming(h); }} style={{ flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Different amount</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 12, color: colors.ink500 }}>The cashier will confirm once they count it.</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : null}

            {seesAll ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>BY WAITER</Text>
                {waiters.length === 0 ? <Text style={{ color: colors.ink500, fontFamily: fonts.body }}>No served tables in this period.</Text> : null}
                {waiters.map((w) => (
                  <View key={w.membership_id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{w.waiter_name}</Text>
                      <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(w.collected_minor)}</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>
                      {w.tables_served} table{w.tables_served === 1 ? '' : 's'} · {w.orders_served} order{w.orders_served === 1 ? '' : 's'} served
                    </Text>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>
                      With waiter {formatMinor(w.held_by_waiter_minor)} · Awaiting cashier {formatMinor(w.pending_handover_minor)} · Received {formatMinor(w.confirmed_minor)}
                      {w.shortage_minor !== 0 ? ` · ${w.shortage_minor > 0 ? 'Short' : 'Excess'} ${formatMinor(Math.abs(w.shortage_minor))}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>TABLES SERVED</Text>
              {tables.length === 0 ? <Text style={{ color: colors.ink500, fontFamily: fonts.body }}>No served tables in this period.</Text> : null}
              {tables.map((t) => {
                const chip = t.handover_status ? HANDOVER_LABEL[t.handover_status] : null;
                return (
                  <View key={t.order_id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ minWidth: 40, height: 36, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{t.table_label ?? 'TA'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>#{t.order_number} · served by {t.served_by_name ?? 'staff'}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink500 }}>{timeOf(t.served_at)}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(t.total_minor)}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {t.collected_by_name ? (
                        <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>
                          {(t.payment_method ?? 'paid').toUpperCase()} collected by {t.collected_by_name}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: t.payment_status === 'unpaid' ? colors.warning : colors.ink700 }}>
                          {t.payment_status === 'unpaid' ? 'Not paid yet' : 'Paid online'}
                        </Text>
                      )}
                      {chip ? (
                        <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: chip.bg, justifyContent: 'center' }}>
                          <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: chip.fg }}>{chip.label}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>

            {doneList.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>HANDOVER HISTORY</Text>
                {doneList.map((h) => {
                  const diff = h.amount_minor - (h.received_amount_minor ?? h.amount_minor);
                  return (
                    <View key={h.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: '#F4ECE6', padding: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{nameOf(h)}</Text>
                        <Text style={{ fontSize: 12, color: colors.ink500 }}>Received {h.confirmed_at ? timeOf(h.confirmed_at) : ''}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 15, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(h.received_amount_minor ?? h.amount_minor)}</Text>
                        {diff !== 0 ? (
                          <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.error }}>
                            {diff > 0 ? 'Short' : 'Excess'} {formatMinor(Math.abs(diff))} of {formatMinor(h.amount_minor)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Modal visible={confirming !== null} transparent animationType="fade" onRequestClose={() => setConfirming(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Amount you received</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              {confirming ? `${nameOf(confirming)} submitted ${formatMinor(confirming.amount_minor)}. Enter what you actually counted (₹).` : ''}
            </Text>
            <TextInput
              value={receivedText}
              onChangeText={setReceivedText}
              keyboardType="decimal-pad"
              placeholder="0"
              style={{ height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, fontSize: 18, fontFamily: fonts.bodyBold, color: colors.ink900 }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setConfirming(null)} style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => {
                  const rupees = Number(receivedText);
                  if (receivedText.trim() === '' || !Number.isFinite(rupees) || rupees < 0) {
                    Alert.alert('Enter the amount', 'Type the cash you counted.');
                    return;
                  }
                  if (confirming) confirm(confirming, Math.round(rupees * 100));
                }}
                style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
