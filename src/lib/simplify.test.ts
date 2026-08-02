import assert from 'node:assert/strict';
import { test } from 'node:test';

import { simplify, type Balance } from './simplify.ts';

const totalMoved = (ts: { cents: number }[]) => ts.reduce((s, t) => s + t.cents, 0);
const totalOwed = (bs: Balance[]) =>
  bs.filter((b) => b.netCents > 0).reduce((s, b) => s + b.netCents, 0);

/** Apply transfers to balances; everyone should end at zero. */
function settle(balances: Balance[], transfers: { from: string; to: string; cents: number }[]) {
  const net = new Map(balances.map((b) => [b.userId, b.netCents]));
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) + t.cents);
    net.set(t.to, (net.get(t.to) ?? 0) - t.cents);
  }
  return [...net.values()];
}

test('two-party debt is a single transfer', () => {
  const balances: Balance[] = [
    { userId: 'a', netCents: 500 },
    { userId: 'b', netCents: -500 },
  ];
  assert.deepEqual(simplify(balances), [{ from: 'b', to: 'a', cents: 500 }]);
});

test('everyone settled produces no transfers', () => {
  assert.deepEqual(simplify([{ userId: 'a', netCents: 0 }, { userId: 'b', netCents: 0 }]), []);
  assert.deepEqual(simplify([]), []);
});

test('one creditor, two debtors settles fully in 2 transfers', () => {
  const balances: Balance[] = [
    { userId: 'a', netCents: 1000 },
    { userId: 'b', netCents: -400 },
    { userId: 'c', netCents: -600 },
  ];
  const ts = simplify(balances);
  assert.equal(ts.length, 2);
  assert.equal(totalMoved(ts), 1000);
  assert.ok(settle(balances, ts).every((n) => n === 0), 'all settled');
});

test('mutual debts collapse rather than round-tripping', () => {
  // A owes B, B owes C, C owes A — nets cancel into a smaller set.
  const balances: Balance[] = [
    { userId: 'a', netCents: -500 },
    { userId: 'b', netCents: 200 },
    { userId: 'c', netCents: 300 },
  ];
  const ts = simplify(balances);
  assert.ok(ts.length <= 2, `expected <= 2 transfers, got ${ts.length}`);
  assert.ok(settle(balances, ts).every((n) => n === 0), 'all settled');
  // Nobody both pays and receives.
  const payers = new Set(ts.map((t) => t.from));
  const payees = new Set(ts.map((t) => t.to));
  assert.equal([...payers].filter((p) => payees.has(p)).length, 0);
});

test('never exceeds n-1 transfers and always fully settles', () => {
  const cases: Balance[][] = [
    [
      { userId: 'a', netCents: 1000 },
      { userId: 'b', netCents: -250 },
      { userId: 'c', netCents: -250 },
      { userId: 'd', netCents: -500 },
    ],
    [
      { userId: 'a', netCents: 333 },
      { userId: 'b', netCents: 333 },
      { userId: 'c', netCents: 334 },
      { userId: 'd', netCents: -1000 },
    ],
    [
      { userId: 'a', netCents: -1 },
      { userId: 'b', netCents: 1 },
    ],
    [
      { userId: 'a', netCents: 700 },
      { userId: 'b', netCents: -300 },
      { userId: 'c', netCents: 100 },
      { userId: 'd', netCents: -500 },
      { userId: 'e', netCents: 0 },
    ],
  ];

  for (const balances of cases) {
    const ts = simplify(balances);
    assert.ok(ts.length <= balances.length - 1, `too many transfers: ${ts.length}`);
    assert.equal(totalMoved(ts), totalOwed(balances), 'moves exactly what is owed');
    assert.ok(settle(balances, ts).every((n) => n === 0), 'all settled');
    assert.ok(ts.every((t) => t.cents > 0), 'no zero/negative transfers');
    assert.ok(ts.every((t) => t.from !== t.to), 'no self-transfers');
  }
});

test('output is deterministic regardless of input order', () => {
  const balances: Balance[] = [
    { userId: 'a', netCents: 600 },
    { userId: 'b', netCents: -600 },
    { userId: 'c', netCents: 400 },
    { userId: 'd', netCents: -400 },
  ];
  const first = simplify(balances);
  const shuffled = simplify([...balances].reverse());
  assert.deepEqual(first, shuffled);
});
