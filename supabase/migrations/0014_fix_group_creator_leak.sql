-- ChipIn: stop a group's creator retaining read access after they leave.
--
-- 0003 relaxed groups_select_member to:
--     created_by = auth.uid() or is_group_member(id)
-- because `INSERT INTO groups ... RETURNING *` (what createGroup does via
-- .select()) has to read the row back in the instant before the creator's
-- membership row exists.
--
-- That arm never expires, so it also grants permanent access to a creator who
-- has since LEFT the group — or whose account has been deleted, which is how
-- this surfaced: a deleted user could still read a group they had created.
--
-- Narrow it to the window it was actually for: the creator may read the group
-- only while it has no members at all. Once anybody has joined, membership is
-- the sole test.

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups for select
  using (
    public.is_group_member(id)
    or (
      created_by = auth.uid()
      and not exists (
        select 1 from public.group_members gm where gm.group_id = id
      )
    )
  );
