import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centsToInput, parseAmountToCents } from './money.ts';

test('parseAmountToCents parses valid amounts to integer cents', () => {
  assert.equal(parseAmountToCents('12.34'), 1234);
  assert.equal(parseAmountToCents('0.01'), 1);
  assert.equal(parseAmountToCents('100'), 10000);
  assert.equal(parseAmountToCents('19.99'), 1999); // float-artifact guard
  assert.equal(parseAmountToCents(' 42 '), 4200);
  assert.equal(parseAmountToCents('$5.50'), 550);
  assert.equal(parseAmountToCents('7.5'), 750);
});

test('parseAmountToCents rejects invalid or non-positive input', () => {
  assert.equal(parseAmountToCents(''), null);
  assert.equal(parseAmountToCents('.'), null);
  assert.equal(parseAmountToCents('abc'), null);
  assert.equal(parseAmountToCents('0'), null);
  assert.equal(parseAmountToCents('-5'), null); // '-' stripped -> '5'? guard below
  assert.equal(parseAmountToCents('1.234'), null); // too many decimals
  assert.equal(parseAmountToCents('1.2.3'), null);
});

test('centsToInput renders 2 decimals', () => {
  assert.equal(centsToInput(1234), '12.34');
  assert.equal(centsToInput(5), '0.05');
  assert.equal(centsToInput(10000), '100.00');
});
