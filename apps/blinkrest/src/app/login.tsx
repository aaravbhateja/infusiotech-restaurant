import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

const COPY = {
  signup: { title: 'Create your account', body: 'Enter your email — we’ll send a one-time code, then set your restaurant up.' },
  signin: { title: 'Welcome back', body: 'Log in with your email and password.' },
  invite: { title: 'Join your team', body: 'Enter your email — after the code, you’ll enter your invite.' },
} as const;

export default function Login() {
  const { intent } = useLocalSearchParams<{ intent?: keyof typeof COPY }>();
  const mode = intent ?? 'signin';
  const copy = COPY[mode] ?? COPY.signin;
  const { refreshMembership, memberships } = useAuth();
  const isOnline = useIsOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push({ pathname: '/otp', params: { email: email.trim(), intent: mode } });
  }

  async function signInWithPassword() {
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError('Incorrect email or password.');
      return;
    }
    const membership = await refreshMembership();
    setLoading(false);
    if (!membership && memberships.length <= 1) {
      setError("We couldn't find a restaurant for this account.");
      return;
    }
    router.replace('/');
  }

  const isSignin = mode === 'signin';

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

          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 20,
              backgroundColor: colors.ink900,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.saffron400 }}>B</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
              {copy.title}
            </Text>
            <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.ink700 }}>
              {copy.body}
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
            error={!isSignin ? (error ?? undefined) : undefined}
          />

          {isSignin ? (
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
          ) : null}

          {isSignin ? (
            <Text
              onPress={() => router.push('/forgot-password')}
              style={{ alignSelf: 'flex-end', fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}
            >
              Forgot password?
            </Text>
          ) : null}

          <Button
            title={loading ? 'Please wait...' : isSignin ? 'Sign in' : 'Get code'}
            onPress={isSignin ? signInWithPassword : sendCode}
            disabled={!email.includes('@') || (isSignin && password.length < 1) || loading}
            loading={loading}
          />

          <View style={{ marginTop: 'auto', gap: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700, textAlign: 'center' }}>
              {isSignin
                ? 'Use the email and password your restaurant is registered with.'
                : 'One code works for both — new accounts get set up right after.'}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
