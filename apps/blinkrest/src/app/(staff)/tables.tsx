import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav } from '@/components/BottomNav';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TableQrSheet } from '@/components/TableQrSheet';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

type TableRow = {
  id: string;
  label: string;
  capacity: number | null;
  activeTotal?: number;
  activeSince?: string;
};

function TablesScreen() {
  const { membership } = useAuth();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [statFilter, setStatFilter] = useState<'all' | 'free' | 'occupied'>('all');
  const [newQr, setNewQr] = useState<{ label: string; rawToken: string } | null>(null);

  const load = useCallback(async () => {
    const { data: tableRows } = await supabase
      .from('restaurant_tables')
      .select('id, label, capacity')
      .eq('status', 'active')
      .order('label');

    const { data: activeOrders } = await supabase
      .from('orders')
      .select('table_id, total_minor, created_at')
      .not('order_status', 'in', '(served,rejected,cancelled)');

    const byTable = new Map<string, { total: number; since: string }>();
    for (const o of activeOrders ?? []) {
      if (!o.table_id) continue;
      const existing = byTable.get(o.table_id);
      if (!existing || o.created_at < existing.since) {
        byTable.set(o.table_id, { total: (existing?.total ?? 0) + o.total_minor, since: existing?.since ?? o.created_at });
      } else {
        existing.total += o.total_minor;
      }
    }

    setTables(
      (tableRows ?? []).map((t) => ({
        ...t,
        activeTotal: byTable.get(t.id)?.total,
        activeSince: byTable.get(t.id)?.since,
      })),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const counts = useMemo(() => {
    const occupied = tables.filter((t) => t.activeTotal != null).length;
    return { all: tables.length, occupied, free: tables.length - occupied };
  }, [tables]);

  const visible = useMemo(() => {
    if (statFilter === 'all') return tables;
    if (statFilter === 'free') return tables.filter((t) => t.activeTotal == null);
    return tables.filter((t) => t.activeTotal != null);
  }, [tables, statFilter]);

  async function addTable() {
    if (!membership || !newLabel.trim()) return;
    const label = newLabel.trim();
    setAdding(true);
    const { data, error } = await supabase.rpc('create_table_with_qr', {
      p_tenant_id: membership.tenantId,
      p_label: label,
      p_capacity: null,
    });
    setAdding(false);
    if (error) {
      Alert.alert('Could not add table', error.message);
      return;
    }
    setNewLabel('');
    if (data?.raw_token) setNewQr({ label, rawToken: data.raw_token });
    await load();
  }

  function durationSince(iso: string) {
    // eslint-disable-next-line react-hooks/purity -- display-only elapsed time, not state
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    return `${mins}m`;
  }

  const STAT_DEFS = [
    { key: 'all' as const, label: 'Total', icon: 'tables' as const, fg: colors.ink900, bg: colors.surface, count: counts.all },
    { key: 'free' as const, label: 'Free', icon: 'checkc' as const, fg: colors.success, bg: '#F3FBF6', count: counts.free },
    { key: 'occupied' as const, label: 'Seated', icon: 'dine' as const, fg: colors.coral700, bg: colors.coral50, count: counts.occupied },
  ];

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>Tables</Text>
            <Text style={{ fontSize: 13, color: colors.ink700, marginTop: 2 }}>
              {counts.all ? Math.round((counts.occupied / counts.all) * 100) : 0}% occupied
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {STAT_DEFS.map((s) => {
            const active = statFilter === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setStatFilter(s.key)}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? colors.ink900 : colors.line,
                  backgroundColor: s.bg,
                  paddingVertical: 10,
                  alignItems: 'center',
                  gap: 2,
                  minHeight: 72,
                  justifyContent: 'center',
                }}
              >
                <Icon name={s.icon} size={18} stroke={2.2} color={s.fg} />
                <Text style={{ fontSize: 20, fontFamily: fonts.display, color: colors.ink900 }}>{s.count}</Text>
                <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: s.fg }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="New table, e.g. T12"
            placeholderTextColor={colors.ink500}
            style={{
              flex: 1,
              height: 44,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              borderWidth: 1.5,
              borderColor: colors.inputBorder,
              paddingHorizontal: 16,
            }}
          />
          <Pressable
            onPress={addTable}
            disabled={adding || !newLabel.trim()}
            style={{
              height: 44,
              paddingHorizontal: 18,
              borderRadius: radius.pill,
              backgroundColor: !newLabel.trim() ? colors.disabledBg : colors.coral600,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
            }}
          >
            <Icon name="plus" size={18} stroke={2.6} color={!newLabel.trim() ? colors.disabledFg : '#FFFFFF'} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: !newLabel.trim() ? colors.disabledFg : '#FFFFFF' }}>Add</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={visible}
        keyExtractor={(t) => t.id}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => {
          const occupied = item.activeTotal != null;
          return (
            <Pressable
              onPress={() => router.push(`/(staff)/table/${item.id}` as never)}
              style={{
                flex: 1,
                minHeight: 124,
                borderRadius: 20,
                backgroundColor: occupied ? colors.coral500 : '#F3FBF6',
                borderWidth: 2,
                borderColor: occupied ? colors.coral500 : '#8FD3AE',
                padding: 12,
                gap: 6,
                ...shadow.card,
              }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>{item.label}</Text>
                {item.capacity ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Icon name="users" size={15} stroke={2} color={occupied ? colors.ink900 : colors.ink700} />
                    <Text style={{ fontSize: 12, fontFamily: fonts.bodyBold, color: occupied ? colors.ink900 : colors.ink700 }}>
                      {item.capacity}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name={occupied ? 'dine' : 'checkc'} size={15} stroke={2.3} color={occupied ? colors.ink900 : colors.success} />
                <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: occupied ? colors.ink900 : colors.success }}>
                  {occupied ? 'Occupied' : 'Available'}
                </Text>
              </View>
              {occupied ? (
                <View style={{ marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 19, fontFamily: fonts.display, color: colors.ink900 }}>
                    ₹{((item.activeTotal ?? 0) / 100).toFixed(0)}
                  </Text>
                  {item.activeSince ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Icon name="clock" size={13} stroke={2.4} color={colors.ink900} />
                      <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
                        {durationSince(item.activeSince)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : (
                <Text style={{ marginTop: 'auto', fontSize: 12, color: colors.ink700 }}>Ready to seat</Text>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.body, color: colors.ink500 }}>No tables yet — add one above.</Text>
          </View>
        }
      />
      <BottomNav active="tables" />
      {newQr && membership ? (
        <TableQrSheet tableLabel={newQr.label} tenantSlug={membership.tenantSlug} rawToken={newQr.rawToken} onClose={() => setNewQr(null)} />
      ) : null}
    </SafeAreaView>
  );
}

export default function Tables() {
  return (
    <RequireAccess permission="tables.view">
      <TablesScreen />
    </RequireAccess>
  );
}
