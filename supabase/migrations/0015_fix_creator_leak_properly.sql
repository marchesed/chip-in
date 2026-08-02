-- ChipIn: actually close the group-creator read leak. Supersedes 0014.
--
-- 0014 tried to scope the creator arm with an inline subquery:
--
--     created_by = auth.uid()
--     and not exists (select 1 from public.group_members where group_id = id)
--
-- That does not work. The subquery is evaluated as the CALLING user, so RLS on
-- group_members applies to it: a non-member cannot see anybody else's
-- membership rows, the subquery returns nothing, `not exists` is TRUE, and the
-- creator arm matches after all. Exactly the trap that made is_group_member a
-- SECURITY DEFINER function in 0002 — policy subqueries are not exempt from RLS.
--
-- So the emptiness check has to bypass RLS too.

create or replace function public.group_has_members(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members where group_id = gid
  );
$$;

comment on function public.group_has_members(uuid) is
  'True if the group has at least one member. SECURITY DEFINER so it sees the '
  'real roster rather than the caller''s RLS-filtered view.';

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups for select
  using (
    public.is_group_member(id)
    -- Only while the group is brand new and has nobody in it yet, which is the
    -- single instant `INSERT INTO groups ... RETURNING *` needs.
    or (created_by = auth.uid() and not public.group_has_members(id))
  );
