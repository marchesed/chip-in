-- ChipIn M1: profiles table, auto-provisioning trigger, and RLS.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  avatar_url text,
  phone      text,
  email      text,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'App-facing user profile, 1:1 with auth.users.';

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    -- Prefer a display name passed in signup metadata, fall back to email local part.
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;

-- A user can always read and edit their own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Note: cross-member profile visibility (seeing group-mates' names/avatars)
-- is added in M2 alongside the group_members table and is_group_member(),
-- to avoid referencing tables that don't exist yet.
