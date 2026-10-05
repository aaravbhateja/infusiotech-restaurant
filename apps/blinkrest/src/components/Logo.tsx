import { Text, View } from 'react-native';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';

import { fonts } from '@/theme/tokens';

type Variant = 'full' | 'mark' | 'icon';
type Tone = 'color' | 'white';

export function Logo({
  variant = 'full',
  tone = 'color',
  size = 48,
  knock = '#FFFFFF',
}: {
  variant?: Variant;
  tone?: Tone;
  size?: number;
  knock?: string;
}) {
  const icon = variant === 'icon';
  const light = icon || tone === 'white';
  const bg = icon ? '#FF5A36' : 'none';
  const ring = light ? '#FFFFFF' : '#FF5A36';
  const bolt = light ? '#FFC93C' : '#1B1716';
  const strokeKnock = icon ? '#FF5A36' : knock;
  const gap = Math.round(size * 0.24);
  const fs = Math.round(size * 0.62);
  const word1 = tone === 'white' ? '#FFFFFF' : '#1B1716';
  const word2 = tone === 'white' ? '#FFC93C' : '#FF5A36';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {icon ? <Rect width={48} height={48} rx={11} fill={bg} /> : null}
        <G transform={icon ? 'translate(24 24) scale(0.74) translate(-24 -24)' : undefined}>
          <Circle cx={24} cy={24} r={15} fill="none" stroke={ring} strokeWidth={5.5} />
          <Path
            d="M27.5 4.5 13 27.5h10l-3.5 16L35 19.5H25z"
            fill={bolt}
            stroke={strokeKnock}
            strokeWidth={3.2}
            strokeLinejoin="round"
          />
        </G>
      </Svg>
      {variant === 'full' ? (
        <Text style={{ fontFamily: fonts.display, fontSize: fs, letterSpacing: -fs * 0.035 }}>
          <Text style={{ color: word1 }}>Blink</Text>
          <Text style={{ color: word2 }}>Rest</Text>
        </Text>
      ) : null}
    </View>
  );
}
