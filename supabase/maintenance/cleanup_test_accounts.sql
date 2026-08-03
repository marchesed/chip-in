-- Remove the throwaway accounts created by smoke testing.
--
-- RUN STEP 1 FIRST AND READ THE OUTPUT. Step 2 is destructive and irreversible.
--
-- Why this needs a script rather than the dashboard: financial foreign keys
-- (groups.created_by, expenses.paid_by, expense_shares.user_id,
-- settlements.from_user/to_user) are ON DELETE RESTRICT, so a profile cannot be
-- removed while it appears anywhere in a ledger. Migration 0013 also dropped the
-- profiles -> auth.users foreign key, so deleting an auth user no longer removes
-- its profile — that has to be done explicitly or orphan rows are left behind.
--
-- Whole test GROUPS are deleted rather than individual rows. Deleting one
-- member's expense_shares out of a surviving expense would leave that expense's
-- shares no longer summing to its amount, which is worse than leaving the data
-- alone. Step 1 lists every group that will go, so check the names look like
-- test groups before running step 2.

-- ===========================================================================
-- STEP 1 — PREVIEW (read-only, safe to run repeatedly)
-- ===========================================================================

with doomed as (
  select id, email, created_at
  from auth.users
  where (
        email like 'chipin-%@gmail.com'   -- chipin-smoke/m3..m6/edit/settled/push/img/del/leave/bv/pwreset
     or email like 'dbg%@gmail.com'       -- ad-hoc debug probes
     or email like 'dm3-%@gmail.com'
     or email like 'bal-%@gmail.com'
     or email like 'lv-%@gmail.com'
     or email like 'audit-%@gmail.com'
     or email like 'verify-%@gmail.com'
     or email like 'probe-%@gmail.com'
  )
  -- Belt and braces: never touch the real accounts.
  and email not in ('marchese@hotmail.ca', 'marchesedb@gmail.com')
)
select 'users to delete' as item, count(*)::text as detail from doomed
union all
select 'groups to delete', count(distinct g.id)::text
  from public.groups g
  where g.created_by in (select id from doomed)
     or exists (select 1 from public.group_members gm
                where gm.group_id = g.id and gm.user_id in (select id from doomed))
union all
select 'expenses in those groups', count(*)::text
  from public.expenses e
  where e.group_id in (
    select g.id from public.groups g
    where g.created_by in (select id from doomed)
       or exists (select 1 from public.group_members gm
                  where gm.group_id = g.id and gm.user_id in (select id from doomed))
  )
union all
-- MUST be 0. Anything here means a test user is entangled with a real group.
select '>> real users in those groups (must be 0)', count(distinct gm.user_id)::text
  from public.group_members gm
  where gm.user_id not in (select id from doomed)
    and gm.group_id in (
      select g.id from public.groups g
      where g.created_by in (select id from doomed)
         or exists (select 1 from public.group_members gm2
                    where gm2.group_id = g.id and gm2.user_id in (select id from doomed))
    );

-- And eyeball the actual names before deleting anything:
with doomed as (
  select id from auth.users
  where (email like 'chipin-%@gmail.com' or email like 'dbg%@gmail.com'
      or email like 'dm3-%@gmail.com' or email like 'bal-%@gmail.com'
      or email like 'lv-%@gmail.com' or email like 'audit-%@gmail.com'
      or email like 'verify-%@gmail.com' or email like 'probe-%@gmail.com')
    and email not in ('marchese@hotmail.ca', 'marchesedb@gmail.com')
)
select g.name, g.created_at,
       (select count(*) from public.group_members gm where gm.group_id = g.id) as members
from public.groups g
where g.created_by in (select id from doomed)
   or exists (select 1 from public.group_members gm
              where gm.group_id = g.id and gm.user_id in (select id from doomed))
order by g.created_at;


-- ===========================================================================
-- STEP 2 — DELETE  (only after step 1 looks right; "real users" must be 0)
-- ===========================================================================
-- Runs as one transaction: if any statement fails, nothing is removed.

begin;

create temporary table doomed_users on commit drop as
select id from auth.users
where (
      email like 'chipin-%@gmail.com'
   or email like 'dbg%@gmail.com'
   or email like 'dm3-%@gmail.com'
   or email like 'bal-%@gmail.com'
   or email like 'lv-%@gmail.com'
   or email like 'audit-%@gmail.com'
   or email like 'verify-%@gmail.com'
   or email like 'probe-%@gmail.com'
)
and email not in ('marchese@hotmail.ca', 'marchesedb@gmail.com');

create temporary table doomed_groups on commit drop as
select g.id from public.groups g
where g.created_by in (select id from doomed_users)
   or exists (select 1 from public.group_members gm
              where gm.group_id = g.id and gm.user_id in (select id from doomed_users));

-- 1. Whole test groups. Cascades their members, invites, expenses,
--    expense_shares and settlements.
delete from public.groups where id in (select id from doomed_groups);

-- 2. Anything left pointing at these users from groups that survived.
--    Settlements before shares before expenses: each references the ones after.
delete from public.settlements
 where from_user in (select id from doomed_users)
    or to_user   in (select id from doomed_users);

delete from public.expense_shares
 where user_id in (select id from doomed_users);

delete from public.expenses
 where paid_by in (select id from doomed_users);

delete from public.group_members
 where user_id in (select id from doomed_users);

delete from public.device_tokens
 where user_id in (select id from doomed_users);

delete from public.invites
 where created_by in (select id from doomed_users);

-- 3. Profiles must go explicitly — 0013 removed the cascade from auth.users.
delete from public.profiles
 where id in (select id from doomed_users);

-- 4. Finally the credentials.
delete from auth.users
 where id in (select id from doomed_users);

commit;


-- ===========================================================================
-- STEP 3 — CONFIRM
-- ===========================================================================

select 'remaining test users' as item, count(*)::text as detail
from auth.users
where email like 'chipin-%@gmail.com' or email like 'dbg%@gmail.com'
   or email like 'dm3-%@gmail.com' or email like 'bal-%@gmail.com'
   or email like 'lv-%@gmail.com' or email like 'audit-%@gmail.com'
   or email like 'verify-%@gmail.com' or email like 'probe-%@gmail.com'
union all
-- Left behind by any earlier partial cleanup attempts.
select 'orphaned profiles (no auth user)', count(*)::text
from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id)
union all
select 'groups with no members', count(*)::text
from public.groups g
where not exists (select 1 from public.group_members gm where gm.group_id = g.id);
