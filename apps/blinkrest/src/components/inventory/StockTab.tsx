import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

import { Button, Chip, Field, Sheet, UNITS, card, heading, qtyText, rupees, type InvItem } from './ui';

type Movement = { id: string; qty_delta: number; kind: string; note: string | null; created_at: string };

const KIND_LABEL: Record<string, string> = {
  purchase: 'Stock in',
  sale: 'Used in sales',
  sale_reversal: 'Returned (void)',
  wastage: 'Wastage',
  staff_meal: 'Staff meal',
  adjustment: 'Adjustment',
  stocktake: 'Stocktake',
  opening: 'Opening',
};

export function StockTab() {
  const { membership } = useAuth();
  const canManage = !!membership?.permissions.has('inventory.manage');
  const [items, setItems] = useState<InvItem[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<InvItem | null>(null);
  const [moves, setMoves] = useState<Movement[]>([]);

  // add-item form
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<(typeof UNITS)[number]>('kg');
  const [purchaseUnit, setPurchaseUnit] = useState('');
  const [factor, setFactor] = useState('1');
  const [minQty, setMinQty] = useState('');
  const [perishable, setPerishable] = useState(false);
  const [openQty, setOpenQty] = useState('');
  const [openCost, setOpenCost] = useState('');

  // action form on an item
  const [action, setAction] = useState<null | 'in' | 'wastage' | 'staff_meal' | 'adjustment'>(null);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [expiry, setExpiry] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase.from('inventory_items').select('*').eq('is_active', true).order('name');
    setItems((data as InvItem[]) ?? []);
  }, []);

  useRealtimeRefresh('stocktabtsx', tenantSubs(membership?.tenantId, ['inventory_items']), load);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const shown = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())), [items, query]);
  const low = items.filter((i) => i.min_qty > 0 && i.current_qty <= i.min_qty);

  async function openItem(i: InvItem) {
    setOpen(i);
    setAction(null);
    const { data } = await supabase.from('stock_movements').select('id, qty_delta, kind, note, created_at').eq('inventory_item_id', i.id).order('created_at', { ascending: false }).limit(12);
    setMoves((data as Movement[]) ?? []);
  }

  async function saveItem() {
    if (!membership) return;
    const f = Number(factor);
    if (!name.trim() || !Number.isFinite(f) || f <= 0) {
      Alert.alert('Check the item', 'Give it a name and a valid pack size.');
      return;
    }
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        tenant_id: membership.tenantId,
        name: name.trim(),
        unit,
        purchase_unit: purchaseUnit.trim() || null,
        purchase_factor: purchaseUnit.trim() ? f : 1,
        min_qty: Number(minQty) || 0,
        perishable,
      })
      .select('id')
      .single();
    if (error) {
      Alert.alert('Could not add item', error.message.includes('duplicate') ? 'An item with this name already exists.' : error.message);
      return;
    }
    if (Number(openQty) > 0) {
      const { error: e2 } = await supabase.rpc('add_stock_with_cost', { p_item: data.id, p_qty: Number(openQty), p_unit_cost_minor: Math.round((Number(openCost) || 0) * 100), p_note: 'Opening stock', p_expiry: null });
      if (e2) Alert.alert('Item added, but opening stock failed', e2.message);
    }
    setAdding(false);
    setName('');
    setOpenQty('');
    setOpenCost('');
    setMinQty('');
    setPurchaseUnit('');
    setFactor('1');
    load();
  }

  async function submitAction() {
    if (!open || !action) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0) {
      Alert.alert('Enter a quantity', 'The quantity cannot be zero.');
      return;
    }
    let error;
    if (action === 'in') {
      ({ error } = await supabase.rpc('add_stock_with_cost', {
        p_item: open.id,
        p_qty: Math.abs(n),
        p_unit_cost_minor: Math.round((Number(cost) || 0) * 100),
        p_note: note || null,
        p_expiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? expiry : null,
      }));
    } else {
      const delta = action === 'adjustment' ? n : -Math.abs(n);
      ({ error } = await supabase.rpc('record_stock_change', { p_item: open.id, p_qty: delta, p_kind: action, p_note: note || null }));
    }
    if (error) {
      Alert.alert('Could not save', error.message === 'wastage_needs_negative_qty_and_reason' ? 'Add a reason.' : error.message);
      return;
    }
    setQty('');
    setCost('');
    setNote('');
    setExpiry('');
    setAction(null);
    await load();
    const fresh = (await supabase.from('inventory_items').select('*').eq('id', open.id).single()).data as InvItem;
    if (fresh) openItem(fresh);
  }

  async function saveMin(i: InvItem, v: string) {
    await supabase.from('inventory_items').update({ min_qty: Number(v) || 0 }).eq('id', i.id);
    load();
  }

  return (
    <View style={{ gap: 12 }}>
      <Field value={query} onChangeText={setQuery} placeholder="Search ingredients" />
      {low.length > 0 ? (
        <View style={{ backgroundColor: colors.errorBg, borderRadius: 16, padding: 12 }}>
          <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>{low.length} running low: {low.slice(0, 3).map((i) => i.name).join(', ')}{low.length > 3 ? '…' : ''}</Text>
        </View>
      ) : null}
      {canManage ? <Button label="Add ingredient" onPress={() => setAdding(true)} tone="dark" /> : null}

      {shown.map((i) => {
        const isLow = i.min_qty > 0 && i.current_qty <= i.min_qty;
        return (
          <Pressable key={i.id} onPress={() => openItem(i)} style={[card, { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: isLow ? colors.error : '#F4ECE6' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{i.name}</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>{rupees(i.cost_per_unit_minor, 2)} per {i.unit} · value {rupees(i.current_qty * i.cost_per_unit_minor, 0)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: i.current_qty < 0 ? colors.error : colors.ink900 }}>{qtyText(i.current_qty)} {i.unit}</Text>
              {isLow ? <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.error }}>LOW</Text> : null}
            </View>
          </Pressable>
        );
      })}
      {shown.length === 0 ? <Text style={{ color: colors.ink500 }}>No ingredients yet. Add your first one to start tracking stock.</Text> : null}

      <Sheet visible={adding} title="Add ingredient" onClose={() => setAdding(false)}>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Paneer" />
        <Text style={heading}>MEASURED IN</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{UNITS.map((u) => <Chip key={u} label={u} on={unit === u} onPress={() => setUnit(u)} />)}</View>
        <Field label="Bought in (optional), e.g. bag, case" value={purchaseUnit} onChangeText={setPurchaseUnit} />
        {purchaseUnit.trim() ? <Field label={`How many ${unit} in one ${purchaseUnit.trim()}?`} value={factor} onChangeText={setFactor} keyboardType="decimal-pad" /> : null}
        <Field label={`Alert when below (${unit})`} value={minQty} onChangeText={setMinQty} keyboardType="decimal-pad" />
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="Perishable" on={perishable} onPress={() => setPerishable((p) => !p)} />
        </View>
        <Text style={heading}>OPENING STOCK (OPTIONAL)</Text>
        <Field label={`Quantity (${unit})`} value={openQty} onChangeText={setOpenQty} keyboardType="decimal-pad" />
        <Field label={`Cost per ${unit} (₹)`} value={openCost} onChangeText={setOpenCost} keyboardType="decimal-pad" />
        <Button label="Save ingredient" onPress={saveItem} />
      </Sheet>

      <Sheet visible={open !== null} title={open?.name ?? ''} onClose={() => setOpen(null)}>
        {open ? (
          <>
            <View style={card}>
              <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900 }}>{qtyText(open.current_qty)} {open.unit}</Text>
              <Text style={{ fontSize: 13, color: colors.ink700 }}>Average cost {rupees(open.cost_per_unit_minor, 2)} per {open.unit} · worth {rupees(open.current_qty * open.cost_per_unit_minor, 0)}</Text>
              {canManage ? <Field label={`Alert below (${open.unit})`} value={qtyText(open.min_qty)} onChangeText={(v) => saveMin(open, v)} keyboardType="decimal-pad" /> : null}
            </View>
            {canManage ? (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label="Stock in" on={action === 'in'} onPress={() => setAction('in')} />
                  <Chip label="Wastage" on={action === 'wastage'} onPress={() => setAction('wastage')} />
                  <Chip label="Staff meal" on={action === 'staff_meal'} onPress={() => setAction('staff_meal')} />
                  <Chip label="Correct count" on={action === 'adjustment'} onPress={() => setAction('adjustment')} />
                </View>
                {action ? (
                  <View style={card}>
                    <Field label={action === 'adjustment' ? `Change (+ or −, ${open.unit})` : `Quantity (${open.unit})`} value={qty} onChangeText={setQty} keyboardType="numbers-and-punctuation" />
                    {action === 'in' ? (
                      <>
                        <Field label={`Cost per ${open.unit} (₹)`} value={cost} onChangeText={setCost} keyboardType="decimal-pad" />
                        {open.perishable ? <Field label="Expiry date (YYYY-MM-DD)" value={expiry} onChangeText={setExpiry} /> : null}
                      </>
                    ) : null}
                    <Field label={action === 'wastage' || action === 'staff_meal' ? 'Reason (required)' : 'Note'} value={note} onChangeText={setNote} />
                    <Button label="Save" onPress={submitAction} />
                  </View>
                ) : null}
              </>
            ) : null}
            <Text style={heading}>RECENT ACTIVITY</Text>
            {moves.map((m) => (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{KIND_LABEL[m.kind] ?? m.kind}{m.note ? ` · ${m.note}` : ''}</Text>
                  <Text style={{ fontSize: 11, color: colors.ink500 }}>{new Date(m.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Text>
                </View>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: m.qty_delta < 0 ? colors.error : colors.success }}>{m.qty_delta > 0 ? '+' : ''}{qtyText(m.qty_delta)}</Text>
              </View>
            ))}
            {moves.length === 0 ? <Text style={{ color: colors.ink500 }}>No movements yet.</Text> : null}
            {canManage ? (
              <Pressable onPress={async () => { await supabase.from('inventory_items').update({ is_active: false }).eq('id', open.id); setOpen(null); load(); }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.error, marginTop: 6 }}>Stop tracking this ingredient</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
