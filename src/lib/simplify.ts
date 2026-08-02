// Debt simplification: collapse everyone's net positions into the fewest
// practical transfers ("Bob pays Alice $12" instead of a web of small debts).
//
// Uses the standard greedy min-cash-flow heuristic: repeatedly settle the
// largest creditor against the largest debtor. Finding the true minimum number
// of transactions is NP-hard, but this always produces at most n-1 transfers
// and is what Splitwise-style apps use in practice.
//
// All amounts are integer cents.

export type Balance = {
  userId: string;
  /** > 0 they are owed, < 0 they owe, 0 settled. */
  netCents: number;
};

export type Transfer = {
  /** Payer (a debtor). */
  from: string;
  /** Payee (a creditor). */
  to: string;
  cents: number;
};

/** Sort by amount desc, tie-broken by userId so output is deterministic. */
function byAmountDesc(a: { userId: string; amt: number }, b: { userId: string; amt: number }) {
  if (b.amt !== a.amt) return b.amt - a.amt;
  return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
}

/**
 * Turn net balances into a list of transfers that settles everyone.
 * Zero balances are ignored. Returns at most n-1 transfers.
 */
export function simplify(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netCents > 0)
    .map((b) => ({ userId: b.userId, amt: b.netCents }))
    .sort(byAmountDesc);

  const debtors = balances
    .filter((b) => b.netCents < 0)
    .map((b) => ({ userId: b.userId, amt: -b.netCents }))
    .sort(byAmountDesc);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;

  while (i < creditors.length && j < debtors.length) {
    const c = creditors[i];
    const d = debtors[j];
    const amount = Math.min(c.amt, d.amt);

    if (amount > 0) {
      transfers.push({ from: d.userId, to: c.userId, cents: amount });
      c.amt -= amount;
      d.amt -= amount;
    }

    // Advance whichever side is exhausted (both, if they matched exactly).
    if (c.amt === 0) i++;
    if (d.amt === 0) j++;
  }

  return transfers;
}
