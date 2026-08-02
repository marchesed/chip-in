// Split-percentage helpers. Percents are stored as numeric(5,2), so we work to
// 2 decimal places. To avoid float drift we compute in integer "basis points"
// (hundredths of a percent): 100.00% === 10000 bp.

const BP = 100; // basis points per percent (2 decimals)
export const TOTAL_BP = 100 * BP; // 10000

/** Round a percent to 2 decimals as an integer basis-point value. */
function toBp(percent: number): number {
  return Math.round(percent * BP);
}

export type SplitValidation = {
  valid: boolean;
  /** Sum of the provided percents, rounded to 2 decimals. */
  sum: number;
  /** Signed difference from 100 (positive = over), rounded to 2 decimals. */
  remaining: number;
};

/**
 * Validate that a set of member percents sums to exactly 100 (to 2 decimals).
 * Empty input is invalid.
 */
export function validateSplits(percents: number[]): SplitValidation {
  const totalBp = percents.reduce((acc, p) => acc + toBp(p), 0);
  return {
    valid: percents.length > 0 && totalBp === TOTAL_BP,
    sum: totalBp / BP,
    remaining: (TOTAL_BP - totalBp) / BP,
  };
}

/**
 * Produce `count` percents that sum to exactly 100.00, as evenly as possible.
 * The leftover basis points (from non-divisible splits) are spread one-by-one
 * across the first members, so e.g. 3 members -> [33.34, 33.33, 33.33].
 */
export function evenSplit(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(TOTAL_BP / count);
  let remainder = TOTAL_BP - base * count;
  return Array.from({ length: count }, (_, i) => {
    const extra = i < remainder ? 1 : 0;
    return (base + extra) / BP;
  });
}

/**
 * Split an integer cent amount across members by percent, returning integer
 * cents that sum EXACTLY to `totalCents`. Uses the largest-remainder method:
 * floor every share, then hand the leftover cents out one at a time to the
 * shares with the largest fractional parts (ties break toward the lower index,
 * i.e. the order given). Works for any percents; if they don't sum to 100 the
 * leftover is still distributed so the total is always preserved.
 */
export function splitCentsByPercent(totalCents: number, percents: number[]): number[] {
  const n = percents.length;
  if (n === 0) return [];

  // Exact share numerators in cents * TOTAL_BP, kept as integers.
  //   exact_i = totalCents * percentBp_i / TOTAL_BP
  const numerators = percents.map((p) => totalCents * toBp(p));
  const floors = numerators.map((num) => Math.floor(num / TOTAL_BP));
  const remainders = numerators.map((num, i) => num - floors[i] * TOTAL_BP);

  let leftover = totalCents - floors.reduce((a, b) => a + b, 0);

  // Order indices by remainder desc, stable on original index for ties.
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => remainders[b] - remainders[a] || a - b,
  );

  const result = floors.slice();
  for (let k = 0; k < order.length && leftover > 0; k++) {
    result[order[k]] += 1;
    leftover -= 1;
  }
  // If percents summed to >100 (negative leftover), trim from smallest remainders.
  for (let k = order.length - 1; k >= 0 && leftover < 0; k--) {
    if (result[order[k]] > 0) {
      result[order[k]] -= 1;
      leftover += 1;
    }
  }
  return result;
}
