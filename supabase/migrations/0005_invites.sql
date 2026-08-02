-- ChipIn M3: invites + the join_group RPC. Depends on 0002.
-- Invites are reusable until they expire (default 7 days); the join flow runs
-- through a SECURITY DEFINER RPC because the invitee is not yet a member and so
-- cannot select the invite row under RLS.

create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  -- 32 hex chars, url-safe, ~122 bits of entropy. gen_random_uuid is core PG.
  token      text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists invites_group_idx on public.invites (group_id);

-- RLS: only group members manage invites. The invitee never selects invites
-- directly — join_group (below) resolves the token for them.
alter table public.invites enable row level security;

drop policy if exists "invites_select_member" on public.invites;
create policy "invites_select_member"
  on public.invites for select
  using (public.is_group_member(group_id));

drop policy if exists "invites_insert_member" on public.invites;
create policy "invites_insert_member"
  on public.invites for insert
  with check (public.is_group_member(group_id) and created_by = auth.uid());

drop policy if exists "invites_delete_member" on public.invites;
create policy "invites_delete_member"
  on public.invites for delete
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- join_group: validate a token and add the caller to the group. ---------------
-- SECURITY DEFINER so it can read the invite and insert the membership on behalf
-- of a user who is not yet a member. Returns the joined group's id.
create or replace function public.join_group(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_expires  timestamptz;
  v_uid      uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select group_id, expires_at into v_group_id, v_expires
  from public.invites
  where token = invite_token;

  if v_group_id is null then
    raise exception 'invalid_invite' using errcode = 'P0001';
  end if;

  if v_expires < now() then
    raise exception 'expired_invite' using errcode = 'P0001';
  end if;

  -- New members join at 0%; the group re-balances splits afterwards.
  insert into public.group_members (group_id, user_id, default_split_percent)
  values (v_group_id, v_uid, 0)
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

-- Expose the RPC to signed-in users only.
revoke all on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;
