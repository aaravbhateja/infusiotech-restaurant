import { Redirect, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/AnimatedPressable';
import { PartPaymentSheet, type PartPayOrder } from '@/components/PartPaymentSheet';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { homePathForRole } from '@/lib/roleHome';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, statusBadge } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Bill = {
  id: string;
  order_number: string;
  order_status: string;
  total_minor: number;
  amount_paid_minor: number;
  table: { label: string } | null;
  customer: { name: string | null; phone: string | null } | null;
  items: { item_name_snapshot: string; quantity: number }[];
};

type Shift = { id: string; started_at: string; opening_float_minor: number };
type Tab = 'all' | 'counter' | 'dining';

function shiftSince(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

function itemsLine(items: Bill['items']) {
  if (items.length === 0) return '';
  const first = items.slice(0, 2).map((i) => `${i.item_name_snapshot}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ');
  return items.length > 2 ? `${first} +${items.length - 2} more` : first;
}

export default function CashierHome() {
  const { membership, session } = useAuth();
  const isOnline = useIsOnline();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [bills, setBills] = useState<Bill[]>([]);
  const [splitting, setSplitting] = useState<PartPayOrder | null>(null);
  const [shift, setShift] = useState<Shift | null>(null);
  const [cashCollected, setCashCollected] = useState(0);
  const [pendingHandovers, setPendingHandovers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [floatOpen, setFloatOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [shiftBusy, setShiftBusy] = useState(false);
  const searchRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data, error }, { data: shiftRow }] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_number, order_status, total_minor, amount_paid_minor, table:restaurant_tables(label), customer:customers(name, phone), items:order_items(item_name_snapshot, quantity)')
        .eq('payment_status', 'unpaid')
        .not('order_status', 'in', '(rejected,cancelled)')
        .order('created_at'),
      supabase.from('staff_shifts').select('id, started_at, opening_float_minor').eq('membership_id', membership.id).is('ended_at', null).maybeSingle(),
    ]);
    if (error) {
      setFailed(true);
      setLoading(false);
      return;
    }
    setFailed(false);
    setBills((data as unknown as Bill[]) ?? []);
    setShift(shiftRow as Shift | null);

    const since = shiftRow?.started_at ?? new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    // Counter cash plus waiter cash the cashier has confirmed receiving; cash
    // still in a waiter's pocket is not in the drawer yet.
    const [{ data: payments }, { data: handovers }, { count: pending }] = await Promise.all([
      supabase.from('payments').select('amount_minor').eq('status', 'cash_received').eq('method', 'cash').eq('via_waiter', false).gte('created_at', since),
      supabase.from('cash_handovers').select('received_amount_minor').eq('status', 'confirmed').gte('confirmed_at', since),
      supabase.from('cash_handovers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setCashCollected(
      (payments ?? []).reduce((s, p) => s + p.amount_minor, 0) + (handovers ?? []).reduce((s, h) => s + (h.received_amount_minor ?? 0), 0),
    );
    setPendingHandovers(pending ?? 0);
    setLoading(false);
  }, [membership]);

  useRealtimeRefresh('cashierhometsx', tenantSubs(membership?.tenantId, ['orders', 'order_items', 'payments', 'staff_shifts', 'cash_handovers']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [membership, load]);

  async function collect(bill: Bill, method: 'cash' | 'upi' | 'card') {
    if (!guardOnline(isOnline)) return;
    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    if (method === 'cash') setCashCollected((c) => c + bill.total_minor);
    const { error } = await supabase.rpc('record_cash_payment', { p_order_id: bill.id, p_method: method });
    if (error) {
      Alert.alert('Could not record payment', error.message);
      load();
    }
  }

  async function startShift() {
    if (!guardOnline(isOnline)) return;
    const rupees = Number(amountText || '0');
    if (!Number.isFinite(rupees) || rupees < 0) {
      Alert.alert('Enter a valid amount', 'The opening float is the cash already in the drawer.');
      return;
    }
    setShiftBusy(true);
    const { error } = await supabase.rpc('start_shift', { p_opening_float_minor: Math.round(rupees * 100) });
    setShiftBusy(false);
    if (error) {
      Alert.alert('Could not start shift', error.message);
      return;
    }
    setFloatOpen(false);
    setAmountText('');
    load();
  }

  async function closeShift() {
    if (!guardOnline(isOnline)) return;
    const rupees = Number(amountText);
    if (amountText.trim() === '' || !Number.isFinite(rupees) || rupees < 0) {
      Alert.alert('Enter the counted cash', 'Count the drawer and enter the total.');
      return;
    }
    setShiftBusy(true);
    const { error } = await supabase.rpc('end_shift', { p_counted_cash_minor: Math.round(rupees * 100) });
    setShiftBusy(false);
    if (error) {
      Alert.alert('Could not close shift', error.message);
      return;
    }
    setCloseOpen(false);
    setAmountText('');
    load();
  }

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      bills.filter((b) => {
        if (!q) return true;
        return (
          b.order_number.toLowerCase().includes(q) ||
          (b.table?.label ?? '').toLowerCase().includes(q) ||
          (b.customer?.name ?? '').toLowerCase().includes(q) ||
          (b.customer?.phone ?? '').includes(q)
        );
      }),
    [bills, q],
  );

  // Guests who've finished eating (served) are the ones standing at the
  // counter; everyone else will settle up when they're done dining.
  const atCounter = matches.filter((b) => b.order_status === 'served');
  const dining = matches.filter((b) => b.order_status !== 'served');
  const totalQueue = bills.reduce((s, b) => s + (b.total_minor - b.amount_paid_minor), 0);
  const expectedDrawer = (shift?.opening_float_minor ?? 0) + cashCollected;
  const initials = (session?.user.email ?? 'C').slice(0, 2).toUpperCase();

  if (membership && membership.roleName !== 'Cashier') return <Redirect href={homePathForRole(membership.roleName)} />;

  function renderBill(b: Bill, idx: number, waiting: boolean) {
    const badge = statusBadge[b.order_status] ?? statusBadge.new;
    return (
      <Animated.View
        key={b.id}
        entering={FadeInDown.delay(Math.min(idx, 8) * 40).duration(260)}
        exiting={FadeOutUp.duration(200)}
        layout={LinearTransition.springify().damping(18)}
        style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: waiting ? 2 : 1, borderColor: waiting ? colors.saffron400 : '#F4ECE6', padding: 14, gap: 10 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ minWidth: 40, height: 36, paddingHorizontal: 8, borderRadius: 10, backgroundColor: waiting ? colors.saffron400 : colors.bg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{b.table?.label ?? 'TA'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              #{b.order_number} · {b.customer?.name ?? b.customer?.phone ?? (b.table ? 'Guest' : 'Takeaway')}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.ink500 }}>{itemsLine(b.items)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(b.total_minor - b.amount_paid_minor)}</Text>
            {b.amount_paid_minor > 0 ? <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.success }}>{formatMinor(b.amount_paid_minor)} paid of {formatMinor(b.total_minor)}</Text> : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E0B860', borderStyle: 'dashed', justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.warning }}>₹ Awaiting payment</Text>
          </View>
          <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: badge.bg, justifyContent: 'center' }}>
            <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: badge.fg }}>Order: {badge.label}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([
            ['upi', 'UPI', 'qr'],
            ['card', 'Card', 'card'],
            ['cash', 'Cash', 'cash'],
          ] as const).map(([method, label, icon]) => {
            const primary = method === 'upi';
            return (
              <AnimatedPressable
                key={method}
                onPress={() => collect(b, method)}
                style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: primary ? colors.ink900 : colors.surface, borderWidth: primary ? 0 : 1.5, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Icon name={icon} size={15} color={primary ? '#FFFFFF' : colors.ink900} />
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: primary ? '#FFFFFF' : colors.ink900, fontSize: 13 }}>{label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
        <Pressable
          onPress={() => setSplitting({ id: b.id, label: `${b.table?.label ?? 'Takeaway'} · #${b.order_number}`, totalMinor: b.total_minor, paidMinor: b.amount_paid_minor })}
          style={{ alignSelf: 'flex-start' }}
        >
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>Split bill / part payment</Text>
        </Pressable>
      </Animated.View>
    );
  }

  const sectionLabel = (text: string, dot: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 4, marginTop: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>{text}</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.infoBg, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.info }}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Counter</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 6, backgroundColor: colors.infoBg, justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: colors.info, letterSpacing: 0.4 }}>CASHIER</Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.ink700 }}>
                {membership?.tenantName}
                {shift ? ` · shift since ${shiftSince(shift.started_at)}` : ' · shift not started'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable
            onPress={() => searchRef.current?.focus()}
            style={{ flex: 1.2, height: 48, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Icon name="qr" size={18} color="#FFFFFF" />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 14 }}>Find by order #</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(staff)/orders/new')}
            style={{ flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <Icon name="plus" size={16} color={colors.ink900} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900, fontSize: 14 }}>Counter bill</Text>
          </Pressable>
        </View>

        <View style={{ height: 46, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
          <Icon name="search" size={17} color={colors.ink500} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Order #, table or guest name"
            placeholderTextColor={colors.ink500}
            style={{ flex: 1, fontSize: 14, fontFamily: fonts.body, color: colors.ink900 }}
          />
        </View>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 24, padding: 18, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ gap: 2 }}>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.saffron400, letterSpacing: 0.8 }}>PENDING BILLS</Text>
              <Text style={{ fontSize: 32, fontFamily: fonts.display, color: '#FFFFFF' }}>{formatMinor(totalQueue)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 26, fontFamily: fonts.display, color: '#FFFFFF' }}>{bills.length}</Text>
              <Text style={{ fontSize: 12, color: '#C9BDB6' }}>bills to collect</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
            <Icon name="shield" size={14} color="#C9BDB6" />
            <Text style={{ flex: 1, fontSize: 12, color: '#C9BDB6', lineHeight: 17 }}>
              Guests who chose to call a waiter for the bill appear here. Online (Razorpay) payments settle automatically.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => router.push('/(staff)/cash' as never)}
          style={{ backgroundColor: pendingHandovers > 0 ? colors.saffron50 : colors.surface, borderWidth: pendingHandovers > 0 ? 2 : 1, borderColor: pendingHandovers > 0 ? colors.saffron400 : '#F4ECE6', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <Icon name="cash" size={20} color={colors.ink900} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              {pendingHandovers > 0 ? `${pendingHandovers} waiter handover${pendingHandovers === 1 ? '' : 's'} to confirm` : 'Waiter cash & tables'}
            </Text>
            <Text style={{ fontSize: 12, color: colors.ink700 }}>See which waiter served and collected from each table</Text>
          </View>
          <Icon name="right" size={18} color={colors.ink700} />
        </Pressable>

        <View style={{ flexDirection: 'row', backgroundColor: '#F7F1EC', borderRadius: radius.pill, padding: 4 }}>
          {([
            ['all', `All · ${matches.length}`],
            ['counter', `At counter · ${atCounter.length}`],
            ['dining', `Dining · ${dining.length}`],
          ] as const).map(([key, label]) => {
            const on = tab === key;
            return (
              <Pressable key={key} onPress={() => setTab(key)} style={{ flex: 1, height: 38, borderRadius: radius.pill, backgroundColor: on ? colors.surface : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12.5, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? colors.ink900 : colors.ink700 }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={{ gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 10 }}>
                <Skeleton style={{ width: '60%', height: 18 }} />
                <Skeleton style={{ width: '35%', height: 14 }} />
                <Skeleton style={{ width: '100%', height: 44, borderRadius: 22 }} />
              </View>
            ))}
          </View>
        ) : failed ? (
          <ErrorState icon="receipt" title="We couldn’t load your bills" body="Check your connection and try again. Payments already recorded are safe." onRetry={load} />
        ) : (
          <>
            {tab !== 'dining' && atCounter.length > 0 ? sectionLabel('WAITING AT THE COUNTER', colors.saffron400) : null}
            {tab !== 'dining' ? atCounter.map((b, i) => renderBill(b, i, true)) : null}
            {tab !== 'counter' && dining.length > 0 ? sectionLabel('STILL DINING · WILL PAY AT THE TABLE', colors.ink500) : null}
            {tab !== 'counter' ? dining.map((b, i) => renderBill(b, i, false)) : null}
            {(tab === 'all' ? matches : tab === 'counter' ? atCounter : dining).length === 0 ? (
              <EmptyState icon="receipt" title={q ? 'No bills match' : 'No bills waiting'} body={q ? 'Try a different order number, table or name.' : 'You’re all caught up. New bills show up here as guests ask for them.'} />
            ) : null}
          </>
        )}

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 17, fontFamily: fonts.display, color: colors.ink900 }}>Cash drawer</Text>
            <Text style={{ fontSize: 11, color: colors.ink500 }}>{shift ? `Since ${shiftSince(shift.started_at)}` : 'No open shift'}</Text>
          </View>
          {shift ? (
            <>
              {([
                ['Opening float', shift.opening_float_minor],
                ['Cash collected', cashCollected],
              ] as const).map(([label, value]) => (
                <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, color: colors.ink700 }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{formatMinor(value)}</Text>
                </View>
              ))}
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Expected in drawer</Text>
                <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(expectedDrawer)}</Text>
              </View>
              <Button
                title="Count cash & close shift"
                variant="secondary"
                onPress={() => {
                  setAmountText('');
                  setCloseOpen(true);
                }}
              />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: colors.ink700 }}>Start your shift with the cash float already in the drawer to track what should be in it.</Text>
              <Button
                title="Start shift"
                onPress={() => {
                  setAmountText('');
                  setFloatOpen(true);
                }}
              />
            </>
          )}
        </View>
      </ScrollView>

      {[
        { open: floatOpen, title: 'Start shift', label: 'Opening float (₹)', confirm: 'Start shift', onConfirm: startShift, onClose: () => setFloatOpen(false) },
        { open: closeOpen, title: 'Count cash & close shift', label: `Cash counted in drawer (₹) — expected ${formatMinor(expectedDrawer)}`, confirm: 'Close shift', onConfirm: closeShift, onClose: () => setCloseOpen(false) },
      ].map((m) => (
        <Modal key={m.title} visible={m.open} transparent animationType="fade" onRequestClose={m.onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(27,23,22,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: radius.xl, padding: 20, gap: 12, alignSelf: 'stretch' }}>
              <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{m.title}</Text>
              <Text style={{ fontSize: 13, color: colors.ink700 }}>{m.label}</Text>
              <TextInput
                value={amountText}
                onChangeText={(v) => setAmountText(v.replace(/[^0-9.]/g, ''))}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.ink500}
                style={{ height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, fontSize: 18, fontFamily: fonts.bodyBold, color: colors.ink900 }}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Cancel" variant="outline" onPress={m.onClose} style={{ flex: 1 }} />
                <Button title={m.confirm} onPress={m.onConfirm} loading={shiftBusy} style={{ flex: 1 }} />
              </View>
            </View>
          </View>
        </Modal>
      ))}

      <BottomNav active="home" />
      <PartPaymentSheet order={splitting} onClose={() => setSplitting(null)} onChanged={load} />
    </SafeAreaView>
  );
}
