// BlinkRest design tokens — mirrors the BlinkRest Design System style guide
// (coral/saffron palette, Bricolage Grotesque + Figtree, 4px grid, pill
// buttons, warm-tinted shadows). Keep names stable; screens reference these,
// not raw hex/px values.

export const colors = {
  coral500: '#FF5A36',
  coral600: '#D9381A',
  coral700: '#C2330F',
  coral50: '#FFF1EC',
  saffron400: '#FFC93C',
  saffron50: '#FFF6D9',

  ink900: '#1B1716',
  ink700: '#4A4240',
  ink500: '#6E6461',
  line: '#F1E7E0',
  bg: '#FFF8F3',
  surface: '#FFFFFF',

  success: '#0B7A3E',
  successBg: '#E8F7EE',
  info: '#1F5BD6',
  infoBg: '#EAF1FF',
  warning: '#8A5A00',
  warningBg: '#FFF4D6',
  premium: '#5B21B6',
  premiumBg: '#F1EBFF',
  error: '#B42318',
  errorBg: '#FEECEB',

  inputBorder: '#E4D8D0',
  disabledBg: '#EFE8E3',
  disabledFg: '#8F8582',
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  gutter: 20,
  lg: 24,
  xl: 32,
} as const;

export const fonts = {
  display: 'BricolageGrotesque_800ExtraBold',
  displaySemi: 'BricolageGrotesque_700Bold',
  body: 'Figtree_500Medium',
  bodySemi: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  bodyExtraBold: 'Figtree_800ExtraBold',
} as const;

export const type = {
  display: { fontSize: 40, lineHeight: 44, fontFamily: fonts.display },
  h1: { fontSize: 28, lineHeight: 34, fontFamily: fonts.display },
  h2: { fontSize: 20, lineHeight: 26, fontFamily: fonts.display },
  title: { fontSize: 16, lineHeight: 22, fontFamily: fonts.bodyBold },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fonts.body },
  label: { fontSize: 13, lineHeight: 18, fontFamily: fonts.bodyBold },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fonts.bodySemi },
} as const;

export const shadow = {
  card: {
    shadowColor: '#1B1716',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sheet: {
    shadowColor: '#1B1716',
    shadowOpacity: 0.14,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 8,
  },
} as const;

export const statusBadge: Record<
  string,
  { label: string; fg: string; bg: string }
> = {
  new: { label: 'New', fg: colors.coral700, bg: colors.coral50 },
  accepted: { label: 'Accepted', fg: colors.info, bg: colors.infoBg },
  preparing: { label: 'Preparing', fg: colors.warning, bg: colors.warningBg },
  ready: { label: 'Ready', fg: colors.success, bg: colors.successBg },
  served: { label: 'Served', fg: colors.premium, bg: colors.premiumBg },
  completed: { label: 'Completed', fg: colors.ink700, bg: colors.line },
  rejected: { label: 'Rejected', fg: colors.error, bg: colors.errorBg },
  cancelled: { label: 'Cancelled', fg: colors.error, bg: colors.errorBg },
};

export function formatMinor(minor: number, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  return `${symbol}${(minor / 100).toLocaleString('en-IN')}`;
}
