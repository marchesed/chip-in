-- ChipIn M2 fix: allow a group's creator to select it before their membership
-- row exists. Without this, `INSERT INTO groups ... RETURNING *` (what the app's
-- createGroup does via .select()) is denied by RLS, because groups_select_member
-- required is_group_member(id) and the creator isn't a member yet at that instant.
--
-- Safe to run on an already-migrated database (drops + recreates the policy).

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups for select
  using (created_by = auth.uid() or public.is_group_member(id));
