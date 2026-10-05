import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const MIN_LENGTH = 8;

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords don’t match.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.replace('/');
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 24, gap: 22 }}>
          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.successBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={28} color={colors.success} />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
              Set a new password
            </Text>
            <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.ink700 }}>
              You&rsquo;re verified — choose a new password to sign in with from now on.
            </Text>
          </View>

          <TextField
            label="New password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(null);
            }}
            placeholder="At least 8 characters"
            secureTextEntry
            error={undefined}
          />
          <TextField
            label="Confirm new password"
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              setError(null);
            }}
            placeholder="Re-enter password"
            secureTextEntry
            error={error ?? undefined}
          />

          <Button title={loading ? 'Saving...' : 'Save password'} onPress={save} disabled={!password || !confirm || loading} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
