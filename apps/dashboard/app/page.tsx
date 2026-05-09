import Link from 'next/link';
import { listReposWithStats } from '@/lib/db';
import { formatCost } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  let stats;
  try {
    stats = await listReposWithStats();
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-red-200">
        <p className="font-semibold">Could not connect to Supabase.</p>
        <p className="text-sm mt-1 text-red-300/80">{(err as Error).message}</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="text-center py-20">
        <h1 className="text-2xl font-semibold">No repositories yet</h1>
        <p className="text-ink-400 mt-2 max-w-md mx-auto">
          Install the Maintainer GitHub Action on a repository and pass the Supabase secrets so its
          runs land here. The dashboard updates automatically.
        </p>
        <a
          href="https://github.com/ugurkocde/Maintainer#quickstart"
          className="mt-6 inline-block rounded-md bg-accent-500 px-4 py-2 text-sm font-medium hover:bg-accent-600"
        >
          Quickstart
        </a>
      </div>
    );
  }

  const totals = stats.reduce(
    (acc, s) => ({
      runs: acc.runs + s.total_runs,
      cost: acc.cost + s.total_cost_usd,
      fixed: acc.fixed + s.fix_proposed,
    }),
    { runs: 0, cost: 0, fixed: 0 },
  );

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold">Repositories</h1>
        <p className="text-ink-400 text-sm mt-1">
          {stats.length} repo{stats.length === 1 ? '' : 's'} under Maintainer management
          {' · '}
          {totals.runs} run{totals.runs === 1 ? '' : 's'}
          {' · '}
          {totals.fixed} draft PR{totals.fixed === 1 ? '' : 's'}
          {' · '}
          {formatCost(totals.cost)} spent
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.repo.id}
            href={`/repos/${s.repo.owner}/${s.repo.name}`}
            className="group rounded-lg border border-ink-700/60 bg-ink-800/40 p-5 hover:border-ink-600 hover:bg-ink-800/70 transition"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-medium tracking-tight group-hover:text-accent-500">
                {s.repo.owner}
                <span className="text-ink-500">/</span>
                {s.repo.name}
              </h2>
              {s.repo.enabled ? (
                <span className="text-emerald-400 text-xs">active</span>
              ) : (
                <span className="text-ink-500 text-xs">paused</span>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <dt className="text-ink-500 text-xs">Runs</dt>
                <dd className="text-ink-100 font-medium tabular-nums">{s.total_runs}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Open</dt>
                <dd className="text-ink-100 font-medium tabular-nums">{s.open_issues}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Drafted</dt>
                <dd className="text-emerald-300 font-medium tabular-nums">{s.fix_proposed}</dd>
              </div>
              <div>
                <dt className="text-ink-500 text-xs">Failed</dt>
                <dd className="text-red-300 font-medium tabular-nums">{s.fix_failed}</dd>
              </div>
              <div className="col-span-2 text-right">
                <dt className="text-ink-500 text-xs">Spent</dt>
                <dd className="text-ink-200 font-medium tabular-nums">
                  {formatCost(s.total_cost_usd)}
                </dd>
              </div>
            </dl>
          </Link>
        ))}
      </section>
    </div>
  );
}
