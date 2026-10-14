-- Apply after supabase/schema.sql.
-- Habits become a reusable library; commitments are the three choices for one day.

begin;

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  unique (user_id, day, position),
  unique (user_id, day, habit_id)
);

insert into public.commitments (habit_id, user_id, day, position, created_at)
select id, user_id, created_at::date, position, created_at
from public.habits
on conflict do nothing;

drop trigger if exists habits_cap on public.habits;
drop function if exists public.reject_fourth_habit();

alter table public.habits
  drop constraint if exists habits_user_id_position_key;

alter table public.habits
  drop column position;

create unique index habits_user_normalized_name_key
  on public.habits (user_id, lower(btrim(name)));

create index checkins_user_day_idx
  on public.checkins (user_id, day);

alter table public.commitments enable row level security;

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
using ((select auth.uid()) = user_id);

create policy habits_insert_own on public.habits
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy habits_update_own on public.habits
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy habits_delete_own on public.habits
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy checkins_select_own on public.checkins
for select to authenticated
using ((select auth.uid()) = user_id);

create policy checkins_insert_own on public.checkins
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.habits
    join public.commitments
      on commitments.habit_id = habits.id
    where habits.id = checkins.habit_id
      and habits.user_id = (select auth.uid())
      and commitments.user_id = (select auth.uid())
      and commitments.day = checkins.day
  )
);

create policy checkins_update_own on public.checkins
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.habits
    join public.commitments
      on commitments.habit_id = habits.id
    where habits.id = checkins.habit_id
      and habits.user_id = (select auth.uid())
      and commitments.user_id = (select auth.uid())
      and commitments.day = checkins.day
  )
);

create policy checkins_delete_own on public.checkins
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy commitments_select_own on public.commitments
for select to authenticated
using ((select auth.uid()) = user_id);

create policy commitments_insert_own on public.commitments
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.habits
    where habits.id = commitments.habit_id
      and habits.user_id = (select auth.uid())
  )
);

create or replace function public.set_commitment(
  p_day date,
  p_habit_id uuid default null,
  p_name text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_habit_id uuid;
  v_position smallint;
  v_name text := btrim(p_name);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Sign in first.';
  end if;

  -- Serialize slot selection for this user and day.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_day::text, 0)
  );

  if p_habit_id is not null then
    select id
    into v_habit_id
    from public.habits
    where id = p_habit_id
      and user_id = v_user_id;

    if v_habit_id is null then
      raise exception using errcode = '42501', message = 'That habit is not yours.';
    end if;
  else
    if v_name is null or v_name = '' then
      raise exception using errcode = '22023', message = 'Name the habit.';
    end if;

    select id
    into v_habit_id
    from public.habits
    where user_id = v_user_id
      and lower(btrim(name)) = lower(v_name);

    if v_habit_id is null then
      insert into public.habits (user_id, name)
      values (v_user_id, v_name)
      returning id into v_habit_id;
    end if;
  end if;

  if exists (
    select 1
    from public.commitments
    where user_id = v_user_id
      and day = p_day
      and habit_id = v_habit_id
  ) then
    raise exception using errcode = '23505', message = 'That habit is already committed today.';
  end if;

  select candidate
  into v_position
  from pg_catalog.generate_series(1, 3) as candidate
  where not exists (
    select 1
    from public.commitments
    where user_id = v_user_id
      and day = p_day
      and position = candidate
  )
  order by candidate
  limit 1;

  if v_position is null then
    raise exception using errcode = '23505', message = 'Three habits is the commitment.';
  end if;

  insert into public.commitments (habit_id, user_id, day, position)
  values (v_habit_id, v_user_id, p_day, v_position);

  return v_habit_id;
end;
$$;

revoke all on public.commitments from anon;
grant select, insert on public.commitments to authenticated;

revoke all on function public.set_commitment(date, uuid, text) from public;
grant execute on function public.set_commitment(date, uuid, text) to authenticated;

commit;
