-- AISA AI: free-form decision-support conversations. Only the `aisa-chat` Edge Function writes messages.
create table if not exists public.ai_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null default '',
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_chats_user_idx on public.ai_chats (user_id, updated_at desc);
alter table public.ai_chats enable row level security;
create policy "ai_chats_select_own" on public.ai_chats for select using (auth.uid() = user_id);
create policy "ai_chats_delete_own" on public.ai_chats for delete using (auth.uid() = user_id);
revoke insert, update on public.ai_chats from anon, authenticated;
