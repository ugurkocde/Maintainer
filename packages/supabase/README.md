# @maintainer/supabase

Generated Supabase types and typed client factories for the Maintainer orchestrator and dashboard.

## Layout

```
packages/supabase/
├── package.json
├── types.ts        # Auto-generated. Do not edit by hand.
└── index.ts        # createServerClient, createBrowserClient, re-exports
```

## Use

```ts
// Server (orchestrator, Action, Vercel Functions)
import { createServerClient } from '@maintainer/supabase';
const db = createServerClient();

// Browser (dashboard)
import { createBrowserClient } from '@maintainer/supabase';
const db = createBrowserClient();
```

## Env vars

The factories read from `process.env` so the same code runs in Node, the Action runner, Vercel Functions, and a Next.js client. Standard names:

| Use | First-checked variable | Fallbacks |
| --- | --- | --- |
| URL | `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` |
| Browser | `SUPABASE_PUBLISHABLE_KEY` | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Server | `SUPABASE_SECRET_KEY` | `SUPABASE_SERVICE_ROLE_KEY` |

Real values live only in:

- Local: untracked `.env`
- Vercel: project env vars
- GitHub Actions: repo or org secrets

## Regenerating types

After every migration:

```bash
supabase gen types typescript --project-id gpnsaswidreusgkyemvi > packages/supabase/types.ts
```

Then commit the regenerated file in the same PR as the migration.
