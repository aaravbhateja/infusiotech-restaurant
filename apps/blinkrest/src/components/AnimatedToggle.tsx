import { Pressable } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useDerivedValue, withSpring, withTiming } from 'react-native-reanimated';

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 30;
const THUMB_SIZE = 24;
const PADDING = 3;

export function AnimatedToggle({
  value,
  onValueChange,
  onColor,
  offColor = '#D8CCC4',
  disabled,
}: {
  value: boolean;
  onValueChange: () => void;
  onColor: string;
  offColor?: string;
  disabled?: boolean;
}) {
  const progress = useDerivedValue(() => withTiming(value ? 1 : 0, { duration: 180 }), [value]);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, onColor]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withSpring(progress.value * (TRACK_WIDTH - THUMB_SIZE - PADDING * 2), { damping: 16, stiffness: 300 }) },
    ],
  }));

  return (
    <Pressable onPress={onValueChange} disabled={disabled} hitSlop={8}>
      <Animated.View
        style={[
          { width: TRACK_WIDTH, height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, padding: PADDING, justifyContent: 'center' },
          trackStyle,
        ]}
      >
        <Animated.View style={[{ width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2, backgroundColor: '#FFFFFF' }, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}
