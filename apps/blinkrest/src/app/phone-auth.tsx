import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { FormErrorBanner } from '@/components/States';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme/tokens';

type Mode = 'signup' | 'signin' | 'reset' | 'invite';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const COPY: Record<Mode, { title: string; body: string }> = {
  signup: { title: 'Sign up with your mobile', body: 'We’ll text you a code to confirm your number, then you set a password.' },
  invite: { title: 'Join your team', body: 'Confirm your mobile number with a text code, then set a password.' },
  signin: { title: 'Welcome back', body: 'Log in with your mobile number and password.' },
  reset: { title: 'Reset your password', body: 'We’ll text a code to your number so you can set a new password.' },
};

const ERRORS: Record<string, string> = {
  invalid_phone: 'Enter a valid 10-digit Indian mobile number.',
  invalid_code: 'That code is wrong or has expired.',
  too_many_attempts: 'Too many wrong tries. Request a new code.',
  wait_before_resend: 'Please wait a few seconds before asking for another code.',
  too_many_requests: 'Too many codes requested. Try again in an hour.',
  weak_password: 'Use at least 8 characters for your password.',
  already_registered: 'This number already has an account — log in instead.',
  no_account: 'No account found for this number.',
  sms_failed: 'We couldn’t send the text. Please try again in a moment.',
  sms_not_configured: 'Mobile sign-up isn’t available right now. Use your email instead.',
};

// Must match the edge function: the number is only turned into a login id,
// nothing is ever emailed to it.
const loginEmail = (ten: string) => `${ten}@phone.blinkrest.app`;

async function callPhoneOtp(body: object): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/phone-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ error: 'request_failed' }));
}

export default function PhoneAuth() {
  const { intent } = useLocalSearchParams<{ intent?: Mode }>();
  const [mode, setMode] = useState<Mode>(intent ?? 'signin');
  const { refreshMembership, memberships } = useAuth();
  const isOnline = useIsOnline();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const ten = phone.replace(/\D/g, '').slice(-10);
  const validPhone = /^[6-9]\d{9}$/.test(ten);
  const isSignin = mode === 'signin';
  const copy = COPY[mode];

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function fail(key?: string) {
    setError((key && ERRORS[key]) || 'Something went wrong. Please try again.');
  }

  async function sendCode() {
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    const res = await callPhoneOtp({ action: 'send', phone: ten });
    setLoading(false);
    if (!res.ok) return fail(res.error);
    setCodeSent(true);
    setCooldown(30);
  }

  async function signInWithPhone(pw: string) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail(ten), password: pw });
    if (signInError) return false;
    const membership = await refreshMembership();
    if (membership) router.replace('/');
    else if (memberships.length > 1) router.replace('/select-restaurant');
    else router.replace(mode === 'invite' ? '/accept-invite' : mode === 'signin' ? '/' : '/onboarding');
    return true;
  }

  async function submit() {
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);

    if (isSignin) {
      const ok = await signInWithPhone(password);
      setLoading(false);
      if (!ok) setError('Incorrect mobile number or password.');
      return;
    }

    const res = await callPhoneOtp({ action: mode === 'reset' ? 'reset' : 'signup', phone: ten, code: code.trim(), password });
    if (!res.ok) {
      setLoading(false);
      return fail(res.error);
    }
    if (mode === 'reset') {
      setLoading(false);
      Alert.alert('Password updated', 'Log in with your new password.');
      setMode('signin');
      setCodeSent(false);
      setCode('');
      setPassword('');
      return;
    }
    const ok = await signInWithPhone(password);
    setLoading(false);
    if (!ok) setError('Account created, but we couldn’t sign you in. Try logging in.');
  }

  const showCodeStep = !isSignin && codeSent;
  const canSubmit = isSignin ? validPhone && password.length > 0 : validPhone && /^\d{6}$/.test(code.trim()) && password.length >= 8;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
          </Pressable>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>{copy.title}</Text>
            <Text style={{ fontSize: 15, fontFamily: fonts.body, color: colors.ink700 }}>{copy.body}</Text>
          </View>

          <FormErrorBanner message={error} />

          <TextField
            label="Mobile number"
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              setError(null);
              if (codeSent) setCodeSent(false);
            }}
            placeholder="98765 43210"
            keyboardType="phone-pad"
            maxLength={14}
            editable={!showCodeStep}
          />

          {isSignin ? (
            <>
              <TextField label="Password" value={password} onChangeText={(v) => { setPassword(v); setError(null); }} placeholder="••••••••" secureTextEntry />
              <Text onPress={() => { setMode('reset'); setError(null); setPassword(''); }} style={{ alignSelf: 'flex-end', fontSize: 13, fontFamily: fonts.bodyExtraBold, color: colors.coral600 }}>
                Forgot password?
              </Text>
            </>
          ) : null}

          {showCodeStep ? (
            <>
              <TextField label="6-digit code" value={code} onChangeText={(v) => { setCode(v.replace(/\D/g, '')); setError(null); }} placeholder="123456" keyboardType="number-pad" maxLength={6} />
              <TextField
                label={mode === 'reset' ? 'New password' : 'Create a password'}
                value={password}
                onChangeText={(v) => { setPassword(v); setError(null); }}
                placeholder="At least 8 characters"
                secureTextEntry
              />
              <Text
                onPress={cooldown > 0 || loading ? undefined : sendCode}
                style={{ alignSelf: 'flex-start', fontSize: 13, fontFamily: fonts.bodyExtraBold, color: cooldown > 0 ? colors.ink500 : colors.coral600 }}
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </>
          ) : null}

          <Button
            title={loading ? 'Please wait...' : isSignin ? 'Log in' : showCodeStep ? (mode === 'reset' ? 'Update password' : 'Create account') : 'Send code'}
            onPress={isSignin || showCodeStep ? submit : sendCode}
            disabled={loading || (isSignin || showCodeStep ? !canSubmit : !validPhone)}
            loading={loading}
          />

          <View style={{ marginTop: 'auto', gap: 12, alignItems: 'center' }}>
            {isSignin ? (
              <Text onPress={() => { setMode('signup'); setError(null); }} style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700 }}>
                New here? <Text style={{ color: colors.coral600, fontFamily: fonts.bodyExtraBold }}>Create an account</Text>
              </Text>
            ) : (
              <Text onPress={() => { setMode('signin'); setCodeSent(false); setError(null); }} style={{ fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700 }}>
                Already have an account? <Text style={{ color: colors.coral600, fontFamily: fonts.bodyExtraBold }}>Log in</Text>
              </Text>
            )}
            <Text onPress={() => router.replace({ pathname: '/login', params: { intent: mode === 'invite' ? 'invite' : mode === 'signup' ? 'signup' : 'signin' } })} style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.ink500 }}>
              Use email instead
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
