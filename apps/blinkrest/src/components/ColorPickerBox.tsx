import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';

import { hexToHsv, hsvToHex, isValidHexColor, type Hsv } from '@/lib/brandColor';
import { colors } from '@/theme/tokens';

const BOX_HEIGHT = 180;
const HUE_HEIGHT = 28;
const THUMB = 22;

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'] as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// A standard saturation/value square + hue strip picker — not a native
// component in React Native, so built from LinearGradient layers (white→
// transparent for saturation, transparent→black for value, a 7-stop rainbow
// for hue) with PanResponder-driven thumbs. Kept controlled by `value` (hex)
// so it stays in sync with the swatches/text field next to it, while
// tracking its own hsv internally during a drag — hex↔hsv round-trips lose
// precision, so re-deriving hsv from `value` on every parent re-render
// would make the thumb jitter mid-drag.
//
// This screen scrolls, and a vertical drag inside the SV box is otherwise
// indistinguishable from a scroll gesture — without explicitly capturing
// the responder, the ScrollView wins the gesture and the thumb never
// moves. Capturing on both start and move, and refusing termination
// requests, keeps the drag once it begins. Position math uses the
// gesture's delta from where the touch started (anchored via refs so the
// responder itself never needs recreating) rather than re-reading
// locationX/Y on every move, which React Native Web reports inconsistently
// mid-drag.
export function ColorPickerBox({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(isValidHexColor(value) ? value : '#FF5A36'));
  const [boxWidth, setBoxWidth] = useState(300);
  const [hueWidth, setHueWidth] = useState(300);
  const lastEmitted = useRef(value);
  const hsvRef = useRef(hsv);
  const boxWidthRef = useRef(boxWidth);
  const hueWidthRef = useRef(hueWidth);
  const svGrant = useRef({ s: 0, v: 0 });
  const hueGrant = useRef({ x: 0 });

  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);
  useEffect(() => {
    boxWidthRef.current = boxWidth;
  }, [boxWidth]);
  useEffect(() => {
    hueWidthRef.current = hueWidth;
  }, [hueWidth]);

  useEffect(() => {
    if (value === lastEmitted.current || !isValidHexColor(value)) return;
    setHsv(hexToHsv(value));
  }, [value]);

  function emit(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    lastEmitted.current = hex;
    onChange(hex);
  }

  const svResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- PanResponder.create is a stable RN API that manages its own refs internally; not a ref read of ours
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const x = clamp(evt.nativeEvent.locationX, 0, boxWidthRef.current);
          const y = clamp(evt.nativeEvent.locationY, 0, BOX_HEIGHT);
          const s = x / boxWidthRef.current;
          const v = 1 - y / BOX_HEIGHT;
          svGrant.current = { s, v };
          emit({ ...hsvRef.current, s, v });
        },
        onPanResponderMove: (_evt, gestureState) => {
          const s = clamp(svGrant.current.s + gestureState.dx / boxWidthRef.current, 0, 1);
          const v = clamp(svGrant.current.v - gestureState.dy / BOX_HEIGHT, 0, 1);
          emit({ ...hsvRef.current, s, v });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; reads live state via refs
    [],
  );

  const hueResponder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- PanResponder.create is a stable RN API that manages its own refs internally; not a ref read of ours
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (evt) => {
          const x = clamp(evt.nativeEvent.locationX, 0, hueWidthRef.current);
          const h = (x / hueWidthRef.current) * 360;
          hueGrant.current.x = x;
          emit({ ...hsvRef.current, h });
        },
        onPanResponderMove: (_evt, gestureState) => {
          const x = clamp(hueGrant.current.x + gestureState.dx, 0, hueWidthRef.current);
          emit({ ...hsvRef.current, h: (x / hueWidthRef.current) * 360 });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally stable; reads live state via refs
    [],
  );

  const pureHue = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <View style={{ gap: 14 }}>
      <View
        onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}
        {...svResponder.panHandlers}
        style={{ height: BOX_HEIGHT, borderRadius: 16, overflow: 'hidden', backgroundColor: pureHue }}
      >
        <LinearGradient colors={['#FFFFFF', 'rgba(255,255,255,0)'] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <LinearGradient colors={['rgba(0,0,0,0)', '#000000'] as const} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: clamp(hsv.s * boxWidth - THUMB / 2, -THUMB / 2, boxWidth - THUMB / 2),
            top: clamp((1 - hsv.v) * BOX_HEIGHT - THUMB / 2, -THUMB / 2, BOX_HEIGHT - THUMB / 2),
            width: THUMB,
            height: THUMB,
            borderRadius: THUMB / 2,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            backgroundColor: hsvToHex(hsv),
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>

      <View
        onLayout={(e) => setHueWidth(e.nativeEvent.layout.width)}
        {...hueResponder.panHandlers}
        style={{ height: HUE_HEIGHT, borderRadius: HUE_HEIGHT / 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}
      >
        <LinearGradient colors={HUE_STOPS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: clamp((hsv.h / 360) * hueWidth - HUE_HEIGHT / 2, -2, hueWidth - HUE_HEIGHT + 2),
            top: -1,
            width: HUE_HEIGHT,
            height: HUE_HEIGHT,
            borderRadius: HUE_HEIGHT / 2,
            borderWidth: 3,
            borderColor: '#FFFFFF',
            backgroundColor: pureHue,
            shadowColor: '#000',
            shadowOpacity: 0.3,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
          }}
        />
      </View>
    </View>
  );
}
