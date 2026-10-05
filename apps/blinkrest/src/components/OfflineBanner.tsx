import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/hooks/useIsOnline';
import { colors, fonts } from '@/theme/tokens';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  // Absolutely positioned overlay, not document flow: each screen already
  // reserves its own top safe-area inset via its own SafeAreaView, so a
  // banner that pushed content down would double that gap. Floating over
  // the top edge instead costs no screen any layout changes.
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: colors.ink900,
        paddingTop: insets.top + 8,
        paddingBottom: 8,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 12 }}>You&rsquo;re offline</Text>
      <Text style={{ color: '#C9BDB6', fontFamily: fonts.body, fontSize: 12 }}>— some actions are paused until you&rsquo;re back</Text>
    </View>
  );
}
