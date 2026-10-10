import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Customer = { id: string; name: string | null; phone: string | null; email: string | null; created_at: string; staff_notes: string | null; points_balance: number; birthday: string | null; credit_limit_minor: number; account_balance_minor: number };
type OrderRow = { id: string; order_number: string; order_status: string; total_minor: number; created_at: string; table: { label: string } | null };
type Favorite = { name: string; count: number };

const STATUS_ICON: Record<string, IconName> = {
  served: 'dine', new: 'bolt', accepted: 'bolt', preparing: 'flame', ready: 'bell', rejected: 'x', cancelled: 'x',
};

function initials(text: string | null) {
  if (!text) return '?';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [birthday, setBirthday] = useState('');
  const [limit, setLimit] = useState('');
  const [payAmount, setPayAmount] = useState('');

  const load = useCallback(async () => {
    const [{ data: c }, { data: os }] = await Promise.all([
      supabase.from('customers').select('id, name, phone, email, created_at, staff_notes, points_balance, birthday, credit_limit_minor, account_balance_minor').eq('id', id).maybeSingle(),
      supabase
        .from('orders')
        .select('id, order_number, order_status, total_minor, created_at, table:restaurant_tables(label)')
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
    ]);
    setCustomer(c);
    setNotes(c?.staff_notes ?? '');
    setBirthday(c?.birthday ?? '');
    setLimit(c ? String(c.credit_limit_minor / 100) : '');
    setOrders((os as unknown as OrderRow[]) ?? []);

    const orderIds = (os ?? []).map((o) => o.id);
    if (orderIds.length) {
      const { data: items } = await supabase.from('order_items').select('item_name_snapshot, quantity').in('order_id', orderIds);
      const counts = new Map<string, number>();
      for (const it of items ?? []) counts.set(it.item_name_snapshot, (counts.get(it.item_name_snapshot) ?? 0) + it.quantity);
      setFavorites(Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 3));
    } else {
      setFavorites([]);
    }
  }, [id]);

  useRealtimeRefresh('customersidtsx', [{ table: 'customers' }, { table: 'orders' }], load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function saveNotes() {
    setSavingNotes(true);
    await supabase.from('customers').update({ staff_notes: notes.trim() || null }).eq('id', id);
    setSavingNotes(false);
  }

  if (!customer) return null;

  const lifetimeSpend = orders.reduce((s, o) => s + o.total_minor, 0);
  const avgOrder = orders.length ? Math.round(lifetimeSpend / orders.length) : 0;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {customer.phone ? (
            <Pressable onPress={() => Linking.openURL(`tel:${customer.phone}`)} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="phone" size={20} color={colors.success} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: '#FFD3C5', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.ink900 }}>{initials(customer.name ?? customer.phone)}</Text>
          </View>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, marginTop: 6 }}>{customer.name ?? customer.phone ?? 'Guest'}</Text>
          {customer.phone ? <Text style={{ fontSize: 14, color: colors.ink700 }}>{customer.phone}</Text> : null}
          <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: '#F1ECE8', justifyContent: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>
              Customer since {new Date(customer.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ width: '47%', backgroundColor: colors.ink900, borderRadius: 20, padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.saffron400 }}>{formatMinor(lifetimeSpend)}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#FFFFFF' }}>Lifetime spend</Text>
          </View>
          <View style={{ width: '47%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 20, padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{orders.length}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Orders</Text>
          </View>
          <View style={{ width: '100%', backgroundColor: colors.surface, borderWidth: 1, borderColor: '#F4ECE6', borderRadius: 20, padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(avgOrder)}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Avg order value</Text>
          </View>
        </View>

        {favorites.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Favourite items</Text>
            {favorites.map((f) => (
              <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="dine" size={17} color={colors.ink900} />
                </View>
                <Text style={{ flex: 1, fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{f.name}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>ordered {f.count}×</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Order history</Text>
          {orders.map((o) => (
            <Pressable key={o.id} onPress={() => router.push(`/(staff)/orders/${o.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={STATUS_ICON[o.order_status] ?? 'orders'} size={19} color={colors.ink900} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>#{o.order_number} · {o.table?.label ?? 'Takeaway'}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{new Date(o.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
              </View>
              <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(o.total_minor)}</Text>
            </Pressable>
          ))}
          {orders.length === 0 ? <Text style={{ color: colors.ink500 }}>No orders yet.</Text> : null}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10, ...shadow.card }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Contact</Text>
          <TextInput
            editable={false}
            value={customer.email ?? 'No email on file'}
            style={{ borderRadius: 14, borderWidth: 1.5, borderColor: '#E4D8D0', padding: 12, fontSize: 15, backgroundColor: '#FFFBF8', color: colors.ink900, fontFamily: fonts.body }}
          />
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>House account</Text>
          <Text style={{ fontSize: 14, color: colors.ink700 }}>
            Owes {(customer.account_balance_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })} · limit {(customer.credit_limit_minor / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={limit}
              onChangeText={setLimit}
              placeholder="Credit limit (₹)"
              placeholderTextColor={colors.ink500}
              keyboardType="number-pad"
              style={{ flex: 1, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }}
            />
            <Pressable
              onPress={async () => {
                const v = Math.round(Number(limit) * 100);
                if (!Number.isFinite(v) || v < 0) return;
                const { error } = await supabase.rpc('set_credit_limit', { p_customer: id, p_limit_minor: v });
                if (error) Alert.alert('Could not save', error.message);
                else load();
              }}
              style={{ height: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Set</Text>
            </Pressable>
          </View>
          {customer.account_balance_minor > 0 ? (
            <>
              <TextInput
                value={payAmount}
                onChangeText={setPayAmount}
                placeholder="Amount received (₹)"
                placeholderTextColor={colors.ink500}
                keyboardType="number-pad"
                style={{ height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(['cash', 'upi', 'card'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={async () => {
                      const v = Math.round(Number(payAmount) * 100);
                      if (!Number.isFinite(v) || v <= 0) {
                        Alert.alert('Enter the amount received');
                        return;
                      }
                      const { error } = await supabase.rpc('settle_account', { p_customer: id, p_amount_minor: v, p_method: m });
                      if (error) Alert.alert('Could not record', error.message === 'invalid_amount' ? 'That is more than the customer owes.' : error.message);
                      else {
                        setPayAmount('');
                        load();
                      }
                    }}
                    style={{ flex: 1, height: 42, borderRadius: 21, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Received {m.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Loyalty & dates</Text>
          <Text style={{ fontSize: 14, color: colors.ink700 }}>{customer.points_balance} loyalty points</Text>
          <TextInput
            value={birthday}
            onChangeText={setBirthday}
            placeholder="Birthday (YYYY-MM-DD)"
            placeholderTextColor={colors.ink500}
            style={{ height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }}
          />
          <Pressable
            onPress={async () => {
              const ok = birthday.trim() === '' || /^\d{4}-\d{2}-\d{2}$/.test(birthday.trim());
              if (!ok) return;
              await supabase.from('customers').update({ birthday: birthday.trim() || null }).eq('id', id);
              load();
            }}
            style={{ alignSelf: 'flex-end', height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Save</Text>
          </Pressable>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Staff notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Allergies, seating preference, anything worth remembering…"
            multiline
            style={{ borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 12, fontSize: 14, minHeight: 70, textAlignVertical: 'top', color: colors.ink900 }}
          />
          <Pressable
            onPress={saveNotes}
            disabled={savingNotes || notes === (customer.staff_notes ?? '')}
            style={{ alignSelf: 'flex-end', height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: savingNotes || notes === (customer.staff_notes ?? '') ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 13 }}>{savingNotes ? 'Saving…' : 'Save note'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CustomerDetail() {
  return (
    <RequireAccess permission="customers.view">
      <CustomerDetailScreen />
    </RequireAccess>
  );
}
