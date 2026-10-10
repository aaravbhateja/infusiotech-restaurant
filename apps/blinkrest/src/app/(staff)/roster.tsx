import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { Button, Chip, Field, Sheet, card } from '@/components/inventory/ui';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type Member = { id: string; name: string; role: string };
type Shift = { id: string; membership_id: string; shift_date: string; start_time: string; end_time: string; note: string | null };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function RosterScreen() {
  const { membership } = useAuth();
  const canManage = !!membership?.permissions.has('staff.manage');
  const [weekOffset, setWeekOffset] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [adding, setAdding] = useState<string | null>(null); // date being added
  const [who, setWho] = useState<string | null>(null);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('18:00');
  const [note, setNote] = useState('');

  const days = useMemo(() => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() - base.getDay() + 1 + weekOffset * 7); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  const load = useCallback(async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      supabase.from('tenant_memberships').select('id, user:users(display_name, email), role:roles(name)').eq('status', 'active'),
      supabase.from('roster_shifts').select('*').gte('shift_date', ymd(days[0])).lte('shift_date', ymd(days[6])).order('start_time'),
    ]);
    setMembers(
      ((m as unknown as { id: string; user: { display_name: string | null; email: string | null } | null; role: { name: string } | null }[]) ?? []).map((x) => ({
        id: x.id,
        name: x.user?.display_name ?? x.user?.email ?? 'Staff',
        role: x.role?.name ?? '',
      })),
    );
    setShifts((s as Shift[]) ?? []);
  }, [days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Staff';

  async function save() {
    if (!membership || !adding || !who) {
      Alert.alert('Pick a person', 'Choose who works this shift.');
      return;
    }
    if (!validTime(start) || !validTime(end)) {
      Alert.alert('Check the times', 'Use times like 10:00 and 18:00.');
      return;
    }
    const { error } = await supabase.from('roster_shifts').insert({ tenant_id: membership.tenantId, membership_id: who, shift_date: adding, start_time: start, end_time: end, note: note.trim() || null });
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    setAdding(null);
    setNote('');
    load();
  }

  async function remove(id: string) {
    await supabase.from('roster_shifts').delete().eq('id', id);
    load();
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Roster</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="Last week" on={weekOffset === -1} onPress={() => setWeekOffset(-1)} />
          <Chip label="This week" on={weekOffset === 0} onPress={() => setWeekOffset(0)} />
          <Chip label="Next week" on={weekOffset === 1} onPress={() => setWeekOffset(1)} />
        </View>

        {days.map((d) => {
          const key = ymd(d);
          const day = shifts.filter((s) => s.shift_date === key);
          return (
            <View key={key} style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                  {d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                </Text>
                {canManage ? <Pressable onPress={() => { setAdding(key); setWho(null); }}><Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>+ Add</Text></Pressable> : null}
              </View>
              {day.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: colors.ink700 }}>
                    {nameOf(s.membership_id)} · {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}{s.note ? ` · ${s.note}` : ''}
                  </Text>
                  {canManage ? <Pressable onPress={() => remove(s.id)}><Text style={{ color: colors.error, fontFamily: fonts.bodyExtraBold, fontSize: 12 }}>Remove</Text></Pressable> : null}
                </View>
              ))}
              {day.length === 0 ? <Text style={{ color: colors.ink500, fontSize: 13 }}>No one scheduled.</Text> : null}
            </View>
          );
        })}
      </ScrollView>

      <Sheet visible={adding !== null} title="Add shift" onClose={() => setAdding(null)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {members.map((m) => <Chip key={m.id} label={`${m.name} · ${m.role}`} on={who === m.id} onPress={() => setWho(m.id)} />)}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Field label="From" value={start} onChangeText={setStart} /></View>
          <View style={{ flex: 1 }}><Field label="To" value={end} onChangeText={setEnd} /></View>
        </View>
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
        <Button label="Save shift" onPress={save} />
      </Sheet>
    </SafeAreaView>
  );
}

export default function Roster() {
  return (
    <RequireAccess permission="staff.view">
      <RosterScreen />
    </RequireAccess>
  );
}
