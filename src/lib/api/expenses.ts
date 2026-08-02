import { supabase } from '@/lib/supabase';

export type ExpenseShareInput = {
  userId: string;
  percent: number;
  amountOwed: number; // cents
};

export type ExpenseListItem = {
  id: string;
  amount: number; // cents
  description: string;
  date: string;
  paid_by: string;
  /** Non-null once a settlement closed the books on it. Display-only. */
  settled_at: string | null;
  payer: { id: string; name: string | null; email: string | null } | null;
};

export type ExpenseDetail = ExpenseListItem & {
  group_id: string;
  shares: {
    user_id: string;
    percent: number;
    amount_owed: number;
    profile: { id: string; name: string | null; email: string | null } | null;
  }[];
};

const ADD_ERRORS: Record<string, string> = {
  not_authenticated: 'Please sign in.',
  not_member: 'You are not a member of this group.',
  invalid_amount: 'Enter an amount greater than zero.',
  no_shares: 'This expense has no split.',
  payer_not_member: 'The payer must be a group member.',
  share_user_not_member: 'Everyone in the split must be a group member.',
  shares_sum_mismatch: 'The split does not add up to the total.',
  not_allowed: "You don't have permission to change this expense.",
  expense_not_found: 'That expense no longer exists.',
};

function friendlyError(message: string): Error {
  const known = Object.keys(ADD_ERRORS).find((k) => message.includes(k));
  return new Error(known ? ADD_ERRORS[known] : message);
}

/** Insert an expense and its shares atomically via the add_expense RPC. */
export async function addExpense(input: {
  groupId: string;
  paidBy: string;
  amount: number; // cents
  description: string;
  date: string; // YYYY-MM-DD
  shares: ExpenseShareInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('add_expense', {
    p_group_id: input.groupId,
    p_paid_by: input.paidBy,
    p_amount: input.amount,
    p_description: input.description,
    p_date: input.date,
    p_shares: input.shares.map((s) => ({
      user_id: s.userId,
      percent: s.percent,
      amount_owed: s.amountOwed,
    })),
  });

  if (error) throw friendlyError(error.message);
  return data as string;
}

/**
 * Replace an existing expense and its shares atomically via update_expense.
 * A rejected edit leaves the original completely untouched.
 */
export async function updateExpense(input: {
  expenseId: string;
  paidBy: string;
  amount: number; // cents
  description: string;
  date: string; // YYYY-MM-DD
  shares: ExpenseShareInput[];
}): Promise<string> {
  const { data, error } = await supabase.rpc('update_expense', {
    p_expense_id: input.expenseId,
    p_paid_by: input.paidBy,
    p_amount: input.amount,
    p_description: input.description,
    p_date: input.date,
    p_shares: input.shares.map((s) => ({
      user_id: s.userId,
      percent: s.percent,
      amount_owed: s.amountOwed,
    })),
  });

  if (error) throw friendlyError(error.message);
  return data as string;
}

/**
 * Delete an expense. Shares cascade. RLS restricts this to the payer or the
 * group creator — a denied delete removes no rows rather than erroring, so we
 * verify by asking for the deleted row back.
 */
export async function deleteExpense(expenseId: string): Promise<void> {
  const { data, error } = await supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .select('id');

  if (error) throw friendlyError(error.message);
  if (!data || data.length === 0) {
    throw new Error(ADD_ERRORS.not_allowed);
  }
}

/** Expenses for a group, newest first, with the payer's profile. */
export async function listExpenses(groupId: string): Promise<ExpenseListItem[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select(
      'id, amount, description, date, paid_by, settled_at, payer:profiles!expenses_paid_by_fkey(id, name, email)',
    )
    .eq('group_id', groupId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ExpenseListItem[];
}

/** A single expense with its shares. */
export async function getExpense(id: string): Promise<ExpenseDetail> {
  const { data: expense, error: eErr } = await supabase
    .from('expenses')
    .select(
      'id, group_id, amount, description, date, paid_by, payer:profiles!expenses_paid_by_fkey(id, name, email)',
    )
    .eq('id', id)
    .single();
  if (eErr) throw eErr;

  const { data: shares, error: sErr } = await supabase
    .from('expense_shares')
    .select('user_id, percent, amount_owed, profile:profiles(id, name, email)')
    .eq('expense_id', id);
  if (sErr) throw sErr;

  return {
    ...(expense as unknown as ExpenseListItem & { group_id: string }),
    shares: (shares ?? []) as unknown as ExpenseDetail['shares'],
  };
}
