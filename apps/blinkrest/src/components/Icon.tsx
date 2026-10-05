import Svg, { Path } from 'react-native-svg';

// Direct port of the BlinkRest design system's icon set (stroke-based,
// 24x24 viewBox). Keep path data byte-identical to the design source so
// icons match the spec exactly.

function circle(x: number, y: number, r: number) {
  return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}
function roundedRect(x: number, y: number, w: number, h: number, r: number) {
  return (
    `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}` +
    `a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}` +
    `v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`
  );
}

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V20h5v-6h4v6h5V9.5',
  orders: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  menu: 'M7 3v8M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 21V3c-2.2 0-4 2.5-4 6v4h4',
  tables: roundedRect(6, 7, 12, 10, 2) + 'M9 4h6M9 20h6M3 10v4M21 10v4',
  more:
    roundedRect(4, 4, 6.5, 6.5, 1.5) +
    roundedRect(13.5, 4, 6.5, 6.5, 1.5) +
    roundedRect(4, 13.5, 6.5, 6.5, 1.5) +
    roundedRect(13.5, 13.5, 6.5, 6.5, 3.25),
  grid:
    roundedRect(4, 4, 6.5, 6.5, 1.5) +
    roundedRect(13.5, 4, 6.5, 6.5, 1.5) +
    roundedRect(4, 13.5, 6.5, 6.5, 1.5) +
    roundedRect(13.5, 13.5, 6.5, 6.5, 1.5),
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  search: circle(11, 11, 6.5) + 'M16 16l4.5 4.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8' + circle(16, 7, 2) + circle(10, 17, 2),
  right: 'M9 5l7 7-7 7',
  left: 'M15 5l-7 7 7 7',
  down: 'M5 9l7 7 7-7',
  up: 'M5 15l7-7 7 7',
  clock: circle(12, 12, 8.5) + 'M12 7.5V12l3 2',
  timer: circle(12, 13.5, 7.5) + 'M12 9.5v4l2.5 1.5M9.5 2.5h5M18.5 6.5l1.5-1.5',
  user: circle(12, 8, 4) + 'M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  users:
    circle(9, 8.5, 3.5) +
    'M2.5 19.5c.9-3 3.4-4.8 6.5-4.8s5.6 1.8 6.5 4.8M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.9c2 .6 3.4 2.2 4 4.6',
  phone:
    'M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4z',
  mail: roundedRect(3, 5.5, 18, 13, 2) + 'M4 7l8 6 8-6',
  lock: roundedRect(5, 10.5, 14, 10, 2) + 'M8 10.5v-3a4 4 0 0 1 8 0v3',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' + circle(12, 12, 3),
  rupee: 'M7 4.5h10M7 9h10M7 4.5h3.5a4.5 4.5 0 0 1 0 9H7l8 6.5',
  card: roundedRect(3, 5.5, 18, 13, 2) + 'M3 10h18M7 15h3',
  cash: roundedRect(2.5, 6.5, 19, 11, 2) + circle(12, 12, 2.5) + 'M6 10v4M18 10v4',
  qr:
    roundedRect(4, 4, 6, 6, 1) +
    roundedRect(14, 4, 6, 6, 1) +
    roundedRect(4, 14, 6, 6, 1) +
    'M14 14h2v2h-2zM18 14h2M14 18v2M17.5 17.5H20V20h-2.5z',
  share: circle(18, 5.5, 2.5) + circle(6, 12, 2.5) + circle(18, 18.5, 2.5) + 'M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1',
  edit: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16zM13.5 6.5l4 4',
  trash: 'M4 7h16M9 7V4.5h6V7M6 7l1 13h10l1-13M10 11v5M14 11v5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  checkc: circle(12, 12, 9) + 'M8 12.5l2.8 2.8L16.5 9.5',
  x: 'M6 6l12 12M18 6L6 18',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  tag: 'M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-6.5 6.5a1.5 1.5 0 0 1-2.1 0z' + circle(8, 8, 1.5),
  chart: 'M4 20h16' + roundedRect(6, 11, 3, 6, 1) + roundedRect(11, 6, 3, 11, 1) + roundedRect(16, 9, 3, 8, 1),
  trend: 'M3.5 16.5l6-6 4 4 7-7M15 7.5h5.5V13',
  trenddown: 'M3.5 7.5l6 6 4-4 7 7M15 16.5h5.5V11',
  settings:
    'M10.3 3h3.4l.5 2.4 1.9 1 2.3-.8 1.7 2.9-1.8 1.6v2.2l1.8 1.6-1.7 2.9-2.3-.8-1.9 1-.5 2.4h-3.4l-.5-2.4-1.9-1-2.3.8-1.7-2.9 1.8-1.6v-2.2L3.9 8.5l1.7-2.9 2.3.8 1.9-1z' +
    circle(12, 12, 2.8),
  help: circle(12, 12, 9) + 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.2v.3',
  crown: 'M4 18h16M4.5 15L3.5 7l5 3.5L12 5l3.5 5.5 5-3.5-1 8z',
  store:
    'M4 9.5L5.5 4h13L20 9.5M4 9.5h16M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11.5V20h14v-8.5M10 20v-5h4v5',
  logout: 'M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h10',
  image: roundedRect(3.5, 4.5, 17, 15, 2) + circle(9, 10, 1.8) + 'M4 18l5.5-5 4 3.5 2.5-2 4 3.5',
  upload: 'M12 15.5V4M7.5 8.5L12 4l4.5 4.5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15',
  download: 'M12 4v11.5M7.5 11l4.5 4.5 4.5-4.5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15',
  flame:
    'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 3-5.8 3.8-9.3 2.4 1.4 3.4 3.4 3.4 5.5.9-.6 1.6-1.7 1.8-2.9 2 1.7 4 4 4 6.7 0 3.6-2.6 6.2-6.5 6.2z',
  bag: 'M5.5 8h13l-1 12.5h-11zM9 10V6.5a3 3 0 0 1 6 0V10',
  bike: circle(6, 17, 3) + circle(18, 17, 3) + 'M6 17h6l3-7h-3M15 10l3 7M9.5 10H13',
  note: 'M5 3.5h10l4 4v13H5zM14.5 3.5V8H19M8.5 12.5h7M8.5 16h5',
  printer: 'M7 9V3.5h10V9' + roundedRect(3.5, 9, 17, 8, 2) + 'M7 14h10v6.5H7z',
  shield: 'M12 3L4.5 6v5.5c0 4.5 3.1 8 7.5 9.5 4.4-1.5 7.5-5 7.5-9.5V6zM9 12l2 2 4-4',
  wifioff:
    'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M14.5 10.3a10 10 0 0 1 4.5 2.2M2 9a14.5 14.5 0 0 1 4.3-2.7M10.5 5.6A14.5 14.5 0 0 1 22 9M12 20h.01',
  refresh: 'M20 11.5A8 8 0 0 0 5.6 7M4 4v4h4M4 12.5A8 8 0 0 0 18.4 17M20 20v-4h-4',
  calendar: roundedRect(3.5, 5, 17, 15.5, 2) + 'M3.5 10h17M8 3v4M16 3v4',
  chef: 'M7 14.5a4 4 0 0 1-1.2-7.8A4.5 4.5 0 0 1 12 4a4.5 4.5 0 0 1 6.2 2.7A4 4 0 0 1 17 14.5V20H7zM7 17h10',
  bolt: 'M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z',
  pin: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z' + circle(12, 10, 2.3),
  message: 'M4 5h16v11H9l-5 4zM8 9.5h8M8 12.5h5',
  dots: circle(12, 5.5, 1.1) + circle(12, 12, 1.1) + circle(12, 18.5, 1.1),
  send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z',
  alert: 'M12 3.5L2.5 20h19zM12 10v4.5M12 17.2v.3',
  info: circle(12, 12, 9) + 'M12 11v5.5M12 7.8v.3',
  percent: 'M19 5L5 19' + circle(7, 7, 2.5) + circle(17, 17, 2.5),
  ticket:
    'M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4zM14 7v2M14 11v2M14 15v2',
  broom: 'M14 3.5L10.5 11M7 11h7.5l1.5 9.5H5.5zM9 15v5.5M12.5 15v5.5',
  key: circle(8, 15, 4) + 'M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  book: 'M4.5 5A1.5 1.5 0 0 1 6 3.5h13.5V17H6a1.5 1.5 0 0 0-1.5 1.5zM4.5 18.5A1.5 1.5 0 0 0 6 20h13.5',
  ban: circle(12, 12, 8.5) + 'M6 6l12 12',
  dine: circle(12, 12, 5) + 'M3 4v5a2 2 0 0 0 2 2M3 4v16M21 4c-1.5 0-2 2-2 4v4h2M21 4v16',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 24,
  stroke = 1.8,
  color = 'currentColor',
}: {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const d = PATHS[name] ?? PATHS.home;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={d} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
