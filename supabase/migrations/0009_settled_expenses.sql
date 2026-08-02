-- ChipIn: mark expenses settled so the list can collapse history. Depends on 0007.
--
-- Settlements are group-level (a payment between two people) and are NOT linked
-- to individual expenses — one payment routinely covers parts of several. So
-- "settled" is modelled as a watermark rather than per-expense attribution:
-- recording ANY settlement closes the books on everything logged up to that
-- point. Expenses added afterwards start fresh.
--
-- IMPORTANT: settled_at is display-only. group_balances still sums every
-- expense regardless of this column, so hiding a row never changes what anyone
-- owes. A partial settlement can therefore hide expenses while a balance is
-- still outstanding — that's the accepted trade-off of this rule.

alter table public.expenses
  add column if not exists settled_at timestamptz;

comment on column public.expenses.settled_at is
  'Set when a settlement closed the books on this expense. Display-only: '
  'balances ignore it. Null means the expense is still active.';

create index if not exists expenses_group_active_idx
  on public.expenses (group_id, settled_at);

-- Stamp every still-active expense in the group when a settlement is recorded.
-- A trigger (rather than client code) so it holds no matter how the settlement
-- was created.
create or replace function public.mark_expenses_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.expenses
     set settled_at = new.settled_at
   where group_id = new.group_id
     and settled_at is null;
  return new;
end;
$$;

drop trigger if exists on_settlement_created on public.settlements;
create trigger on_settlement_created
  after insert on public.settlements
  for each row execute function public.mark_expenses_settled();
