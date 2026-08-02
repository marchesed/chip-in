-- ChipIn: let a member leave a group. Depends on 0007.
--
-- Leaving is gated on being settled up, and that is not politeness — it is a
-- data-integrity requirement. group_balances is derived FROM group_members, so
-- deleting the membership row removes that person from the group's accounting
-- while their expenses remain. Verified: a group summing to zero became
--
--     before: A +2000, B -2000   (sum 0)
--     after:  B -2000            (sum -2000)
--
-- B still owes £20 to nobody, and debt simplification yields no transfer
-- because there is no creditor left, so B can never settle. Requiring a zero
-- net before leaving keeps the ledger balanced.

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_net bigint;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'not_member' using errcode = 'P0001';
  end if;

  -- Same formula as group_balances, computed inline so this doesn't depend on
  -- how the view resolves RLS when called from a SECURITY DEFINER context.
  select
    coalesce((
      select sum(e.amount) from public.expenses e
      where e.group_id = p_group_id and e.paid_by = v_uid
    ), 0)
    - coalesce((
      select sum(es.amount_owed)
      from public.expense_shares es
      join public.expenses e2 on e2.id = es.expense_id
      where e2.group_id = p_group_id and es.user_id = v_uid
    ), 0)
    + coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = p_group_id and s.from_user = v_uid
    ), 0)
    - coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = p_group_id and s.to_user = v_uid
    ), 0)
  into v_net;

  if v_net <> 0 then
    -- The amount rides along so the app can name it without a second query.
    raise exception 'outstanding_balance:%', v_net using errcode = 'P0001';
  end if;

  delete from public.group_members
   where group_id = p_group_id and user_id = v_uid;

  -- A group with nobody left is unreachable under RLS forever, so remove it.
  -- Cascades clear its expenses, shares, invites and settlements.
  if not public.group_has_members(p_group_id) then
    delete from public.groups where id = p_group_id;
  end if;
end;
$$;

revoke all on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
