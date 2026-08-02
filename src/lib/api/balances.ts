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

/**
 * Names for people who appear in a group's balances but not in its roster —
 * they had expenses here and have since left or deleted their account.
 *
 * A deleted account is readable (its profile holds no personal data by then) and
 * comes back as "Deleted user". Someone who merely left is not readable, since
 * you no longer share a group; the caller falls back to a generic label.
 */
export async function getFormerParticipantNames(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds);

  if (error || !data) return {};
  return Object.fromEntries(
    data.map((p) => [p.id, p.name || p.email || 'Former member']),
  );
}
