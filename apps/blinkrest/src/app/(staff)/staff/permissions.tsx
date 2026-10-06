import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

const OWNER_ONLY = new Set(['staff.manage', 'settings.manage', 'subscription.manage', 'ownership.transfer']);

const GROUP_META: Record<string, { name: string; icon: IconName }> = {
  orders: { name: 'Orders', icon: 'orders' },
  menu: { name: 'Menu', icon: 'menu' },
  tables: { name: 'Tables', icon: 'tables' },
  customers: { name: 'Customers', icon: 'users' },
  payments: { name: 'Payments', icon: 'card' },
  analytics: { name: 'Analytics', icon: 'chart' },
  offers: { name: 'Offers', icon: 'percent' },
  reviews: { name: 'Reviews', icon: 'star' },
  staff: { name: 'Staff', icon: 'users' },
  settings: { name: 'Settings', icon: 'settings' },
};

const ROLE_META: Record<string, { sub: string; icon: IconName; bg: string; fg: string }> = {
  Manager: { sub: 'Runs the floor', icon: 'crown', bg: '#F1EBFF', fg: '#5B21B6' },
  Cashier: { sub: 'Billing & payments', icon: 'cash', bg: '#EAF1FF', fg: '#1F5BD6' },
  Waiter: { sub: 'Tables & orders', icon: 'dine', bg: colors.coral50, fg: colors.coral700 },
  'Kitchen Staff': { sub: 'Order queue', icon: 'chef', bg: '#FFF4D6', fg: '#8A5A00' },
};

type Perm = { id: string; key: string; description: string };
type Role = { id: string; name: string };
type OverrideRow = { permission_id: string; effect: 'grant' | 'deny' };

