import assert from 'node:assert/strict';
import { test } from 'node:test';

import { THEME_LIST, resolveTheme, DEFAULT_THEME, type Palette } from './theme.ts';

// WCAG 2.1 relative luminance / contrast ratio.
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * [foreground, background, minimum ratio, description]
 * 4.5 is WCAG AA for body text; 3.0 is AA for large/supplementary text.
 * Disabled text is exempt under WCAG and is not asserted here.
 */
const REQUIREMENTS: [keyof Palette, keyof Palette, number, string][] = [
  ['text', 'background', 4.5, 'body text on screen background'],
  ['text', 'surface', 4.5, 'body text on cards'],
  ['text', 'surfaceMuted', 4.5, 'body text on muted rows'],
  ['textSecondary', 'background', 4.5, 'secondary text on background'],
  ['textSecondary', 'surface', 4.5, 'secondary text on cards'],
  ['textTertiary', 'surface', 3.0, 'hints on cards'],
  ['textTertiary', 'background', 3.0, 'hints on background'],
  ['onAccent', 'accent', 4.5, 'button label on accent'],
  ['accent', 'background', 3.0, 'links on background'],
  ['accent', 'surface', 3.0, 'links on cards'],
  ['positive', 'surface', 4.5, 'positive balance on cards'],
  ['negative', 'surface', 4.5, 'negative balance on cards'],
  ['negative', 'background', 4.5, 'error text on background'],
];

for (const theme of THEME_LIST) {
  test(`${theme.label}: meets contrast requirements`, () => {
    for (const [fg, bg, min, what] of REQUIREMENTS) {
      const ratio = contrast(theme.colors[fg], theme.colors[bg]);
      assert.ok(
        ratio >= min,
        `${theme.label}: ${what} (${fg} on ${bg}) is ${ratio.toFixed(2)}:1, need ${min}:1`,
      );
    }
  });
}

test('every theme defines every token', () => {
  const tokens = Object.keys(THEME_LIST[0].colors) as (keyof Palette)[];
  for (const theme of THEME_LIST) {
    for (const token of tokens) {
      const value = theme.colors[token];
      assert.ok(
        typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value),
        `${theme.label} has an invalid ${token}: ${value}`,
      );
    }
  }
});

test('resolveTheme falls back safely on unknown or missing input', () => {
  assert.equal(resolveTheme(null).name, DEFAULT_THEME);
  assert.equal(resolveTheme(undefined).name, DEFAULT_THEME);
  assert.equal(resolveTheme('').name, DEFAULT_THEME);
  assert.equal(resolveTheme('not-a-theme').name, DEFAULT_THEME);
  assert.equal(resolveTheme('midnight').name, 'midnight');
});

test('dark flag matches actual palette luminance', () => {
  for (const theme of THEME_LIST) {
    const bgIsDark = luminance(theme.colors.background) < 0.2;
    assert.equal(
      theme.dark,
      bgIsDark,
      `${theme.label}: dark flag is ${theme.dark} but background luminance says ${bgIsDark}`,
    );
  }
});
