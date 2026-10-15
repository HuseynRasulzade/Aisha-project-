-- "Özümü kəşf edirəm": a user's self-reflection answers and the AI-written personal growth map.
-- Reflection tool only: not a diagnosis and not a fixed personality verdict.
create table if not exists public.discoveries (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  answers    jsonb not null default '{}'::jsonb,
  map        jsonb,
  map_at     timestamptz,
  gens       timestamptz[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.discoveries enable row level security;
create policy "disc_select_own" on public.discoveries for select using (auth.uid() = user_id);
create policy "disc_insert_own" on public.discoveries for insert with check (auth.uid() = user_id);
create policy "disc_update_own" on public.discoveries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "disc_delete_own" on public.discoveries for delete using (auth.uid() = user_id);

-- Clients may only write their answers; the map and the rate-limit log are written by the Edge Function.
revoke insert, update on public.discoveries from anon, authenticated;
grant insert (user_id, answers, updated_at) on public.discoveries to authenticated;
grant update (answers, updated_at) on public.discoveries to authenticated;
