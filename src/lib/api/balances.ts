import { supabase } from '@/lib/supabase';
import type { Balance } from '@/lib/simplify';

/**
 * Net position per member for a group, straight from the `group_balances` view
 * (paid − owed ± settlements). RLS on the view is security_invoker, so this only
 * returns rows for groups the caller belongs to.
 *
 * Profiles are joined client-side: the view carries no foreign-key metadata, so
 * PostgREST can't embed `profiles` off it.
 */
export async function getGroupBalances(groupId: string): Promise<Balance[]> {
  const { data, error } = await supabase
    .from('group_balances')
    .select('user_id, net_cents')
    .eq('group_id', groupId);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    netCents: row.net_cents ?? 0,
  }));
}
