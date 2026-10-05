import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const GROUP_META: Record<string, { name: string; icon: IconName }> = {
  orders: { name: 'Orders', icon: 'orders' },
  menu: { name: 'Menu', icon: 'menu' },
  tables: { name: 'Tables', icon: 'tables' },
  customers: { name: 'Customers', icon: 'users' },
  payments: { name: 'Payments', icon: 'card' },
  analytics: { name: 'Analytics', icon: 'chart' },
  offers: { name: 'Offers', icon: 'percent' },
  reviews: { name: 'Reviews', icon: 'star' },
};

const ROLE_META: Record<string, { sub: string; icon: IconName; bg: string; fg: string }> = {
  Manager: { sub: 'Runs the floor', icon: 'crown', bg: '#F1EBFF', fg: '#5B21B6' },
  Cashier: { sub: 'Billing & payments', icon: 'cash', bg: '#EAF1FF', fg: '#1F5BD6' },
  Waiter: { sub: 'Tables & orders', icon: 'dine', bg: colors.coral50, fg: colors.coral700 },
  'Kitchen Staff': { sub: 'Order queue', icon: 'chef', bg: '#FFF4D6', fg: '#8A5A00' },
};

type RoleRow = { role_name: string; is_customized: boolean };
type Perm = { key: string; description: string; granted: boolean };

function RoleDefaultsScreen() {
  const isOnline = useIsOnline();
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Perm[]>([]);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Record<string, boolean>>({ orders: true });
  const [busy, setBusy] = useState(false);

  const loadRoles = useCallback(async () => {
    const { data } = await supabase.rpc('get_role_catalog');
    const list = (data ?? []) as RoleRow[];
    setRoles(list);
    if (!selected && list[0]) setSelected(list[0].role_name);
  }, [selected]);

  const loadPermissions = useCallback(async (roleName: string) => {
    const { data, error } = await supabase.rpc('get_role_default_permissions', { p_role_name: roleName });
    if (error) {
      Alert.alert('Could not load permissions', error.message);
      return;
    }
    const list = (data ?? []) as Perm[];
    setPermissions(list);
    setDraft(new Set(list.filter((p) => p.granted).map((p) => p.key)));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-selection-change
    if (selected) loadPermissions(selected);
  }, [selected, loadPermissions]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Perm[]>();
    for (const p of permissions) {
      const group = p.key.split('.')[0];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(p);
    }
    return Array.from(byGroup.entries()).map(([key, perms]) => ({
      key,
      meta: GROUP_META[key] ?? { name: key, icon: 'settings' as IconName },
      perms,
      onCount: perms.filter((p) => draft.has(p.key)).length,
    }));
  }, [permissions, draft]);

  const dirty = useMemo(
    () => permissions.some((p) => draft.has(p.key) !== p.granted),
    [permissions, draft],
  );

  function toggle(key: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    if (!selected) return;
    if (!guardOnline(isOnline)) return;
    setBusy(true);
    const { error } = await supabase.rpc('set_role_default_permissions', {
      p_role_name: selected,
      p_permission_keys: Array.from(draft),
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    await Promise.all([loadRoles(), loadPermissions(selected)]);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Role defaults</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }}>
        <Text style={{ fontSize: 13, color: colors.ink500 }}>
          These are the permissions every new {selected ?? 'staff member'} gets automatically. Changing them here updates everyone currently in this role, and every future hire.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {roles.map((r) => {
            const on = selected === r.role_name;
            const meta = ROLE_META[r.role_name] ?? { sub: '', icon: 'settings' as IconName, bg: '#F7F1EC', fg: colors.ink900 };
            return (
              <Pressable
                key={r.role_name}
                onPress={() => setSelected(r.role_name)}
                style={{ width: '48%', minHeight: 64, borderRadius: 18, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink900 : '#E4D8D0', backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              >
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={meta.icon} size={19} stroke={2.1} color={meta.fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: colors.ink900 }}>{r.role_name}</Text>
                    {r.is_customized ? (
                      <View style={{ height: 18, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: colors.saffron50 }}>
                        <Text style={{ fontSize: 9, fontFamily: fonts.bodyExtraBold, color: '#6B4600', lineHeight: 18 }}>CUSTOM</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 11, color: colors.ink500 }}>{meta.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {groups.map((g) => (
          <View key={g.key} style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden' }}>
            <Pressable
              onPress={() => setOpen((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
              style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: '#F7F1EC', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={g.meta.icon} size={20} color={colors.ink900} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{g.meta.name}</Text>
                <Text style={{ fontSize: 12, color: colors.ink500 }}>{g.onCount} of {g.perms.length} allowed</Text>
              </View>
              <Icon name={open[g.key] ? 'up' : 'down'} size={20} stroke={2.2} color={colors.ink500} />
            </Pressable>
            {open[g.key] ? (
              <View style={{ borderTopWidth: 1, borderTopColor: '#F4ECE6', paddingHorizontal: 16, paddingBottom: 8 }}>
                {g.perms.map((p, i) => {
                  const on = draft.has(p.key);
                  const changed = on !== p.granted;
                  return (
                    <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < g.perms.length - 1 ? 1 : 0, borderBottomColor: '#F7F1EC' }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{p.description}</Text>
                          {changed ? (
                            <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.saffron50, justifyContent: 'center' }}>
                              <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: '#6B4600' }}>CHANGED</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 1 }}>{p.key}</Text>
                      </View>
                      <Pressable disabled={busy} onPress={() => toggle(p.key)}>
                        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: on ? colors.success : '#D8CCC4', padding: 3, alignItems: on ? 'flex-end' : 'flex-start' }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }} />
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>

      {dirty ? (
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 20 }}>
          <Pressable
            disabled={busy}
            onPress={save}
            style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
          >
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF', fontSize: 16 }}>{busy ? 'Saving…' : `Save changes for ${selected}`}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

export default function RoleDefaults() {
  return (
    <RequireAccess permission="staff.manage">
      <RoleDefaultsScreen />
    </RequireAccess>
  );
}
