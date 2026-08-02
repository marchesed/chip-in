-- ChipIn M2: groups + group_members, membership helpers, and RLS.
-- Depends on 0001_profiles.sql.

create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  type       text not null default 'household',
  currency   text not null default 'CAD' check (char_length(currency) = 3),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id              uuid not null references public.groups (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  -- Default share weight for this member, used as the per-expense default.
  -- Percents across a group are intended to sum to 100 (validated app-side).
  default_split_percent numeric(5, 2) not null default 0 check (default_split_percent >= 0 and default_split_percent <= 100),
  joined_at             timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members (user_id);

-- Membership helpers -------------------------------------------------------
-- SECURITY DEFINER so they bypass RLS on group_members and can't recurse into
-- the very policies that call them.

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.shares_group_with(other uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = other
  );
$$;

-- RLS: groups --------------------------------------------------------------
alter table public.groups enable row level security;

-- Creator OR any member can select. The `created_by` arm matters: it lets the
-- creator read the row back immediately after INSERT ... RETURNING, before their
-- own membership row has been added (otherwise the create flow 403s).
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups for select
  using (created_by = auth.uid() or public.is_group_member(id));

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
  on public.groups for insert
  with check (created_by = auth.uid());

drop policy if exists "groups_update_creator" on public.groups;
create policy "groups_update_creator"
  on public.groups for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "groups_delete_creator" on public.groups;
create policy "groups_delete_creator"
  on public.groups for delete
  using (created_by = auth.uid());

-- RLS: group_members -------------------------------------------------------
alter table public.group_members enable row level security;

-- A user can always see their own membership rows; members can see the whole
-- roster. The `user_id = auth.uid()` arm also lets an INSERT ... RETURNING on a
-- fresh membership re-select the row (is_group_member can't see the just-inserted
-- row inside its own STABLE subquery during the returning select).
drop policy if exists "group_members_select" on public.group_members;
create policy "group_members_select"
  on public.group_members for select
  using (user_id = auth.uid() or public.is_group_member(group_id));

-- A user may add only themselves (used when creating a group; invite-based
-- joins for other users go through a SECURITY DEFINER RPC in M3).
drop policy if exists "group_members_insert_self" on public.group_members;
create policy "group_members_insert_self"
  on public.group_members for insert
  with check (user_id = auth.uid());

-- Members can adjust split percentages within their group.
drop policy if exists "group_members_update" on public.group_members;
create policy "group_members_update"
  on public.group_members for update
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- A user can leave (delete self); the group creator can remove anyone.
drop policy if exists "group_members_delete" on public.group_members;
create policy "group_members_delete"
  on public.group_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- Deferred from M1: group-mates can read each other's profiles ---------------
drop policy if exists "profiles_select_group_mates" on public.profiles;
create policy "profiles_select_group_mates"
  on public.profiles for select
  using (public.shares_group_with(id));
