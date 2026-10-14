# Auth + AI plan setup

Architecture: static site -> Supabase Auth + `plans` table (RLS) -> Edge Function `generate-plan` -> OpenAI.
The OpenAI key lives only in Supabase function secrets, never in the browser.

## 1. Supabase project
1. Create a project at https://supabase.com.
2. Copy **Project URL** and **anon public key** (Settings -> API) into `config.js`.
3. Authentication -> Providers -> Email is enabled by default. For instant sign-in during testing, turn off "Confirm email".
4. Authentication -> URL Configuration: add your site URL (and `http://localhost:8765` for local dev).

## 2. Database
Run `supabase/migrations/001_plans.sql` in the SQL editor (or `supabase db push`).

## 3. Edge Function
```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
supabase secrets set OPENAI_API_KEY=sk-...        # optional: OPENAI_MODEL=gpt-4o-mini DAILY_LIMIT=10
supabase functions deploy generate-plan
```

## 4. Run locally
```bash
python3 -m http.server 8765
```
Open http://localhost:8765/signup.html, create an account, then use **AI Plan**.

## Notes
- Each user can only read/update/delete their own plans (RLS). Default limit: 10 plans per 24 h per user.
- The function treats user text as data (prompt-injection guard) and adds a safety note if crisis wording is detected.

## Community ("You are not alone") + moderation
```bash
supabase db push                      # applies 002_community.sql
supabase functions deploy community   # needs the same OPENAI_API_KEY secret
```
Make yourself admin (after you have signed up) in the Supabase SQL editor:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'YOUR_EMAIL');
```
Then open `admin.html` (an "Admin" link also appears in the header). New notifications arrive live (Realtime), with exact date and time to the second.
- Members only ever see a random nickname; author ids are in tables that browsers cannot read.
- Every post/comment is checked by AI before it is stored. Moderation fails closed: if OpenAI is unreachable, nothing is published.
