import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/hooks/useIsOnline';
import { guardOnline } from '@/lib/offline';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius } from '@/theme/tokens';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function Otp() {
  const { email, intent } = useLocalSearchParams<{ email: string; intent?: string }>();
  const { refreshMembership, memberships } = useAuth();
  const isOnline = useIsOnline();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function verify(fullCode: string) {
    if (!guardOnline(isOnline)) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: fullCode, type: 'email' });
    setLoading(false);
    if (error) {
      setError('Incorrect or expired code.');
      return;
    }

    if (intent === 'reset') {
      router.replace('/reset-password');
      return;
    }

    const membership = await refreshMembership();

    if (membership) {
      if (intent === 'signup') Alert.alert('You already have a restaurant', `Taking you to ${membership.tenantName}.`);
      else if (intent === 'invite') Alert.alert("You're already part of a team", `Taking you to ${membership.tenantName}.`);
      router.replace('/');
      return;
    }

    if (memberships.length > 1) {
      router.replace('/select-restaurant');
      return;
    }

    if (intent === 'invite') {
      router.replace('/accept-invite');
      return;
    }

    if (intent === 'signin') {
      Alert.alert("We couldn't find a restaurant for this email", "Let's set one up now.");
    }
    router.replace('/onboarding');
  }

  async function resend() {
    if (!guardOnline(isOnline)) return;
    setResendIn(RESEND_SECONDS);
    await supabase.auth.signInWithOtp({ email });
  }

  function onChangeCode(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) verify(digits);
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, padding: 24, gap: 22 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="left" size={22} stroke={2.2} color={colors.ink900} />
        </Pressable>

        <View style={{ gap: 10 }}>
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 20,
              backgroundColor: '#FFE4DA',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="message" size={30} stroke={2} color={colors.coral600} />
          </View>
          <Text style={{ fontSize: 30, fontFamily: fonts.display, color: colors.ink900, letterSpacing: -1 }}>
            Enter the code
          </Text>
          <Text style={{ fontSize: 15, color: colors.ink700, fontFamily: fonts.body }}>
            Sent to {email} ·{' '}
            <Text onPress={() => router.back()} style={{ fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>
              Edit
            </Text>
          </Text>
        </View>

        <Pressable onPress={() => inputRef.current?.focus()}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {Array.from({ length: CODE_LENGTH }).map((_, i) => {
              const filled = i < code.length;
              const active = i === code.length;
              return (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 60,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: active ? 2 : 1.5,
                    borderColor: active ? colors.ink900 : error ? colors.error : colors.inputBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 26, fontFamily: fonts.display, color: colors.ink900 }}>
                    {filled ? code[i] : ''}
                  </Text>
                </View>
              );
            })}
          </View>
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={onChangeCode}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
          />
        </Pressable>

        {error ? (
          <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: colors.error }}>{error}</Text>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 14, color: colors.ink700, fontFamily: fonts.body }}>
            {resendIn > 0 ? (
              <>Resend code in <Text style={{ fontFamily: fonts.bodyExtraBold }}>0:{String(resendIn).padStart(2, '0')}</Text></>
            ) : (
              <Text onPress={resend} style={{ fontFamily: fonts.bodyExtraBold, color: colors.success }}>
                Resend code
              </Text>
            )}
          </Text>
        </View>

        <Button
          title={loading ? 'Verifying...' : 'Verify & continue'}
          onPress={() => verify(code)}
          disabled={code.length < CODE_LENGTH || loading}
          loading={loading}
          style={{ marginTop: 'auto' }}
        />
      </View>
    </SafeAreaView>
  );
}
