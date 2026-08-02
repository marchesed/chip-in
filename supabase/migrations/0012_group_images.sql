-- ChipIn M7: custom group images. Depends on 0002.
--
-- Files live in a PRIVATE `group-images` bucket, keyed by group id:
--     group-images/<group_id>/<timestamp>.jpg
-- The first path segment is the group id, which is what the storage policies
-- below key off to decide who may read or write.
--
-- Private means there is no public URL: reads require a signed URL, which the
-- client mints per session (see uploadGroupImage/signImageUrl). Storage only
-- issues one to a caller who passes the SELECT policy — i.e. an actual member —
-- so a group photo is never fetchable by a stranger who somehow learns the path.
--
-- Consequently the database stores the object PATH, not a URL: signed URLs
-- expire, so persisting one would leave a dead link within the hour.

alter table public.groups
  add column if not exists image_path text;

-- An earlier revision of this migration stored a public URL. No data shipped
-- with it, so the column is simply removed rather than migrated.
alter table public.groups
  drop column if exists image_url;

comment on column public.groups.image_path is
  'Object path within the private group-images bucket, e.g. <group_id>/<ts>.jpg. '
  'Null = use the generated letter avatar. Render via a signed URL.';

insert into storage.buckets (id, name, public)
values ('group-images', 'group-images', false)
on conflict (id) do update set public = false;

-- Storage policies ------------------------------------------------------------
-- storage.objects has RLS enabled by Supabase; these scope the bucket.
-- Membership is matched on the first path segment as TEXT rather than casting to
-- uuid, so a malformed path can never raise a cast error inside a policy.

-- Read is members-only. This is also what gates signed-URL creation.
drop policy if exists "group_images_read" on storage.objects;
create policy "group_images_read"
  on storage.objects for select
  using (
    bucket_id = 'group-images'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_images_insert" on storage.objects;
create policy "group_images_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'group-images'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_images_update" on storage.objects;
create policy "group_images_update"
  on storage.objects for update
  using (
    bucket_id = 'group-images'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_images_delete" on storage.objects;
create policy "group_images_delete"
  on storage.objects for delete
  using (
    bucket_id = 'group-images'
    and exists (
      select 1 from public.group_members gm
      where gm.group_id::text = (storage.foldername(name))[1]
        and gm.user_id = auth.uid()
    )
  );

-- Any member may set the group photo -----------------------------------------
-- 0002's groups_update policy is creator-only, which would stop members from
-- saving image_path. Widen it to match how expenses work (any member can edit).
drop policy if exists "groups_update_creator" on public.groups;
drop policy if exists "groups_update_member" on public.groups;
create policy "groups_update_member"
  on public.groups for update
  using (public.is_group_member(id))
  with check (public.is_group_member(id));
