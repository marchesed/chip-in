-- ChipIn M8: in-app account deletion. Depends on 0010.
--
-- Apple requires in-app account deletion for any app that offers account
-- creation (App Store guideline 5.1.1(v)).
--
-- We cannot simply delete the person. groups.created_by, expenses.paid_by,
-- expense_shares.user_id and settlements.from_user/to_user are all ON DELETE
-- RESTRICT, deliberately: removing someone who appears in expense history would
-- silently corrupt every other member's balance. So deletion means
-- ANONYMISE THE PERSON, KEEP THE LEDGER.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the user deleted their account. The row is retained, stripped of '
  'personal data, so financial history referencing it stays valid.';

-- Break the profile -> auth.users link ---------------------------------------
-- profiles.id referenced auth.users(id) ON DELETE CASCADE. Deleting the auth
-- user would therefore cascade into deleting the profile row and immediately
-- hit the RESTRICT constraints above, aborting the whole transaction. Dropping
-- the constraint lets an anonymised profile outlive its auth user. Profiles are
-- still created by the handle_new_user trigger; only the constraint goes.
alter table public.profiles
  drop constraint if exists profiles_id_fkey;

-- Historical names stay visible ----------------------------------------------
-- Once memberships are removed, shares_group_with() no longer matches, so
-- remaining members could not read the deleted profile and old expenses would
-- render as "Someone". A deleted profile holds no personal data, so allowing it
-- to be read keeps expense history legible without leaking anything.
drop policy if exists "profiles_select_deleted" on public.profiles;
create policy "profiles_select_deleted"
  on public.profiles for select
  using (deleted_at is not null);

-- delete_my_account ----------------------------------------------------------
-- SECURITY DEFINER because it must reach into the auth schema. Everything runs
-- in one transaction: if the auth deletion fails, nothing is anonymised either.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_groups uuid[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- Remember the groups before dropping memberships, so the emptiness check
  -- below stays scoped to this user rather than sweeping the whole table.
  select array_agg(group_id) into v_groups
  from public.group_members
  where user_id = v_uid;

  -- 1. Strip personal data but keep the row for financial references.
  update public.profiles
     set name       = 'Deleted user',
         email      = null,
         phone      = null,
         avatar_url = null,
         deleted_at = now()
   where id = v_uid;

  -- 2. Stop push immediately.
  delete from public.device_tokens where user_id = v_uid;

  -- 3. Invites they created become unusable.
  delete from public.invites where created_by = v_uid;

  -- 4. Leave every group (removes their access and hides them from rosters).
  delete from public.group_members where user_id = v_uid;

  -- 5. Any group they were in that now has nobody left is unreachable under RLS
  --    forever, so remove it. Cascades clear its expenses, shares and invites.
  if v_groups is not null then
    delete from public.groups g
     where g.id = any (v_groups)
       and not exists (
         select 1 from public.group_members gm where gm.group_id = g.id
       );
  end if;

  -- 6. Finally remove the credentials so the account cannot sign in again.
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
