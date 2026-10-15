-- Plan tasks are completed by writing an entry in the in-app diary.
-- Day N+1 stays locked (and its content stays on the server) until every task of day N has an entry.

create table if not exists public.task_entries (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  day        int  not null check (day between 1 and 14),
  task_idx   int  not null check (task_idx between 0 and 9),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content    text not null check (char_length(content) between 10 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, day, task_idx)
);
alter table public.task_entries enable row level security;
create policy "entries_select_own" on public.task_entries for select using (auth.uid() = user_id);
revoke insert, update, delete on public.task_entries from anon, authenticated;  -- writes only via complete_task()

-- Clients may no longer read the full plan JSON (it contains the locked days).
revoke select on public.plans from anon, authenticated;
grant select (id, problems, lang, created_at) on public.plans to authenticated;
revoke update on public.plans from anon, authenticated;

create or replace function public.get_plan(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r public.plans; days jsonb; n int; i int; j int; t_n int;
  day_obj jsonb; tasks jsonb; new_tasks jsonb; ent jsonb; entries jsonb;
  res_days jsonb := '[]'::jsonb; locked jsonb := '[]'::jsonb;
  blocked boolean := false; done_cnt int; total_done int := 0; total int := 0;
begin
  select * into r from public.plans where id = p_id and user_id = auth.uid();
  if not found then return null; end if;

  select coalesce(jsonb_object_agg(day || '-' || task_idx,
           jsonb_build_object('content', content, 'at', updated_at)), '{}'::jsonb)
    into entries from public.task_entries where plan_id = p_id;

  days := r.plan -> 'days';
  n := jsonb_array_length(days);
  for i in 0 .. n - 1 loop
    day_obj := days -> i;
    tasks := day_obj -> 'tasks';
    t_n := jsonb_array_length(tasks);
    total := total + t_n;
    done_cnt := 0;
    new_tasks := '[]'::jsonb;
    for j in 0 .. t_n - 1 loop
      ent := entries -> ((i + 1) || '-' || j);
      if ent is not null then done_cnt := done_cnt + 1; end if;
      new_tasks := new_tasks || jsonb_build_array((tasks -> j) || jsonb_build_object('entry', ent));
    end loop;
    total_done := total_done + done_cnt;
    if blocked then
      locked := locked || to_jsonb(i + 1);
    else
      res_days := res_days || jsonb_build_array((day_obj - 'tasks') || jsonb_build_object('day', i + 1, 'tasks', new_tasks, 'done', done_cnt = t_n));
      if done_cnt < t_n then blocked := true; end if;
    end if;
  end loop;

  return jsonb_build_object(
    'id', r.id, 'created_at', r.created_at, 'problems', r.problems,
    'summary', r.plan -> 'summary', 'focus_areas', r.plan -> 'focus_areas',
    'professional_help_note', r.plan -> 'professional_help_note',
    'total_days', n, 'days', res_days, 'locked', locked,
    'done', total_done, 'total', total, 'finished', total_done = total and total > 0,
    'closing_tip', case when total_done = total and total > 0 then r.plan -> 'closing_tip' else null end);
end $$;

create or replace function public.list_plans() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x ->> 'created_at') desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'created_at', p.created_at, 'problems', p.problems,
      'done', (select count(*) from public.task_entries e where e.plan_id = p.id),
      'total', (select coalesce(sum(jsonb_array_length(d -> 'tasks')), 0) from jsonb_array_elements(p.plan -> 'days') d)) as x
    from public.plans p where p.user_id = auth.uid() order by p.created_at desc limit 20) s;
$$;

create or replace function public.complete_task(p_plan uuid, p_day int, p_idx int, p_content text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.plans; n int; k int; t_n int; txt text := btrim(coalesce(p_content, ''));
begin
  select * into r from public.plans where id = p_plan and user_id = auth.uid();
  if not found then raise exception 'not_found'; end if;
  n := jsonb_array_length(r.plan -> 'days');
  if p_day < 1 or p_day > n then raise exception 'bad_day'; end if;
  if p_idx < 0 or p_idx >= jsonb_array_length(r.plan -> 'days' -> (p_day - 1) -> 'tasks') then raise exception 'bad_task'; end if;
  if char_length(txt) < 10 then raise exception 'too_short'; end if;
  -- every task of every earlier day must already be done
  for k in 1 .. p_day - 1 loop
    t_n := jsonb_array_length(r.plan -> 'days' -> (k - 1) -> 'tasks');
    if (select count(*) from public.task_entries where plan_id = p_plan and day = k) < t_n then raise exception 'day_locked'; end if;
  end loop;
  insert into public.task_entries (plan_id, day, task_idx, user_id, content)
  values (p_plan, p_day, p_idx, auth.uid(), left(txt, 5000))
  on conflict (plan_id, day, task_idx) do update set content = excluded.content, updated_at = now();
  return public.get_plan(p_plan);
end $$;

revoke all on function public.get_plan(uuid), public.list_plans(), public.complete_task(uuid, int, int, text) from public, anon;
grant execute on function public.get_plan(uuid), public.list_plans(), public.complete_task(uuid, int, int, text) to authenticated;
