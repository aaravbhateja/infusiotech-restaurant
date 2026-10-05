import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/hooks/useAuth';
import { colors, fonts, radius } from '@/theme/tokens';

import { Icon } from './Icon';

// Wraps a sensitive screen (Settings, Staff, Offers management, ...) so
// navigating straight to its URL — a deep link, browser back/forward, a
// stale button, typing it on web — can't bypass what the role picker and
// bottom nav already hide. The backend still enforces every write via
// has_permission(); this is what stops someone from even *seeing* the
// screen they're not supposed to use.
export function RequireAccess({ permission, children }: { permission: string; children: ReactNode }) {
  const { membership, loading } = useAuth();

  if (loading || !membership) return null;

  if (!membership.permissions.has(permission)) {
    return (
      <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: colors.errorBg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="lock" size={28} color={colors.error} />
          </View>
          <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900, textAlign: 'center' }}>
            You don&rsquo;t have access to this
          </Text>
          <Text style={{ fontSize: 14, color: colors.ink700, textAlign: 'center', maxWidth: 280 }}>
            This is restricted to your {membership.roleName === 'Owner' ? 'role' : "restaurant's owner or manager"}. Ask
            them if you need it.
          </Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            style={{ marginTop: 10, height: 50, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 15 }}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}
