import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillPreviewSheet } from '@/components/BillPreviewSheet';
import { Button } from '@/components/Button';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { homePathForRole } from '@/lib/roleHome';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, statusBadge } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type OrderItem = {
  id: string;
  item_name_snapshot: string;
  quantity: number;
  line_total_minor: number;
  variant_snapshot: { name: string }[];
  addon_snapshot: { name: string }[];
  voided_at: string | null;
  void_reason: string | null;
  added_after_kot: boolean;
};

type OrderDetailData = {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  total_minor: number;
  currency: string;
  created_at: string;
  table: { label: string } | null;
  items: OrderItem[];
};

const NEXT_STEP: Record<string, { status: string; label: string; permission: string } | undefined> = {
  new: { status: 'accepted', label: 'Accept order', permission: 'orders.accept' },
  accepted: { status: 'preparing', label: 'Start preparing', permission: 'orders.prepare' },
  preparing: { status: 'ready', label: 'Mark ready', permission: 'orders.prepare' },
  ready: { status: 'served', label: 'Mark served', permission: 'orders.serve' },
};

type DiscountRequest = { id: string; amount_minor: number; reason: string; status: string };

function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [voiding, setVoiding] = useState<OrderItem | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  // Kitchen staff only prepare food: no bills, receipts or printing.
  const canSeeBill = !!(membership?.permissions.has('payments.view') || membership?.permissions.has('payments.cash.collect') || membership?.permissions.has('orders.create'));
  const [discountRequest, setDiscountRequest] = useState<DiscountRequest | null>(null);
  const [requestingDiscount, setRequestingDiscount] = useState(false);
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [submittingDiscount, setSubmittingDiscount] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select(
        'id, order_number, order_status, payment_status, total_minor, currency, created_at, table:restaurant_tables(label), items:order_items(id, item_name_snapshot, quantity, line_total_minor, variant_snapshot, addon_snapshot, voided_at, void_reason, added_after_kot)',
      )
      .eq('id', id)
      .single();
    setOrder(data as unknown as OrderDetailData);

    const { data: dr } = await supabase
      .from('discount_requests')
      .select('id, amount_minor, reason, status')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setDiscountRequest(dr);
  }, [id]);

  useRealtimeRefresh('ordersidtsx', tenantSubs(membership?.tenantId, ['orders', 'order_items', 'payments', 'discount_requests']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function transition(status: string, reason?: string) {
    if (!guardOnline(isOnline)) return;
    setOrder((prev) => (prev ? { ...prev, order_status: status } : prev));
    const { error } = await supabase.rpc('transition_order_status', {
      p_order_id: id,
      p_new_status: status,
      p_reason: reason ?? null,
    });
    if (error) {
      Alert.alert('Could not update order', error.message);
      await load();
    }
  }

  function confirmReject() {
    Alert.prompt?.(
      'Reject order',
      'Reason for rejecting this order:',
      (reason) => {
        if (reason?.trim()) transition('rejected', reason.trim());
      },
    ) ?? transition('rejected', 'Rejected by staff');
  }

  async function recordCash() {
    if (!guardOnline(isOnline)) return;
    setOrder((prev) => (prev ? { ...prev, payment_status: 'cash_received' } : prev));
    const { error } = await supabase.rpc('record_cash_payment', { p_order_id: id });
    if (error) {
      Alert.alert('Could not record payment', error.message);
      await load();
    }
  }

  async function submitDiscountRequest() {
    const amountMinor = Math.round(parseFloat(discountAmount || '0') * 100);
    if (amountMinor <= 0 || !discountReason.trim()) return;
    if (!guardOnline(isOnline)) return;
    setSubmittingDiscount(true);
    const { error } = await supabase.rpc('request_discount', { p_order_id: id, p_amount_minor: amountMinor, p_reason: discountReason.trim() });
    setSubmittingDiscount(false);
    if (error) {
      Alert.alert('Could not request discount', error.message);
      return;
    }
    setRequestingDiscount(false);
    setDiscountAmount('');
    setDiscountReason('');
    await load();
  }

  if (!order) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  const badge = statusBadge[order.order_status] ?? statusBadge.new;
  const nextStep = NEXT_STEP[order.order_status];
  const next = nextStep && (membership?.permissions.has(nextStep.permission) || membership?.permissions.has('orders.status.update')) ? nextStep : undefined;

  async function submitVoid() {
    if (!voiding) return;
    if (voidReason.trim().length === 0) {
      Alert.alert('Reason needed', 'Say why this item is being removed.');
      return;
    }
    if (!guardOnline(isOnline)) return;
    setVoidBusy(true);
    const { data, error } = await supabase.rpc('void_order_item', { p_item_id: voiding.id, p_reason: voidReason.trim() });
    setVoidBusy(false);
    if (error) {
      Alert.alert('Could not void item', error.message === 'request_already_pending' ? 'A request for this item is already waiting for approval.' : error.message);
      return;
    }
    setVoiding(null);
    setVoidReason('');
    if ((data as { status?: string } | null)?.status === 'pending_approval') {
      Alert.alert('Sent for approval', 'A manager has to approve removing this item.');
    }
    load();
  }

  const canEditItems = !!order && membership?.permissions.has('orders.edit') && !['rejected', 'cancelled'].includes(order.order_status) && ['unpaid', 'pending'].includes(order.payment_status);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 24, gap: 20 }}>
      <Text onPress={() => router.back()} style={{ fontFamily: fonts.bodyBold, color: colors.coral600 }}>
        ← Back
      </Text>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900 }}>
            #{order.order_number}
          </Text>
          <Text style={{ fontFamily: fonts.body, color: colors.ink700 }}>
            {order.table?.label ?? 'No table'} ·{' '}
            {new Date(order.created_at).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <View style={{ backgroundColor: badge.bg, borderRadius: radius.pill, paddingHorizontal: 12, height: 30, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: badge.fg }}>{badge.label}</Text>
        </View>
      </View>

      <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.line }}>
        {order.items.map((item) => {
          const voided = !!item.voided_at;
          return (
            <View key={item.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, color: voided ? colors.ink500 : colors.ink900, textDecorationLine: voided ? 'line-through' : 'none' }}>
                    {item.quantity}× {item.item_name_snapshot}
                    {item.added_after_kot && !voided ? '  · ADDED' : ''}
                  </Text>
                  {[...item.variant_snapshot, ...item.addon_snapshot].map((v, i) => (
                    <Text key={i} style={{ fontSize: 12, color: colors.ink500, fontFamily: fonts.body }}>
                      {v.name}
                    </Text>
                  ))}
                  {voided ? <Text style={{ fontSize: 12, color: colors.error, fontFamily: fonts.bodyBold }}>Voided: {item.void_reason}</Text> : null}
                </View>
                <Text style={{ fontFamily: fonts.bodyBold, color: voided ? colors.ink500 : colors.ink900, textDecorationLine: voided ? 'line-through' : 'none' }}>
                  {formatMinor(item.line_total_minor, order.currency)}
                </Text>
              </View>
              {canEditItems && !voided ? (
                <Pressable onPress={() => { setVoidReason(''); setVoiding(item); }} style={{ alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Remove item</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink900 }}>Total</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.ink900 }}>
            {formatMinor(order.total_minor, order.currency)}
          </Text>
        </View>
      </View>

      {membership?.permissions.has('orders.status.update') && !['rejected', 'cancelled'].includes(order.order_status) ? (
        discountRequest?.status === 'pending' ? (
          <View style={{ backgroundColor: colors.saffron50, borderRadius: radius.lg, padding: 16, gap: 4 }}>
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#8A5A00' }}>
              Discount request pending · {formatMinor(discountRequest.amount_minor)}
            </Text>
            <Text style={{ fontSize: 13, color: '#6B4600' }}>{discountRequest.reason}</Text>
          </View>
        ) : discountRequest?.status === 'declined' ? (
          <View style={{ backgroundColor: colors.errorBg, borderRadius: radius.lg, padding: 16 }}>
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>Last discount request was declined.</Text>
          </View>
        ) : requestingDiscount ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 }}>
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Request a discount</Text>
            <TextField label="Amount (₹)" value={discountAmount} onChangeText={setDiscountAmount} keyboardType="decimal-pad" placeholder="0" />
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Reason</Text>
              <TextInput
                value={discountReason}
                onChangeText={setDiscountReason}
                placeholder="Why does this order need a discount?"
                multiline
                style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.line, padding: 12, fontSize: 15, minHeight: 60, textAlignVertical: 'top' }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Cancel" variant="outline" onPress={() => setRequestingDiscount(false)} style={{ flex: 1 }} />
              <Button
                title={submittingDiscount ? 'Sending…' : 'Send request'}
                onPress={submitDiscountRequest}
                disabled={!discountAmount || !discountReason.trim() || submittingDiscount}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        ) : (
          <Button title="Request discount" variant="outline" onPress={() => setRequestingDiscount(true)} />
        )
      ) : null}

      <View style={{ gap: 10 }}>
        {next ? <Button title={next.label} onPress={() => transition(next.status)} /> : null}
        {order.order_status === 'new' && membership?.permissions.has('orders.reject') ? (
          <Button title="Reject" variant="danger-outline" onPress={confirmReject} />
        ) : null}
        {['new', 'accepted', 'preparing'].includes(order.order_status) && membership?.permissions.has('orders.cancel') ? (
          <Button
            title="Cancel order"
            variant="outline"
            onPress={() => transition('cancelled', 'Cancelled by staff')}
          />
        ) : null}
        {order.payment_status === 'unpaid' ? (
          <Button title="Record cash payment" variant="outline" onPress={recordCash} />
        ) : (
          <Text style={{ fontFamily: fonts.bodyBold, color: colors.success, textAlign: 'center' }}>
            Payment: {order.payment_status}
          </Text>
        )}
        {canEditItems ? <Button title="Add items" variant="outline" onPress={() => router.push(`/(staff)/orders/new?orderId=${order.id}` as never)} /> : null}
        {canSeeBill ? <Button title="Check bill" variant="outline" onPress={() => setBillOpen(true)} /> : null}
      </View>
    </ScrollView>

    <Modal visible={voiding !== null} transparent animationType="fade" onRequestClose={() => setVoiding(null)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: colors.surface, borderRadius: 24, padding: 20, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Remove item</Text>
          <Text style={{ fontSize: 13, color: colors.ink700 }}>
            {voiding ? `${voiding.quantity}× ${voiding.item_name_snapshot}. ` : ''}
            {membership?.permissions.has('orders.void') ? 'The kitchen is told right away.' : 'A manager has to approve this.'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {['Customer changed mind', 'Wrong item', 'Out of stock', 'Long wait'].map((reason) => (
              <Pressable key={reason} onPress={() => setVoidReason(reason)} style={{ height: 34, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: voidReason === reason ? colors.ink900 : colors.bg, justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: voidReason === reason ? '#FFFFFF' : colors.ink900 }}>{reason}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={voidReason}
            onChangeText={setVoidReason}
            placeholder="Reason"
            placeholderTextColor={colors.ink500}
            style={{ height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }}
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable onPress={() => setVoiding(null)} style={{ flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Cancel</Text>
            </Pressable>
            <Pressable disabled={voidBusy} onPress={submitVoid} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', opacity: voidBusy ? 0.6 : 1 }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{voidBusy ? 'Please wait…' : 'Remove'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>

    {billOpen ? (
      <BillPreviewSheet
        order={{
          orderNumber: order.order_number,
          createdAt: order.created_at,
          tableLabel: order.table?.label ?? null,
          items: order.items.filter((i) => !i.voided_at).map((i) => ({ name: i.item_name_snapshot, quantity: i.quantity, lineTotalMinor: i.line_total_minor })),
          totalMinor: order.total_minor,
        }}
        onClose={() => setBillOpen(false)}
      />
    ) : null}
    </SafeAreaView>
  );
}

export default function OrderDetail() {
  const { membership } = useAuth();
  // Kitchen staff work from their queue only.
  if (membership?.roleName === 'Kitchen Staff') return <Redirect href={homePathForRole(membership.roleName)} />;
  return (
    <RequireAccess permission="orders.view">
      <OrderDetailScreen />
    </RequireAccess>
  );
}
