-- ChipIn M4: expenses + expense_shares and an atomic add_expense RPC.
-- Depends on 0002. All money is integer cents (bigint).

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  paid_by     uuid not null references public.profiles (id) on delete restrict,
  amount      bigint not null check (amount > 0),        -- cents
  description text not null default '',
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists expenses_group_idx on public.expenses (group_id, date desc);

create table if not exists public.expense_shares (
  expense_id  uuid not null references public.expenses (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete restrict,
  percent     numeric(5, 2) not null check (percent >= 0 and percent <= 100),
  amount_owed bigint not null check (amount_owed >= 0),  -- cents
  primary key (expense_id, user_id)
);

create index if not exists expense_shares_user_idx on public.expense_shares (user_id);

-- RLS ----------------------------------------------------------------------
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member"
  on public.expenses for select
  using (public.is_group_member(group_id));

-- The payer or the group creator can delete an expense.
drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete"
  on public.expenses for delete
  using (
    paid_by = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

drop policy if exists "expense_shares_select_member" on public.expense_shares;
create policy "expense_shares_select_member"
  on public.expense_shares for select
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_id and public.is_group_member(e.group_id)
    )
  );

-- add_expense: insert an expense and its shares atomically. -------------------
-- p_shares is a jsonb array of { user_id, percent, amount_owed }. Runs in a
-- single transaction; any raised exception rolls back the whole thing, so a
-- mismatched split can never persist. Returns the new expense id.
create or replace function public.add_expense(
  p_group_id    uuid,
  p_paid_by     uuid,
  p_amount      bigint,
  p_description text,
  p_date        date,
  p_shares      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_expense_id uuid;
  v_share_sum  bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'no_shares' using errcode = 'P0001';
  end if;

  -- Payer must belong to the group.
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_paid_by
  ) then
    raise exception 'payer_not_member' using errcode = 'P0001';
  end if;

  -- Every share recipient must belong to the group.
  if exists (
    select 1
    from jsonb_array_elements(p_shares) s
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = p_group_id
        and gm.user_id = (s ->> 'user_id')::uuid
    )
  ) then
    raise exception 'share_user_not_member' using errcode = 'P0001';
  end if;

  -- Shares must sum to the expense amount exactly.
  select coalesce(sum((s ->> 'amount_owed')::bigint), 0)
    into v_share_sum
  from jsonb_array_elements(p_shares) s;

  if v_share_sum <> p_amount then
    raise exception 'shares_sum_mismatch: % vs %', v_share_sum, p_amount
      using errcode = 'P0001';
  end if;

  insert into public.expenses (group_id, paid_by, amount, description, date)
  values (p_group_id, p_paid_by, p_amount, coalesce(p_description, ''),
          coalesce(p_date, current_date))
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, percent, amount_owed)
  select v_expense_id,
         (s ->> 'user_id')::uuid,
         (s ->> 'percent')::numeric,
         (s ->> 'amount_owed')::bigint
  from jsonb_array_elements(p_shares) s;

  return v_expense_id;
end;
$$;

revoke all on function public.add_expense(uuid, uuid, bigint, text, date, jsonb) from public, anon;
grant execute on function public.add_expense(uuid, uuid, bigint, text, date, jsonb) to authenticated;
