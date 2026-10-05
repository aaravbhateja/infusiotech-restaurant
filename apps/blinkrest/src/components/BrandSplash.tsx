import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { Logo } from '@/components/Logo';
import { fonts } from '@/theme/tokens';

const BG = '#120F0E';
const ORANGE = '#FF5A36';
const YELLOW = '#FFC93C';
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const ICON = 120;

function useRise(delay: number) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 700, easing: EASE_OUT }));
  }, [p, delay]);
  return useAnimatedStyle(() => ({ opacity: p.value, transform: [{ translateY: (1 - p.value) * 14 }] }));
}

function useSpin(duration: number, reverse = false) {
  const r = useSharedValue(0);
  useEffect(() => {
    r.value = withRepeat(withTiming(reverse ? -360 : 360, { duration, easing: Easing.linear }), -1);
  }, [r, duration, reverse]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
}

export function BrandSplash() {
  const iconScale = useSharedValue(0.72);
  const iconOpacity = useSharedValue(0);
  const glow = useSharedValue(0);
  const shine = useSharedValue(0);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 540, easing: EASE_OUT });
    iconScale.value = withSequence(
      withTiming(1.04, { duration: 540, easing: EASE_OUT }),
      withTiming(1, { duration: 360, easing: EASE_OUT }),
    );
    glow.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true);
    // Sweep across during the last part of each 3.2s cycle, rest otherwise.
    shine.value = withDelay(
      1000,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 1760 }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 640 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [iconScale, iconOpacity, glow, shine]);

  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value, transform: [{ scale: iconScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.55 + glow.value * 0.3, transform: [{ scale: 1 + glow.value * 0.06 }] }));
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -ICON * 0.6 + shine.value * ICON * 1.9 }, { rotate: '20deg' }],
  }));
  const orbit1 = useSpin(24000);
  const orbit2 = useSpin(36000, true);
  const rise1 = useRise(450);
  const rise2 = useRise(700);
  const rise3 = useRise(1000);

  return (
    <View style={styles.root}>
      <View style={styles.spacerTop} />

      <View style={styles.cluster}>
        <Animated.View style={[styles.centered, { width: 520, height: 520 }, glowStyle]}>
          <Svg width={520} height={520}>
            <Defs>
              <RadialGradient id="g" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={ORANGE} stopOpacity={0.38} />
                <Stop offset="0.38" stopColor={ORANGE} stopOpacity={0.1} />
                <Stop offset="0.68" stopColor={BG} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={260} cy={260} r={260} fill="url(#g)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.centered, styles.ring, { width: 300, height: 300, borderRadius: 150, borderColor: 'rgba(255,255,255,0.08)' }, orbit1]}>
          <View style={[styles.dot, { top: -4, left: 146, width: 8, height: 8, borderRadius: 4, backgroundColor: YELLOW, shadowColor: YELLOW }]} />
        </Animated.View>
        <Animated.View style={[styles.centered, styles.ring, { width: 420, height: 420, borderRadius: 210, borderColor: 'rgba(255,255,255,0.05)' }, orbit2]}>
          <View style={[styles.dot, { bottom: 40, right: 46, width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, shadowColor: ORANGE }]} />
        </Animated.View>
        <View style={[styles.centered, styles.ring, { width: 540, height: 540, borderRadius: 270, borderColor: 'rgba(255,255,255,0.035)' }]} />

        <Animated.View style={[styles.icon, iconStyle]}>
          <Logo variant="icon" size={ICON} />
          <Animated.View style={[styles.shine, shineStyle]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.words}>
        <Animated.Text style={[styles.wordmark, rise1]}>
          <Text style={{ color: '#FFFFFF' }}>Blink</Text>
          <Text style={{ color: ORANGE }}>Rest</Text>
        </Animated.Text>
        <Animated.View style={[styles.taglineRow, rise2]}>
          <View style={styles.rule} />
          <Text style={styles.tagline}>ONE BLINK AWAY</Text>
          <View style={styles.rule} />
        </Animated.View>
      </View>

      <View style={styles.spacerBottom} />

      <Animated.Text style={[styles.footer, rise3]}>
        CRAFTED BY <Text style={styles.footerBrand}>INFUSIOTECH</Text>
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center', overflow: 'hidden' },
  spacerTop: { flex: 0.85 },
  spacerBottom: { flex: 1 },
  cluster: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  centered: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1 },
  dot: { position: 'absolute', shadowOpacity: 0.9, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  icon: {
    width: ICON,
    height: ICON,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: ORANGE,
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
    elevation: 16,
  },
  shine: { position: 'absolute', top: -30, left: 0, width: 46, height: 180 },
  words: { marginTop: 62, alignItems: 'center', gap: 14 },
  wordmark: { fontFamily: fonts.display, fontSize: 46, letterSpacing: -2.3, lineHeight: 50 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { width: 22, height: 1, backgroundColor: 'rgba(201,189,182,0.5)' },
  tagline: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 3.8, color: '#C9BDB6' },
  footer: { marginBottom: 54, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2, color: '#9A8F8B' },
  footerBrand: { fontFamily: fonts.bodyExtraBold, color: '#FFFFFF' },
});
