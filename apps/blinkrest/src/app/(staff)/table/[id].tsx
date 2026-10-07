import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BillPreviewSheet } from '@/components/BillPreviewSheet';
import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TableQrSheet } from '@/components/TableQrSheet';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Status = 'O' | 'F' | 'C' | 'R';

const STATUS_META: Record<Status, { label: string; icon: IconName; fg: string; bg: string }> = {
  O: { label: 'Occupied', icon: 'dine', fg: '#C2330F', bg: colors.coral500 },
  F: { label: 'Available', icon: 'checkc', fg: colors.success, bg: '#C9F0DA' },
  C: { label: 'Needs cleaning', icon: 'broom', fg: '#8A5A00', bg: '#FFE7A6' },
  R: { label: 'Reserved · 9:30 PM', icon: 'calendar', fg: '#1F5BD6', bg: '#CFE0FF' },
};

const SHEETS: Record<string, [string, string, string]> = {
  F: ['Mark table available?', 'The open bill must be settled first. Guests will be checked out and the table freed for walk-ins.', 'Mark available'],
  C: ['Send table for cleaning?', 'The table is hidden from seating until a staff member marks it clean.', 'Mark for cleaning'],
  R: ['Reserve this table?', 'Hold it for later today. Walk-ins will see it as reserved 15 min before.', 'Reserve'],
};

type ActiveOrder = { id: string; order_number: string; order_status: string; payment_status: string; total_minor: number; guest_count: number | null; items: { item_name_snapshot: string; quantity: number; line_total_minor: number }[] };
type HistoryOrder = { id: string; order_number: string; total_minor: number; created_at: string; payment_status: string; provider: string | null };

const FLOOR_TO_STATUS: Record<string, Status> = { available: 'F', reserved: 'R', cleaning: 'C' };
const STATUS_TO_FLOOR: Record<'F' | 'C' | 'R', string> = { F: 'available', R: 'reserved', C: 'cleaning' };

function TableDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [table, setTable] = useState<{ label: string; capacity: number | null; floor_state?: string } | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActiveOrder | null>(null);
  const [history, setHistory] = useState<HistoryOrder[]>([]);
  const [status, setStatus] = useState<Status>('O');
  const [sheet, setSheet] = useState<'' | 'F' | 'C' | 'R'>('');
  const [newQr, setNewQr] = useState<string | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [editingTable, setEditingTable] = useState(false);
  const [editLabel, setEditLabel] = useState('');
  const [editCapacity, setEditCapacity] = useState('');
  const [savingTable, setSavingTable] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [freeTables, setFreeTables] = useState<{ id: string; label: string }[]>([]);
  const [loadingFreeTables, setLoadingFreeTables] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: t } = await supabase.from('restaurant_tables').select('label, capacity, floor_state').eq('id', id).maybeSingle();
    setTable(t ?? null);

    const { data: active } = await supabase
      .from('orders')
      .select('id, order_number, order_status, payment_status, total_minor, guest_count')
      .eq('table_id', id)
      .not('order_status', 'in', '(rejected,cancelled)')
      .is('table_released_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (active) {
      const { data: items } = await supabase.from('order_items').select('item_name_snapshot, quantity, line_total_minor').eq('order_id', active.id);
      setActiveOrder({ ...active, items: items ?? [] });
      setStatus('O');
    } else {
      setActiveOrder(null);
      setStatus(FLOOR_TO_STATUS[t?.floor_state ?? 'available'] ?? 'F');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data: past } = await supabase
      .from('orders')
      .select('id, order_number, total_minor, created_at, payment_status, payments(provider)')
      .eq('table_id', id)
      .eq('order_status', 'served')
      .gte('created_at', startOfDay.toISOString())
      .order('created_at', { ascending: false })
      .limit(5);
    setHistory(
      (past ?? []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        total_minor: o.total_minor,
        created_at: o.created_at,
        payment_status: o.payment_status,
        provider: (Array.isArray(o.payments) ? o.payments[0] : o.payments)?.provider ?? null,
      })),
    );
  }, [id]);

  useRealtimeRefresh('tableidtsx', tenantSubs(membership?.tenantId, ['restaurant_tables', 'orders', 'order_items', 'payments']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const meta = STATUS_META[status];
  const occupied = status === 'O';

  async function reissueQr() {
    Alert.alert('Reissue this table’s QR?', 'The old code stops working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reissue',
        onPress: async () => {
          if (!guardOnline(isOnline)) return;
          setReissuing(true);
          const { data, error } = await supabase.rpc('reissue_table_qr', { p_table_id: id });
          setReissuing(false);
          if (error) Alert.alert('Could not reissue QR', error.message);
          else if (data?.raw_token) setNewQr(data.raw_token);
        },
      },
    ]);
  }

  async function collectCash() {
    if (!activeOrder) return;
    if (!guardOnline(isOnline)) return;
    setActiveOrder((prev) => (prev ? { ...prev, payment_status: 'cash_received' } : prev));
    const { error } = await supabase.rpc('record_cash_payment', { p_order_id: activeOrder.id });
    if (error) {
      Alert.alert('Could not record payment', error.message);
      load();
    }
  }

  function openSheet(k: 'F' | 'C' | 'R') {
    setSheet(k);
  }

  async function confirmSheet() {
    if (!sheet) return;
    if (!guardOnline(isOnline)) return;
    const next = sheet;
    setSheet('');
    setStatus(next);
    setTable((prev) => (prev ? { ...prev, floor_state: STATUS_TO_FLOOR[next] } : prev));
    const { error } = await supabase.rpc('set_table_floor_state', { p_table_id: id, p_state: STATUS_TO_FLOOR[next] });
    if (error) {
      Alert.alert('Could not update table', error.message);
      load();
    }
  }

  function openEditTable() {
    if (!table) return;
    setEditLabel(table.label);
    setEditCapacity(table.capacity ? String(table.capacity) : '');
    setEditingTable(true);
  }

  async function saveTable() {
    if (!editLabel.trim()) return;
    if (!guardOnline(isOnline)) return;
    setSavingTable(true);
    const { error } = await supabase
      .from('restaurant_tables')
      .update({ label: editLabel.trim(), capacity: editCapacity.trim() ? parseInt(editCapacity, 10) : null })
      .eq('id', id);
    setSavingTable(false);
    if (error) {
      Alert.alert('Could not save table', error.message);
      return;
    }
    setEditingTable(false);
    await load();
  }

  async function openTransfer() {
    if (!guardOnline(isOnline)) return;
    setTransferring(true);
    setLoadingFreeTables(true);
    const [{ data: allTables }, { data: occupiedOrders }] = await Promise.all([
      supabase.from('restaurant_tables').select('id, label').neq('id', id).eq('status', 'active').order('label'),
      supabase.from('orders').select('table_id').not('table_id', 'is', null).not('order_status', 'in', '(rejected,cancelled)').is('table_released_at', null),
    ]);
    const occupiedIds = new Set((occupiedOrders ?? []).map((o) => o.table_id));
    setFreeTables((allTables ?? []).filter((t) => !occupiedIds.has(t.id)));
    setLoadingFreeTables(false);
  }

  async function doTransfer(toTableId: string) {
    if (!activeOrder) return;
    if (!guardOnline(isOnline)) return;
    setTransferBusy(true);
    const { error } = await supabase.rpc('transfer_order_table', { p_order_id: activeOrder.id, p_to_table_id: toTableId });
    setTransferBusy(false);
    if (error) {
      Alert.alert('Could not transfer', error.message);
      return;
    }
    setTransferring(false);
    router.replace(`/(staff)/table/${toTableId}` as never);
  }


  const actions: { label: string; icon: IconName; bg: string; fg: string; go?: () => void }[] = [
    { label: activeOrder ? 'Open order' : 'Take order', icon: 'orders', bg: colors.coral50, fg: colors.coral600, go: () => router.push(activeOrder ? `/(staff)/orders/${activeOrder.id}` as never : `/(staff)/orders/new?tableId=${id}` as never) },
    { label: 'Mark available', icon: 'checkc', bg: colors.successBg, fg: colors.success, go: () => openSheet('F') },
    { label: 'Reserve', icon: 'calendar', bg: '#EAF1FF', fg: '#1F5BD6', go: () => openSheet('R') },
    { label: 'Cleaning', icon: 'broom', bg: '#FFF4D6', fg: '#8A5A00', go: () => openSheet('C') },
    ...(activeOrder && membership?.permissions.has('tables.assign')
      ? [{ label: 'Transfer', icon: 'share' as IconName, bg: '#F1EBFF', fg: '#5B21B6', go: openTransfer }]
      : []),
    ...(membership?.permissions.has('tables.manage')
      ? [{ label: 'Edit table', icon: 'edit' as IconName, bg: '#F7F1EC', fg: colors.ink900, go: openEditTable }]
      : []),
    { label: 'New QR', icon: 'qr', bg: '#F7F1EC', fg: colors.ink900, go: reissueQr },
    ...(activeOrder
      ? [{ label: 'Bill', icon: 'printer' as IconName, bg: '#F7F1EC', fg: colors.ink900, go: () => setBillOpen(true) }]
      : []),
  ];

  if (!table) return null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{table.label}</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>{table.capacity ? `${table.capacity} seats` : 'Capacity not set'}</Text>
          </View>
          {membership?.permissions.has('tables.manage') ? (
            <Pressable onPress={openEditTable} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="edit" size={20} color={colors.ink900} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ backgroundColor: meta.bg, borderRadius: 26, padding: 18, gap: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={meta.icon} size={16} stroke={2.3} color={meta.fg} />
              <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: meta.fg }}>{meta.label}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 10 }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{occupied ? activeOrder?.guest_count ?? '—' : 0}</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Guests</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 10 }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{table.capacity ?? '—'}</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Capacity</Text>
            </View>
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 16, padding: 10 }}>
              <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{activeOrder ? formatMinor(activeOrder.total_minor) : '—'}</Text>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: colors.ink700 }}>Bill</Text>
            </View>
          </View>
        </View>

        {occupied && activeOrder ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Active order #{activeOrder.order_number}</Text>
              <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.coral50, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Icon name="bolt" size={14} stroke={2.3} color={colors.coral700} />
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.coral700 }}>{activeOrder.order_status}</Text>
              </View>
            </View>
            {activeOrder.items.map((it, idx) => (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemi, color: colors.ink900, flex: 1 }}>{it.item_name_snapshot}</Text>
                <Text style={{ fontSize: 13, color: colors.ink500 }}>×{it.quantity}</Text>
                <Text style={{ width: 70, textAlign: 'right', fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(it.line_total_minor)}</Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#EADFD7', borderStyle: 'dashed', paddingTop: 12 }}>
              <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E0B860', borderStyle: 'dashed', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: '#8A5A00' }}>{activeOrder.payment_status}</Text>
              </View>
              <Pressable onPress={() => router.push(`/(staff)/orders/${activeOrder.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Open order</Text>
                <Icon name="right" size={16} stroke={2.4} color={colors.ink900} />
              </Pressable>
            </View>
            {activeOrder.payment_status === 'unpaid' ? (
              <Pressable onPress={collectCash} style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.ink900, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="receipt" size={18} color="#FFFFFF" />
                <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, color: '#FFFFFF' }}>{`Collect ${formatMinor(activeOrder.total_minor)}`}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Table actions</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {actions.map((a) => (
              <Pressable key={a.label} onPress={a.go} style={{ width: '23%', minHeight: 88, borderRadius: 18, borderWidth: 1, borderColor: '#F1E7E0', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 }}>
                <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: a.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={a.icon} size={20} stroke={2.1} color={a.fg} />
                </View>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink900, textAlign: 'center' }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ backgroundColor: colors.ink900, borderRadius: 26, padding: 18, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="qr" size={28} color={colors.saffron400} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: '#FFFFFF' }}>Scan to order · {table.label}</Text>
            <Text style={{ fontSize: 13, color: '#C9BDB6', lineHeight: 18 }}>
              For security, the printed QR code can&rsquo;t be shown again here — generate a new one if you need to reprint it.
            </Text>
            <Pressable disabled={reissuing} onPress={reissueQr} style={{ alignSelf: 'flex-start', height: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.saffron400, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Icon name="qr" size={18} color={colors.ink900} />
              <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, color: colors.ink900 }}>{reissuing ? 'Generating…' : 'Generate QR'}</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Today at this table</Text>
          {history.map((h) => (
            <Pressable key={h.id} onPress={() => router.push(`/(staff)/orders/${h.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="receipt" size={19} color={colors.ink900} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodySemi, color: colors.ink900 }}>
                  {new Date(h.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                </Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>Order #{h.order_number}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{formatMinor(h.total_minor)}</Text>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.success }}>
                  {h.payment_status === 'unpaid' ? 'Unpaid' : `Paid${h.provider ? ' · ' + h.provider : ''}`}
                </Text>
              </View>
            </Pressable>
          ))}
          {history.length === 0 ? <Text style={{ color: colors.ink500 }}>No served orders here yet today.</Text> : null}
        </View>
      </ScrollView>

      {sheet ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(27,23,22,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#E4D8D0' }} />
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>{SHEETS[sheet][0]}</Text>
            <Text style={{ fontSize: 15, color: colors.ink700, lineHeight: 21 }}>{SHEETS[sheet][1]}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setSheet('')} style={{ flex: 1, height: 54, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E4D8D0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: colors.ink900 }}>Not now</Text>
              </Pressable>
              <Pressable onPress={confirmSheet} style={{ flex: 1, height: 54, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: '#FFFFFF' }}>{SHEETS[sheet][2]}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {newQr && membership ? (
        <TableQrSheet tableLabel={table.label} tenantSlug={membership.tenantSlug} rawToken={newQr} onClose={() => setNewQr(null)} />
      ) : null}

      {editingTable ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,23,22,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#E4D8D0' }} />
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Edit table</Text>
            <TextField label="Table name" value={editLabel} onChangeText={setEditLabel} placeholder="e.g. Table 7" autoCapitalize="words" />
            <TextField label="Capacity (seats)" value={editCapacity} onChangeText={setEditCapacity} placeholder="4" keyboardType="numeric" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable onPress={() => setEditingTable(false)} style={{ flex: 1, height: 54, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E4D8D0', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: colors.ink900 }}>Cancel</Text>
              </Pressable>
              <Pressable disabled={savingTable || !editLabel.trim()} onPress={saveTable} style={{ flex: 1, height: 54, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: savingTable || !editLabel.trim() ? 0.6 : 1 }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: '#FFFFFF' }}>{savingTable ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {transferring ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(27,23,22,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 14, maxHeight: '70%' }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#E4D8D0' }} />
            <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Transfer to which table?</Text>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>Only free tables are shown.</Text>
            <ScrollView contentContainerStyle={{ gap: 8 }}>
              {loadingFreeTables ? (
                <Text style={{ color: colors.ink500, padding: 12 }}>Loading…</Text>
              ) : freeTables.length === 0 ? (
                <Text style={{ color: colors.ink500, padding: 12 }}>No free tables right now.</Text>
              ) : (
                freeTables.map((t) => (
                  <Pressable
                    key={t.id}
                    disabled={transferBusy}
                    onPress={() => doTransfer(t.id)}
                    style={{ height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: '#E4D8D0', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: colors.ink900 }}>{t.label}</Text>
                    <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
                  </Pressable>
                ))
              )}
            </ScrollView>
            <Pressable onPress={() => setTransferring(false)} style={{ height: 54, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#E4D8D0', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, fontSize: 15, color: colors.ink900 }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {billOpen && activeOrder ? (
        <BillPreviewSheet
          order={{
            orderNumber: activeOrder.order_number,
            createdAt: new Date().toISOString(),
            tableLabel: table?.label ?? null,
            items: activeOrder.items.map((i) => ({ name: i.item_name_snapshot, quantity: i.quantity, lineTotalMinor: i.line_total_minor })),
            totalMinor: activeOrder.total_minor,
          }}
          onClose={() => setBillOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}

export default function TableDetail() {
  return (
    <RequireAccess permission="tables.view">
      <TableDetailScreen />
    </RequireAccess>
  );
}
