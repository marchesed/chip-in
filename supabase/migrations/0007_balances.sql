-- ChipIn M5: settlements table + the group_balances view.
-- Depends on 0006. All money is integer cents (bigint).
--
-- settlements is created here (rather than in M6) so the balances view is
-- settlement-aware from the start; M6 only adds the UI that inserts rows.

create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  from_user  uuid not null references public.profiles (id) on delete restrict,
  to_user    uuid not null references public.profiles (id) on delete restrict,
  amount     bigint not null check (amount > 0),   -- cents
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint settlements_distinct_parties check (from_user <> to_user)
);

create index if not exists settlements_group_idx on public.settlements (group_id, settled_at desc);

alter table public.settlements enable row level security;

drop policy if exists "settlements_select_member" on public.settlements;
create policy "settlements_select_member"
  on public.settlements for select
  using (public.is_group_member(group_id));

-- Any member can record a settlement between two members of their group.
drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
  on public.settlements for insert
  with check (
    public.is_group_member(group_id)
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id and gm.user_id = from_user
    )
    and exists (
      select 1 from public.group_members gm
      where gm.group_id = settlements.group_id and gm.user_id = to_user
    )
  );

drop policy if exists "settlements_delete_member" on public.settlements;
create policy "settlements_delete_member"
  on public.settlements for delete
  using (public.is_group_member(group_id));

-- group_balances -------------------------------------------------------------
-- Net position per member, in cents:
--     what they paid  -  what they owe  +  what they've paid out in settlements
--                                       -  what they've received in settlements
--   > 0 they are owed, < 0 they owe, 0 settled up.
--
-- WITH (security_invoker = true) is essential: without it the view runs as its
-- owner and BYPASSES row level security on the underlying tables, which would
-- let any authenticated user read every group's balances. With it, the caller's
-- RLS applies, so a user only sees balances for groups they belong to.
create or replace view public.group_balances
with (security_invoker = true)
as
select
  gm.group_id,
  gm.user_id,
  (
    coalesce((
      select sum(e.amount) from public.expenses e
      where e.group_id = gm.group_id and e.paid_by = gm.user_id
    ), 0)
    - coalesce((
      select sum(es.amount_owed)
      from public.expense_shares es
      join public.expenses e2 on e2.id = es.expense_id
      where e2.group_id = gm.group_id and es.user_id = gm.user_id
    ), 0)
    + coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = gm.group_id and s.from_user = gm.user_id
    ), 0)
    - coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = gm.group_id and s.to_user = gm.user_id
    ), 0)
  )::bigint as net_cents
from public.group_members gm;

grant select on public.group_balances to authenticated;
