import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evenSplit, splitCentsByPercent, validateSplits } from './splits.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('evenSplit sums to exactly 100% for 1..12 members', () => {
  for (let n = 1; n <= 12; n++) {
    const parts = evenSplit(n);
    assert.equal(parts.length, n);
    // Sum in basis points to avoid float comparison.
    assert.equal(sum(parts.map((p) => Math.round(p * 100))), 10000, `n=${n}`);
  }
});

test('evenSplit gives the leftover cent-of-a-percent to earlier members', () => {
  assert.deepEqual(evenSplit(3), [33.34, 33.33, 33.33]);
});

test('validateSplits accepts exactly 100 and rejects otherwise', () => {
  assert.equal(validateSplits([50, 50]).valid, true);
  assert.equal(validateSplits([33.33, 33.33, 33.34]).valid, true);
  assert.equal(validateSplits([50, 49.99]).valid, false);
  assert.equal(validateSplits([60, 40, 0.01]).valid, false);
  assert.equal(validateSplits([]).valid, false);
  assert.equal(validateSplits([100]).remaining, 0);
});

test('splitCentsByPercent always sums back to the total', () => {
  const cases: [number, number[]][] = [
    [1000, [33.33, 33.33, 33.34]],
    [1000, [50, 50]],
    [1001, [50, 50]],
    [1, [50, 50]],
    [9999, [33.33, 33.33, 33.34]],
    [12345, [10, 20, 30, 40]],
    [100, [99.99, 0.01]],
    [7, [14.29, 14.29, 14.29, 14.29, 14.28, 14.28, 14.28]],
  ];
  for (const [total, percents] of cases) {
    const parts = splitCentsByPercent(total, percents);
    assert.equal(sum(parts), total, `total=${total} percents=${percents}`);
    assert.ok(parts.every((c) => c >= 0), 'no negative cents');
  }
});

test('splitCentsByPercent: $10.00 three ways -> 334/333/333', () => {
  assert.deepEqual(splitCentsByPercent(1000, [33.34, 33.33, 33.33]), [334, 333, 333]);
});

test('splitCentsByPercent: odd cent on 50/50 goes to the first member', () => {
  assert.deepEqual(splitCentsByPercent(1001, [50, 50]), [501, 500]);
});

test('splitCentsByPercent: 100% to one member gets the whole amount', () => {
  assert.deepEqual(splitCentsByPercent(4237, [100]), [4237]);
});

test('splitCentsByPercent: zero-percent members get zero', () => {
  const parts = splitCentsByPercent(1000, [100, 0, 0]);
  assert.deepEqual(parts, [1000, 0, 0]);
});
