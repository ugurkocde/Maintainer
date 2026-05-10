import Link from 'next/link';
import {
  getTotals,
  listRecentActivity,
  listReposWithStats,
  type RepoStats,
} from '@/lib/db';
import { ActivityFeed } from '@/app/components/ActivityFeed';
import { LiveTotals } from '@/app/components/LiveTotals';
import { formatCost, formatRelativeTime } from '@/lib/format';
import type { ActivityEntry } from '@/lib/use-realtime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  let totals, activity, repos;
  try {
    [totals, activity, repos] = await Promise.all([
      getTotals(),
      listRecentActivity(30),
      listReposWithStats(),
    ]);
  } catch (err) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/5 p-6 text-red-200">
        <p className="font-semibold">Could not connect to Supabase.</p>
        <p className="text-sm mt-1 text-red-300/80">{(err as Error).message}</p>
      </div>
    );
  }

  const initialActivity: ActivityEntry[] = activity.map((r) => ({
    run: {
      ...r,
      issue_id: r.issue?.id ?? null,
      pr_id: r.pull_request?.id ?? null,
      repo_id: r.repo_id,
    } as ActivityEntry['run'],
    issue: r.issue,
    steps: r.agent_steps,
    pull_request: r.pull_request,
    repo: r.repo,
  }));

  return (
    <div className="space-y-12">
      <Hero />
      <LiveTotals initial={totals} />

      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          <SectionHeader title="Live activity" subtitle="Updates without refresh" live />
          <ActivityFeed initial={initialActivity} />
        </div>
        <div className="lg:col-span-2 space-y-3" id="repos">
          <SectionHeader title="Repositories" subtitle={`${repos.length} under management`} />
          <RepoList repos={repos} />
        </div>
      </section>

      <HowItWorks />
    </div>
  );
}

function Hero() {
  return (
    <section className="pt-6 pb-2">
      <div className="max-w-3xl">
        <p className="text-xs uppercase tracking-widest text-accent-500 mb-3">live</p>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          A fleet of AI agents keeping
          <br />
          open-source repositories healthy.
        </h1>
        <p className="mt-5 text-ink-300 text-lg max-w-2xl">
          Maintainer triages new issues, drafts pull requests for scoped bugs,
          and keeps an honest record of what was done. Watch every run as it
          happens.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <a
            href="https://github.com/ugurkocde/Maintainer"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-accent-500 px-4 py-2 text-sm font-medium hover:bg-accent-600 transition"
          >
            Get the Action
          </a>
          <a
            href="#how-it-works"
            className="rounded-md border border-white/10 px-4 py-2 text-sm hover:border-white/20 transition"
          >
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  title,
  subtitle,
  live,
}: {
  title: string;
  subtitle?: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        {title}
        {live && (
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-emerald-400">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            live
          </span>
        )}
      </h2>
      {subtitle && <span className="text-xs text-ink-400">{subtitle}</span>}
    </div>
  );
}

function RepoList({ repos }: { repos: RepoStats[] }) {
  if (repos.length === 0) {
    return (
      <div className="glass p-6 text-center">
        <p className="text-ink-300">No repositories yet.</p>
        <p className="text-sm text-ink-500 mt-1">
          Install the Action and the first run lands here.
        </p>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {repos.map((s) => (
        <li key={s.repo.id}>
          <Link
            href={`/repos/${s.repo.owner}/${s.repo.name}`}
            className="group block glass hover:bg-white/[0.04] transition px-4 py-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-medium tracking-tight truncate">
                {s.repo.owner}<span className="text-ink-500">/</span>{s.repo.name}
              </div>
              <span className="text-xs text-ink-500 shrink-0">
                {s.last_run_at ? formatRelativeTime(s.last_run_at) : 'no runs'}
              </span>
            </div>
            <dl className="mt-2 flex items-center gap-4 text-xs text-ink-400 tabular-nums">
              <span>{s.total_runs} runs</span>
              <span>{s.fix_proposed} drafted</span>
              <span>{s.open_issues} open</span>
              <span className="ml-auto text-ink-300">{formatCost(s.total_cost_usd)}</span>
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Triage on every new issue',
      body: 'A small Sonnet agent classifies type, severity, scope, and reproducibility. Duplicates linked, labels applied, structured comment posted.',
    },
    {
      n: '02',
      title: 'Auto-attempt scoped bugs',
      body: 'When the verdict is fixable, a code agent reads the repo, writes the smallest correct change, runs tests, and opens a draft pull request.',
    },
    {
      n: '03',
      title: 'Honest cost and time accounting',
      body: 'Every run records token usage, cache reuse, model, runtime, and estimated cost. Maintainers decide what to merge and what to discard.',
    },
  ];
  return (
    <section id="how-it-works" className="space-y-4 pt-8">
      <SectionHeader title="How it works" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div key={s.n} className="glass p-5">
            <div className="text-xs text-accent-500 font-mono">{s.n}</div>
            <div className="mt-2 font-medium">{s.title}</div>
            <p className="mt-2 text-sm text-ink-400 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
