-- Stores each user's problems and the AI-generated 7-day plan.
create table if not exists public.plans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  problems   jsonb not null,
  plan       jsonb not null,
  progress   jsonb not null default '{}'::jsonb,
  lang       text,
  created_at timestamptz not null default now()
);

create index if not exists plans_user_created_idx on public.plans (user_id, created_at desc);

alter table public.plans enable row level security;

create policy "plans_select_own" on public.plans for select using (auth.uid() = user_id);
create policy "plans_insert_own" on public.plans for insert with check (auth.uid() = user_id);
create policy "plans_update_own" on public.plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plans_delete_own" on public.plans for delete using (auth.uid() = user_id);
