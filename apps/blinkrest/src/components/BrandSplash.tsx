import { useEffect, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

import { Logo } from '@/components/Logo';
import { fonts } from '@/theme/tokens';

function useRing(delay: number) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(2400 - delay),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value, delay]);
  return value;
}

export function BrandSplash() {
  const ring1 = useRing(0);
  const ring2 = useRing(1200);
  const [blink] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(1440),
        Animated.timing(blink, { toValue: 0.92, duration: 240, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1.06, duration: 240, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 480, useNativeDriver: true }),
        Animated.delay(960),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);

  const ringStyle = (v: Animated.Value) => ({
    position: 'absolute' as const,
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }],
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#FF5A36', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={ringStyle(ring1)} />
      <Animated.View style={ringStyle(ring2)} />
      <View style={{ alignItems: 'center', gap: 22 }}>
        <Animated.View style={{ transform: [{ scale: blink }] }}>
          <Logo variant="mark" tone="white" size={120} knock="#FF5A36" />
        </Animated.View>
        <Text style={{ fontFamily: fonts.display, fontSize: 44, letterSpacing: -2 }}>
          <Text style={{ color: '#FFFFFF' }}>Blink</Text>
          <Text style={{ color: '#1B1716' }}>Rest</Text>
        </Text>
        <Text style={{ fontSize: 16, fontFamily: fonts.bodyBold, color: '#1B1716' }}>Your Restaurant. One Blink Away.</Text>
      </View>
      <View style={{ position: 'absolute', bottom: 48, alignItems: 'center', gap: 14 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#1B1716' }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(27,23,22,0.35)' }} />
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(27,23,22,0.35)' }} />
        </View>
        <Text style={{ fontSize: 13, fontFamily: fonts.bodyBold, color: '#1B1716', letterSpacing: 0.5 }}>
          A PRODUCT BY INFUSIOTECH
        </Text>
      </View>
    </View>
  );
}
