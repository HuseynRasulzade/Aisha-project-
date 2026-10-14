-- "Tək deyilsən": anonymous support community + AI moderation log.
-- Anonymity: author ids live only in base tables, which clients cannot read. Clients read via views that expose an alias only.

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  alias      text not null unique,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
-- No insert/update policies: is_admin can only be granted from the SQL editor / service role.

create or replace function public.make_alias() returns text language sql volatile as $$
  select (array['Sakit','Mehriban','Cəsur','Nəzakətli','Parlaq','Səssiz','Həlim','Qərarlı'])[1 + floor(random() * 8)::int]
    || ' ' || (array['Lotus','Bulud','Dəniz','Ulduz','Yarpaq','Külək','Şəfəq','Çiçək'])[1 + floor(random() * 8)::int]
    || ' ' || (1000 + floor(random() * 9000))::int;
$$;

create or replace function public.ensure_profile(uid uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  for i in 1..10 loop
    begin
      insert into public.profiles (id, alias) values (uid, public.make_alias()) on conflict (id) do nothing;
      return;
    exception when unique_violation then null;  -- alias collision, retry
    end;
  end loop;
end $$;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.ensure_profile(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

select public.ensure_profile(id) from auth.users;  -- backfill existing users

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references auth.users (id) on delete cascade,
  topic      text not null default 'other',
  body       text not null check (char_length(body) between 10 and 1000),
  status     text not null default 'published' check (status in ('published', 'deleted')),
  created_at timestamptz not null default now()
);
create index if not exists posts_feed_idx on public.posts (status, created_at desc);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  body       text not null check (char_length(body) between 2 and 600),
  status     text not null default 'published' check (status in ('published', 'deleted')),
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, created_at);

create table if not exists public.reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.moderation_log (
  id          uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('post', 'comment')),
  content_id  uuid,
  author_id   uuid references auth.users (id) on delete set null,
  alias       text,
  topic       text,
  content     text not null,
  action      text not null check (action in ('removed', 'flagged')),
  severity    text not null check (severity in ('low', 'medium', 'high')),
  categories  text[] not null default '{}',
  reason      text,
  reviewed    boolean not null default false,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists modlog_created_idx on public.moderation_log (created_at desc);

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.moderation_log enable row level security;

-- Base tables: no client access to posts/comments (writes go through the Edge Function with the service role).
revoke all on public.posts, public.comments from anon, authenticated;
revoke all on public.moderation_log from anon;

create policy "reactions_select_own" on public.reactions for select using (auth.uid() = user_id);
create policy "reactions_insert_own" on public.reactions for insert with check (
  auth.uid() = user_id and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'));
create policy "reactions_delete_own" on public.reactions for delete using (auth.uid() = user_id);

create policy "modlog_admin_select" on public.moderation_log for select using (public.is_admin());
create policy "modlog_admin_update" on public.moderation_log for update using (public.is_admin()) with check (public.is_admin());
revoke update on public.moderation_log from authenticated;
grant update (reviewed, reviewed_at) on public.moderation_log to authenticated;

-- Public read models: alias only, never author_id.
create or replace view public.community_posts as
select p.id, pr.alias, p.topic, p.body, p.created_at,
       (select count(*) from public.reactions r where r.post_id = p.id)::int as relate_count,
       exists (select 1 from public.reactions r where r.post_id = p.id and r.user_id = auth.uid()) as i_relate,
       (select count(*) from public.comments c where c.post_id = p.id and c.status = 'published')::int as comment_count,
       (p.author_id = auth.uid()) as mine
from public.posts p join public.profiles pr on pr.id = p.author_id
where p.status = 'published';

create or replace view public.community_comments as
select c.id, c.post_id, pr.alias, c.body, c.created_at, (c.author_id = auth.uid()) as mine
from public.comments c join public.profiles pr on pr.id = c.author_id
where c.status = 'published';

revoke all on public.community_posts, public.community_comments from anon;
grant select on public.community_posts, public.community_comments to authenticated;

alter publication supabase_realtime add table public.moderation_log;
