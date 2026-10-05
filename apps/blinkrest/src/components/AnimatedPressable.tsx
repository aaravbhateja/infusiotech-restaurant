import { Pressable, type PressableProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

const Base = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({ scaleTo = 0.95, style, ...props }: PressableProps & { scaleTo?: number }) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Base
      {...props}
      onPressIn={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated by design
        scale.value = withSpring(scaleTo, { damping: 16, stiffness: 400 });
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared values are mutated by design
        scale.value = withSpring(1, { damping: 12, stiffness: 300 });
        props.onPressOut?.(e);
      }}
      style={[style as any, animatedStyle]}
    />
  );
}
