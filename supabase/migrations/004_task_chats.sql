-- Every plan task is done through a conversation with Aisha. Only the `task-chat` Edge Function writes here;
-- a task counts as completed only when the AI (server side) decides the user has genuinely worked through it.

create table if not exists public.task_chats (
  plan_id    uuid not null references public.plans (id) on delete cascade,
  day        int  not null check (day between 1 and 14),
  task_idx   int  not null check (task_idx between 0 and 9),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  completed  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (plan_id, day, task_idx)
);
alter table public.task_chats enable row level security;
create policy "chats_select_own" on public.task_chats for select using (auth.uid() = user_id);
revoke insert, update, delete on public.task_chats from anon, authenticated;

-- Completing a task from the browser would bypass the conversation, so remove that path.
revoke execute on function public.complete_task(uuid, int, int, text) from authenticated;
