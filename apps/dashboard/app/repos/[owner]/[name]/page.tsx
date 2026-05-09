import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRepoBySlug, listRunsForRepo, type RunWithRelations } from '@/lib/db';
import {
  formatCost,
  formatDuration,
  formatRelativeTime,
  formatTokens,
  outcomeColor,
  statusColor,
  agentColor,
} from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Params = { params: Promise<{ owner: string; name: string }> };

export default async function RepoPage({ params }: Params) {
  const { owner, name } = await params;
  const repo = await getRepoBySlug(owner, name);
  if (!repo) notFound();
  const runs = await listRunsForRepo(repo.id);

  return (
    <div className="space-y-6">
      <nav className="text-sm text-ink-400">
        <Link href="/" className="hover:text-ink-100">repos</Link>
        <span className="mx-2">/</span>
        <span>
          {owner}/<span className="text-ink-100">{name}</span>
        </span>
      </nav>

      <header>
        <h1 className="text-2xl font-semibold">
          {owner}
          <span className="text-ink-500">/</span>
          {name}
        </h1>
        <p className="text-ink-400 text-sm mt-1">
          {runs.length} run{runs.length === 1 ? '' : 's'}
        </p>
      </header>

      <section className="space-y-3">
        {runs.length === 0 && (
          <p className="text-ink-400 text-sm">No runs recorded yet.</p>
        )}
        {runs.map((run) => (
          <RunRow key={run.id} run={run} />
        ))}
      </section>
    </div>
  );
}

function RunRow({ run }: { run: RunWithRelations }) {
  const issueLabel = run.issue
    ? `#${run.issue.github_issue_number} ${run.issue.title}`
    : run.trigger;
  return (
    <Link
      href={`/runs/${run.id}`}
      className="block rounded-lg border border-ink-700/60 bg-ink-800/30 p-4 hover:border-ink-600 hover:bg-ink-800/60 transition"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${statusColor(run.status)}`}
            >
              {run.status}
            </span>
            {run.outcome && (
              <span className={`inline-flex items-center rounded px-2 py-0.5 ${outcomeColor(run.outcome)}`}>
                {run.outcome}
              </span>
            )}
            <span className="text-ink-500">{run.trigger}</span>
            <span className="text-ink-500">·</span>
            <span className="text-ink-500">{formatRelativeTime(run.started_at)}</span>
          </div>
          <p className="mt-2 truncate text-ink-100">{issueLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {run.agent_steps.map((step) => (
              <span
                key={step.id}
                className={`inline-flex items-center rounded bg-ink-700/40 px-2 py-0.5 text-xs ${agentColor(step.agent)}`}
              >
                {step.agent}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right shrink-0">
          <span className="font-medium tabular-nums">{formatCost(run.total_cost_usd)}</span>
          <span className="text-xs text-ink-400 tabular-nums">
            {formatDuration(run.total_runtime_ms)}
          </span>
          <span className="text-xs text-ink-500 tabular-nums">
            {formatTokens(run.total_input_tokens + (run.total_cache_read_tokens ?? 0) + (run.total_cache_creation_tokens ?? 0))} in /
            {' '}
            {formatTokens(run.total_output_tokens)} out
          </span>
        </div>
      </div>
    </Link>
  );
}
