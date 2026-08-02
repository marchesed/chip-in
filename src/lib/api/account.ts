import { clearRecentGroup } from '@/lib/quickActions';
import { supabase } from '@/lib/supabase';

/**
 * Permanently delete the signed-in user's account.
 *
 * Runs server-side in one transaction: personal data is stripped from the
 * profile, memberships/tokens/invites are removed, groups left with nobody are
 * deleted, and the auth user is removed so the account can't sign in again.
 *
 * Shared expense history is deliberately retained in anonymised form — other
 * members' balances are computed from it, so erasing it would corrupt their
 * accounts, not just this one.
 */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) {
    throw new Error(
      error.message.includes('not_authenticated')
        ? 'Please sign in again before deleting your account.'
        : error.message,
    );
  }

  // The credentials are gone; clear local state so the app returns to the
  // signed-out state rather than holding a token that resolves to nothing, and
  // drop the home-screen shortcut which now points at a group they've left.
  await clearRecentGroup();
  await supabase.auth.signOut();
}
