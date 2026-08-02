import * as Linking from 'expo-linking';

import { supabase } from './supabase';

/**
 * Turn a Supabase auth deep link into a session.
 *
 * Handles both flows so it works regardless of the project's flowType:
 *   PKCE     -> ?code=...          exchangeCodeForSession
 *   implicit -> #access_token=...  setSession
 *
 * Returns null on success, or a human-readable reason on failure.
 */
export async function establishSessionFromUrl(url: string): Promise<string | null> {
  const parsed = Linking.parse(url);
  const qp = (parsed.queryParams ?? {}) as Record<string, string | undefined>;

  // Fragment params (implicit flow) aren't part of queryParams — parse by hand.
  const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
  const frag = Object.fromEntries(new URLSearchParams(fragment)) as Record<
    string,
    string | undefined
  >;

  const errDescription = qp.error_description ?? frag.error_description;
  const errCode = qp.error ?? frag.error;
  if (errDescription || errCode) {
    return decodeURIComponent(errDescription ?? errCode ?? 'This link is not valid.');
  }

  try {
    if (qp.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(qp.code);
      if (error) throw error;
      return null;
    }
    if (frag.access_token && frag.refresh_token) {
      const { error } = await supabase.auth.setSession({
        access_token: frag.access_token,
        refresh_token: frag.refresh_token,
      });
      if (error) throw error;
      return null;
    }
    return 'This link is missing its sign-in code.';
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not complete sign-in from this link.';
  }
}
