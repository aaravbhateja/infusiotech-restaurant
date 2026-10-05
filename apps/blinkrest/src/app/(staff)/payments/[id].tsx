import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

type Payment = {
  id: string;
  provider: 'razorpay' | 'cash';
  method: string | null;
  provider_reference: string | null;
  amount_minor: number;
  status: string;
  verified_at: string | null;
  created_at: string;
  order: { id: string; order_number: string; order_status: string; table: { label: string } | null; customer: { name: string | null; phone: string | null } | null } | null;
};

type Refund = { id: string; amount_minor: number; reason: string | null; status: string; created_at: string };

function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [refund, setRefund] = useState<Refund | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: p } = await supabase
      .from('payments')
      .select('id, provider, method, provider_reference, amount_minor, status, verified_at, created_at, order:orders(id, order_number, order_status, table:restaurant_tables(label), customer:customers(name, phone))')
      .eq('id', id)
      .maybeSingle();
    setPayment(p as unknown as Payment);

    const { data: r } = await supabase.from('refunds').select('id, amount_minor, reason, status, created_at').eq('payment_id', id).maybeSingle();
    setRefund(r);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function reconcile() {
    setBusy(true);
    const { error } = await supabase.rpc('reconcile_payment', { p_payment_id: id });
    setBusy(false);
    if (error) Alert.alert('Could not reconcile', error.message);
    else load();
  }

  if (!payment) return null;

  const isRefunded = payment.status === 'refunded';
  const who = payment.order?.customer?.name ?? payment.order?.customer?.phone ?? payment.order?.table?.label ?? 'Guest';
  const canReconcile = membership?.permissions.has('payments.reconcile') && payment.status === 'cash_received';

  const steps: { label: string; sub: string; time: string; done: boolean }[] = [
    { label: 'Payment started', sub: payment.provider === 'cash' ? 'Cash collected at the table' : 'Customer opened checkout', time: new Date(payment.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' }), done: true },
  ];
  if (payment.verified_at) {
    steps.push({ label: 'Payment successful', sub: 'Confirmed', time: new Date(payment.verified_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit' }), done: true });
  } else if (payment.status === 'failed') {
    steps.push({ label: 'Payment failed', sub: 'Not completed', time: '', done: true });
  } else if (payment.status === 'reconciled') {
    steps.push({ label: 'Reconciled', sub: 'Matched against settlement', time: '', done: true });
  }
  if (refund) {
    steps.push({ label: 'Refund initiated', sub: refund.reason ?? `Full amount ${formatMinor(refund.amount_minor)}`, time: new Date(refund.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }), done: true });
    if (refund.status === 'completed') {
      steps.push({ label: 'Refund credited', sub: "To the customer's account", time: '', done: true });
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Transaction</Text>
        </View>

        <View style={{ backgroundColor: isRefunded ? '#F1EBFF' : colors.successBg, borderRadius: 26, padding: 22, alignItems: 'center', gap: 8 }}>
          {isRefunded ? (
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#9C83E0', backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="refresh" size={15} stroke={2.3} color="#5B21B6" />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#5B21B6' }}>Refunded</Text>
            </View>
          ) : (
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="checkc" size={15} stroke={2.3} color={colors.success} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.success }}>{payment.status}</Text>
            </View>
          )}
          <Text style={{ fontSize: 44, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(payment.amount_minor)}</Text>
          <Text style={{ fontSize: 14, color: colors.ink700 }}>{payment.provider === 'cash' ? 'Cash' : payment.method ? payment.method.toUpperCase() : 'Online'} · {who} · {new Date(payment.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Text>
          {payment.order ? (
            <Pressable onPress={() => router.push(`/(staff)/orders/${payment.order!.id}` as never)} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Icon name="orders" size={16} color={colors.ink900} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Order #{payment.order.order_number} · {payment.order.order_status}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900, marginBottom: 14 }}>Payment timeline</Text>
          {steps.map((s, i) => (
            <View key={s.label} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ alignItems: 'center', width: 26 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#0E8F4A', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="check" size={14} stroke={2.8} color="#FFFFFF" />
                </View>
                {i < steps.length - 1 ? <View style={{ width: 2, flexGrow: 1, minHeight: 18, backgroundColor: '#E4D8D0' }} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <View>
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{s.label}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>{s.sub}</Text>
                </View>
                {s.time ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{s.time}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', paddingHorizontal: 16 }}>
          {[
            ['Transaction ID', payment.id.slice(0, 13).toUpperCase()],
            ['Provider', payment.provider === 'cash' ? 'Cash' : `Razorpay${payment.method ? ` · ${payment.method.toUpperCase()}` : ''}`],
            ['Gateway reference', payment.provider_reference ?? '—'],
            ...(refund ? [['Refund status', refund.status]] : []),
          ].map(([k, v], i, arr) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: '#F7F1EC' }}>
              <Text style={{ fontSize: 14, color: colors.ink700 }}>{k}</Text>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900, textAlign: 'right' }}>{v}</Text>
            </View>
          ))}
        </View>

        {canReconcile ? (
          <Pressable disabled={busy} onPress={reconcile} style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 15 }}>{busy ? 'Reconciling…' : 'Mark reconciled'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function PaymentDetail() {
  return (
    <RequireAccess permission="payments.view">
      <PaymentDetailScreen />
    </RequireAccess>
  );
}
