import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

type Impact = { is_super_admin: boolean; closes_restaurants: string[]; blocked_by: string[] };

function friendlyError(message: string) {
  if (message.startsWith('owner_has_team')) {
    const name = message.split(':')[1]?.trim();
    return `You're the only owner of ${name ?? 'a restaurant'} and it still has team members. Remove them first (More, then Staff), then try again.`;
  }
  if (message.includes('super_admin_cannot_delete')) return "Platform admin accounts can't be deleted from the app.";
  return message;
}

// Deliberately not behind a permission check: every role, from owner to
// kitchen staff, must be able to delete their own account.
export default function DeleteAccount() {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    const { data, error } = await supabase.rpc('get_account_deletion_impact');
    if (error || !data) setLoadError(true);
    else setImpact(data as Impact);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-mount
    load();
  }, [load]);

  const blocked = !!impact && (impact.blocked_by.length > 0 || impact.is_super_admin);
  const canDelete = !!impact && !blocked && confirmText === 'DELETE' && !deleting;

  async function deleteAccount() {
    if (!canDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc('delete_my_account', { p_confirm: 'DELETE' });
    if (error) {
      setDeleting(false);
      Alert.alert('Could not delete your account', friendlyError(error.message));
      return;
    }
    // The account no longer exists server-side, so only clear the local session.
    await supabase.auth.signOut({ scope: 'local' });
    router.replace('/welcome');
    Alert.alert('Account deleted', 'Your account and personal details have been deleted.');
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>
          <Text style={{ fontSize: 24, fontFamily: fonts.display, color: colors.ink900, flex: 1 }}>Delete account</Text>
        </View>

        <View style={{ backgroundColor: colors.errorBg, borderRadius: 20, padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="alert" size={20} color={colors.error} />
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.error }}>This can&rsquo;t be undone</Text>
          </View>
          <Text style={{ fontSize: 14, lineHeight: 21, color: colors.ink900 }}>
            Your login, name, email, phone number and notification settings are erased. Orders and payments are kept for the restaurant&rsquo;s tax records, but no longer carry your name.
          </Text>
        </View>

        {!impact && !loadError ? <ActivityIndicator color={colors.ink500} /> : null}

        {loadError ? (
          <Pressable onPress={load} style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink900 }}>Couldn&rsquo;t check your account. Tap to try again.</Text>
          </Pressable>
        ) : null}

        {impact?.is_super_admin ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.line, padding: 16 }}>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.ink900 }}>Platform admin accounts can&rsquo;t be deleted from the app.</Text>
          </View>
        ) : null}

        {impact && impact.blocked_by.length > 0 ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1.5, borderColor: colors.error, padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: colors.error }}>Remove your team first</Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.ink900 }}>
              You&rsquo;re the only owner of {impact.blocked_by.join(', ')}, and it still has team members who rely on it. Remove them under More, then Staff, and come back here.
            </Text>
          </View>
        ) : null}

        {impact && impact.closes_restaurants.length > 0 ? (
          <View style={{ backgroundColor: colors.saffron50, borderRadius: 20, padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 15, fontFamily: fonts.bodyExtraBold, color: '#8A5A00' }}>
              This also closes {impact.closes_restaurants.join(', ')}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 21, color: colors.ink900 }}>
              You&rsquo;re its only owner, so ordering stops, its QR codes stop working and the subscription is cancelled. Its bank and verification details and guests&rsquo; names and phone numbers are erased. Order and payment records are kept.
            </Text>
          </View>
        ) : null}

        <View style={{ backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 16, gap: 14 }}>
          <TextField
            label="Type DELETE to confirm"
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
            editable={!blocked && !deleting}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canDelete }}
            disabled={!canDelete}
            onPress={deleteAccount}
            style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', opacity: canDelete ? 1 : 0.4 }}
          >
            {deleting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>Delete my account</Text>}
          </Pressable>
        </View>

        <Text
          onPress={() => router.push('/privacy' as never)}
          style={{ textAlign: 'center', fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700, textDecorationLine: 'underline' }}
        >
          Privacy Policy
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
