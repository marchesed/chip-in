import { supabase } from '@/lib/supabase';

export type Settlement = {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount: number; // cents
  settled_at: string;
};

/**
 * Record a payment between two group members. RLS requires the caller to be a
 * member and both parties to belong to the group.
 */
export async function recordSettlement(input: {
  groupId: string;
  fromUser: string;
  toUser: string;
  amountCents: number;
}): Promise<Settlement> {
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      group_id: input.groupId,
      from_user: input.fromUser,
      to_user: input.toUser,
      amount: input.amountCents,
    })
    .select('id, group_id, from_user, to_user, amount, settled_at')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Settlement history for a group, newest first. Member names are resolved
 * client-side against the group roster: `settlements` has two foreign keys to
 * `profiles` (from_user and to_user), so a PostgREST embed would need
 * constraint-name disambiguation for each.
 */
export async function listSettlements(groupId: string): Promise<Settlement[]> {
  const { data, error } = await supabase
    .from('settlements')
    .select('id, group_id, from_user, to_user, amount, settled_at')
    .eq('group_id', groupId)
    .order('settled_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
