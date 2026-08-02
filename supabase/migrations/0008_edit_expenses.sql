-- ChipIn: editing and deleting expenses. Depends on 0006.
--
-- Editing was impossible before this: 0006 shipped no UPDATE policy at all, so
-- every update was denied.
--
-- Permission model: ANY group member may edit or delete ANY expense in their
-- group (Splitwise-style shared ledger — whoever spots a mistake can fix it).
-- This also widens 0006's delete rule, which was payer-or-creator. Keeping
-- delete narrow while edit is open bought nothing: a member could simply edit an
-- expense down to a cent, so the restriction was an annoyance rather than a
-- guardrail.
--
-- Idempotent: safe to re-run over an earlier version of this migration.

alter table public.expenses
  add column if not exists updated_at timestamptz;

comment on column public.expenses.updated_at is
  'Set by update_expense; null means never edited.';

drop policy if exists "expenses_update" on public.expenses;
create policy "expenses_update"
  on public.expenses for update
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

-- Widen 0006's payer-or-creator delete rule to any member, matching edit.
drop policy if exists "expenses_delete" on public.expenses;
create policy "expenses_delete"
  on public.expenses for delete
  using (public.is_group_member(group_id));

-- update_expense: replace an expense and its shares atomically. ---------------
-- Mirrors add_expense's validation. Runs in one transaction, so a rejected edit
-- leaves the original expense and shares completely untouched.
create or replace function public.update_expense(
  p_expense_id  uuid,
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
  v_group_id   uuid;
  v_share_sum  bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select e.group_id into v_group_id
  from public.expenses e
  where e.id = p_expense_id;

  if v_group_id is null then
    raise exception 'expense_not_found' using errcode = 'P0001';
  end if;

  -- Any member of the group may edit any of its expenses.
  if not public.is_group_member(v_group_id) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;

  if p_shares is null or jsonb_array_length(p_shares) = 0 then
    raise exception 'no_shares' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.group_members
    where group_id = v_group_id and user_id = p_paid_by
  ) then
    raise exception 'payer_not_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_shares) s
    where not exists (
      select 1 from public.group_members gm
      where gm.group_id = v_group_id
        and gm.user_id = (s ->> 'user_id')::uuid
    )
  ) then
    raise exception 'share_user_not_member' using errcode = 'P0001';
  end if;

  select coalesce(sum((s ->> 'amount_owed')::bigint), 0)
    into v_share_sum
  from jsonb_array_elements(p_shares) s;

  if v_share_sum <> p_amount then
    raise exception 'shares_sum_mismatch: % vs %', v_share_sum, p_amount
      using errcode = 'P0001';
  end if;

  update public.expenses
     set paid_by     = p_paid_by,
         amount      = p_amount,
         description = coalesce(p_description, ''),
         date        = coalesce(p_date, current_date),
         updated_at  = now()
   where id = p_expense_id;

  -- Replace the split wholesale; simpler and safer than diffing rows.
  delete from public.expense_shares where expense_id = p_expense_id;

  insert into public.expense_shares (expense_id, user_id, percent, amount_owed)
  select p_expense_id,
         (s ->> 'user_id')::uuid,
         (s ->> 'percent')::numeric,
         (s ->> 'amount_owed')::bigint
  from jsonb_array_elements(p_shares) s;

  return p_expense_id;
end;
$$;

revoke all on function public.update_expense(uuid, uuid, bigint, text, date, jsonb) from public, anon;
grant execute on function public.update_expense(uuid, uuid, bigint, text, date, jsonb) to authenticated;
