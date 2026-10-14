-- Run this once in the Supabase SQL editor.
-- It creates the habit tables and turns on row level security.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  status text not null check (status in ('done', 'missed')),
  miss_note text,
  created_at timestamptz not null default now(),
  unique (habit_id, day),
  check (
    (status = 'done' and miss_note is null)
    or (
      status = 'missed'
      and miss_note is not null
      and char_length(trim(miss_note)) > 0
    )
  )
);

create or replace function public.reject_fourth_habit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.habits
    where user_id = new.user_id
  ) >= 3 then
    raise exception 'Three habits is the commitment.';
  end if;
  return new;
end;
$$;

drop trigger if exists habits_cap on public.habits;
create trigger habits_cap
before insert on public.habits
for each row
execute function public.reject_fourth_habit();

alter table public.habits enable row level security;
alter table public.checkins enable row level security;

drop policy if exists habits_select_own on public.habits;
drop policy if exists habits_insert_own on public.habits;
drop policy if exists habits_update_own on public.habits;
drop policy if exists habits_delete_own on public.habits;
drop policy if exists checkins_select_own on public.checkins;
drop policy if exists checkins_insert_own on public.checkins;
drop policy if exists checkins_update_own on public.checkins;
drop policy if exists checkins_delete_own on public.checkins;

create policy habits_select_own on public.habits
for select to authenticated
using (auth.uid() = user_id);

create policy habits_insert_own on public.habits
for insert to authenticated
with check (auth.uid() = user_id);

create policy habits_update_own on public.habits
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy habits_delete_own on public.habits
for delete to authenticated
using (auth.uid() = user_id);

create policy checkins_select_own on public.checkins
for select to authenticated
using (auth.uid() = user_id);

create policy checkins_insert_own on public.checkins
for insert to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.habits
    where habits.id = habit_id
      and habits.user_id = auth.uid()
  )
);

create policy checkins_update_own on public.checkins
for update to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.habits
    where habits.id = habit_id
      and habits.user_id = auth.uid()
  )
);

create policy checkins_delete_own on public.checkins
for delete to authenticated
using (auth.uid() = user_id);

revoke all on public.habits from anon;
revoke all on public.checkins from anon;
grant select, insert, update, delete on public.habits to authenticated;
grant select, insert, update, delete on public.checkins to authenticated;
