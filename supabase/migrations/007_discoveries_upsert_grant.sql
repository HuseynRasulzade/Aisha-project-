-- PostgREST upsert generates `ON CONFLICT (user_id) DO UPDATE SET user_id = excluded.user_id, ...`,
-- which needs UPDATE privilege on user_id too. RLS (with check auth.uid() = user_id) still prevents
-- anyone from writing another user's row; map / gens / map_at stay writable only by the Edge Function.
grant update (user_id) on public.discoveries to authenticated;
