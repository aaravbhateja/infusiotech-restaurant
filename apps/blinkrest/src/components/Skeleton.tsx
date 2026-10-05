import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(withSequence(withTiming(1, { duration: 650 }), withTiming(0.4, { duration: 650 })), -1, true);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[{ backgroundColor: '#E8DED6', borderRadius: 14 }, style, animatedStyle]} />;
}

export function MenuItemSkeleton() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 12 }}>
      <Skeleton style={{ width: 72, height: 72, borderRadius: 18 }} />
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        <Skeleton style={{ width: '70%', height: 16 }} />
        <Skeleton style={{ width: '40%', height: 14 }} />
        <Skeleton style={{ width: '30%', height: 18 }} />
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  return (
    <View style={{ width: '47%', backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#F4ECE6', padding: 14, gap: 10 }}>
      <Skeleton style={{ width: '50%', height: 26 }} />
      <Skeleton style={{ width: 70, height: 22, borderRadius: 11 }} />
      <Skeleton style={{ width: '60%', height: 14 }} />
    </View>
  );
}
