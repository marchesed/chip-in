-- ChipIn: make balances survive someone leaving. Supersedes the view in 0007.
--
-- group_balances used to select FROM group_members, so deleting a membership row
-- erased that person from the group's accounting while their expenses remained.
-- Measured on a balanced group:
--
--     before: A +2000, B -2000   (sum 0)
--     after:  B -2000            (sum -2000)
--
-- B owed money to nobody and debt simplification produced no transfer, because
-- there was no creditor left — so B could never settle. leave_group (0016)
-- sidesteps this by refusing while the caller has a balance, but
-- delete_my_account cannot: Apple requires account deletion to work, so it can't
-- be gated on being settled up.
--
-- The fix is to stop treating "who is in this group's ledger" as the same
-- question as "who is currently a member". A participant is anyone with
-- financial history here, so a departure never erases a position and the group
-- always sums to zero.

create or replace view public.group_balances
with (security_invoker = true)
as
with participants as (
  select group_id, user_id from public.group_members
  union
  select group_id, paid_by  from public.expenses
  union
  select e.group_id, es.user_id
    from public.expense_shares es
    join public.expenses e on e.id = es.expense_id
  union
  select group_id, from_user from public.settlements
  union
  select group_id, to_user   from public.settlements
)
select
  p.group_id,
  p.user_id,
  (
    coalesce((
      select sum(e.amount) from public.expenses e
      where e.group_id = p.group_id and e.paid_by = p.user_id
    ), 0)
    - coalesce((
      select sum(es.amount_owed)
      from public.expense_shares es
      join public.expenses e2 on e2.id = es.expense_id
      where e2.group_id = p.group_id and es.user_id = p.user_id
    ), 0)
    + coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = p.group_id and s.from_user = p.user_id
    ), 0)
    - coalesce((
      select sum(s.amount) from public.settlements s
      where s.group_id = p.group_id and s.to_user = p.user_id
    ), 0)
  )::bigint as net_cents
from participants p;

grant select on public.group_balances to authenticated;

-- Isolation is unchanged: security_invoker means every branch of the union is
-- filtered by the caller's RLS, so a non-member matches nothing and sees no rows.

-- Settling with someone who has left --------------------------------------
-- Keeping departed people in the ledger is only useful if the debt can actually
-- be cleared. settlements_insert_member required BOTH parties to be current
-- members, which would make "you owe someone who deleted their account"
-- permanently unsettleable.

create or replace function public.is_group_participant(gid uuid, uid uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    exists (select 1 from public.group_members where group_id = gid and user_id = uid)
    or exists (select 1 from public.expenses where group_id = gid and paid_by = uid)
    or exists (
      select 1 from public.expense_shares es
      join public.expenses e on e.id = es.expense_id
      where e.group_id = gid and es.user_id = uid
    )
    or exists (
      select 1 from public.settlements
      where group_id = gid and (from_user = uid or to_user = uid)
    );
$$;

comment on function public.is_group_participant(uuid, uuid) is
  'True if the user has any financial history in the group, whether or not they '
  'are still a member. SECURITY DEFINER so it sees past the caller''s RLS view.';

-- The caller must still be a current member to record anything; the two parties
-- only need to be participants.
drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
  on public.settlements for insert
  with check (
    public.is_group_member(group_id)
    and public.is_group_participant(group_id, from_user)
    and public.is_group_participant(group_id, to_user)
  );
