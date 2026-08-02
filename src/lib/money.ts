// Money is handled as integer minor units (cents) everywhere. These helpers are
// the only place dollars<->cents conversion happens, so float math stays at the
// display edge and never touches stored amounts.

/** Format integer cents as a localized currency string, e.g. 1234 -> "$12.34". */
export function formatCents(cents: number, currency = 'CAD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** Format integer cents as a plain 2-decimal number, e.g. 1234 -> "12.34". */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Parse a user-typed amount into integer cents. Accepts an optional currency
 * symbol/whitespace and up to two decimals. Returns null for empty/invalid
 * input or non-positive amounts.
 */
export function parseAmountToCents(text: string): number | null {
  // Reject explicit negatives before stripping, so "-5" doesn't become "5".
  if (text.includes('-')) return null;
  const cleaned = text.trim().replace(/[^0-9.]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  // Reject more than one decimal point or more than two decimal places.
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;

  // Round to avoid binary float artifacts (e.g. 19.99 * 100 = 1998.9999...).
  return Math.round(value * 100);
}
