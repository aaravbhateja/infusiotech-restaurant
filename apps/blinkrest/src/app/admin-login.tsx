import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

// A platform-console sign-in, deliberately separate from the restaurant
// staff login — same underlying Supabase auth, but a super admin is never a
// tenant_membership, so this never touches the restaurant onboarding flow.
export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setLoading(false);
      setError('Incorrect email or password.');
      return;
    }
    const { data: isAdmin, error: checkError } = await supabase.rpc('is_super_admin');
    setLoading(false);
    if (checkError || !isAdmin) {
      setError('This account does not have platform admin access.');
      await supabase.auth.signOut();
      return;
    }
    router.replace('/admin' as never);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.ink900 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, padding: 24, gap: 22, justifyContent: 'center' }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: colors.saffron400, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="shield" size={26} color={colors.ink900} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 28, fontFamily: fonts.display, color: '#FFFFFF' }}>Platform console</Text>
            <Text style={{ fontSize: 14, color: '#C9BDB6' }}>InfusioTech staff only.</Text>
          </View>

          <View style={{ gap: 14 }}>
            <TextField
              label="Email"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              placeholder="you@infusiotech.com"
              keyboardType="email-address"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              placeholder="••••••••"
              secureTextEntry
              error={error ?? undefined}
            />
          </View>

          <Button title={loading ? 'Please wait…' : 'Sign in'} onPress={signIn} loading={loading} disabled={!email.includes('@') || !password} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
