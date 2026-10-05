import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { RequireAccess } from '@/components/RequireAccess';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Role = { id: string; name: string };

function InviteStaffScreen() {
  const { membership } = useAuth();
  const isOnline = useIsOnline();
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!membership) return;
    supabase.rpc('get_role_catalog').then(({ data }) => {
      const list = ((data ?? []) as { role_name: string; role_id: string }[]).map((r) => ({ id: r.role_id, name: r.role_name }));
      setRoles(list);
      if (list[0]) setRoleId(list[0].id);
    });
  }, [membership]);

  async function invite() {
    if (!membership || !roleId || !contact.trim()) return;
    if (!guardOnline(isOnline)) return;
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_staff_invitation', {
      p_tenant_id: membership.tenantId,
      p_contact: contact.trim(),
      p_role_id: roleId,
      p_display_name: name.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setRawToken((data as any).raw_token);
  }

  if (rawToken) {
    const shareMessage = `You're invited to join ${membership?.tenantName ?? 'the team'} on BlinkRest!\n\nOpen the app, tap "Joining a team?" and enter this invite code:\n\n${rawToken}`;

    async function copyCode() {
      await Clipboard.setStringAsync(rawToken!);
      setCopied(true);
    }

    async function shareCode() {
      await Share.share({ message: shareMessage });
    }

    return (
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg, padding: 20, gap: 20, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={28} color={colors.success} />
          </View>
          <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900, textAlign: 'center' }}>Invite created</Text>
          <Text style={{ fontSize: 14, color: colors.ink700, textAlign: 'center' }}>
            Share this code with {name || contact} — valid for 7 days.
          </Text>
        </View>
        <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.inputBorder, padding: 20, alignItems: 'center' }}>
          <Text selectable style={{ fontFamily: fonts.display, fontSize: 20, color: colors.ink900, letterSpacing: 1 }}>
            {rawToken}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={copyCode} style={{ flex: 1, height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name={copied ? 'check' : 'share'} size={18} color={colors.ink900} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>{copied ? 'Copied' : 'Copy code'}</Text>
          </Pressable>
          <Pressable onPress={shareCode} style={{ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: colors.coral600, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name="share" size={18} color="#FFFFFF" />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Share</Text>
          </Pressable>
        </View>
        <Button title="Done" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Invite staff</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Rohit Saini" autoCapitalize="words" />
        <TextField label="Phone or email" value={contact} onChangeText={setContact} placeholder="+91XXXXXXXXXX or email" error={error ?? undefined} />

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Role</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {roles.map((r) => {
              const active = roleId === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRoleId(r.id)}
                  style={{
                    height: 44,
                    paddingHorizontal: 16,
                    borderRadius: radius.pill,
                    backgroundColor: active ? colors.ink900 : colors.surface,
                    borderWidth: active ? 0 : 1.5,
                    borderColor: colors.inputBorder,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: active ? '#FFFFFF' : colors.ink900 }}>{r.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button title={saving ? 'Creating...' : 'Create invite'} onPress={invite} loading={saving} disabled={!contact.trim() || !roleId} />
      </ScrollView>
    </SafeAreaView>
  );
}

export default function InviteStaff() {
  return (
    <RequireAccess permission="staff.invite">
      <InviteStaffScreen />
    </RequireAccess>
  );
}
