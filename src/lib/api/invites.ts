import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export type Invite = {
  id: string;
  group_id: string;
  token: string;
  expires_at: string;
  created_at: string;
};

/**
 * Build the deep link that opens the app to the join flow for a token.
 *
 * `isTripleSlashed` matters: without it this produces `chipin://join/<token>`,
 * where `join` parses as the URL *host* and only `<token>` is the path — so the
 * router sees no `join/[token]` match and the screen gets an undefined token.
 * The triple-slashed form `chipin:///join/<token>` has an empty host, so the
 * whole thing is a path and routes correctly.
 */
export function buildInviteUrl(token: string): string {
  return Linking.createURL(`join/${token}`, { isTripleSlashed: true });
}

/** The most recent non-expired invite for a group, if any. */
export async function getActiveInvite(groupId: string): Promise<Invite | null> {
  const { data, error } = await supabase
    .from('invites')
    .select('id, group_id, token, expires_at, created_at')
    .eq('group_id', groupId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Create a fresh invite for a group (token + expiry are set by the DB). */
export async function createInvite(groupId: string): Promise<Invite> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('invites')
    .insert({ group_id: groupId, created_by: user.id })
    .select('id, group_id, token, expires_at, created_at')
    .single();

  if (error) throw error;
  return data;
}

/** Reuse the active invite for a group or create one. */
export async function getOrCreateInvite(groupId: string): Promise<Invite> {
  return (await getActiveInvite(groupId)) ?? (await createInvite(groupId));
}

const JOIN_ERRORS: Record<string, string> = {
  not_authenticated: 'Please sign in to join this group.',
  invalid_invite: 'This invite link is not valid.',
  expired_invite: 'This invite link has expired. Ask for a new one.',
};

/**
 * Redeem an invite token for the current user via the join_group RPC.
 * Returns the joined group's id. Throws with a friendly message on failure.
 */
export async function joinGroup(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_group', { invite_token: token });

  if (error) {
    const known = Object.keys(JOIN_ERRORS).find((k) => error.message.includes(k));
    throw new Error(known ? JOIN_ERRORS[known] : error.message);
  }
  return data as string;
}
