import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { colors, fonts, radius } from '@/theme/tokens';

export default function Welcome() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ height: 300, backgroundColor: '#FFE9DE', borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden', justifyContent: 'flex-end' }}>
        <View
          style={{
            margin: 20,
            backgroundColor: '#FFFFFF',
            borderRadius: 20,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: colors.ink900, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="bolt" size={20} stroke={2.2} color={colors.saffron400} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: fonts.bodyExtraBold, color: colors.ink900 }}>New order · Table 7</Text>
            <Text style={{ fontSize: 12, color: colors.ink500 }}>4 items · ₹1,266 · just now</Text>
          </View>
          <View style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' }}>Accept</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1, padding: 24, gap: 14 }}>
        <Text style={{ fontSize: 22, fontFamily: fonts.display, color: colors.ink900 }}>BlinkRest</Text>
        <Text style={{ fontSize: 32, fontFamily: fonts.display, color: colors.ink900, lineHeight: 36, letterSpacing: -1.2 }}>
          Run your restaurant at the speed of a blink.
        </Text>
        <Text style={{ fontSize: 15, color: colors.ink700, fontFamily: fonts.body, lineHeight: 22 }}>
          Orders, menu, tables, staff and payments — one app for the whole team.
        </Text>

        <View style={{ marginTop: 'auto', gap: 10 }}>
          <Pressable
            onPress={() => router.push({ pathname: '/login', params: { intent: 'signup' } })}
            style={{ height: 56, borderRadius: radius.pill, backgroundColor: colors.coral600, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>Set up my restaurant</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/login', params: { intent: 'signin' } })}
            style={{ height: 56, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.inputBorder, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.ink900, fontFamily: fonts.bodyExtraBold, fontSize: 16 }}>I already have an account</Text>
          </Pressable>
          <Text
            onPress={() => router.push({ pathname: '/login', params: { intent: 'invite' } })}
            style={{ textAlign: 'center', fontSize: 14, fontFamily: fonts.bodyBold, color: colors.ink700 }}
          >
            Joining a team? <Text style={{ color: colors.coral600, textDecorationLine: 'underline' }}>Use your invite</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
