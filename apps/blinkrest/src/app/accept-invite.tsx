import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { isAlreadyMemberError } from '@/lib/authErrors';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const MIN_PASSWORD_LENGTH = 8;

type Preview = { tenant_name: string; role_name: string; invitee_name: string | null; inviter_name: string | null };

export default function AcceptInvite() {
  const { refreshMembership } = useAuth();
  const isOnline = useIsOnline();
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    const code = token.trim();
    if (!code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing preview when the field empties
      setPreview(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error: previewErr } = await supabase.rpc('preview_staff_invitation', { p_raw_token: code });
      if (cancelled) return;
      if (previewErr || !data) {
        setPreview(null);
        setPreviewError("That code isn't valid or has expired.");
      } else {
        setPreview(data as Preview);
        setPreviewError(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [token]);

  async function accept() {
    if (loading) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords don’t match.');
      return;
    }
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    setPasswordError(null);

    const { error: passwordUpdateError } = await supabase.auth.updateUser({ password });
    if (passwordUpdateError) {
      setLoading(false);
      setPasswordError(passwordUpdateError.message);
      return;
    }

    const { error } = await supabase.rpc('accept_staff_invitation', { p_raw_token: token.trim() });
    if (error) {
      if (isAlreadyMemberError(error.message)) {
        await refreshMembership();
        router.replace('/(staff)/home');
        return;
      }
      setLoading(false);
      setError(error.message.includes('not_authenticated') ? 'Please sign in first.' : 'Invalid or expired invite code.');
      return;
    }
    await refreshMembership();
    router.replace('/(staff)/home');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: 24, gap: 22, justifyContent: 'center' }}>
        <View
          style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.saffron50, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="users" size={28} color="#8A5A00" />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 28, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
            Join a team
          </Text>
          <Text style={{ fontSize: 15, color: colors.ink700, fontFamily: fonts.body }}>
            Enter the invite code your manager shared with you, and set a password for your account.
          </Text>
        </View>

        <TextField
          label="Invite code"
          value={token}
          onChangeText={setToken}
          placeholder="Paste your invite code"
          autoCapitalize="none"
          error={error ?? previewError ?? undefined}
        />

        {preview ? (
          <View style={{ backgroundColor: colors.successBg, borderRadius: radius.lg, padding: 16, gap: 6 }}>
            <Text style={{ fontSize: 16, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              Join {preview.tenant_name} as {preview.role_name}
            </Text>
            {preview.inviter_name ? (
              <Text style={{ fontSize: 13, color: colors.ink700 }}>Invited by {preview.inviter_name}</Text>
            ) : null}
          </View>
        ) : null}

        <TextField
          label="Create a password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            setPasswordError(null);
          }}
          placeholder="At least 8 characters"
          secureTextEntry
        />
        <TextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={(v) => {
            setConfirmPassword(v);
            setPasswordError(null);
          }}
          placeholder="Re-enter password"
          secureTextEntry
          error={passwordError ?? undefined}
        />

        <Button
          title={loading ? 'Joining...' : 'Accept & join team'}
          onPress={accept}
          disabled={!token.trim() || password.length < MIN_PASSWORD_LENGTH || !confirmPassword || loading}
          loading={loading}
        />

        <Text
          onPress={() => router.replace('/onboarding')}
          style={{ textAlign: 'center', fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700 }}
        >
          Don&apos;t have a code? Create your own restaurant instead
        </Text>
      </View>
    </SafeAreaView>
  );
}
