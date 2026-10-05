import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

export default function Security() {
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('users').select('display_name').eq('id', session.user.id).maybeSingle();
    setName(data?.display_name ?? '');
    setSavedName(data?.display_name ?? '');
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  async function saveName() {
    if (!session) return;
    setSaving(true);
    const trimmed = name.trim();
    const { error } = await supabase.from('users').update({ display_name: trimmed || null }).eq('id', session.user.id);
    setSaving(false);
    if (error) Alert.alert('Could not save name', error.message);
    else setSavedName(trimmed);
  }

  function signOutEverywhere() {
    Alert.alert('Sign out of all devices?', 'Every phone and browser signed in to this account will be signed out, including this one.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out everywhere', style: 'destructive', onPress: () => supabase.auth.signOut({ scope: 'global' }) },
    ]);
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>Security</Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name="mail" size={19} color={colors.ink700} />
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyBold, color: colors.ink900 }}>{session?.user.email ?? session?.user.phone}</Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.ink500 }}>
            BlinkRest uses one-time codes sent to your email instead of a password, so there&rsquo;s nothing to reset — just request a fresh code any time you sign in.
          </Text>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.ink900 }}>Your name</Text>
          <Text style={{ fontSize: 13, color: colors.ink500 }}>Shown to teammates on the Staff screen instead of your email.</Text>
          <TextField label="Full name" value={name} onChangeText={setName} placeholder="e.g. Aarna Bhateja" autoCapitalize="words" />
          <Pressable
            disabled={saving || name.trim() === savedName}
            onPress={saveName}
            style={{ height: 48, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center', opacity: saving || name.trim() === savedName ? 0.5 : 1 }}
          >
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>{saving ? 'Saving…' : 'Save name'}</Text>
          </Pressable>
        </View>

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4C7C1', padding: 16, gap: 10 }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.display, color: colors.error }}>Signed-in devices</Text>
          <Text style={{ fontSize: 13, color: colors.ink700 }}>If you lost a phone or suspect unauthorised access, sign out of every device at once.</Text>
          <Pressable onPress={signOutEverywhere} style={{ height: 50, borderRadius: radius.pill, borderWidth: 1.5, borderColor: '#F4C7C1', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon name="logout" size={19} color={colors.error} />
            <Text style={{ fontFamily: fonts.bodyExtraBold, color: colors.error, fontSize: 14 }}>Sign out of all devices</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
