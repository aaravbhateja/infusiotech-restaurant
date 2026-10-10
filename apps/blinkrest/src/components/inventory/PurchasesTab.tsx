import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

import { Button, Chip, Field, Sheet, card, heading, qtyText, rupees, type InvItem } from './ui';

type Supplier = { id: string; name: string; phone: string | null };
type PO = {
  id: string;
  status: 'ordered' | 'received' | 'cancelled';
  created_at: string;
  invoice_no: string | null;
  invoice_total_minor: number | null;
  supplier: { name: string } | null;
  lines: { id: string; qty: number; unit_cost_minor: number; received_qty: number | null; item: { name: string; unit: string } | null }[];
};
type DraftLine = { item: InvItem; packs: string; costPerPack: string };

export function PurchasesTab() {
  const { membership } = useAuth();
  const canManage = !!membership?.permissions.has('inventory.manage');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<InvItem[]>([]);
  const [orders, setOrders] = useState<PO[]>([]);

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [sName, setSName] = useState('');
  const [sPhone, setSPhone] = useState('');

  const [creating, setCreating] = useState(false);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [poNote, setPoNote] = useState('');

  const [receiving, setReceiving] = useState<PO | null>(null);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});
  const [recvCost, setRecvCost] = useState<Record<string, string>>({});
  const [recvExpiry, setRecvExpiry] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [{ data: s }, { data: i }, { data: o }] = await Promise.all([
      supabase.from('suppliers').select('id, name, phone').eq('is_active', true).order('name'),
      supabase.from('inventory_items').select('*').eq('is_active', true).order('name'),
      supabase
        .from('purchase_orders')
        .select('id, status, created_at, invoice_no, invoice_total_minor, supplier:suppliers(name), lines:purchase_order_lines(id, qty, unit_cost_minor, received_qty, item:inventory_items(name, unit))')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    setSuppliers((s as Supplier[]) ?? []);
    setItems((i as InvItem[]) ?? []);
    setOrders((o as unknown as PO[]) ?? []);
  }, []);

  useRealtimeRefresh('purchasestabtsx', tenantSubs(membership?.tenantId, ['purchase_orders', 'suppliers']), load);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function saveSupplier() {
    if (!membership || !sName.trim()) return;
    const { error } = await supabase.from('suppliers').insert({ tenant_id: membership.tenantId, name: sName.trim(), phone: sPhone.trim() || null });
    if (error) Alert.alert('Could not save', error.message);
    setAddingSupplier(false);
    setSName('');
    setSPhone('');
    load();
  }

  function addLine(item: InvItem) {
    if (draft.some((d) => d.item.id === item.id)) return;
    setDraft((d) => [...d, { item, packs: '1', costPerPack: item.cost_per_unit_minor ? String(((item.cost_per_unit_minor * item.purchase_factor) / 100).toFixed(2)) : '' }]);
  }

  async function createOrder() {
    const lines = draft
      .map((d) => {
        const packs = Number(d.packs);
        const packCost = Number(d.costPerPack);
        return { item_id: d.item.id, qty: packs * d.item.purchase_factor, unit_cost_minor: (packCost * 100) / d.item.purchase_factor, ok: packs > 0 && Number.isFinite(packCost) };
      })
      .filter((l) => l.ok);
    if (lines.length === 0) {
      Alert.alert('Add items', 'Pick at least one ingredient with a quantity.');
      return;
    }
    const { error } = await supabase.rpc('create_purchase_order', { p_supplier: supplierId, p_lines: lines.map(({ ok: _ok, ...l }) => l), p_notes: poNote || null });
    if (error) {
      Alert.alert('Could not create order', error.message);
      return;
    }
    setCreating(false);
    setDraft([]);
    setSupplierId(null);
    setPoNote('');
    load();
  }

  function openReceive(po: PO) {
    setReceiving(po);
    setInvoiceNo('');
    setInvoiceTotal('');
    setRecvQty(Object.fromEntries(po.lines.map((l) => [l.id, qtyText(l.qty)])));
    setRecvCost(Object.fromEntries(po.lines.map((l) => [l.id, String((l.unit_cost_minor / 100).toFixed(4)).replace(/0+$/, '').replace(/\.$/, '')])));
    setRecvExpiry({});
  }

  async function receive() {
    if (!receiving) return;
    const p_lines = receiving.lines.map((l) => ({
      line_id: l.id,
      received_qty: Number(recvQty[l.id]) || 0,
      unit_cost_minor: Math.round((Number(recvCost[l.id]) || 0) * 100 * 10000) / 10000,
      expiry: /^\d{4}-\d{2}-\d{2}$/.test(recvExpiry[l.id] ?? '') ? recvExpiry[l.id] : null,
    }));
    const { error } = await supabase.rpc('receive_purchase_order', {
      p_po: receiving.id,
      p_lines,
      p_invoice_no: invoiceNo || null,
      p_invoice_total_minor: invoiceTotal ? Math.round(Number(invoiceTotal) * 100) : null,
    });
    if (error) {
      Alert.alert('Could not receive', error.message);
      return;
    }
    setReceiving(null);
    load();
  }

  async function cancel(po: PO) {
    await supabase.rpc('cancel_purchase_order', { p_po: po.id });
    load();
  }

  const estimate = (po: PO) => po.lines.reduce((s, l) => s + l.qty * l.unit_cost_minor, 0);

  return (
    <View style={{ gap: 12 }}>
      {canManage ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button label="New purchase order" onPress={() => setCreating(true)} tone="dark" /></View>
          <Button label="Add supplier" onPress={() => setAddingSupplier(true)} tone="ghost" />
        </View>
      ) : null}

      <Text style={heading}>SUPPLIERS</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {suppliers.map((s) => <View key={s.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: '#F4ECE6', paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ fontFamily: fonts.bodyBold, color: colors.ink900 }}>{s.name}{s.phone ? ` · ${s.phone}` : ''}</Text></View>)}
        {suppliers.length === 0 ? <Text style={{ color: colors.ink500 }}>No suppliers yet.</Text> : null}
      </View>

      <Text style={heading}>PURCHASE ORDERS</Text>
      {orders.map((po) => (
        <View key={po.id} style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{po.supplier?.name ?? 'No supplier'}</Text>
            <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: po.status === 'received' ? colors.successBg : po.status === 'cancelled' ? colors.bg : colors.saffron50, justifyContent: 'center' }}>
              <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: po.status === 'received' ? colors.success : po.status === 'cancelled' ? colors.ink700 : '#8A5A00' }}>{po.status.toUpperCase()}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: colors.ink500 }}>
            {new Date(po.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {po.lines.length} item{po.lines.length === 1 ? '' : 's'} · {po.status === 'received' && po.invoice_total_minor ? `Invoice ${rupees(po.invoice_total_minor)}` : `≈ ${rupees(estimate(po), 0)}`}
            {po.invoice_no ? ` · #${po.invoice_no}` : ''}
          </Text>
          <Text style={{ fontSize: 13, color: colors.ink700 }}>{po.lines.map((l) => `${l.item?.name} ${qtyText(l.received_qty ?? l.qty)} ${l.item?.unit}`).join(' · ')}</Text>
          {canManage && po.status === 'ordered' ? (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Button label="Receive goods" onPress={() => openReceive(po)} /></View>
              <Button label="Cancel" tone="ghost" onPress={() => cancel(po)} />
            </View>
          ) : null}
        </View>
      ))}
      {orders.length === 0 ? <Text style={{ color: colors.ink500 }}>No purchase orders yet.</Text> : null}

      <Sheet visible={addingSupplier} title="Add supplier" onClose={() => setAddingSupplier(false)}>
        <Field label="Name" value={sName} onChangeText={setSName} />
        <Field label="Phone (optional)" value={sPhone} onChangeText={setSPhone} keyboardType="phone-pad" />
        <Button label="Save supplier" onPress={saveSupplier} />
      </Sheet>

      <Sheet visible={creating} title="New purchase order" onClose={() => setCreating(false)}>
        <Text style={heading}>SUPPLIER</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {suppliers.map((s) => <Chip key={s.id} label={s.name} on={supplierId === s.id} onPress={() => setSupplierId(s.id)} />)}
        </View>
        <Text style={heading}>ADD INGREDIENTS</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {items.map((i) => <Chip key={i.id} label={i.name} on={draft.some((d) => d.item.id === i.id)} onPress={() => addLine(i)} />)}
        </View>
        {draft.map((d, idx) => (
          <View key={d.item.id} style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{d.item.name}</Text>
              <Pressable onPress={() => setDraft((x) => x.filter((_, k) => k !== idx))}><Text style={{ color: colors.error, fontFamily: fonts.bodyExtraBold, fontSize: 12 }}>Remove</Text></Pressable>
            </View>
            <Field label={`Quantity (${d.item.purchase_unit ?? d.item.unit})`} value={d.packs} onChangeText={(v) => setDraft((x) => x.map((l, k) => (k === idx ? { ...l, packs: v } : l)))} keyboardType="decimal-pad" />
            <Field label={`Cost per ${d.item.purchase_unit ?? d.item.unit} (₹)`} value={d.costPerPack} onChangeText={(v) => setDraft((x) => x.map((l, k) => (k === idx ? { ...l, costPerPack: v } : l)))} keyboardType="decimal-pad" />
          </View>
        ))}
        <Field label="Note (optional)" value={poNote} onChangeText={setPoNote} />
        <Button label="Place order" onPress={createOrder} />
      </Sheet>

      <Sheet visible={receiving !== null} title="Receive goods" onClose={() => setReceiving(null)}>
        {receiving ? (
          <>
            {receiving.lines.map((l) => (
              <View key={l.id} style={card}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{l.item?.name} (ordered {qtyText(l.qty)} {l.item?.unit})</Text>
                <Field label={`Received (${l.item?.unit})`} value={recvQty[l.id] ?? ''} onChangeText={(v) => setRecvQty((x) => ({ ...x, [l.id]: v }))} keyboardType="decimal-pad" />
                <Field label={`Actual cost per ${l.item?.unit} (₹)`} value={recvCost[l.id] ?? ''} onChangeText={(v) => setRecvCost((x) => ({ ...x, [l.id]: v }))} keyboardType="decimal-pad" />
                <Field label="Expiry (YYYY-MM-DD, optional)" value={recvExpiry[l.id] ?? ''} onChangeText={(v) => setRecvExpiry((x) => ({ ...x, [l.id]: v }))} />
              </View>
            ))}
            <Field label="Invoice number" value={invoiceNo} onChangeText={setInvoiceNo} />
            <Field label="Invoice total (₹)" value={invoiceTotal} onChangeText={setInvoiceTotal} keyboardType="decimal-pad" />
            <Button label="Add to stock" onPress={receive} />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
