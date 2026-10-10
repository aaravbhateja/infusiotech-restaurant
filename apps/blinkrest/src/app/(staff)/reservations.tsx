import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, Field, Sheet, card } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type Res = { id: string; name: string; phone: string | null; party_size: number; reserved_for: string | null; status: string; note: string | null; created_at: string; table_id: string | null };
type Tbl = { id: string; label: string; capacity: number | null; floor_state: string };

const TABS = [
  ['waiting', 'Waitlist'],
  ['booked', 'Bookings'],
  ['done', 'Seated / closed'],
] as const;

const fmtTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const waitedMin = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

function ReservationsScreen() {
  const { membership } = useAuth();
  const canAssign = !!membership?.permissions.has('tables.assign');
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('waiting');
  const [rows, setRows] = useState<Res[]>([]);
  const [tables, setTables] = useState<Tbl[]>([]);
  const [estimate, setEstimate] = useState<{ estimate_minutes: number; waiting: number } | null>(null);

  const [adding, setAdding] = useState<null | 'walkin' | 'booking'>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [party, setParty] = useState('2');
  const [note, setNote] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState('20:00');
  const [seating, setSeating] = useState<Res | null>(null);

  const load = useCallback(async () => {
    if (!membership) return;
    const since = new Date();
    since.setHours(since.getHours() - 12);
    const [r, t, e] = await Promise.all([
      supabase
        .from('reservations')
        .select('id, name, phone, party_size, reserved_for, status, note, created_at, table_id')
        .or(`status.in.(waiting,booked),created_at.gte.${since.toISOString()}`)
        .order('reserved_for', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabase.from('restaurant_tables').select('id, label, capacity, floor_state').eq('status', 'active').order('label'),
      supabase.rpc('waitlist_estimate'),
    ]);
    setRows((r.data as Res[]) ?? []);
    setTables((t.data as Tbl[]) ?? []);
    setEstimate((e.data as { estimate_minutes: number; waiting: number }) ?? null);
  }, [membership]);

  useRealtimeRefresh('reservationstsx', tenantSubs(membership?.tenantId, ['reservations', 'orders', 'restaurant_tables']), load);

  const shown = rows.filter((r) => (tab === 'done' ? ['seated', 'no_show', 'cancelled'].includes(r.status) : r.status === tab));

  function reset() {
    setName('');
    setPhone('');
    setParty('2');
    setNote('');
    setDayOffset(0);
    setTime('20:00');
  }

  async function save() {
    if (!membership || !adding) return;
    const size = Math.floor(Number(party));
    if (!name.trim() || !Number.isFinite(size) || size < 1) {
      Alert.alert('Name and party size needed');
      return;
    }
    let when: string | null = null;
    if (adding === 'booking') {
      const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
      if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) {
        Alert.alert('Enter the time like 19:30');
        return;
      }
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      if (d.getTime() < Date.now() - 5 * 60000) {
        Alert.alert('That time has already passed');
        return;
      }
      when = d.toISOString();
    }
    const { error } = await supabase.from('reservations').insert({
      tenant_id: membership.tenantId,
      name: name.trim(),
      phone: phone.trim() || null,
      party_size: size,
      reserved_for: when,
      status: adding === 'walkin' ? 'waiting' : 'booked',
      note: note.trim() || null,
      created_by: membership.id,
    });
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setAdding(null);
    reset();
    setTab(adding === 'walkin' ? 'waiting' : 'booked');
    load();
  }

  async function setStatus(r: Res, status: 'no_show' | 'cancelled') {
    const { error } = await supabase.from('reservations').update({ status }).eq('id', r.id);
    if (error) Alert.alert('Could not update', error.message);
    else load();
  }

  async function seat(r: Res, t: Tbl) {
    const { error } = await supabase.rpc('seat_reservation', { p_id: r.id, p_table: t.id });
    if (error) {
      Alert.alert('Could not seat', error.message);
      return;
    }
    setSeating(null);
    load();
  }

  function tableReady(r: Res) {
    if (!r.phone) return;
    const digits = r.phone.replace(/\D/g, '').slice(-10);
    const text = `Hi ${r.name}, your table for ${r.party_size} is ready${membership?.tenantName ? ` at ${membership.tenantName}` : ''}. Please come to the counter.`;
    Linking.openURL(`https://wa.me/91${digits}?text=${encodeURIComponent(text)}`).catch(() => Alert.alert('Could not open WhatsApp'));
  }

  const free = tables.filter((t) => t.floor_state === 'available');

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Reservations</Text>
        </View>

        {estimate ? (
          <View style={{ backgroundColor: colors.saffron50, borderRadius: 16, padding: 12 }}>
            <Text style={{ fontSize: 13, color: colors.ink900 }}>
              {estimate.waiting} {estimate.waiting === 1 ? 'party' : 'parties'} waiting. A new walk-in can be quoted about <Text style={{ fontFamily: fonts.bodyExtraBold }}>{estimate.estimate_minutes} minutes</Text>.
            </Text>
          </View>
        ) : null}

        {canAssign ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><Button label="+ Walk-in" onPress={() => setAdding('walkin')} /></View>
            <View style={{ flex: 1 }}><Button label="+ Booking" tone="dark" onPress={() => setAdding('booking')} /></View>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {TABS.map(([k, l]) => <Chip key={k} label={`${l} · ${rows.filter((r) => (k === 'done' ? ['seated', 'no_show', 'cancelled'].includes(r.status) : r.status === k)).length}`} on={tab === k} onPress={() => setTab(k)} />)}
        </ScrollView>

        {shown.map((r) => (
          <View key={r.id} style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ flex: 1, fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{r.name} · {r.party_size}</Text>
              {r.status === 'waiting' ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: waitedMin(r.created_at) > 30 ? colors.error : colors.ink700 }}>waiting {waitedMin(r.created_at)} min</Text> : null}
              {r.status !== 'waiting' && r.status !== 'booked' ? <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink500 }}>{r.status.replace('_', ' ').toUpperCase()}</Text> : null}
            </View>
            {r.reserved_for ? <Text style={{ fontSize: 13, color: colors.ink700 }}>{fmtTime(r.reserved_for)}</Text> : null}
            {r.phone ? <Text style={{ fontSize: 12, color: colors.ink500 }}>{r.phone}</Text> : null}
            {r.note ? <Text style={{ fontSize: 12, color: colors.ink700 }}>{r.note}</Text> : null}
            {canAssign && (r.status === 'waiting' || r.status === 'booked') ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Pressable onPress={() => setSeating(r)} style={{ height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: colors.coral600, justifyContent: 'center' }}>
                  <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Seat</Text>
                </Pressable>
                {r.phone ? (
                  <Pressable onPress={() => tableReady(r)} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, backgroundColor: '#25D366', justifyContent: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold }}>Table ready</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => setStatus(r, 'no_show')} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                  <Text style={{ color: colors.ink900, fontFamily: fonts.bodyBold }}>No-show</Text>
                </Pressable>
                <Pressable onPress={() => setStatus(r, 'cancelled')} style={{ height: 38, paddingHorizontal: 14, borderRadius: 19, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center' }}>
                  <Text style={{ color: colors.error, fontFamily: fonts.bodyBold }}>Cancel</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ))}
        {shown.length === 0 ? <Text style={{ color: colors.ink500 }}>Nothing here.</Text> : null}
      </ScrollView>

      <Sheet visible={adding !== null} title={adding === 'walkin' ? 'Add walk-in' : 'Add booking'} onClose={() => { setAdding(null); reset(); }}>
        <Field label="Name" value={name} onChangeText={setName} />
        <Field label="Phone (optional, to message when the table is ready)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Field label="Party size" value={party} onChangeText={setParty} keyboardType="number-pad" />
        {adding === 'booking' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 1, 2].map((d) => {
                const dt = new Date();
                dt.setDate(dt.getDate() + d);
                return <Chip key={d} label={d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} on={dayOffset === d} onPress={() => setDayOffset(d)} />;
              })}
            </View>
            <Field label="Time (24-hour, e.g. 19:30)" value={time} onChangeText={setTime} />
          </>
        ) : null}
        <Field label="Note (birthday, high chair...)" value={note} onChangeText={setNote} />
        {adding === 'walkin' && estimate ? <Text style={{ fontSize: 13, color: colors.ink700 }}>Quote them about {estimate.estimate_minutes} minutes.</Text> : null}
        <Button label="Save" onPress={save} />
      </Sheet>

      <Sheet visible={seating !== null} title={seating ? `Seat ${seating.name} (${seating.party_size})` : ''} onClose={() => setSeating(null)}>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>Choose a free table.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {free.map((t) => (
            <Pressable key={t.id} onPress={() => seating && seat(seating, t)} style={{ height: 46, paddingHorizontal: 16, borderRadius: 23, backgroundColor: seating && t.capacity !== null && t.capacity < seating.party_size ? colors.saffron50 : colors.successBg, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{t.label}{t.capacity ? ` · ${t.capacity}` : ''}</Text>
            </Pressable>
          ))}
        </View>
        {free.length === 0 ? <Text style={{ color: colors.ink500 }}>No table is free right now.</Text> : null}
      </Sheet>
    </SafeAreaView>
  );
}

export default function Reservations() {
  return (
    <RequireAccess permission="tables.view">
      <ReservationsScreen />
    </RequireAccess>
  );
}
