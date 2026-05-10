'use client';

import Link from 'next/link';
import { useLiveActivity, type ActivityEntry } from '@/lib/use-realtime';
import {
  agentColor,
  formatCost,
  formatDuration,
  formatRelativeTime,
  outcomeColor,
  statusColor,
} from '@/lib/format';

export function ActivityFeed({ initial }: { initial: ActivityEntry[] }) {
  const entries = useLiveActivity(initial, 30);
  if (entries.length === 0) {
    return (
      <p className="text-ink-400 text-sm">
        No runs yet. Open an issue on a configured repository to start the feed.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <ActivityRow key={e.run.id} entry={e} />
      ))}
    </ul>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { run, issue, steps, pull_request, repo } = entry;
  const slug = repo ? `${repo.owner}/${repo.name}` : '';
  const title = issue
    ? `#${issue.github_issue_number} ${issue.title}`
    : run.trigger;
  return (
    <li className="slide-in">
      <Link
        href={`/runs/${run.id}`}
        className="group block glass hover:bg-white/[0.04] transition px-4 py-3 flex items-start justify-between gap-4"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            {run.status === 'running' ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-300">
                <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                running
              </span>
            ) : (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 ${statusColor(run.status)}`}
              >
                {run.status}
              </span>
            )}
            {run.outcome && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 ${outcomeColor(run.outcome)}`}
              >
                {run.outcome}
              </span>
            )}
            {repo && (
              <span className="text-ink-500 truncate">
                {repo.owner}<span className="text-ink-600">/</span>{repo.name}
              </span>
            )}
            <span className="text-ink-600">·</span>
            <span className="text-ink-500">{formatRelativeTime(run.started_at)}</span>
          </div>
          <p className="mt-1.5 truncate text-ink-100 group-hover:text-white">
            {title}
          </p>
          {steps.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {steps.map((s) => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px] ${agentColor(s.agent)}`}
                >
                  {s.status === 'running' && (
                    <span className="pulse-dot inline-block h-1 w-1 rounded-full bg-current" />
                  )}
                  {s.agent}
                </span>
              ))}
              {pull_request && (
                <a
                  href={pull_request.url}
                  className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-500/20"
                  onClick={(e) => e.stopPropagation()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  PR #{pull_request.github_pr_number}
                </a>
              )}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-medium tabular-nums">{formatCost(run.total_cost_usd)}</div>
          <div className="text-xs text-ink-400 tabular-nums">
            {formatDuration(run.total_runtime_ms)}
          </div>
        </div>
      </Link>
    </li>
  );
}
