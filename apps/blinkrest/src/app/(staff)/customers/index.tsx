import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, formatMinor, radius, shadow } from '@/theme/tokens';
import { tenantSubs, useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

type Tag = 'VIP' | 'Regular' | 'New' | 'Lapsed';

const TAG_COLORS: Record<Tag, [string, string]> = {
  VIP: ['#1B1716', '#FFC93C'],
  Regular: ['#FFF6D9', '#6B4600'],
  New: ['#EAF1FF', '#1F5BD6'],
  Lapsed: ['#F1ECE8', '#4A4240'],
};

type Row = {
  id: string;
  name: string | null;
  phone: string | null;
  order_count: number;
  total_spend_minor: number;
  last_order_at: string | null;
  created_at: string;
};

const AVATAR_BGS = ['#FFE7A6', '#FFD3C5', '#CFE0FF', '#C9F0DA', '#E7DBFF'];

function initials(text: string | null) {
  if (!text) return '?';
  return text.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

function tagFor(r: Row): Tag {
  if (r.order_count <= 1) return 'New';
  if (r.total_spend_minor >= 1500000) return 'VIP';
  if (r.last_order_at && Date.now() - new Date(r.last_order_at).getTime() > 30 * 86400000) return 'Lapsed';
  return 'Regular';
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const SEGMENTS: ('All' | Tag)[] = ['All', 'VIP', 'Regular', 'New', 'Lapsed'];

function CustomersScreen() {
  const { membership } = useAuth();
  const [seg, setSeg] = useState<'All' | Tag>('All');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('customer_summaries')
      .select('id, name, phone, order_count, total_spend_minor, last_order_at, created_at')
      .order('total_spend_minor', { ascending: false });
    setRows((data as Row[]) ?? []);
  }, []);

  useRealtimeRefresh('customersindextsx', tenantSubs(membership?.tenantId, ['customers', 'orders']), load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const tagged = useMemo(() => rows.map((r) => ({ ...r, tag: tagFor(r) })), [rows]);

  const people = tagged.filter(
    (p) => (seg === 'All' || p.tag === seg) && (p.name ?? p.phone ?? '').toLowerCase().includes(query.toLowerCase()),
  );

  const stats = useMemo(() => {
    const total = tagged.length;
    const thisMonth = tagged.filter((p) => {
      const d = new Date(p.created_at);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
    const returning = tagged.filter((p) => p.order_count > 1).length;
    const repeatRate = total ? Math.round((returning / total) * 1000) / 10 : 0;
    return { total, thisMonth, returning, repeatRate };
  }, [tagged]);

  if (!membership) return null;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Customers</Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ width: '47%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{stats.total}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Total customers</Text>
          </View>
          <View style={{ width: '47%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{stats.thisMonth}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>New this month</Text>
          </View>
          <View style={{ width: '47%', backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{stats.returning}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Returning</Text>
            <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 4 }}>2+ visits</Text>
          </View>
          <View style={{ width: '47%', backgroundColor: colors.coral500, borderRadius: 20, padding: 14 }}>
            <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{stats.repeatRate}%</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Repeat order rate</Text>
          </View>
        </View>

        <View style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Icon name="search" size={19} color={colors.ink500} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Name or phone number"
            placeholderTextColor={colors.ink500}
            style={{ flex: 1, fontSize: 15, color: colors.ink900, fontFamily: fonts.body }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {SEGMENTS.map((s) => {
            const on = s === seg;
            return (
              <Pressable
                key={s}
                onPress={() => setSeg(s)}
                style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? colors.ink900 : colors.surface, borderWidth: on ? 0 : 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: on ? '#FFFFFF' : colors.ink900 }}>{s}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ gap: 10 }}>
          {people.map((p, i) => {
            const tagColors = TAG_COLORS[p.tag];
            return (
              <Pressable
                key={p.id}
                onPress={() => router.push(`/(staff)/customers/${p.id}` as never)}
                style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow.card }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: AVATAR_BGS[i % AVATAR_BGS.length], alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.ink900 }}>{initials(p.name ?? p.phone)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{p.name ?? p.phone ?? 'Guest'}</Text>
                    <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: tagColors[0], justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: tagColors[1] }}>{p.tag}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 2 }}>{p.phone ?? 'No phone'} · last {timeAgo(p.last_order_at)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>{formatMinor(p.total_spend_minor)}</Text>
                  <Text style={{ fontSize: 12, color: colors.ink500 }}>{p.order_count} orders</Text>
                </View>
              </Pressable>
            );
          })}
          {people.length === 0 ? (
            <Text style={{ textAlign: 'center', color: colors.ink500, padding: 24 }}>No customers yet — they show up here after their first order.</Text>
          ) : null}
        </View>
      </ScrollView>
      <BottomNav active="more" />
    </SafeAreaView>
  );
}

export default function Customers() {
  return (
    <RequireAccess permission="customers.view">
      <CustomersScreen />
    </RequireAccess>
  );
}
