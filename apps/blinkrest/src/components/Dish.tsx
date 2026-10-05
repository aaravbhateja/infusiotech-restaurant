import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

// Direct port of the BlinkRest design system's dish illustrations.
// Keep shapes byte-identical to the design source (viewBox 0 0 100 100).

export type DishKind =
  | 'biryani' | 'paneer' | 'pizza' | 'burger' | 'dosa' | 'curry'
  | 'lassi' | 'jamun' | 'noodles' | 'coffee' | 'thali' | 'samosa' | 'naan';

const NAMES: Record<DishKind, string> = {
  biryani: 'Dum biryani', paneer: 'Paneer tikka', pizza: 'Pizza', burger: 'Burger',
  dosa: 'Masala dosa', curry: 'Butter chicken', lassi: 'Mango lassi', jamun: 'Gulab jamun',
  noodles: 'Hakka noodles', coffee: 'Cold coffee', thali: 'Thali', samosa: 'Samosa', naan: 'Butter naan',
};

function dishBody(kind: DishKind, r: number) {
  switch (kind) {
    case 'biryani':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE2BF" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={30} fill="#FBF3EA" />
          <Circle cx={50} cy={50} r={26} fill="#F2B45A" />
          <Circle cx={42} cy={44} r={14} fill="#FBE3B0" />
          <Circle cx={58} cy={60} r={11} fill="#FBE3B0" />
          <Circle cx={61} cy={40} r={9} fill="#EE8B2E" />
          <G fill="#FFFFFF">
            <Ellipse cx={38} cy={39} rx={3} ry={1.2} transform="rotate(-30 38 39)" />
            <Ellipse cx={46} cy={42} rx={3} ry={1.2} transform="rotate(20 46 42)" />
            <Ellipse cx={40} cy={48} rx={3} ry={1.2} transform="rotate(60 40 48)" />
            <Ellipse cx={56} cy={62} rx={3} ry={1.2} transform="rotate(-20 56 62)" />
            <Ellipse cx={62} cy={58} rx={3} ry={1.2} transform="rotate(40 62 58)" />
            <Ellipse cx={64} cy={38} rx={2.6} ry={1.1} transform="rotate(10 64 38)" fill="#FFD9A0" />
          </G>
          <Ellipse cx={47} cy={58} rx={7} ry={5.5} fill="#B5531F" />
          <Ellipse cx={62} cy={50} rx={6} ry={5} fill="#A8471A" />
          <Ellipse cx={37} cy={55} rx={6.5} ry={5} fill="#FFFFFF" />
          <Circle cx={37} cy={55} r={2.8} fill="#FFC93C" />
          <Path d="M50 35c3-4 8-4 9 0-3 3-7 3-9 0z" fill="#3E9B4F" />
          <Path d="M42 66c2-3 6-3 7 0-2 2-5 2-7 0z" fill="#3E9B4F" />
          <Path d="M44 46c2 2 5 2 7 0M54 55c1.5 1.5 4 1.5 5.5 0" stroke="#8C4A1C" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </>
      );
    case 'paneer':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFDCCF" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C3A1A" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={30} fill="#FBF3EA" />
          <Circle cx={34} cy={37} r={7} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={34} cy={37} r={5} fill="#5DAA4F" />
          <Path d="M64 70a10 10 0 0 1 14-6z" fill="#F7D547" />
          <Path d="M22 72 80 30" stroke="#B88A5A" strokeWidth={2.2} strokeLinecap="round" />
          <G transform="translate(30 66) rotate(-36)"><Rect x={-6.5} y={-6.5} width={13} height={13} rx={3} fill="#F2A65A" /><Path d="M-4 -2h8M-4 2.5h8" stroke="#8B3A1A" strokeWidth={1.6} strokeLinecap="round" /></G>
          <G transform="translate(40 59) rotate(-20)"><Rect x={-5} y={-5} width={10} height={10} rx={2.5} fill="#4CAF50" /></G>
          <G transform="translate(50 52) rotate(-36)"><Rect x={-6.5} y={-6.5} width={13} height={13} rx={3} fill="#F6B76E" /><Path d="M-4 -2h8M-4 2.5h8" stroke="#8B3A1A" strokeWidth={1.6} strokeLinecap="round" /></G>
          <G transform="translate(60 45) rotate(-50)"><Path d="M-6 3a6 6 0 0 1 12 0z" fill="#E9A0B5" /></G>
          <G transform="translate(70 37) rotate(-36)"><Rect x={-6.5} y={-6.5} width={13} height={13} rx={3} fill="#F2A65A" /><Path d="M-4 -2h8M-4 2.5h8" stroke="#8B3A1A" strokeWidth={1.6} strokeLinecap="round" /></G>
        </>
      );
    case 'pizza':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE6C4" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={33} fill="#E3A04F" />
          <Circle cx={50} cy={50} r={28} fill="#D9472B" />
          <G fill="#FFD37A"><Circle cx={40} cy={38} r={7} /><Circle cx={60} cy={40} r={6} /><Circle cx={38} cy={60} r={6.5} /><Circle cx={58} cy={61} r={7.5} /><Circle cx={50} cy={50} r={5} /></G>
          <G fill="#FFE7B0"><Circle cx={38} cy={36} r={3} /><Circle cx={56} cy={59} r={3} /></G>
          <G fill="#2F8F46"><Ellipse cx={46} cy={34} rx={4} ry={2.2} transform="rotate(-30 46 34)" /><Ellipse cx={64} cy={52} rx={4} ry={2.2} transform="rotate(40 64 52)" /><Ellipse cx={44} cy={66} rx={4} ry={2.2} transform="rotate(10 44 66)" /></G>
          <G fill="none" stroke="#2A2420" strokeWidth={1.8}><Circle cx={33} cy={48} r={2.2} /><Circle cx={67} cy={66} r={2.2} /><Circle cx={55} cy={30} r={2.2} /></G>
          <Path d="M50 17v66M17 50h66M27 27l46 46M73 27 27 73" stroke="#C4572C" strokeWidth={1.2} opacity={0.55} />
        </>
      );
    case 'burger':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE8C9" />
          <Ellipse cx={50} cy={80} rx={31} ry={3.5} fill="#8C4A1C" opacity={0.15} />
          <Rect x={24} y={65} width={52} height={12} rx={6} fill="#E59A43" />
          <Rect x={22} y={55} width={56} height={11} rx={5.5} fill="#6B3A22" />
          <Path d="M22 53h56l-6 6-6-4-6 6-6-5-8 6-6-5-8 4z" fill="#FFC93C" />
          <Rect x={25} y={47} width={50} height={6} rx={3} fill="#E5482D" />
          <Path d="M20 47c4-4 6 2 10-2s6 2 10-2 6 2 10-2 6 2 10-2 6 2 10-2 6 2 10 0v3H20z" fill="#5DB347" />
          <Path d="M24 45c0-14 12-21 26-21s26 7 26 21z" fill="#F0A84B" />
          <Path d="M33 33c4-4 10-6 15-6" stroke="#FFD18A" strokeWidth={3} fill="none" strokeLinecap="round" />
          <G fill="#FFF6E3"><Ellipse cx={44} cy={33} rx={1.8} ry={1} transform="rotate(-20 44 33)" /><Ellipse cx={53} cy={30} rx={1.8} ry={1} transform="rotate(15 53 30)" /><Ellipse cx={60} cy={36} rx={1.8} ry={1} transform="rotate(-10 60 36)" /><Ellipse cx={38} cy={39} rx={1.8} ry={1} transform="rotate(25 38 39)" /><Ellipse cx={51} cy={39} rx={1.8} ry={1} /><Ellipse cx={66} cy={41} rx={1.8} ry={1} transform="rotate(30 66 41)" /></G>
        </>
      );
    case 'dosa':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFF0C4" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={30} fill="#FBF3EA" />
          <Circle cx={35} cy={33} r={8.5} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={35} cy={33} r={6} fill="#F3F1E4" />
          <Circle cx={36} cy={32} r={1.6} fill="#5DAA4F" />
          <Circle cx={66} cy={67} r={10} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={66} cy={67} r={7.5} fill="#D9682A" />
          <Circle cx={64} cy={65} r={1.6} fill="#F6C46A" />
          <Path d="M10 70 82 24c5 2 7 7 5 11L20 79c-6 1-10-3-10-9z" fill="#E7A93E" />
          <Path d="M16 71 83 29" stroke="#F6CF7A" strokeWidth={3} strokeLinecap="round" />
          <Path d="M30 68l4 2M44 58l4 2M58 49l4 2M72 40l3 2" stroke="#C9822A" strokeWidth={1.6} strokeLinecap="round" />
        </>
      );
    case 'curry':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFDCC8" />
          <Ellipse cx={51} cy={55} rx={36} ry={34} fill="#8C3A1A" opacity={0.14} />
          <Circle cx={50} cy={50} r={35} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={28} fill="#D9561E" />
          <Circle cx={48} cy={48} r={20} fill="#E8742D" />
          <Rect x={56} y={54} width={10} height={8} rx={3} fill="#B8441A" transform="rotate(20 61 58)" />
          <Rect x={34} y={52} width={9} height={8} rx={3} fill="#B8441A" transform="rotate(-15 38 56)" />
          <Rect x={52} y={34} width={9} height={7} rx={3} fill="#C24E1E" transform="rotate(10 56 37)" />
          <Path d="M37 45c4-8 18-8 20 0s-12 10-14 4 6-6 8-2" stroke="#FFF4E6" strokeWidth={2.6} fill="none" strokeLinecap="round" />
          <Rect x={44} y={58} width={6} height={5} rx={1.5} fill="#FFE08A" />
          <G fill="#3E9B4F"><Path d="M40 36c2-3 5-3 6 0-2 2-4 2-6 0z" /><Path d="M62 46c2-3 5-3 6 0-2 2-4 2-6 0z" /><Path d="M46 66c2-3 5-3 6 0-2 2-4 2-6 0z" /></G>
        </>
      );
    case 'lassi':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFEFD0" />
          <Ellipse cx={50} cy={86} rx={18} ry={3} fill="#8C4A1C" opacity={0.15} />
          <Path d="M60 26 69 8" stroke="#FF5A36" strokeWidth={3.4} strokeLinecap="round" />
          <Path d="M33 22h34l-4.5 58a4 4 0 0 1-4 3.7H41.5a4 4 0 0 1-4-3.7z" fill="#FFC24A" />
          <Path d="M33 22h34l-.7 9H33.7z" fill="#FFF3D6" />
          <Path d="M33 22h34l-4.5 58a4 4 0 0 1-4 3.7H41.5a4 4 0 0 1-4-3.7z" fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
          <Path d="M40 36l2 40" stroke="#FFFFFF" strokeWidth={2.4} opacity={0.55} strokeLinecap="round" />
          <G fill="#7FB35A"><Circle cx={45} cy={25} r={1.4} /><Circle cx={56} cy={27} r={1.4} /></G>
          <G fill="#E8782A"><Circle cx={50} cy={24} r={1.2} /><Circle cx={61} cy={24} r={1.2} /></G>
        </>
      );
    case 'jamun':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE1DA" />
          <Ellipse cx={51} cy={55} rx={36} ry={34} fill="#7A2E12" opacity={0.14} />
          <Circle cx={50} cy={50} r={35} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={27} fill="#E8A54F" />
          <Circle cx={40} cy={44} r={10.5} fill="#7A2E12" />
          <Circle cx={61} cy={46} r={10.5} fill="#6E2810" />
          <Circle cx={50} cy={62} r={10.5} fill="#7A2E12" />
          <G fill="#A4471F"><Circle cx={37} cy={41} r={4} /><Circle cx={58} cy={43} r={4} /><Circle cx={47} cy={59} r={4} /></G>
          <G fill="#FFFFFF" opacity={0.75}><Circle cx={36} cy={40} r={1.5} /><Circle cx={57} cy={42} r={1.5} /><Circle cx={46} cy={58} r={1.5} /></G>
          <G fill="#8BC34A"><Rect x={44} y={40} width={4} height={1.6} rx={0.8} transform="rotate(-30 46 41)" /><Rect x={58} y={58} width={4} height={1.6} rx={0.8} transform="rotate(20 60 59)" /><Rect x={34} y={58} width={4} height={1.6} rx={0.8} /></G>
        </>
      );
    case 'noodles':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFF0D2" />
          <Ellipse cx={51} cy={55} rx={36} ry={34} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={35} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={28} fill="#F8E1A0" />
          <G fill="none" stroke="#E2AE3C" strokeWidth={2.4} strokeLinecap="round">
            <Path d="M30 44c5-6 9 6 14 0s9 6 14 0 9 6 12 2" />
            <Path d="M28 52c5-6 9 6 14 0s9 6 14 0 9 6 14 0" />
            <Path d="M31 60c5-6 9 6 14 0s9 6 14 0 9 6 11 2" />
            <Path d="M36 37c4-5 8 5 12 0s8 5 12 0" />
            <Path d="M38 67c4-5 8 5 12 0s8 5 10 1" />
          </G>
          <G strokeLinecap="round" strokeWidth={2.6}>
            <Path d="M40 48l6 2" stroke="#F08A2E" />
            <Path d="M58 56l5-3" stroke="#F08A2E" />
            <Path d="M52 42l5 1" stroke="#4CAF50" />
            <Path d="M38 60l4-3" stroke="#4CAF50" />
            <Path d="M60 46l4 3" stroke="#8E5BB5" />
          </G>
          <Path d="M66 14 40 52M74 18 46 54" stroke="#8B5A2B" strokeWidth={2.6} strokeLinecap="round" />
        </>
      );
    case 'coffee':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#EADBCB" />
          <Ellipse cx={51} cy={55} rx={35} ry={33} fill="#5C3A22" opacity={0.14} />
          <Circle cx={50} cy={50} r={34} fill="#FFFFFF" />
          <Rect x={70} y={44} width={13} height={11} rx={5} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={50} cy={50} r={24} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={50} cy={50} r={19} fill="#7B4A2B" />
          <Circle cx={50} cy={50} r={17} fill="none" stroke="#B07B4F" strokeWidth={2} />
          <Path d="M50 59c-8-5-11-9-9-13 2-3 6-3 9 1 3-4 7-4 9-1 2 4-1 8-9 13z" fill="#F3E3CF" />
        </>
      );
    case 'thali':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE9CF" />
          <Ellipse cx={51} cy={55} rx={41} ry={39} fill="#5C4A3A" opacity={0.14} />
          <Circle cx={50} cy={50} r={41} fill="#D9D4CC" />
          <Circle cx={50} cy={50} r={37} fill="#EFECE7" />
          <Circle cx={36} cy={64} r={13} fill="#E8C27A" />
          <G fill="#B57A33"><Circle cx={31} cy={60} r={1.6} /><Circle cx={40} cy={67} r={1.4} /><Circle cx={34} cy={70} r={1.2} /></G>
          <Ellipse cx={56} cy={66} rx={11} ry={9} fill="#FFFDF6" />
          <G fill="#FFFFFF" stroke="#D9D4CC" strokeWidth={1.5}><Circle cx={33} cy={36} r={9.5} /><Circle cx={52} cy={29} r={9} /><Circle cx={69} cy={40} r={9} /><Circle cx={72} cy={60} r={8} /></G>
          <Circle cx={33} cy={36} r={7} fill="#F2B33D" />
          <Circle cx={52} cy={29} r={6.5} fill="#E46A2A" />
          <Circle cx={69} cy={40} r={6.5} fill="#6CA845" />
          <Circle cx={72} cy={60} r={5.6} fill="#FFF8EE" />
          <G fill="#3E9B4F"><Circle cx={71} cy={59} r={1} /><Circle cx={73.5} cy={61.5} r={1} /></G>
          <G fill="#C24E1E"><Circle cx={50} cy={28} r={1.8} /><Circle cx={54} cy={31} r={1.8} /></G>
        </>
      );
    case 'samosa':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFE6BE" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Circle cx={50} cy={50} r={30} fill="#FBF3EA" />
          <Circle cx={68} cy={34} r={7.5} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={68} cy={34} r={5.4} fill="#8C3B1E" />
          <Circle cx={70} cy={66} r={7.5} fill="#FFFFFF" stroke="#EADFD3" strokeWidth={1.5} />
          <Circle cx={70} cy={66} r={5.4} fill="#5DAA4F" />
          <Path d="M24 66 42 30l17 34z" fill="#E7A23F" />
          <Path d="M42 30l17 34H42z" fill="#D18A2C" />
          <Path d="M38 74 52 44l16 26z" fill="#EDB04E" />
          <Path d="M52 44l16 26H52z" fill="#D8922F" />
          <G fill="#B5701F"><Circle cx={34} cy={58} r={1} /><Circle cx={40} cy={48} r={1} /><Circle cx={47} cy={60} r={1} /><Circle cx={50} cy={66} r={1} /><Circle cx={58} cy={62} r={1} /></G>
        </>
      );
    case 'naan':
      return (
        <>
          <Rect width={100} height={100} rx={r} fill="#FFEBCB" />
          <Ellipse cx={51} cy={55} rx={37} ry={35} fill="#8C4A1C" opacity={0.12} />
          <Circle cx={50} cy={50} r={37} fill="#FFFFFF" />
          <Path d="M28 30c18-12 46 0 44 26S48 84 32 72 16 40 28 30z" fill="#F0CD8A" />
          <Path d="M30 34c14-8 36 0 36 20" stroke="#F8DFAA" strokeWidth={3} fill="none" strokeLinecap="round" />
          <G fill="#B57A33"><Ellipse cx={38} cy={44} rx={3} ry={2} /><Ellipse cx={54} cy={40} rx={2.5} ry={1.6} /><Ellipse cx={60} cy={58} rx={3} ry={2} /><Ellipse cx={42} cy={62} rx={2.4} ry={1.6} /><Ellipse cx={50} cy={70} rx={2} ry={1.4} /></G>
          <Rect x={46} y={49} width={7} height={6} rx={1.5} fill="#FFE39A" />
          <G fill="#3E9B4F"><Circle cx={36} cy={54} r={1.3} /><Circle cx={58} cy={48} r={1.3} /><Circle cx={48} cy={62} r={1.3} /></G>
        </>
      );
    default:
      return <Rect width={100} height={100} rx={r} fill="#F1E7E0" />;
  }
}

export function Dish({ kind, size = 120, radius = Math.round(120 * 0.2) }: { kind: DishKind; size?: number; radius?: number }) {
  const r = Math.min(50, (radius * 100) / size);
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={NAMES[kind]}>
      {dishBody(kind, r)}
    </Svg>
  );
}
