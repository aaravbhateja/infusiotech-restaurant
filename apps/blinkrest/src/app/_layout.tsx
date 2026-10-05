import {
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BrandSplash } from '@/components/BrandSplash';
import { OfflineBanner } from '@/components/OfflineBanner';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

// Native fonts load in a fraction of a second, which cut the branded splash
// off before its entrance animation (and footer) ever finished.
const SPLASH_MIN_MS = 2200;

export default function RootLayout() {
  const [splashMinElapsed, setSplashMinElapsed] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => setSplashMinElapsed(true), SPLASH_MIN_MS);
    return () => clearTimeout(t);
  }, []);

  const [fontsLoaded] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppGate fontsLoaded={fontsLoaded} splashMinElapsed={splashMinElapsed} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// One splash, held until fonts, the minimum display time AND the initial
// auth check are all done. Previously the root showed one copy and the index
// route mounted a second while auth loaded, so the animation visibly restarted.
//
// Web skips it: fonts there are a network download, and this gate sits in
// front of every route — including the public QR ordering page a guest
// reaches cold on weak venue wifi. Blocking on it turned "scan QR" into
// "stare at a splash screen"; text falls back to a system font briefly.
function AppGate({ fontsLoaded, splashMinElapsed }: { fontsLoaded: boolean; splashMinElapsed: boolean }) {
  const { loading: authLoading } = useAuth();

  if (Platform.OS !== 'web' && (!fontsLoaded || !splashMinElapsed || authLoading)) {
    return <BrandSplash />;
  }

  return (
    <>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="select-restaurant" />
        <Stack.Screen name="login" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="accept-invite" />
        <Stack.Screen name="admin-login" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="(staff)" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="account-deletion" />
        <Stack.Screen name="order/[token]" />
        <Stack.Screen name="r/[slug]/[table]" />
      </Stack>
    </>
  );
}
