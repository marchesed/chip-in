-- ChipIn: push notifications when an expense is added. Depends on 0006.
--
-- Delivery runs straight from Postgres via pg_net, so there is no Edge Function
-- to deploy and no CLI/Docker in the loop. A trigger on expenses collects the
-- Expo push tokens of every OTHER group member and POSTs one batch to Expo.
--
-- Requires the pg_net extension (Database > Extensions > enable "pg_net" if the
-- create extension below is not permitted for your role).

create extension if not exists pg_net;

-- Device tokens ---------------------------------------------------------------
create table if not exists public.device_tokens (
  token      text primary key,             -- ExponentPushToken[...]
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- A user only ever manages their own device tokens. Nobody can read anyone
-- else's: the notification trigger reads them as SECURITY DEFINER instead.
drop policy if exists "device_tokens_select_own" on public.device_tokens;
create policy "device_tokens_select_own"
  on public.device_tokens for select
  using (user_id = auth.uid());

drop policy if exists "device_tokens_insert_own" on public.device_tokens;
create policy "device_tokens_insert_own"
  on public.device_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "device_tokens_update_own" on public.device_tokens;
create policy "device_tokens_update_own"
  on public.device_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "device_tokens_delete_own" on public.device_tokens;
create policy "device_tokens_delete_own"
  on public.device_tokens for delete
  using (user_id = auth.uid());

-- Notify on new expense -------------------------------------------------------
create or replace function public.notify_expense_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor     uuid := auth.uid();
  v_group     record;
  v_actor_name text;
  v_messages  jsonb;
  v_body      text;
begin
  select g.name, g.currency into v_group
  from public.groups g where g.id = new.group_id;

  select coalesce(p.name, split_part(coalesce(p.email, ''), '@', 1), 'Someone')
    into v_actor_name
  from public.profiles p where p.id = coalesce(v_actor, new.paid_by);

  v_body := v_actor_name || ' added ' ||
            case when coalesce(new.description, '') = ''
                 then 'an expense' else new.description end ||
            ' · ' || to_char(new.amount / 100.0, 'FM999999990.00') ||
            ' ' || coalesce(v_group.currency, '');

  -- Every group member except whoever submitted it, and only those with a
  -- registered device.
  select jsonb_agg(
           jsonb_build_object(
             'to', dt.token,
             'title', v_group.name,
             'body', v_body,
             'sound', 'default',
             'data', jsonb_build_object(
               'type', 'expense_added',
               'groupId', new.group_id,
               'expenseId', new.id
             )
           )
         )
    into v_messages
  from public.group_members gm
  join public.device_tokens dt on dt.user_id = gm.user_id
  where gm.group_id = new.group_id
    and gm.user_id is distinct from v_actor;

  if v_messages is null then
    return new;   -- nobody to notify
  end if;

  -- A push failure must never roll back the expense that triggered it.
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_messages,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      )
    );
  exception when others then
    raise warning 'notify_expense_added: push failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_expense_created on public.expenses;
create trigger on_expense_created
  after insert on public.expenses
  for each row execute function public.notify_expense_added();
