import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius } from '@/theme/tokens';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Category = { id: string; name: string };
type Rule = { id: string; name: string; scope: string; category_ids: string[]; days_of_week: number[]; start_time: string; end_time: string; kind: 'percent_off' | 'fixed_price'; value_percent: number | null; value_minor: number | null; is_active: boolean };
type Schedule = { id: string; name: string; category_id: string | null; days_of_week: number[]; start_time: string; end_time: string; is_active: boolean };

const hhmm = (t: string) => t.slice(0, 5);
const daysLabel = (d: number[]) => (d.length === 7 ? 'Every day' : d.map((x) => DAYS[x]).join(' '));
const validTime = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);

function DayPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {DAYS.map((d, i) => {
        const on = value.includes(i);
        return (
          <Pressable key={d} onPress={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())} style={{ height: 34, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{d}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TimeRow({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (v: string) => void; setEnd: (v: string) => void }) {
  const input = { flex: 1, height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900, backgroundColor: colors.surface } as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <TextInput value={start} onChangeText={setStart} placeholder="From 16:00" placeholderTextColor={colors.ink500} style={input} />
      <Text style={{ color: colors.ink500 }}>to</Text>
      <TextInput value={end} onChangeText={setEnd} placeholder="To 19:00" placeholderTextColor={colors.ink500} style={input} />
    </View>
  );
}

function TimingsScreen() {
  const { membership } = useAuth();
  const canPrice = !!membership?.permissions.has('menu.price.edit');
  const canEdit = !!membership?.permissions.has('menu.edit');
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);

  // new rule form
  const [rName, setRName] = useState('Happy hour');
  const [rCategory, setRCategory] = useState<string>('all');
  const [rDays, setRDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [rStart, setRStart] = useState('16:00');
  const [rEnd, setREnd] = useState('19:00');
  const [rKind, setRKind] = useState<'percent_off' | 'fixed_price'>('percent_off');
  const [rValue, setRValue] = useState('20');

  // new schedule form
  const [sCategory, setSCategory] = useState<string | null>(null);
  const [sDays, setSDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [sStart, setSStart] = useState('07:00');
  const [sEnd, setSEnd] = useState('11:00');

  const load = useCallback(async () => {
    const [{ data: cats }, { data: r }, { data: s }] = await Promise.all([
      supabase.from('menu_categories').select('id, name').order('sort_order'),
      supabase.from('price_rules').select('*').order('created_at'),
      supabase.from('menu_schedules').select('*').order('created_at'),
    ]);
    setCategories(cats ?? []);
    setRules((r as Rule[]) ?? []);
    setSchedules((s as Schedule[]) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Category';

  async function addRule() {
    if (!membership) return;
    const n = Number(rValue);
    if (!rName.trim() || !validTime(rStart) || !validTime(rEnd) || rDays.length === 0 || !Number.isFinite(n) || n <= 0 || (rKind === 'percent_off' && n >= 100)) {
      Alert.alert('Check the rule', 'Give it a name, times like 16:00, at least one day, and a valid value.');
      return;
    }
    const { error } = await supabase.from('price_rules').insert({
      tenant_id: membership.tenantId,
      name: rName.trim(),
      scope: rCategory === 'all' ? 'all' : 'category',
      category_ids: rCategory === 'all' ? [] : [rCategory],
      days_of_week: rDays,
      start_time: rStart,
      end_time: rEnd,
      kind: rKind,
      value_percent: rKind === 'percent_off' ? n : null,
      value_minor: rKind === 'fixed_price' ? Math.round(n * 100) : null,
    });
    if (error) Alert.alert('Could not save', error.message);
    load();
  }

  async function addSchedule() {
    if (!membership || !sCategory) {
      Alert.alert('Pick a category', 'Choose which category these hours apply to.');
      return;
    }
    if (!validTime(sStart) || !validTime(sEnd) || sDays.length === 0) {
      Alert.alert('Check the hours', 'Use times like 07:00 and pick at least one day.');
      return;
    }
    const { error } = await supabase.from('menu_schedules').insert({
      tenant_id: membership.tenantId,
      name: `${catName(sCategory)} hours`,
      category_id: sCategory,
      days_of_week: sDays,
      start_time: sStart,
      end_time: sEnd,
    });
    if (error) Alert.alert('Could not save', error.message);
    load();
  }

  async function toggle(table: 'price_rules' | 'menu_schedules', id: string, on: boolean) {
    await supabase.from(table).update({ is_active: !on }).eq('id', id);
    load();
  }

  async function remove(table: 'price_rules' | 'menu_schedules', id: string) {
    await supabase.from(table).delete().eq('id', id);
    load();
  }

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{label}</Text>
    </Pressable>
  );

  const card = { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 8 } as const;
  const h = { fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink700, letterSpacing: 0.6 } as const;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 50 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Timings & pricing</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.ink700 }}>Times are in restaurant (India) time. Changes apply to the QR menu and staff ordering automatically.</Text>

        <Text style={h}>HAPPY HOUR & SCHEDULED PRICES</Text>
        {rules.map((r) => (
          <View key={r.id} style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{r.name}</Text>
              {canPrice ? (
                <>
                  <Pressable onPress={() => toggle('price_rules', r.id, r.is_active)} style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: r.is_active ? colors.successBg : colors.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: r.is_active ? colors.success : colors.ink700 }}>{r.is_active ? 'On' : 'Off'}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove('price_rules', r.id)}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Delete</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>
              {r.kind === 'percent_off' ? `${r.value_percent}% off` : `Fixed ${formatMinor(r.value_minor ?? 0)}`} · {r.scope === 'all' ? 'all dishes' : catName(r.category_ids[0])} · {hhmm(r.start_time)}–{hhmm(r.end_time)} · {daysLabel(r.days_of_week)}
            </Text>
          </View>
        ))}
        {rules.length === 0 ? <Text style={{ color: colors.ink500 }}>No price rules yet.</Text> : null}

        {canPrice ? (
          <View style={card}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Add a price rule</Text>
            <TextInput value={rName} onChangeText={setRName} placeholder="Name, e.g. Happy hour" placeholderTextColor={colors.ink500} style={{ height: 46, borderRadius: 14, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 14, color: colors.ink900 }} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {chip('All dishes', rCategory === 'all', () => setRCategory('all'))}
              {categories.map((c) => chip(c.name, rCategory === c.id, () => setRCategory(c.id)))}
            </ScrollView>
            <DayPicker value={rDays} onChange={setRDays} />
            <TimeRow start={rStart} end={rEnd} setStart={setRStart} setEnd={setREnd} />
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {chip('% off', rKind === 'percent_off', () => setRKind('percent_off'))}
              {chip('Fixed price ₹', rKind === 'fixed_price', () => setRKind('fixed_price'))}
              <TextInput value={rValue} onChangeText={setRValue} keyboardType="decimal-pad" style={{ flex: 1, height: 36, borderRadius: 12, borderWidth: 1.5, borderColor: colors.inputBorder, paddingHorizontal: 12, color: colors.ink900 }} />
            </View>
            <Pressable onPress={addRule} style={{ height: 46, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Save rule</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: colors.ink500 }}>Only people with the price permission can add or change price rules.</Text>
        )}

        <Text style={[h, { marginTop: 8 }]}>CATEGORY HOURS (E.G. BREAKFAST MENU)</Text>
        {schedules.map((s) => (
          <View key={s.id} style={card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{catName(s.category_id)}</Text>
              {canEdit ? (
                <>
                  <Pressable onPress={() => toggle('menu_schedules', s.id, s.is_active)} style={{ height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: s.is_active ? colors.successBg : colors.bg, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: s.is_active ? colors.success : colors.ink700 }}>{s.is_active ? 'On' : 'Off'}</Text>
                  </Pressable>
                  <Pressable onPress={() => remove('menu_schedules', s.id)}>
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Delete</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
            <Text style={{ fontSize: 13, color: colors.ink700 }}>Available {hhmm(s.start_time)}–{hhmm(s.end_time)} · {daysLabel(s.days_of_week)}</Text>
          </View>
        ))}
        {schedules.length === 0 ? <Text style={{ color: colors.ink500 }}>All categories are available all day.</Text> : null}

        {canEdit ? (
          <View style={card}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Add category hours</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {categories.map((c) => chip(c.name, sCategory === c.id, () => setSCategory(c.id)))}
            </ScrollView>
            <DayPicker value={sDays} onChange={setSDays} />
            <TimeRow start={sStart} end={sEnd} setStart={setSStart} setEnd={setSEnd} />
            <Pressable onPress={addSchedule} style={{ height: 46, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Save hours</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Timings() {
  return (
    <RequireAccess permission="menu.view">
      <TimingsScreen />
    </RequireAccess>
  );
}
