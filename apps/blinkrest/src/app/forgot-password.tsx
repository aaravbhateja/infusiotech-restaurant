import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push({ pathname: '/otp', params: { email: email.trim(), intent: 'reset' } });
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 24, gap: 22 }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>

          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: colors.coral50, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={28} color={colors.coral600} />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
              Reset your password
            </Text>
            <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.ink700 }}>
              Enter your email — we&rsquo;ll send a one-time code to verify it&rsquo;s you, then you can set a new password.
            </Text>
          </View>

          <TextField
            label="Email address"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            error={error ?? undefined}
          />

          <Button title={loading ? 'Please wait...' : 'Send code'} onPress={sendCode} disabled={!email.includes('@') || loading} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
