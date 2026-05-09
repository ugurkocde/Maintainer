# Maintainer Dashboard

Live orchestration view of automated repository maintenance. Reads from the
Maintainer Supabase project; renders the runs and agent_steps that the
GitHub Action streams in real time.

## Local dev

```bash
npm install --workspaces
cp apps/dashboard/.env.example apps/dashboard/.env.local
# edit .env.local with real Supabase URL + secret key
npm run dev -w @maintainer/dashboard
```

## Architecture

- Next.js App Router (16+) on the App Router with server components.
- Reads via `@maintainer/supabase` `createServerClient` using the
  service-role key, so RLS is bypassed for the demo. In production this
  switches to the publishable key plus signed-in user.
- Pages:
  - `/` repo grid with totals
  - `/repos/[owner]/[name]` recent runs for one repo
  - `/runs/[id]` agent timeline + triage verdict + linked PR
- No realtime subscriptions yet; pages are server-rendered with
  `dynamic = 'force-dynamic'` so each request hits Supabase.

## Deploy

```bash
vercel link        # links this directory to a Vercel project
vercel env add SUPABASE_URL
vercel env add SUPABASE_SECRET_KEY
vercel deploy --prod
```
