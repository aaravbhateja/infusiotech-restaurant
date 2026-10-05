import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { colors, fonts, radius } from '@/theme/tokens';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'outline' | 'danger-outline';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);
  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bg = isDisabled
    ? colors.disabledBg
    : variant === 'primary'
      ? colors.coral600
      : variant === 'secondary'
        ? colors.ink900
        : colors.surface;

  const fg = isDisabled
    ? colors.disabledFg
    : variant === 'primary' || variant === 'secondary'
      ? '#FFFFFF'
      : variant === 'danger-outline'
        ? colors.error
        : colors.ink900;

  const border =
    variant === 'outline' ? colors.inputBorder : variant === 'danger-outline' ? '#F4C7C1' : 'transparent';

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated by design
        scale.value = withSpring(0.96, { damping: 16, stiffness: 400 });
      }}
      onPressOut={() => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated by design
        scale.value = withSpring(1, { damping: 12, stiffness: 300 });
      }}
      disabled={isDisabled}
      style={[
        {
          height: 52,
          paddingHorizontal: 26,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: variant.includes('outline') ? 1.5 : 0,
          borderColor: border,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
        },
        pressedStyle,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 16, fontFamily: fonts.bodyExtraBold }}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}
