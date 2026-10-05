import { colors } from '@/theme/tokens';

export type BrandPalette = {
  tint: string; // light background for icon chips, subtle fills (was coral50)
  primary: string; // header background, strongest fills (was coral500)
  dark: string; // buttons, active icons (was coral600)
  darker: string; // text on tinted backgrounds (was coral700)
  onPrimary: string; // text/icon color that reads on top of `primary`
};

const DEFAULT_PALETTE: BrandPalette = {
  tint: colors.coral50,
  primary: colors.coral500,
  dark: colors.coral600,
  darker: colors.coral700,
  onPrimary: '#1B1716',
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function withLightness(hex: string, l: number, sMultiplier = 1): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [h, s] = rgbToHsl(...rgb);
  return rgbToHex(...hslToRgb(h, Math.min(1, s * sMultiplier), l));
}

// WCAG relative luminance, used only to decide black vs white text on the
// user's chosen color — not for aesthetic tuning.
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isValidHexColor(hex: string): boolean {
  return hexToRgb(hex) !== null;
}

// Derives the same 4-role shade set the app's default coral theme uses
// (light tint / strong fill / darker fill / darkest-for-text) from a single
// owner-picked hex, so free-form color input can't accidentally produce
// unreadable text — `onPrimary` always passes a basic contrast check
// against `primary`, regardless of how light or dark the chosen color is.
export function deriveBrandPalette(hex: string | null | undefined): BrandPalette {
  if (!hex || !isValidHexColor(hex)) return DEFAULT_PALETTE;
  const primary = hex.toUpperCase();
  const dark = withLightness(primary, 0.38);
  const darker = withLightness(primary, 0.3);
  const tint = withLightness(primary, 0.94, 0.5);
  const onPrimary = relativeLuminance(primary) > 0.45 ? '#1B1716' : '#FFFFFF';
  return { tint, primary, dark, darker, onPrimary };
}

export type Hsv = { h: number; s: number; v: number };

// For the visual picker's saturation/value box and hue strip.
export function hexToHsv(hex: string): Hsv {
  const rgb = hexToRgb(hex) ?? [255, 90, 54];
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return rgbToHex((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255);
}
