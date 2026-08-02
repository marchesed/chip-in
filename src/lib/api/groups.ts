import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';

const IMAGE_BUCKET = 'group-images';
/** Signed URLs are short-lived; the app refetches on focus and pull-to-refresh. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type GroupSummary = {
  id: string;
  name: string;
  type: string;
  currency: string;
  created_by: string;
  created_at: string;
  /** Stable object path — also the image cache key. Null if no photo. */
  image_path: string | null;
  /** Signed, expiring URL for rendering. Do not persist. */
  image_url: string | null;
};

export type GroupMemberWithProfile = {
  user_id: string;
  default_split_percent: number;
  joined_at: string;
  profile: {
    id: string;
    name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
};

export type GroupDetail = GroupSummary & {
  members: GroupMemberWithProfile[];
};

/** Groups the current user belongs to (RLS scopes this to their memberships). */
export async function listGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, type, currency, created_by, created_at, image_path')
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data ?? [];

  const urls = await signImageUrls(
    rows.map((g) => g.image_path).filter((p): p is string => !!p),
  );
  return rows.map((g) => ({
    ...g,
    image_url: g.image_path ? (urls.get(g.image_path) ?? null) : null,
  }));
}

/**
 * Create a group and add the creator as its first member at 100%.
 * Two inserts (group, then membership); if the second fails we surface the
 * error — an atomic RPC can replace this later if partial state becomes an issue.
 */
export async function createGroup(input: {
  name: string;
  type: string;
  currency: string;
}): Promise<GroupSummary> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not signed in.');

  const { data: group, error: groupError } = await supabase
    .from('groups')
    .insert({
      name: input.name,
      type: input.type,
      currency: input.currency,
      created_by: user.id,
    })
    .select('id, name, type, currency, created_by, created_at, image_path')
    .single();

  if (groupError) throw groupError;

  const { error: memberError } = await supabase.from('group_members').insert({
    group_id: group.id,
    user_id: user.id,
    default_split_percent: 100,
  });
  if (memberError) throw memberError;

  // A brand-new group never has a photo yet.
  return { ...group, image_url: null };
}

/** A group with its members joined to profile info. */
export async function getGroup(id: string): Promise<GroupDetail> {
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, type, currency, created_by, created_at, image_path')
    .eq('id', id)
    .single();
  if (groupError) throw groupError;

  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select(
      'user_id, default_split_percent, joined_at, profile:profiles(id, name, avatar_url, email)',
    )
    .eq('group_id', id)
    .order('joined_at', { ascending: true });
  if (membersError) throw membersError;

  return {
    ...group,
    image_url: await signImageUrl(group.image_path),
    members: (members ?? []) as unknown as GroupMemberWithProfile[],
  };
}

/**
 * Mint a signed URL for one object path. Storage only issues one if the caller
 * passes the bucket's SELECT policy, i.e. is a member of that group.
 */
export async function signImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  // A missing photo shouldn't break the screen — fall back to the letter avatar.
  return error ? null : (data?.signedUrl ?? null);
}

/** Batch version, so a list of groups costs one request rather than N. */
async function signImageUrls(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;

  const { data, error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return urls;

  for (const entry of data) {
    if (entry.path && entry.signedUrl) urls.set(entry.path, entry.signedUrl);
  }
  return urls;
}

/**
 * Upload a new group photo and point the group at it.
 *
 * Each upload gets a unique filename rather than overwriting a fixed one, so a
 * replaced photo can never be served from an image cache keyed on the old path.
 * The previous file is deleted afterwards so replacements don't accumulate.
 *
 * Returns { path, url }: the path to persist and cache on, and a signed URL to
 * render immediately.
 */
export async function uploadGroupImage(
  groupId: string,
  image: { base64: string; mimeType?: string | null },
): Promise<{ path: string; url: string | null }> {
  const contentType = image.mimeType ?? 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const path = `${groupId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, decode(image.base64), { contentType, upsert: false });
  if (uploadError) throw uploadError;

  // Note the old file before repointing the group.
  const { data: existing } = await supabase
    .from('groups')
    .select('image_path')
    .eq('id', groupId)
    .single();

  const { error: updateError } = await supabase
    .from('groups')
    .update({ image_path: path })
    .eq('id', groupId);
  if (updateError) throw updateError;

  const oldPath = existing?.image_path ?? null;
  if (oldPath && oldPath !== path) {
    // Best effort: a leftover file is untidy, not broken.
    await supabase.storage.from(IMAGE_BUCKET).remove([oldPath]);
  }

  return { path, url: await signImageUrl(path) };
}

/** Clear the group photo and delete the stored file. */
export async function removeGroupImage(groupId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('groups')
    .select('image_path')
    .eq('id', groupId)
    .single();

  const { error } = await supabase
    .from('groups')
    .update({ image_path: null })
    .eq('id', groupId);
  if (error) throw error;

  const path = existing?.image_path ?? null;
  if (path) await supabase.storage.from(IMAGE_BUCKET).remove([path]);
}

/**
 * Leave a group. Refuses while the caller has a non-zero balance: their
 * expenses stay behind but they'd vanish from the group's accounting, leaving
 * the others owing money to nobody.
 *
 * Deletes the group too if they were the last member.
 */
export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (!error) return;

  const outstanding = error.message.match(/outstanding_balance:(-?\d+)/);
  if (outstanding) {
    const cents = Math.abs(Number(outstanding[1]));
    const owed = Number(outstanding[1]) > 0;
    throw new Error(
      `Settle up first — ${owed ? "you're owed" : 'you owe'} ${(cents / 100).toFixed(2)} in this group.`,
    );
  }
  if (error.message.includes('not_member')) {
    throw new Error('You are not a member of this group.');
  }
  throw error;
}

/** Persist updated default split percentages for members of a group. */
export async function updateMemberSplits(
  groupId: string,
  splits: { userId: string; percent: number }[],
): Promise<void> {
  // Update each member row; RLS restricts this to the caller's groups.
  const results = await Promise.all(
    splits.map((s) =>
      supabase
        .from('group_members')
        .update({ default_split_percent: s.percent })
        .eq('group_id', groupId)
        .eq('user_id', s.userId),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
