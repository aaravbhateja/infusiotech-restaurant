import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

export type PartPayOrder = {
  id: string;
  label: string;
  totalMinor: number;
  paidMinor: number;
};

const METHODS = [
  ['upi', 'UPI'],
  ['card', 'Card'],
  ['cash', 'Cash'],
] as const;

// Take a bill in parts: split between guests ("÷2", "÷3", "÷4" fill the amount
// for you) or mix methods (₹500 cash + the rest on UPI). Each part is recorded
// separately; the order is marked paid when the parts cover the total.
export function PartPaymentSheet({ order, onClose, onChanged }: { order: PartPayOrder | null; onClose: () => void; onChanged: () => void }) {
  const [paid, setPaid] = useState(0);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);

  const total = order?.totalMinor ?? 0;
  const due = Math.max(0, total - paid);

  useEffect(() => {
    if (!order) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when a different bill opens
    setPaid(order.paidMinor);
    setAmountText(String(((order.totalMinor - order.paidMinor) / 100).toFixed(2)));
  }, [order]);

  function setSplit(n: number) {
    setAmountText(String((Math.ceil(due / n) / 100).toFixed(2)));
  }

  async function pay(method: 'upi' | 'card' | 'cash') {
    if (!order) return;
    const rupees = Number(amountText);
    const minor = Math.round(rupees * 100);
    if (!Number.isFinite(rupees) || minor <= 0 || minor > due) {
      Alert.alert('Check the amount', `Enter an amount between ₹0.01 and ${formatMinor(due)}.`);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('record_payment_amount', { p_order_id: order.id, p_method: method, p_amount_minor: minor });
    setBusy(false);
    if (error) {
      Alert.alert('Could not record payment', error.message);
      return;
    }
    const remaining = Number((data as { remaining_minor: number }).remaining_minor);
    onChanged();
    if (remaining <= 0) {
      onClose();
      return;
    }
    setPaid(total - remaining);
    setAmountText(String((remaining / 100).toFixed(2)));
  }

  return (
    <Modal visible={order !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>Split payment · {order?.label}</Text>
            <Pressable onPress={onClose} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.bg, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Close</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              ['Total', formatMinor(total), colors.ink900],
              ['Paid', formatMinor(paid), colors.success],
              ['Due', formatMinor(due), due > 0 ? colors.warning : colors.success],
            ].map(([k, v, c]) => (
              <View key={k} style={{ flex: 1, backgroundColor: colors.bg, borderRadius: 14, padding: 10, gap: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyBold, color: colors.ink700 }}>{k}</Text>
                <Text style={{ fontSize: 16, fontFamily: fonts.display, color: c }}>{v}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>THIS PAYMENT</Text>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={amountText}
              onChangeText={setAmountText}
              keyboardType="decimal-pad"
              style={{ flex: 1, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, fontSize: 18, fontFamily: fonts.bodyBold, color: colors.ink900 }}
            />
            {[2, 3, 4].map((n) => (
              <Pressable key={n} onPress={() => setSplit(n)} style={{ height: 50, minWidth: 50, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>÷{n}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {METHODS.map(([m, label]) => (
              <Pressable
                key={m}
                disabled={busy}
                onPress={() => pay(m)}
                style={{ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: m === 'upi' ? colors.ink900 : colors.surface, borderWidth: m === 'upi' ? 0 : 1.5, borderColor: colors.inputBorder, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
              >
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: m === 'upi' ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={{ fontSize: 12, color: colors.ink500 }}>Tap a method to record this amount. Repeat for each guest until the due amount is zero.</Text>
        </View>
      </View>
    </Modal>
  );
}
