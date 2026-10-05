import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadow } from '@/theme/tokens';

type Invite = { id: string; display_name: string | null; contact: string; role_name: string; created_at: string };
type Member = { id: string; display_name: string | null; phone: string | null; email: string | null; role_name: string; status: string };

function initials(name: string | null) {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function StaffScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  const load = useCallback(async () => {
    if (!membership) return;
    const [{ data: inviteRows }, { data: memberRows }] = await Promise.all([
      supabase
        .from('staff_invitations')
        .select('id, display_name, contact, created_at, roles(name)')
        .eq('tenant_id', membership.tenantId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('tenant_memberships')
        .select('id, status, users!tenant_memberships_user_id_fkey(display_name, phone, email), roles(name)')
        .eq('tenant_id', membership.tenantId)
        .order('joined_at', { ascending: false }),
    ]);

    setInvites(
      (inviteRows ?? []).map((r: any) => ({
        id: r.id,
        display_name: r.display_name,
        contact: r.contact,
        role_name: Array.isArray(r.roles) ? r.roles[0]?.name : r.roles?.name,
        created_at: r.created_at,
      })),
    );
    setMembers(
      (memberRows ?? []).map((r: any) => {
        const user = Array.isArray(r.users) ? r.users[0] : r.users;
        const role = Array.isArray(r.roles) ? r.roles[0] : r.roles;
        return {
          id: r.id,
          display_name: user?.display_name,
          phone: user?.phone,
          email: user?.email,
          role_name: role?.name ?? '',
          status: r.status,
        };
      }),
    );
  }, [membership]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
    if (!membership) return;
    const channel = supabase
      .channel('staff-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenant_memberships', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_invitations', filter: `tenant_id=eq.${membership.tenantId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [membership, load]);

  async function revokeInvite(id: string) {
    if (!guardOnline(isOnline)) return;
    const { error } = await supabase.from('staff_invitations').update({ status: 'revoked' }).eq('id', id);
    if (error) {
      Alert.alert('Could not revoke invite', error.message);
      return;
    }
    load();
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
        <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, flex: 1, letterSpacing: -1 }}>Staff</Text>
        <Pressable
          onPress={() => router.push('/(staff)/staff/invite')}
          style={{ height: 46, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Icon name="plus" size={20} stroke={2.6} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 15 }}>Invite</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <View style={{ width: '47%', backgroundColor: colors.ink900, borderRadius: 22, padding: 14, gap: 4 }}>
            <Icon name="users" size={22} color={colors.saffron400} />
            <Text style={{ fontSize: 28, fontFamily: fonts.display, color: '#FFFFFF' }}>{members.length}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#E9E1DC' }}>Total staff</Text>
          </View>
          <View style={{ width: '47%', backgroundColor: colors.saffron50, borderRadius: 22, padding: 14, gap: 4 }}>
            <Icon name="send" size={22} color="#8A5A00" />
            <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900 }}>{invites.length}</Text>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#8A5A00' }}>Pending invites</Text>
          </View>
        </View>

        {membership?.permissions.has('staff.manage') ? (
          <Pressable
            onPress={() => router.push('/(staff)/staff/roles')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: '#F4ECE6', padding: 14 }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: '#F1EBFF', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="sliders" size={20} stroke={2.1} color="#5B21B6" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>Role defaults</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>What each role can do by default</Text>
            </View>
            <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
          </Pressable>
        ) : null}

        {invites.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Pending invitations</Text>
              <Text style={{ fontSize: 12, color: colors.ink500 }}>Expire in 7 days</Text>
            </View>
            {invites.map((inv) => (
              <View key={inv.id} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1.5, borderColor: '#E0B860', borderStyle: 'dashed', padding: 14, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.saffron50, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontFamily: fonts.display, color: '#6B4600', fontSize: 15 }}>{initials(inv.display_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{inv.display_name ?? inv.contact}</Text>
                    <Text style={{ fontSize: 12, color: colors.ink500 }}>{inv.role_name} · {inv.contact}</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => revokeInvite(inv.id)}
                  style={{ height: 42, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#F4C7C1', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error }}>Revoke</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.display, color: colors.ink900 }}>Team</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', overflow: 'hidden', ...shadow.card }}>
            {members.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/(staff)/staff/permissions?membershipId=${m.id}` as never)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderBottomWidth: i < members.length - 1 ? 1 : 0,
                  borderBottomColor: '#F4ECE6',
                }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.coral50, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.display, fontSize: 16, color: colors.coral700 }}>{initials(m.display_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{m.display_name ?? m.email ?? m.phone}</Text>
                    <View style={{ height: 22, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: '#EAF1FF' }}>
                      <Text style={{ fontSize: 11, fontFamily: fonts.bodyExtraBold, color: '#1F5BD6', lineHeight: 22 }}>{m.role_name}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.ink500, marginTop: 2 }}>{m.status}</Text>
                </View>
                <Icon name="right" size={18} stroke={2.2} color="#B9AEA8" />
              </Pressable>
            ))}
            {members.length === 0 ? (
              <View style={{ padding: 20 }}>
                <Text style={{ color: colors.ink500 }}>No staff yet — invite your first team member.</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function Staff() {
  return (
    <RequireAccess permission="staff.view">
      <StaffScreen />
    </RequireAccess>
  );
}