function initials(name: string | null) {
  if (!name) return '?';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

function StaffPermissionsScreen() {
  const { membershipId } = useLocalSearchParams<{ membershipId: string }>();
  const { membership: myMembership } = useAuth();
  const isOnline = useIsOnline();

  const [member, setMember] = useState<{ displayName: string | null; phone: string | null; status: string; roleId: string; joinedAt: string } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Perm[]>([]);
  const [rolePermIds, setRolePermIds] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, 'grant' | 'deny'>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({ orders: true, menu: true, payments: true });

  const load = useCallback(async () => {
    const [{ data: m }, { data: roleRows }, { data: permRows }] = await Promise.all([
      supabase.from('tenant_memberships').select('status, role_id, joined_at, users!tenant_memberships_user_id_fkey(display_name, phone)').eq('id', membershipId).maybeSingle(),
      supabase.rpc('get_role_catalog'),
      supabase.from('permissions').select('id, key, description').order('key'),
    ]);

    if (m) {
      const user = Array.isArray(m.users) ? m.users[0] : m.users;
      setMember({ displayName: user?.display_name ?? null, phone: user?.phone ?? null, status: m.status, roleId: m.role_id, joinedAt: m.joined_at });

      const [{ data: rp }, { data: ov }] = await Promise.all([
        supabase.from('role_permissions').select('permission_id').eq('role_id', m.role_id),
        supabase.from('user_permission_overrides').select('permission_id, effect').eq('membership_id', membershipId),
      ]);
      setRolePermIds(new Set((rp ?? []).map((r) => r.permission_id)));
      setOverrides(Object.fromEntries((ov as OverrideRow[] ?? []).map((o) => [o.permission_id, o.effect])));
    }
    setRoles(((roleRows ?? []) as { role_name: string; role_id: string }[]).map((r) => ({ id: r.role_id, name: r.role_name })));
    setPermissions(permRows ?? []);
  }, [membershipId]);

  useRealtimeRefresh('staffpermissionstsx', [{ table: 'tenant_memberships' }], load);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, Perm[]>();
    for (const p of permissions) {
      if (p.key === 'subscription.manage' || p.key === 'ownership.transfer') continue;
      const group = p.key.split('.')[0];
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(p);
    }
    return Array.from(byGroup.entries()).map(([key, perms]) => {
      const locked = key === 'staff' || key === 'settings';
      const withState = perms.map((p) => {
        const def = rolePermIds.has(p.id);
        const ov = overrides[p.id];
        const on = locked ? false : ov ? ov === 'grant' : def;
        const changed = !locked && ov !== undefined && (ov === 'grant') !== def;
        return { ...p, on, changed, def };
      });
      return { key, meta: GROUP_META[key] ?? { name: key, icon: 'settings' as IconName }, locked, perms: withState, onCount: withState.filter((p) => p.on).length };
    });
  }, [permissions, rolePermIds, overrides]);

  const diff = groups.reduce((sum, g) => sum + g.perms.filter((p) => p.changed).length, 0);

  async function toggle(perm: { id: string; key: string; on: boolean; def: boolean }) {
    if (!myMembership?.permissions.has('staff.manage')) return;
    if (!guardOnline(isOnline)) return;
    const wantOn = !perm.on;
    const effect = wantOn === perm.def ? 'clear' : wantOn ? 'grant' : 'deny';
    setOverrides((prev) => {
      const next = { ...prev };
      if (effect === 'clear') delete next[perm.id];
      else next[perm.id] = effect;
      return next;
    });
    const { error } = await supabase.rpc('set_permission_override', { p_membership_id: membershipId, p_permission_key: perm.key, p_effect: effect });
    if (error) {
      Alert.alert('Could not update permission', error.message);
      await load();
    }
  }

  async function pickRole(roleId: string) {
    if (!guardOnline(isOnline)) return;
    setMember((prev) => (prev ? { ...prev, roleId } : prev));
    const { error } = await supabase.rpc('set_membership_role', { p_membership_id: membershipId, p_role_id: roleId });
    if (error) Alert.alert('Could not change role', error.message);
    await load();
  }

  async function resetOverrides() {
    if (!guardOnline(isOnline)) return;
    setOverrides({});
    const { error } = await supabase.rpc('reset_permission_overrides', { p_membership_id: membershipId });
    if (error) {
      Alert.alert('Could not reset', error.message);
      await load();
    }
  }

  function confirmSuspendOrRevoke(kind: 'suspended' | 'revoked') {
    Alert.alert(
      kind === 'suspended' ? 'Suspend account?' : 'Revoke access?',
      kind === 'suspended' ? 'They will be signed out until reinstated.' : 'They will be signed out of all devices immediately. This cannot be undone from here.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: kind === 'suspended' ? 'Suspend' : 'Revoke',
          style: 'destructive',
          onPress: async () => {
            if (!guardOnline(isOnline)) return;
            const { error } = await supabase.from('tenant_memberships').update({ status: kind }).eq('id', membershipId);
            if (error) Alert.alert('Could not update', error.message);
            else router.back();
          },
        },
      ],
    );
  }

  if (!member) return null;

  const currentRole = roles.find((r) => r.id === member.roleId);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Roles & permissions</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFD3C5', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.ink900 }}>{initials(member.displayName)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{member.displayName ?? member.phone ?? 'Staff member'}</Text>
              <Text style={{ fontSize: 13, color: colors.ink500 }}>{member.phone} · since {new Date(member.joinedAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</Text>
            </View>
            <View style={{ height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: member.status === 'active' ? colors.successBg : colors.errorBg, justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, fontFamily: fonts.bodyExtraBold, color: member.status === 'active' ? colors.success : colors.error }}>{member.status}</Text>
            </View>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Role template</Text>
            {diff > 0 ? (
              <Pressable onPress={resetOverrides}>
                <Text style={{ color: colors.coral600, fontFamily: fonts.bodyExtraBold, fontSize: 13 }}>Reset to template</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {roles.map((r) => {
              const on = r.id === member.roleId;
              const meta = ROLE_META[r.name] ?? { sub: '', icon: 'settings' as IconName, bg: '#F7F1EC', fg: colors.ink900 };
              return (
                <Pressable
                  key={r.id}
                  onPress={() => !on && pickRole(r.id)}
                  style={{ width: '48%', minHeight: 64, borderRadius: 18, borderWidth: on ? 2 : 1.5, borderColor: on ? colors.ink900 : '#E4D8D0', backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: meta.bg, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name={meta.icon} size={19} stroke={2.1} color={meta.fg} />
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontFamily: on ? fonts.bodyExtraBold : fonts.bodyBold, color: colors.ink900 }}>{r.name}</Text>
                    <Text style={{ fontSize: 11, color: colors.ink500 }}>{meta.sub}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {diff > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, backgroundColor: colors.saffron50, padding: 12 }}>
              <Icon name="sliders" size={17} color="#6B4600" />
              <Text style={{ fontSize: 13, color: '#6B4600', flex: 1 }}>
                <Text style={{ fontFamily: fonts.bodyExtraBold }}>Customised:</Text> {diff} change(s) from the {currentRole?.name ?? 'role'} template
              </Text>
            </View>
          ) : null}
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
              {g.locked ? (
                <View style={{ height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: '#F1ECE8', flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon name="lock" size={13} stroke={2.3} color={colors.ink700} />
                  <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: colors.ink700 }}>Owner only</Text>
                </View>
              ) : null}
              <Icon name={open[g.key] ? 'up' : 'down'} size={20} stroke={2.2} color={colors.ink500} />
            </Pressable>
            {open[g.key] ? (
              <View style={{ borderTopWidth: 1, borderTopColor: '#F4ECE6', paddingHorizontal: 16, paddingBottom: 8 }}>
                {g.perms.map((p, i) => (
                  <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < g.perms.length - 1 ? 1 : 0, borderBottomColor: '#F7F1EC' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{p.description}</Text>
                        {OWNER_ONLY.has(p.key) ? (
                          <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.errorBg, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Icon name="shield" size={12} stroke={2.3} color={colors.error} />
                            <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: colors.error }}>SENSITIVE</Text>
                          </View>
                        ) : null}
                        {p.changed ? (
                          <View style={{ height: 20, paddingHorizontal: 7, borderRadius: radius.pill, backgroundColor: colors.saffron50, justifyContent: 'center' }}>
                            <Text style={{ fontSize: 10, fontFamily: fonts.bodyExtraBold, color: '#6B4600' }}>CHANGED</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 1 }}>{p.key}</Text>
                    </View>
                    <Pressable disabled={g.locked} onPress={() => toggle(p)}>
                      <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: p.on ? colors.success : g.locked ? '#EFE8E3' : '#D8CCC4', padding: 3, alignItems: p.on ? 'flex-end' : 'flex-start' }}>
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFFFFF' }} />
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ))}

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderRadius: 16, backgroundColor: '#EAF1FF', padding: 14 }}>
          <Icon name="shield" size={18} color="#1A4BAF" />
          <Text style={{ flex: 1, fontSize: 13, color: '#1A4BAF', lineHeight: 19 }}>
            Permissions are checked on BlinkRest&rsquo;s servers for every action, not just hidden in the app. Changes apply immediately.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4C7C1', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.error }}>Account access</Text>
          <Pressable onPress={() => confirmSuspendOrRevoke('suspended')} style={{ height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#E0B860', backgroundColor: '#FFFBEF', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
            <Icon name="ban" size={19} color="#8A5A00" />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#8A5A00', fontSize: 14 }}>Suspend account</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, color: '#8A5A00' }}>Can be restored</Text>
          </Pressable>
          <Pressable onPress={() => confirmSuspendOrRevoke('revoked')} style={{ height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#F4C7C1', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
            <Icon name="logout" size={19} color={colors.error} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error, fontSize: 14 }}>Revoke access</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 12, color: colors.error }}>Signs out all devices</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function StaffPermissions() {
  return (
    <RequireAccess permission="staff.manage">
      <StaffPermissionsScreen />
    </RequireAccess>
  );
}
