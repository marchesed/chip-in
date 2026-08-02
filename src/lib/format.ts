/** Capitalize the first letter, leave the rest untouched (unlike iOS's
 * textTransform:'capitalize', which lowercases the remaining letters and so
 * mangles all-caps tokens like currency codes). */
export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
