import { LinearGradient } from 'expo-linear-gradient';
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

import { Logo } from '@/components/Logo';
import { Wordmark } from '@/components/Wordmark';
import { fonts } from '@/theme/tokens';

const BG = '#120F0E';
const ORANGE = '#FF5A36';
const YELLOW = '#FFC93C';
const EASE_OUT = Easing.bezier(0.2, 0.8, 0.2, 1);
const ICON = 112;

// Matches SPLASH_MIN_MS in the root layout, so the bar fills just as the
// splash hands over to the app.
const LOAD_MS = 2200;

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
  const load = useSharedValue(0);

  useEffect(() => {
    iconOpacity.value = withTiming(1, { duration: 540, easing: EASE_OUT });
    iconScale.value = withSequence(
      withTiming(1.04, { duration: 540, easing: EASE_OUT }),
      withTiming(1, { duration: 360, easing: EASE_OUT }),
    );
    glow.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1, true);
    shine.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    load.value = withDelay(600, withTiming(1, { duration: LOAD_MS - 600, easing: Easing.bezier(0.4, 0, 0.2, 1) }));
  }, [iconScale, iconOpacity, glow, shine, load]);

  const iconStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value, transform: [{ scale: iconScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.6 + glow.value * 0.3, transform: [{ scale: 1 + glow.value * 0.06 }] }));
  const shineStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -ICON * 0.7 + shine.value * ICON * 2 }, { rotate: '20deg' }],
  }));
  const loadStyle = useAnimatedStyle(() => ({ width: `${load.value * 100}%` }));
  const orbit1 = useSpin(24000);
  const orbit2 = useSpin(36000, true);
  const rise1 = useRise(350);
  const rise2 = useRise(550);
  const rise3 = useRise(750);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#1E1714', BG, '#0A0807']} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />

      <View style={styles.flex} />

      <View style={styles.cluster}>
        <Animated.View style={[styles.centered, { width: 560, height: 560 }, glowStyle]}>
          <Svg width={560} height={560}>
            <Defs>
              <RadialGradient id="g" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={ORANGE} stopOpacity={0.42} />
                <Stop offset="0.36" stopColor={ORANGE} stopOpacity={0.1} />
                <Stop offset="0.7" stopColor={BG} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={280} cy={280} r={280} fill="url(#g)" />
          </Svg>
        </Animated.View>

        <Animated.View style={[styles.centered, styles.ring, { width: 260, height: 260, borderRadius: 130, borderColor: 'rgba(255,255,255,0.09)' }, orbit1]}>
          <View style={[styles.dot, { top: -4, left: 126, width: 8, height: 8, borderRadius: 4, backgroundColor: YELLOW, shadowColor: YELLOW }]} />
        </Animated.View>
        <Animated.View style={[styles.centered, styles.ring, { width: 380, height: 380, borderRadius: 190, borderColor: 'rgba(255,255,255,0.055)' }, orbit2]}>
          <View style={[styles.dot, { bottom: 36, right: 42, width: 5, height: 5, borderRadius: 3, backgroundColor: ORANGE, shadowColor: ORANGE }]} />
        </Animated.View>
        <View style={[styles.centered, styles.ring, { width: 500, height: 500, borderRadius: 250, borderColor: 'rgba(255,255,255,0.03)' }]} />

        <Animated.View style={[styles.iconShadow, iconStyle]}>
          <View style={styles.icon}>
            <Logo variant="icon" size={ICON} />
            <Animated.View style={[styles.shine, shineStyle]} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      <View style={styles.words}>
        <Animated.View style={rise1}>
          <Wordmark height={40} />
        </Animated.View>
        <Animated.View style={[styles.taglineRow, rise2]}>
          <LinearGradient colors={['rgba(201,189,182,0)', 'rgba(201,189,182,0.6)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
          <Text style={styles.tagline}>ONE BLINK AWAY</Text>
          <LinearGradient colors={['rgba(201,189,182,0.6)', 'rgba(201,189,182,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.rule} />
        </Animated.View>
      </View>

      <View style={styles.flex} />

      <Animated.View style={[styles.footer, rise3]}>
        <View style={styles.loadTrack}>
          <Animated.View style={[styles.loadFill, loadStyle]}>
            <LinearGradient colors={[ORANGE, YELLOW]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
        <Text style={styles.craftedBy}>CRAFTED BY</Text>
        <Text style={styles.brand}>INFUSIOTECH</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG, alignItems: 'center', overflow: 'hidden' },
  flex: { flex: 1 },
  cluster: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  centered: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1 },
  dot: { position: 'absolute', shadowOpacity: 0.9, shadowRadius: 7, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  iconShadow: {
    borderRadius: 28,
    shadowColor: ORANGE,
    shadowOpacity: 0.5,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 18,
  },
  icon: { width: ICON, height: ICON, borderRadius: 28, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  shine: { position: 'absolute', top: -30, left: 0, width: 44, height: 180 },
  words: { marginTop: 56, alignItems: 'center', gap: 16 },
  taglineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { width: 28, height: 1 },
  tagline: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 4, color: '#C9BDB6' },
  footer: { marginBottom: 52, alignItems: 'center', gap: 6 },
  loadTrack: { width: 120, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', marginBottom: 18 },
  loadFill: { height: 2, borderRadius: 1, overflow: 'hidden' },
  craftedBy: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 3, color: 'rgba(255,255,255,0.5)' },
  brand: { fontFamily: fonts.bodyExtraBold, fontSize: 14, letterSpacing: 4, color: '#FFFFFF' },
});
