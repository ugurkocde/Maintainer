# Dashboard deploy

The dashboard at `apps/dashboard/` is a Next.js app that reads from the
Maintainer Supabase project and renders runs, agent steps, and pull
requests as they happen. It deploys to Vercel.

## Two paths to first deploy

### A. Vercel UI (recommended for the first time)

1. Open **https://vercel.com/new**.
2. Import the **`ugurkocde/Maintainer`** GitHub repository.
3. **Important:** set the **Root Directory** to `apps/dashboard`.
4. Framework Preset: **Next.js** (auto-detected).
5. Add Environment Variables for Production, Preview, and Development:
   - `SUPABASE_URL` = `https://gpnsaswidreusgkyemvi.supabase.co`
   - `SUPABASE_SECRET_KEY` = (from Supabase dashboard → Settings → API keys → service_role)
6. Click **Deploy**.

Future commits to `main` deploy automatically. PR commits deploy a preview.

### B. Vercel CLI

```bash
vercel login                                   # one-time, opens browser
cd apps/dashboard
vercel link                                    # creates the project
echo "https://gpnsaswidreusgkyemvi.supabase.co" | vercel env add SUPABASE_URL production
vercel env add SUPABASE_SECRET_KEY production  # paste the value
vercel deploy --prod
```

## Why the secret key?

The dashboard currently reads with the Supabase **service-role** key, which
bypasses RLS. This is a demo-mode shortcut that lets us render data without
wiring auth. Anyone who hits the deployed URL can see all runs.

For public launch, swap in the publishable key plus signed-in users
(Supabase Auth with GitHub OAuth). The `@maintainer/supabase` package
already exposes `createBrowserClient` for this.

## Local dev

```bash
npm install --workspaces
cp apps/dashboard/.env.example apps/dashboard/.env.local
# fill in real values
npm run dev -w @maintainer/dashboard
```

Then open http://localhost:3000.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Repo grid: totals (runs, drafted PRs, spend) per repo |
| `/repos/[owner]/[name]` | Recent runs for one repo with status, outcome, agent badges, cost |
| `/runs/[id]` | Per-run agent timeline + triage verdict + linked draft PR |
