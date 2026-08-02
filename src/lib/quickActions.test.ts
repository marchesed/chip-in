import assert from 'node:assert/strict';
import { test } from 'node:test';

// groupIdFromAction is pure and has all the branching worth pinning down, so it
// is re-declared here rather than importing the module (which pulls in
// AsyncStorage and the native quick-actions module).
const ADD_EXPENSE_ACTION = 'add-expense';

type Action = {
  id: string;
  title: string;
  params?: Record<string, number | string | boolean | null | undefined> | null;
};

function groupIdFromAction(action: Action | undefined): string | null {
  if (!action || action.id !== ADD_EXPENSE_ACTION) return null;
  const id = action.params?.groupId;
  return typeof id === 'string' && id ? id : null;
}

const act = (over: Partial<Action> = {}): Action => ({
  id: ADD_EXPENSE_ACTION,
  title: 'Add expense',
  params: { groupId: 'group-123' },
  ...over,
});

test('extracts the group id from our action', () => {
  assert.equal(groupIdFromAction(act()), 'group-123');
});

test('ignores actions that are not ours', () => {
  assert.equal(groupIdFromAction(act({ id: 'something-else' })), null);
});

test('handles a cold start with no launching action', () => {
  assert.equal(groupIdFromAction(undefined), null);
});

test('rejects missing, empty, or non-string group ids', () => {
  assert.equal(groupIdFromAction(act({ params: {} })), null);
  assert.equal(groupIdFromAction(act({ params: null })), null);
  assert.equal(groupIdFromAction(act({ params: { groupId: '' } })), null);
  assert.equal(groupIdFromAction(act({ params: { groupId: 42 } })), null);
  assert.equal(groupIdFromAction(act({ params: { groupId: null } })), null);
  assert.equal(groupIdFromAction(act({ params: { groupId: true } })), null);
});
