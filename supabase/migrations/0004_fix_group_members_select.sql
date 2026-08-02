-- ChipIn M2 fix: let a user always see their own membership rows.
--
-- group_members_select previously required is_group_member(group_id). That
-- function is STABLE SECURITY DEFINER and its subquery does not observe the
-- row being inserted during an INSERT ... RETURNING, so re-selecting a freshly
-- inserted membership (i.e. .insert().select()) was denied. Adding the
-- user_id = auth.uid() arm is both correct (you can see your own memberships)
-- and removes that footgun. Isolation is preserved: it only exposes rows where
-- the caller IS the member.
--
-- Safe to run on an already-migrated database.

drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select"
  on public.group_members for select
  using (user_id = auth.uid() or public.is_group_member(group_id));
