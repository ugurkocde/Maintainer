import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRepoBySlug, listRunsForRepo } from '@/lib/db';
import { ActivityFeed } from '@/app/components/ActivityFeed';
import type { ActivityEntry } from '@/lib/use-realtime';
import { formatCost } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ owner: string; name: string }> };

export default async function RepoPage({ params }: Params) {
  const { owner, name } = await params;
  const repo = await getRepoBySlug(owner, name);
  if (!repo) notFound();
  const runs = await listRunsForRepo(repo.id);

  const totalCost = runs.reduce((sum, r) => sum + Number(r.total_cost_usd ?? 0), 0);
  const drafted = runs.filter((r) => r.outcome === 'fix_proposed').length;
  const failed = runs.filter((r) => r.outcome === 'fix_failed').length;

  const initial: ActivityEntry[] = runs.map((r) => ({
    run: { ...r } as ActivityEntry['run'],
    issue: r.issue,
    steps: r.agent_steps,
    pull_request: r.pull_request,
    repo: r.repo,
  }));

  return (
    <div className="space-y-8">
      <nav className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-100">repos</Link>
        <span className="mx-2 text-ink-600">/</span>
        <span>
          {owner}<span className="text-ink-600">/</span><span className="text-ink-100">{name}</span>
        </span>
      </nav>

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {owner}<span className="text-ink-500">/</span>{name}
        </h1>
        <a
          href={`https://github.com/${owner}/${name}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-accent-500 hover:text-accent-600"
        >
          github.com/{owner}/{name} →
        </a>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Runs" value={runs.length.toString()} />
        <Stat label="Drafted" value={drafted.toString()} accent="emerald" />
        <Stat label="Failed" value={failed.toString()} accent="red" />
        <Stat label="Spend" value={formatCost(totalCost)} />
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Activity
            <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-400">
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              live
            </span>
          </h2>
          <span className="text-xs text-ink-400">{runs.length} runs</span>
        </div>
        <ActivityFeed initial={initial} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'emerald' | 'red';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-300'
      : accent === 'red'
        ? 'text-red-300'
        : 'text-ink-100';
  return (
    <div className="glass px-4 py-4">
      <div className="text-xs text-ink-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accentClass}`}>{value}</div>
    </div>
  );
}
