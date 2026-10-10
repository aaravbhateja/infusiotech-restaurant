import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';

type Category = { id: string; name: string };
type MenuItem = { id: string; category_id: string; name: string; price_minor: number; currency: string; is_available: boolean };
type TableOption = { id: string; label: string };
type Parked = { id: string; table_id: string | null; label: string; guest_count: number | null; items: { menu_item_id: string; quantity: number }[] };

function NewOrderScreen() {
  const { membership } = useAuth();
  const { tableId: initialTableId, orderId } = useLocalSearchParams<{ tableId?: string; orderId?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<TableOption[]>([]);
  const [tableId, setTableId] = useState<string | null>(initialTableId ?? null);
  const [takeaway, setTakeaway] = useState(!initialTableId);
  const [guestCount, setGuestCount] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [placing, setPlacing] = useState(false);
  const [parked, setParked] = useState<Parked[]>([]);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: cats }, { data: menuItems }, { data: tableRows }] = await Promise.all([
      supabase.from('menu_categories').select('id, name').eq('tenant_id', membership.tenantId).eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('id, category_id, name, price_minor, currency, is_available').eq('tenant_id', membership.tenantId).eq('is_available', true).order('sort_order'),
      supabase.from('restaurant_tables').select('id, label').eq('tenant_id', membership.tenantId).eq('status', 'active').order('label'),
    ]);
    setCategories(cats ?? []);
    setItems((menuItems as MenuItem[]) ?? []);
    setTables(tableRows ?? []);
  }, [membership]);

  useRealtimeRefresh('neworderstsx', tenantSubs(membership?.tenantId, ['menu_items', 'menu_categories']), load);

  const loadParked = useCallback(async () => {
    const { data } = await supabase.from('parked_orders').select('id, table_id, label, guest_count, items').order('created_at');
    setParked((data as Parked[]) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    loadParked();
  }, [load, loadParked]);

  const visibleItems = useMemo(
    () => (activeCategory === 'All' ? items : items.filter((i) => i.category_id === activeCategory)),
    [items, activeCategory],
  );

  const cartLines = Object.entries(cart)
    .filter(([, q]) => q > 0)
    .map(([itemId, qty]) => ({ item: items.find((i) => i.id === itemId)!, qty }))
    .filter((l) => l.item);
  const cartTotal = cartLines.reduce((s, l) => s + l.item.price_minor * l.qty, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  function setQty(itemId: string, qty: number) {
    setCart((prev) => ({ ...prev, [itemId]: Math.max(0, qty) }));
  }

  // Hold: save the cart on the server so any device can resume it later.
  async function parkOrder() {
    if (!membership || cartLines.length === 0) return;
    if (!takeaway && !tableId) {
      Alert.alert('Pick a table', 'Choose a table, or switch to Takeaway, before parking.');
      return;
    }
    const label = takeaway ? 'Takeaway' : tables.find((t) => t.id === tableId)?.label ?? 'Table';
    const { error } = await supabase.from('parked_orders').insert({
      tenant_id: membership.tenantId,
      created_by: membership.id,
      table_id: takeaway ? null : tableId,
      label,
      guest_count: guestCount.trim() ? Number(guestCount) : null,
      items: cartLines.map((l) => ({ menu_item_id: l.item.id, quantity: l.qty })),
    });
    if (error) {
      Alert.alert('Could not park order', error.message);
      return;
    }
    setCart({});
    loadParked();
  }

  async function resumeParked(p: Parked) {
    const next: Record<string, number> = {};
    for (const line of p.items) next[line.menu_item_id] = line.quantity;
    setCart(next);
    setTakeaway(p.table_id === null);
    setTableId(p.table_id);
    setGuestCount(p.guest_count ? String(p.guest_count) : '');
    await supabase.from('parked_orders').delete().eq('id', p.id);
    loadParked();
  }

  async function discardParked(p: Parked) {
    await supabase.from('parked_orders').delete().eq('id', p.id);
    loadParked();
  }

  async function placeOrder() {
    if (!membership || cartLines.length === 0) return;
    // "Add items" mode: the new lines go onto an existing open order.
    if (orderId) {
      setPlacing(true);
      const { error: addError } = await supabase.rpc('add_order_items', {
        p_order_id: orderId,
        p_items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.qty })),
      });
      setPlacing(false);
      if (addError) {
        Alert.alert('Could not add items', addError.message);
        return;
      }
      router.back();
      return;
    }
    if (!takeaway && !tableId) {
      Alert.alert('Pick a table', 'Choose a table, or switch to Takeaway.');
      return;
    }
    setPlacing(true);
    const { data, error } = await supabase.rpc('create_staff_order', {
      p_tenant_id: membership.tenantId,
      p_table_id: takeaway ? null : tableId,
      p_items: cartLines.map((l) => ({ menu_item_id: l.item.id, variant_ids: [], addon_ids: [], quantity: l.qty })),
      p_guest_count: guestCount.trim() ? Number(guestCount) : null,
    });
    setPlacing(false);
    if (error) {
      Alert.alert('Could not create order', error.message);
      return;
    }
    router.replace(`/(staff)/orders/${data.order_id}` as never);
  }

  if (!membership) return null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>{orderId ? 'Add items' : 'New order'}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: cartCount > 0 ? 110 : 24 }}>
        {!orderId ? (
          <>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setTakeaway(false)}
            style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: !takeaway ? colors.ink900 : colors.surface, borderWidth: !takeaway ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: !takeaway ? fonts.bodyExtraBold : fonts.bodyBold, color: !takeaway ? '#FFFFFF' : colors.ink900 }}>Dine-in</Text>
          </Pressable>
          <Pressable
            onPress={() => setTakeaway(true)}
            style={{ flex: 1, height: 44, borderRadius: radius.pill, backgroundColor: takeaway ? colors.ink900 : colors.surface, borderWidth: takeaway ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 13, fontFamily: takeaway ? fonts.bodyExtraBold : fonts.bodyBold, color: takeaway ? '#FFFFFF' : colors.ink900 }}>Takeaway</Text>
          </Pressable>
        </View>

        {!takeaway ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {tables.map((t) => {
              const on = t.id === tableId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTableId(t.id)}
                  style={{ height: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? colors.coral600 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: on ? '#FFFFFF' : colors.ink900 }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {!takeaway ? (
          <TextInput
            value={guestCount}
            onChangeText={setGuestCount}
            placeholder="Number of guests (optional)"
            placeholderTextColor={colors.ink500}
            keyboardType="number-pad"
            style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 16, color: colors.ink900 }}
          />
        ) : null}

          </>
        ) : null}

        {!orderId && parked.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 }}>PARKED ORDERS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {parked.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, backgroundColor: colors.saffron50, borderWidth: 1.5, borderColor: colors.saffron400, paddingLeft: 14, paddingRight: 6, height: 42, gap: 8 }}>
                  <Pressable onPress={() => resumeParked(p)}>
                    <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                      {p.label} · {p.items.reduce((n, i) => n + i.quantity, 0)} items · Resume
                    </Text>
                  </Pressable>
                  <Pressable onPress={() => discardParked(p)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={14} stroke={2.4} color={colors.ink700} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!orderId && cartCount > 0 ? (
          <Pressable onPress={parkOrder} style={{ alignSelf: 'flex-start', height: 38, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Park this order for later</Text>
          </Pressable>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {['All', ...categories.map((c) => c.id)].map((c) => {
            const on = c === activeCategory;
            const label = c === 'All' ? 'All' : categories.find((x) => x.id === c)?.name ?? c;
            return (
              <Pressable key={c} onPress={() => setActiveCategory(c)} style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ gap: 10 }}>
          {visibleItems.map((item) => {
            const qty = cart[item.id] ?? 0;
            return (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: '#F4ECE6', ...shadow.card }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink900 }}>{item.name}</Text>
                  <Text style={{ fontFamily: fonts.bodyBold, color: colors.ink700, marginTop: 2 }}>{formatMinor(item.price_minor, item.currency)}</Text>
                </View>
                {qty === 0 ? (
                  <Pressable onPress={() => setQty(item.id, 1)} style={{ height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.coral50, justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.coral700 }}>Add</Text>
                  </Pressable>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.coral600, borderRadius: radius.pill, paddingHorizontal: 6, height: 40 }}>
                    <Pressable onPress={() => setQty(item.id, qty - 1)} hitSlop={8}>
                      <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold, fontSize: 18, width: 24, textAlign: 'center' }}>−</Text>
                    </Pressable>
                    <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold }}>{qty}</Text>
                    <Pressable onPress={() => setQty(item.id, qty + 1)} hitSlop={8}>
                      <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold, fontSize: 18, width: 24, textAlign: 'center' }}>+</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}
          {visibleItems.length === 0 ? <Text style={{ color: colors.ink500, textAlign: 'center', padding: 24 }}>No items in this category.</Text> : null}
        </View>
      </ScrollView>

      {cartCount > 0 ? (
        <Pressable
          disabled={placing}
          onPress={placeOrder}
          style={{ position: 'absolute', left: 16, right: 16, bottom: 24, height: 58, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, ...shadow.sheet }}
        >
          <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold }}>{cartCount} item{cartCount > 1 ? 's' : ''}</Text>
          <Text style={{ color: '#FFF', fontFamily: fonts.bodyExtraBold }}>{placing ? 'Please wait…' : `${orderId ? 'Add to order' : 'Place order'} · ${formatMinor(cartTotal)}`}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

export default function NewOrder() {
  return (
    <RequireAccess permission="orders.create">
      <NewOrderScreen />
    </RequireAccess>
  );
}
