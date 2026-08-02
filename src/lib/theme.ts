// Colour themes. Every screen styles itself from these tokens — no hex literals
// in components — so a palette swap restyles the whole app.
//
// The token list is derived from an audit of the colours the app actually used
// before theming existed, so each one has a real job rather than being invented.
//
// Contrast is enforced by src/lib/theme.test.ts: adding a palette that makes text
// unreadable fails the test suite rather than shipping.

export type Palette = {
  /** Brand colour: primary buttons, links, active states. */
  accent: string;
  /** Text/icons drawn on top of `accent`. */
  onAccent: string;

  /** Screen background, behind cards. */
  background: string;
  /** Cards, inputs, raised surfaces. */
  surface: string;
  /** De-emphasised surface, e.g. settled expense rows. */
  surfaceMuted: string;
  /** Hairline separators inside a surface. */
  divider: string;
  /** Input and chip outlines. */
  border: string;

  /** Primary body text and headings. */
  text: string;
  /** Supporting text, labels, metadata. */
  textSecondary: string;
  /** Hints, timestamps, placeholders. */
  textTertiary: string;
  /** Disabled control labels. */
  textDisabled: string;
  /** Decorative glyphs such as chevrons. */
  icon: string;

  /** Money owed to you; success states. */
  positive: string;
  /** Money you owe; errors; destructive actions. */
  negative: string;
  /** Outline for destructive buttons. */
  negativeBorder: string;
  /** Drop shadow colour. */
  shadow: string;
};

export type ThemeName = 'ocean' | 'forest' | 'sunset' | 'grape' | 'midnight';

export type Theme = {
  name: ThemeName;
  label: string;
  /** True for dark palettes; drives status bar and keyboard appearance. */
  dark: boolean;
  colors: Palette;
};

export const THEMES: Record<ThemeName, Theme> = {
  ocean: {
    name: 'ocean',
    label: 'Ocean',
    dark: false,
    colors: {
      // Slightly deeper than the original #208AEF, which only managed 3.53:1
      // against white — below AA for button labels.
      accent: '#1971c2',
      onAccent: '#ffffff',
      background: '#f7f8fa',
      surface: '#ffffff',
      surfaceMuted: '#f2f4f6',
      divider: '#eef1f4',
      border: '#d2d5da',
      text: '#111418',
      textSecondary: '#585e66',
      textTertiary: '#767d86',
      textDisabled: '#b0b6bd',
      icon: '#a8aeb6',
      positive: '#177245',
      negative: '#c62828',
      negativeBorder: '#f3c2bf',
      shadow: '#000000',
    },
  },
  forest: {
    name: 'forest',
    label: 'Forest',
    dark: false,
    colors: {
      accent: '#2f7d54',
      onAccent: '#ffffff',
      background: '#f4f7f4',
      surface: '#ffffff',
      surfaceMuted: '#edf2ed',
      divider: '#e5ebe4',
      border: '#c9d5c9',
      text: '#14201a',
      textSecondary: '#4f5c54',
      textTertiary: '#6d7a72',
      textDisabled: '#a6b1aa',
      icon: '#9fada4',
      positive: '#1b7a43',
      negative: '#bf2f2f',
      negativeBorder: '#e7c3c1',
      shadow: '#000000',
    },
  },
  sunset: {
    name: 'sunset',
    label: 'Sunset',
    dark: false,
    colors: {
      accent: '#c2410c',
      onAccent: '#ffffff',
      background: '#fbf6f2',
      surface: '#ffffff',
      surfaceMuted: '#f6ede6',
      divider: '#f0e4da',
      border: '#e0cdbe',
      text: '#241811',
      textSecondary: '#635146',
      textTertiary: '#7d6c60',
      textDisabled: '#bcaea3',
      icon: '#b7a89c',
      positive: '#15703f',
      negative: '#b91c1c',
      negativeBorder: '#eec7c1',
      shadow: '#000000',
    },
  },
  grape: {
    name: 'grape',
    label: 'Grape',
    dark: false,
    colors: {
      accent: '#6d43c0',
      onAccent: '#ffffff',
      background: '#f7f5fc',
      surface: '#ffffff',
      surfaceMuted: '#f1edf9',
      divider: '#e9e3f4',
      border: '#d5cbe8',
      text: '#1a1526',
      textSecondary: '#554d68',
      textTertiary: '#6f6784',
      textDisabled: '#b1abbf',
      icon: '#b0a8c2',
      positive: '#1b7a43',
      negative: '#c02b2b',
      negativeBorder: '#e9c5c5',
      shadow: '#000000',
    },
  },
  midnight: {
    name: 'midnight',
    label: 'Midnight',
    dark: true,
    colors: {
      accent: '#4da3ff',
      onAccent: '#06121f',
      background: '#0e1116',
      surface: '#171b22',
      surfaceMuted: '#1f242c',
      divider: '#262c35',
      border: '#39414d',
      text: '#f1f4f8',
      textSecondary: '#aab4c0',
      textTertiary: '#8b95a1',
      textDisabled: '#5d6773',
      icon: '#6b7480',
      positive: '#3ddc84',
      negative: '#ff8078',
      negativeBorder: '#63302c',
      shadow: '#000000',
    },
  },
};

export const THEME_LIST: Theme[] = Object.values(THEMES);

export const DEFAULT_THEME: ThemeName = 'ocean';

/** Coerce arbitrary stored input (profile column, cache) to a known theme. */
export function resolveTheme(name: string | null | undefined): Theme {
  return THEMES[(name ?? '') as ThemeName] ?? THEMES[DEFAULT_THEME];
}
